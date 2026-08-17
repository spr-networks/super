package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

var AllowlistConfigPath = TEST_PREFIX + "/configs/base/allowlist.json"

const (
	gAllowlistSourceMapName    = "allowlist_sources"
	allowlistPolicyPrefix      = "allowlist:"
	defaultAllowlistRefreshSec = 300
	minAllowlistRefreshSec     = 60
)

type Allowlist struct {
	Name    string
	CIDRs   []string
	ASNs    []GeoASN
	Domains []string
}

type AllowlistConfig struct {
	Allowlists     []Allowlist
	RefreshSeconds int
}

type AllowlistSource struct {
	Type      string
	Key       string
	Ranges    int
	Addresses int    `json:",omitempty"`
	Error     string `json:",omitempty"`
}

type AllowlistPolicyStatus struct {
	Name             string
	Policy           string
	RangesProgrammed int
	Sources          []AllowlistSource
}

type AllowlistStatus struct {
	LastRefresh string
	Allowlists  []AllowlistPolicyStatus
}

var allowlistNameRE = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$`)

var (
	gAllowlistMtx        sync.Mutex
	gAllowlistRefreshMtx sync.Mutex
	gAllowlistDNSOnce    sync.Once
	gAllowlistConfig     = AllowlistConfig{RefreshSeconds: defaultAllowlistRefreshSec}
	gAllowlistStatus     = AllowlistStatus{}

	gAllowlistResolved = map[string]map[string][]GeoIPRange{}

	gAllowlistObserved = map[string]map[string]time.Time{}

	allowlistDNSUpdates = make(chan struct{}, 1)
)

func allowlistPolicyName(name string) string {
	return allowlistPolicyPrefix + name
}

func allowlistNameFromPolicy(policy string) (string, bool) {
	if !strings.HasPrefix(policy, allowlistPolicyPrefix) {
		return "", false
	}
	name := strings.TrimPrefix(policy, allowlistPolicyPrefix)
	return name, name != ""
}

func allowlistNFTNames(name string) (string, string) {
	digest := sha256.Sum256([]byte(name))
	suffix := hex.EncodeToString(digest[:6])
	return "al_d_" + suffix, "al_c_" + suffix
}

func allowlistConfigCopy() AllowlistConfig {
	gAllowlistMtx.Lock()
	defer gAllowlistMtx.Unlock()

	config := gAllowlistConfig
	config.Allowlists = make([]Allowlist, len(gAllowlistConfig.Allowlists))
	for index, item := range gAllowlistConfig.Allowlists {
		config.Allowlists[index] = item
		config.Allowlists[index].CIDRs = append([]string{}, item.CIDRs...)
		config.Allowlists[index].ASNs = append([]GeoASN{}, item.ASNs...)
		config.Allowlists[index].Domains = append([]string{}, item.Domains...)
	}
	return config
}

func allowlistStatusCopy() AllowlistStatus {
	gAllowlistMtx.Lock()
	defer gAllowlistMtx.Unlock()

	status := gAllowlistStatus
	status.Allowlists = make([]AllowlistPolicyStatus, len(gAllowlistStatus.Allowlists))
	for index, item := range gAllowlistStatus.Allowlists {
		status.Allowlists[index] = item
		status.Allowlists[index].Sources = append([]AllowlistSource{}, item.Sources...)
	}
	return status
}

func findAllowlist(config AllowlistConfig, name string) (Allowlist, bool) {
	for _, item := range config.Allowlists {
		if item.Name == name {
			return item, true
		}
	}
	return Allowlist{}, false
}

func isConfiguredAllowlistPolicy(policy string) bool {
	name, ok := allowlistNameFromPolicy(policy)
	if !ok {
		return false
	}
	_, exists := findAllowlist(allowlistConfigCopy(), name)
	return exists
}

func loadAllowlistConfig() {
	data, err := os.ReadFile(AllowlistConfigPath)
	if err != nil {
		return
	}
	config := AllowlistConfig{}
	if err := json.Unmarshal(data, &config); err != nil {
		fmt.Println("[allowlist] invalid config:", err)
		return
	}
	if err := validateAllowlistConfig(&config); err != nil {
		fmt.Println("[allowlist] invalid config:", err)
		return
	}
	gAllowlistMtx.Lock()
	gAllowlistConfig = config
	gAllowlistMtx.Unlock()
}

func saveAllowlistConfigLocked() error {
	data, err := json.MarshalIndent(gAllowlistConfig, "", " ")
	if err != nil {
		return err
	}
	return writeFileAtomic(AllowlistConfigPath, data, 0600)
}

func normalizeAllowlistDomain(domain string) (string, error) {
	domain = strings.ToLower(strings.TrimSuffix(strings.TrimSpace(domain), "."))
	wildcard := strings.HasPrefix(domain, "*.")
	if wildcard {
		domain = strings.TrimPrefix(domain, "*.")
	}
	normalized, err := normalizeDNSHostname(domain)
	if err != nil {
		return "", err
	}
	if wildcard {
		return "*." + normalized, nil
	}
	return normalized, nil
}

func validateAllowlist(config *Allowlist) error {
	config.Name = strings.ToLower(strings.TrimSpace(config.Name))
	if !allowlistNameRE.MatchString(config.Name) {
		return fmt.Errorf("invalid allowlist name %q: use 1-32 lowercase letters, numbers, or hyphens", config.Name)
	}

	cidrSeen := map[string]bool{}
	cidrs := []string{}
	for _, value := range config.CIDRs {
		value = strings.TrimSpace(value)
		ip := net.ParseIP(value)
		if ip != nil {
			if ip.To4() == nil {
				return fmt.Errorf("allowlist only supports IPv4 addresses: %s", value)
			}
			value = ip.To4().String() + "/32"
		} else {
			_, network, err := net.ParseCIDR(value)
			if err != nil || network.IP.To4() == nil {
				return fmt.Errorf("invalid IPv4 CIDR: %s", value)
			}
			value = network.String()
		}
		if !cidrSeen[value] {
			cidrSeen[value] = true
			cidrs = append(cidrs, value)
		}
	}
	config.CIDRs = cidrs

	asnSeen := map[int]bool{}
	asns := []GeoASN{}
	for _, entry := range config.ASNs {
		if entry.ASN <= 0 {
			return fmt.Errorf("invalid ASN: %d", entry.ASN)
		}
		if !asnSeen[entry.ASN] {
			asnSeen[entry.ASN] = true
			entry.Name = strings.TrimSpace(entry.Name)
			asns = append(asns, entry)
		}
	}
	config.ASNs = asns

	domainSeen := map[string]bool{}
	domains := []string{}
	for _, value := range config.Domains {
		domain, err := normalizeAllowlistDomain(value)
		if err != nil {
			return fmt.Errorf("invalid domain %q", value)
		}
		if !domainSeen[domain] {
			domainSeen[domain] = true
			domains = append(domains, domain)
		}
	}
	config.Domains = domains
	return nil
}

func validateAllowlistConfig(config *AllowlistConfig) error {
	seen := map[string]bool{}
	for index := range config.Allowlists {
		if err := validateAllowlist(&config.Allowlists[index]); err != nil {
			return err
		}
		if seen[config.Allowlists[index].Name] {
			return fmt.Errorf("duplicate allowlist name: %s", config.Allowlists[index].Name)
		}
		seen[config.Allowlists[index].Name] = true
	}
	if config.RefreshSeconds < minAllowlistRefreshSec {
		config.RefreshSeconds = defaultAllowlistRefreshSec
	}
	return nil
}

func allowlistDomainMatches(rule, domain string) bool {
	domain = strings.ToLower(strings.TrimSuffix(strings.TrimSpace(domain), "."))
	if strings.HasPrefix(rule, "*.") {
		suffix := strings.TrimPrefix(rule, "*.")
		return domain != suffix && strings.HasSuffix(domain, "."+suffix)
	}
	return domain == rule
}

func allowlistCIDRRange(cidr string) (GeoIPRange, bool) {
	_, network, err := net.ParseCIDR(cidr)
	if err != nil {
		return GeoIPRange{}, false
	}
	start := network.IP.To4()
	if start == nil {
		return GeoIPRange{}, false
	}
	end := make(net.IP, 4)
	for i := range start {
		end[i] = start[i] | ^network.Mask[i]
	}
	return GeoIPRange{Start: start.String(), End: end.String()}, true
}

func allowlistConfiguredDomain(item Allowlist, domain string) bool {
	for _, rule := range item.Domains {
		if allowlistDomainMatches(rule, domain) {
			return true
		}
	}
	return false
}

func allowlistObservedRangesLocked(item Allowlist, now time.Time, prune bool) []GeoIPRange {
	ranges := []GeoIPRange{}
	for domain, addresses := range gAllowlistObserved {
		for ip, expiry := range addresses {
			if !expiry.After(now) {
				if prune {
					delete(addresses, ip)
				}
				continue
			}
			if allowlistConfiguredDomain(item, domain) {
				ranges = append(ranges, GeoIPRange{Start: ip, End: ip})
			}
		}
		if prune && len(addresses) == 0 {
			delete(gAllowlistObserved, domain)
		}
	}
	return ranges
}

func allowlistCurrentRangesLocked(item Allowlist, now time.Time, prune bool) []GeoIPRange {
	ranges := []GeoIPRange{}
	for _, sourceRanges := range gAllowlistResolved[item.Name] {
		ranges = append(ranges, sourceRanges...)
	}
	ranges = append(ranges, allowlistObservedRangesLocked(item, now, prune)...)
	return mergeGeoRanges(ranges)
}

func ensureAllowlistNFTObjects(config AllowlistConfig) error {
	for _, item := range config.Allowlists {
		setName, chainName := allowlistNFTNames(item.Name)
		if err := CheckMapExists("inet", "filter", setName); err != nil {
			if err := CreateIPv4IntervalSet("inet", "filter", setName); err != nil {
				return err
			}
		}
		if err := CheckChainExists("inet", "filter", chainName); err != nil {
			if err := CreateAllowlistDestinationChain("inet", "filter", chainName, setName); err != nil {
				return err
			}
		}
		if err := EnsureAllowlistDestinationRule("inet", "filter", chainName, setName); err != nil {
			return err
		}
	}
	return nil
}

func addAllowlistSource(ip, iface, policy string) error {
	name, ok := allowlistNameFromPolicy(policy)
	if !ok {
		return fmt.Errorf("invalid allowlist policy: %s", policy)
	}
	if _, exists := findAllowlist(allowlistConfigCopy(), name); !exists {
		return fmt.Errorf("allowlist not found: %s", name)
	}
	_, chainName := allowlistNFTNames(name)
	return AddIPIfaceVerdictElement("inet", "filter", gAllowlistSourceMapName, ip, iface, "jump "+chainName)
}

func rebuildAllowlistSourcesLocked(config AllowlistConfig) error {
	if err := FlushMapByName("inet", "filter", gAllowlistSourceMapName); err != nil {
		return err
	}

	devices := readDevicesSnapshot()
	for _, device := range devices {
		policy, ok := includesAllowlistPolicy(device.Policies)
		if !ok || !isConfiguredAllowlistPolicy(policy) || device.RecentIP == "" {
			continue
		}
		iface := device.DHCPLastInterface
		if device.WGPubKey != "" {
			iface = "wg0"
		} else if iface == "" {
			iface = getRouteInterface(device.RecentIP)
		}
		if iface == "" {
			continue
		}
		if err := addAllowlistSource(device.RecentIP, iface, policy); err != nil {
			return err
		}
	}

	for _, rule := range gFirewallConfig.CustomInterfaceRules {
		policy, ok := includesAllowlistPolicy(rule.Policies)
		if !ok || !isConfiguredAllowlistPolicy(policy) {
			continue
		}
		if err := addAllowlistSource(rule.SrcIP, rule.Interface, policy); err != nil {
			return err
		}
	}
	return nil
}

func validateAllowlistRemovalLocked(previous, next AllowlistConfig) error {
	nextNames := map[string]bool{}
	for _, item := range next.Allowlists {
		nextNames[item.Name] = true
	}
	removedPolicies := map[string]bool{}
	for _, item := range previous.Allowlists {
		if !nextNames[item.Name] {
			removedPolicies[allowlistPolicyName(item.Name)] = true
		}
	}
	if len(removedPolicies) == 0 {
		return nil
	}

	for _, device := range readDevicesSnapshot() {
		for _, policy := range device.Policies {
			if removedPolicies[policy] {
				return fmt.Errorf("allowlist %s is still assigned to device %s", strings.TrimPrefix(policy, allowlistPolicyPrefix), device.Name)
			}
		}
	}
	for _, rule := range gFirewallConfig.CustomInterfaceRules {
		for _, policy := range rule.Policies {
			if removedPolicies[policy] {
				return fmt.Errorf("allowlist %s is still assigned to container rule %s", strings.TrimPrefix(policy, allowlistPolicyPrefix), rule.RuleName)
			}
		}
	}
	return nil
}

func programNamedAllowlist(item Allowlist, ranges []GeoIPRange) error {
	setName, _ := allowlistNFTNames(item.Name)
	if err := FlushSetWithTable("inet", "filter", setName); err != nil {
		return err
	}
	pairs := make([][2]net.IP, 0, len(ranges))
	for _, entry := range ranges {
		start := net.ParseIP(entry.Start)
		end := net.ParseIP(entry.End)
		if start != nil && end != nil {
			pairs = append(pairs, [2]net.IP{start, end})
		}
	}
	return AddIPRangesToSet("inet", "filter", setName, pairs)
}

func allowlistRefresh() AllowlistStatus {
	gAllowlistRefreshMtx.Lock()
	defer gAllowlistRefreshMtx.Unlock()

	config := allowlistConfigCopy()
	now := time.Now()
	status := AllowlistStatus{LastRefresh: now.UTC().Format(time.RFC3339)}

	FWmtx.Lock()
	prepareErr := ensureAllowlistNFTObjects(config)
	FWmtx.Unlock()
	if prepareErr != nil {
		fmt.Println("[allowlist] failed to prepare nft objects:", prepareErr)
	}

	for _, item := range config.Allowlists {
		policyStatus := AllowlistPolicyStatus{Name: item.Name, Policy: allowlistPolicyName(item.Name)}

		next := map[string][]GeoIPRange{}

		for _, cidr := range item.CIDRs {
			key := "cidr:" + cidr
			if entry, ok := allowlistCIDRRange(cidr); ok {
				next[key] = []GeoIPRange{entry}
				policyStatus.Sources = append(policyStatus.Sources, AllowlistSource{Type: "cidr", Key: cidr, Ranges: 1})
			}
		}

		asnNumbers := make([]int, 0, len(item.ASNs))
		for _, entry := range item.ASNs {
			asnNumbers = append(asnNumbers, entry.ASN)
		}
		resolvedASNs, asnErr := resolveASNRanges(asnNumbers)
		resolvedByASN := map[int][]GeoIPRange{}
		if asnErr == nil {
			for _, entry := range resolvedASNs {
				resolvedByASN[entry.ASN] = append(resolvedByASN[entry.ASN], entry.Ranges...)
			}
		}
		for _, entry := range item.ASNs {
			key := "asn:" + strconv.Itoa(entry.ASN)
			source := AllowlistSource{Type: "asn", Key: "AS" + strconv.Itoa(entry.ASN)}
			if asnErr != nil {
				source.Error = asnErr.Error()
			} else {
				next[key] = mergeGeoRanges(resolvedByASN[entry.ASN])
			}
			source.Ranges = len(next[key])
			policyStatus.Sources = append(policyStatus.Sources, source)
		}

		for _, domain := range item.Domains {
			key := "domain:" + domain
			source := AllowlistSource{Type: "domain", Key: domain}
			next[key] = nil

			gAllowlistMtx.Lock()
			for observedDomain, addresses := range gAllowlistObserved {
				if allowlistDomainMatches(domain, observedDomain) {
					for _, expiry := range addresses {
						if expiry.After(now) {
							source.Addresses++
						}
					}
				}
			}
			gAllowlistMtx.Unlock()
			source.Ranges = source.Addresses
			policyStatus.Sources = append(policyStatus.Sources, source)
		}

		gAllowlistMtx.Lock()
		gAllowlistResolved[item.Name] = next
		ranges := allowlistCurrentRangesLocked(item, now, true)
		gAllowlistMtx.Unlock()
		policyStatus.RangesProgrammed = len(ranges)

		if prepareErr == nil {
			FWmtx.Lock()
			err := programNamedAllowlist(item, ranges)
			FWmtx.Unlock()
			if err != nil {
				fmt.Println("[allowlist] failed to program", item.Name, err)
				policyStatus.RangesProgrammed = 0
				policyStatus.Sources = append(policyStatus.Sources, AllowlistSource{Type: "nft", Key: item.Name, Error: err.Error()})
			}
		} else {
			policyStatus.RangesProgrammed = 0
			policyStatus.Sources = append(policyStatus.Sources, AllowlistSource{Type: "nft", Key: item.Name, Error: prepareErr.Error()})
		}
		status.Allowlists = append(status.Allowlists, policyStatus)
	}

	gAllowlistMtx.Lock()
	configured := map[string]bool{}
	for _, item := range config.Allowlists {
		configured[item.Name] = true
	}
	for name := range gAllowlistResolved {
		if !configured[name] {
			delete(gAllowlistResolved, name)
		}
	}
	gAllowlistStatus = status
	gAllowlistMtx.Unlock()
	SprbusPublish("firewall:allowlist:refresh", status)
	return status
}

func allowlistObserveDNS(domain string, ips []string, ttls []int) {
	domain = strings.ToLower(strings.TrimSuffix(strings.TrimSpace(domain), "."))
	config := allowlistConfigCopy()
	matched := false
	for _, item := range config.Allowlists {
		if allowlistConfiguredDomain(item, domain) {
			matched = true
			break
		}
	}
	if !matched {
		return
	}

	now := time.Now()
	gAllowlistMtx.Lock()
	if gAllowlistObserved[domain] == nil {
		gAllowlistObserved[domain] = map[string]time.Time{}
	}
	changed := false
	for index, value := range ips {
		ip := net.ParseIP(value)
		if ip == nil || ip.To4() == nil || ip.IsUnspecified() || ip.IsMulticast() {
			continue
		}
		ttl := defaultAllowlistRefreshSec
		if index < len(ttls) && ttls[index] > 0 {
			ttl = ttls[index]
		}
		if ttl < 30 {
			ttl = 30
		} else if ttl > 86400 {
			ttl = 86400
		}
		address := ip.To4().String()
		expiry := now.Add(time.Duration(ttl) * time.Second)
		if old, ok := gAllowlistObserved[domain][address]; !ok || expiry.After(old) {
			gAllowlistObserved[domain][address] = expiry
			changed = true
		}
	}
	gAllowlistMtx.Unlock()
	if changed {
		select {
		case allowlistDNSUpdates <- struct{}{}:
		default:
		}
	}
}

func allowlistDNSUpdateLoop() {
	for range allowlistDNSUpdates {
		time.Sleep(100 * time.Millisecond)
		for {
			select {
			case <-allowlistDNSUpdates:
				continue
			default:
				allowlistReprogramCurrent()
				goto nextUpdate
			}
		}
	nextUpdate:
	}
}

func allowlistReprogramCurrent() {
	gAllowlistRefreshMtx.Lock()
	defer gAllowlistRefreshMtx.Unlock()
	config := allowlistConfigCopy()
	now := time.Now()

	for _, item := range config.Allowlists {
		gAllowlistMtx.Lock()
		ranges := allowlistCurrentRangesLocked(item, now, true)
		gAllowlistMtx.Unlock()
		FWmtx.Lock()
		err := programNamedAllowlist(item, ranges)
		FWmtx.Unlock()
		if err != nil {
			fmt.Println("[allowlist] failed to update DNS destinations:", err)
			continue
		}
		gAllowlistMtx.Lock()
		for index := range gAllowlistStatus.Allowlists {
			if gAllowlistStatus.Allowlists[index].Name == item.Name {
				gAllowlistStatus.Allowlists[index].RangesProgrammed = len(ranges)
			}
		}
		gAllowlistMtx.Unlock()
	}
}

func allowlistTicker() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		config := allowlistConfigCopy()
		status := allowlistStatusCopy()
		last, err := time.Parse(time.RFC3339, status.LastRefresh)
		if err != nil || time.Since(last) >= time.Duration(config.RefreshSeconds)*time.Second {
			allowlistRefresh()
		} else {
			allowlistReprogramCurrent()
		}
	}
}

func initAllowlist() {
	loadAllowlistConfig()
	gAllowlistDNSOnce.Do(func() { go allowlistDNSUpdateLoop() })
	config := allowlistConfigCopy()
	FWmtx.Lock()
	if err := ensureAllowlistNFTObjects(config); err != nil {
		fmt.Println("[allowlist] failed to initialize nft objects:", err)
	}
	FWmtx.Unlock()
	go func() {
		allowlistRefresh()
		allowlistTicker()
	}()
}

func initAllowlistSources() {
	config := allowlistConfigCopy()
	FWmtx.Lock()
	if err := rebuildAllowlistSourcesLocked(config); err != nil {
		fmt.Println("[allowlist] failed to restore policy assignments:", err)
	}
	FWmtx.Unlock()
}

func allowlistConfigHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPut {
		previous := allowlistConfigCopy()
		config := AllowlistConfig{}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024*1024))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&config); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := validateAllowlistConfig(&config); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		sort.SliceStable(config.Allowlists, func(i, j int) bool { return config.Allowlists[i].Name < config.Allowlists[j].Name })
		FWmtx.Lock()
		removalErr := validateAllowlistRemovalLocked(previous, config)
		FWmtx.Unlock()
		if removalErr != nil {
			http.Error(w, removalErr.Error(), http.StatusConflict)
			return
		}

		gAllowlistMtx.Lock()
		gAllowlistConfig = config
		err := saveAllowlistConfigLocked()
		gAllowlistMtx.Unlock()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		FWmtx.Lock()
		err = ensureAllowlistNFTObjects(config)
		if err == nil {
			err = rebuildAllowlistSourcesLocked(config)
		}
		FWmtx.Unlock()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		go allowlistRefresh()
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(allowlistConfigCopy())
}

func allowlistStatusHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(allowlistStatusCopy())
}

func allowlistRefreshHandler(w http.ResponseWriter, _ *http.Request) {
	status := allowlistRefresh()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(status)
}
