package main

import (
	"bufio"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
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

import (
	"github.com/gorilla/mux"
)

var GeoBlockConfigPath = TEST_PREFIX + "/configs/base/geo_block.json"
var GeoBlockCachePath = TEST_PREFIX + "/state/api/geo_block_ranges.json"
var LookupPluginSocketPath = TEST_PREFIX + "/state/plugins/plugin-lookup/lookup_plugin"

const gGeoBlockSetName = "geo_block"

type GeoASN struct {
	ASN  int
	Name string
}

type GeoBlockList struct {
	URI     string
	Enabled bool
	Note    string
}

type GeoBlockConfig struct {
	Enabled        bool
	DenyCountries  []string
	DenyASNs       []GeoASN
	Lists          []GeoBlockList
	RefreshSeconds int
}

type GeoBlockSource struct {
	Type      string
	Key       string
	Ranges    int
	ASNs      int    `json:",omitempty"`
	LastFetch string `json:",omitempty"`
	Error     string `json:",omitempty"`
}

type GeoBlockStatus struct {
	Enabled          bool
	LastRefresh      string
	RangesProgrammed int
	Sources          []GeoBlockSource
}

type GeoIPRange struct {
	Start string
	End   string
}

type geoBlockCache struct {
	LastRefresh string
	Ranges      []GeoIPRange
	Sources     []GeoBlockSource
}

var gGeoMtx sync.Mutex
var gGeoConfig = GeoBlockConfig{
	RefreshSeconds: 86400,
	Lists: []GeoBlockList{
		{
			URI:     "https://www.spamhaus.org/drop/asndrop.json",
			Enabled: false,
			Note:    "Spamhaus ASN-DROP",
		},
	},
}
var gGeoStatus = GeoBlockStatus{}
var gGeoRefreshMtx sync.Mutex

func loadGeoBlockConfig() {
	gGeoMtx.Lock()
	defer gGeoMtx.Unlock()

	data, err := os.ReadFile(GeoBlockConfigPath)
	if err != nil {
		return
	}
	config := GeoBlockConfig{}
	if err := json.Unmarshal(data, &config); err != nil {
		fmt.Println("[geo_block] invalid config:", err)
		return
	}
	if config.RefreshSeconds < 3600 {
		config.RefreshSeconds = 86400
	}
	gGeoConfig = config
}

func saveGeoBlockConfigLocked() error {
	data, err := json.MarshalIndent(gGeoConfig, "", " ")
	if err != nil {
		return err
	}
	return os.WriteFile(GeoBlockConfigPath, data, 0600)
}

func geoBlockConfigCopy() GeoBlockConfig {
	gGeoMtx.Lock()
	defer gGeoMtx.Unlock()
	config := gGeoConfig
	config.DenyCountries = append([]string{}, gGeoConfig.DenyCountries...)
	config.DenyASNs = append([]GeoASN{}, gGeoConfig.DenyASNs...)
	config.Lists = append([]GeoBlockList{}, gGeoConfig.Lists...)
	return config
}

func lookupPluginGet(path string, dest interface{}) error {
	client := http.Client{
		Timeout: 120 * time.Second,
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
				return net.Dial("unix", LookupPluginSocketPath)
			},
		},
	}

	resp, err := client.Get("http://lookup" + path)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return fmt.Errorf("lookup plugin %s: %d %s", path, resp.StatusCode, strings.TrimSpace(string(body)))
	}

	return json.NewDecoder(resp.Body).Decode(dest)
}

type lookupASNRanges struct {
	ASN     int
	Name    string
	Country string
	Ranges  []GeoIPRange
}

type lookupCountryRanges struct {
	Country string
	Ranges  []GeoIPRange
}

func resolveCountryRanges(countries []string) ([]lookupCountryRanges, error) {
	if len(countries) == 0 {
		return nil, nil
	}
	result := []lookupCountryRanges{}
	err := lookupPluginGet("/country_ranges/"+strings.Join(countries, ","), &result)
	return result, err
}

func resolveASNRanges(asns []int) ([]lookupASNRanges, error) {
	result := []lookupASNRanges{}
	for start := 0; start < len(asns); start += 50 {
		end := start + 50
		if end > len(asns) {
			end = len(asns)
		}
		parts := []string{}
		for _, asn := range asns[start:end] {
			parts = append(parts, strconv.Itoa(asn))
		}
		chunk := []lookupASNRanges{}
		if err := lookupPluginGet("/asn_ranges/"+strings.Join(parts, ","), &chunk); err != nil {
			return nil, err
		}
		result = append(result, chunk...)
	}
	return result, nil
}

var geoASNLinePattern = regexp.MustCompile(`^(?i)AS(\d+)\b`)

func parseGeoBlockList(reader io.Reader) ([]int, []GeoIPRange, error) {
	asns := []int{}
	ranges := []GeoIPRange{}

	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 0, 256*1024), 256*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";") {
			continue
		}

		if strings.HasPrefix(line, "{") {
			entry := struct {
				ASN int `json:"asn"`
			}{}
			if err := json.Unmarshal([]byte(line), &entry); err == nil && entry.ASN > 0 {
				asns = append(asns, entry.ASN)
			}
			continue
		}

		if idx := strings.IndexAny(line, ";#"); idx != -1 {
			line = strings.TrimSpace(line[:idx])
			if line == "" {
				continue
			}
		}

		if m := geoASNLinePattern.FindStringSubmatch(line); m != nil {
			if asn, err := strconv.Atoi(m[1]); err == nil && asn > 0 {
				asns = append(asns, asn)
			}
			continue
		}

		if asn, err := strconv.Atoi(line); err == nil && asn > 0 {
			asns = append(asns, asn)
			continue
		}

		if _, ipnet, err := net.ParseCIDR(line); err == nil {
			if start := ipnet.IP.To4(); start != nil {
				end := make(net.IP, 4)
				for i := range start {
					end[i] = start[i] | ^ipnet.Mask[i]
				}
				ranges = append(ranges, GeoIPRange{Start: start.String(), End: end.String()})
			}
			continue
		}
	}

	return asns, ranges, scanner.Err()
}

func fetchGeoBlockList(uri string) ([]int, []GeoIPRange, error) {
	if !strings.HasPrefix(uri, "https://") && !strings.HasPrefix(uri, "http://") {
		return nil, nil, fmt.Errorf("unsupported list URI")
	}

	client := http.Client{Timeout: 120 * time.Second}
	resp, err := client.Get(uri)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, nil, fmt.Errorf("fetch failed: %d", resp.StatusCode)
	}

	return parseGeoBlockList(io.LimitReader(resp.Body, 32*1024*1024))
}

func geoRangeToUint32(r GeoIPRange) (uint32, uint32, bool) {
	start := net.ParseIP(r.Start)
	end := net.ParseIP(r.End)
	if start == nil || end == nil {
		return 0, 0, false
	}
	start4 := start.To4()
	end4 := end.To4()
	if start4 == nil || end4 == nil {
		return 0, 0, false
	}
	s := binary.BigEndian.Uint32(start4)
	e := binary.BigEndian.Uint32(end4)
	if s > e {
		return 0, 0, false
	}
	return s, e, true
}

func mergeGeoRanges(ranges []GeoIPRange) []GeoIPRange {
	type span struct{ s, e uint32 }
	spans := []span{}
	for _, r := range ranges {
		s, e, ok := geoRangeToUint32(r)
		if !ok {
			continue
		}
		spans = append(spans, span{s, e})
	}
	sort.Slice(spans, func(i, j int) bool { return spans[i].s < spans[j].s })

	merged := []span{}
	for _, sp := range spans {
		if len(merged) > 0 {
			last := &merged[len(merged)-1]
			if last.e == ^uint32(0) || sp.s <= last.e+1 {
				if sp.e > last.e {
					last.e = sp.e
				}
				continue
			}
		}
		merged = append(merged, sp)
	}

	result := []GeoIPRange{}
	buf := make(net.IP, 4)
	for _, sp := range merged {
		binary.BigEndian.PutUint32(buf, sp.s)
		start := buf.String()
		binary.BigEndian.PutUint32(buf, sp.e)
		result = append(result, GeoIPRange{Start: start, End: buf.String()})
	}
	return result
}

func programGeoBlockSet(ranges []GeoIPRange) error {
	FWmtx.Lock()
	defer FWmtx.Unlock()

	err := FlushSetWithTable("inet", "filter", gGeoBlockSetName)
	if err != nil {
		return err
	}

	pairs := [][2]net.IP{}
	for _, r := range ranges {
		start := net.ParseIP(r.Start)
		end := net.ParseIP(r.End)
		if start == nil || end == nil {
			continue
		}
		pairs = append(pairs, [2]net.IP{start, end})
	}

	return AddIPRangesToSet("inet", "filter", gGeoBlockSetName, pairs)
}

func saveGeoBlockCache(cache geoBlockCache) {
	data, err := json.Marshal(cache)
	if err == nil {
		os.WriteFile(GeoBlockCachePath, data, 0600)
	}
}

func loadGeoBlockCache() (geoBlockCache, error) {
	cache := geoBlockCache{}
	data, err := os.ReadFile(GeoBlockCachePath)
	if err != nil {
		return cache, err
	}
	err = json.Unmarshal(data, &cache)
	return cache, err
}

func geoBlockRefresh() GeoBlockStatus {
	gGeoRefreshMtx.Lock()
	defer gGeoRefreshMtx.Unlock()

	config := geoBlockConfigCopy()
	now := time.Now().UTC().Format(time.RFC3339)

	if !config.Enabled {
		FlushSetWithTable("inet", "filter", gGeoBlockSetName)
		status := GeoBlockStatus{Enabled: false, LastRefresh: now}
		gGeoMtx.Lock()
		gGeoStatus = status
		gGeoMtx.Unlock()
		return status
	}

	sources := []GeoBlockSource{}
	allRanges := []GeoIPRange{}

	countries, err := resolveCountryRanges(config.DenyCountries)
	if err != nil {
		for _, cc := range config.DenyCountries {
			sources = append(sources, GeoBlockSource{Type: "country", Key: cc, Error: err.Error()})
		}
	} else {
		for _, entry := range countries {
			sources = append(sources, GeoBlockSource{Type: "country", Key: entry.Country, Ranges: len(entry.Ranges)})
			allRanges = append(allRanges, entry.Ranges...)
		}
	}

	denyASNs := []int{}
	for _, entry := range config.DenyASNs {
		denyASNs = append(denyASNs, entry.ASN)
	}
	asns, err := resolveASNRanges(denyASNs)
	if err != nil {
		for _, entry := range config.DenyASNs {
			sources = append(sources, GeoBlockSource{Type: "asn", Key: "AS" + strconv.Itoa(entry.ASN), Error: err.Error()})
		}
	} else {
		for _, entry := range asns {
			sources = append(sources, GeoBlockSource{Type: "asn", Key: "AS" + strconv.Itoa(entry.ASN), Ranges: len(entry.Ranges)})
			allRanges = append(allRanges, entry.Ranges...)
		}
	}

	for _, list := range config.Lists {
		if !list.Enabled {
			continue
		}
		source := GeoBlockSource{Type: "list", Key: list.URI, LastFetch: now}

		listASNs, listRanges, err := fetchGeoBlockList(list.URI)
		if err == nil && len(listASNs) > 0 {
			resolved, rerr := resolveASNRanges(listASNs)
			if rerr != nil {
				err = rerr
			} else {
				for _, entry := range resolved {
					listRanges = append(listRanges, entry.Ranges...)
				}
			}
		}

		if err != nil {
			source.Error = err.Error()
		} else {
			source.ASNs = len(listASNs)
			source.Ranges = len(listRanges)
			allRanges = append(allRanges, listRanges...)
		}
		sources = append(sources, source)
	}

	merged := mergeGeoRanges(allRanges)

	status := GeoBlockStatus{
		Enabled:          true,
		LastRefresh:      now,
		RangesProgrammed: len(merged),
		Sources:          sources,
	}

	if len(merged) == 0 {
		anyError := false
		for _, source := range sources {
			if source.Error != "" {
				anyError = true
				break
			}
		}
		if anyError {
			gGeoMtx.Lock()
			status.RangesProgrammed = gGeoStatus.RangesProgrammed
			gGeoStatus = status
			gGeoMtx.Unlock()
			return status
		}
	}

	err = programGeoBlockSet(merged)
	if err != nil {
		fmt.Println("[geo_block] failed to program nft set:", err)
		status.RangesProgrammed = 0
		status.Sources = append(status.Sources,
			GeoBlockSource{Type: "nft", Key: gGeoBlockSetName, Error: err.Error()})
	} else {
		saveGeoBlockCache(geoBlockCache{LastRefresh: now, Ranges: merged, Sources: sources})
	}

	gGeoMtx.Lock()
	gGeoStatus = status
	gGeoMtx.Unlock()

	SprbusPublish("firewall:geo_block:refresh", status)

	return status
}

func applyGeoBlockFromCache() {
	config := geoBlockConfigCopy()
	if !config.Enabled {
		return
	}

	cache, err := loadGeoBlockCache()
	if err != nil || len(cache.Ranges) == 0 {
		return
	}

	err = programGeoBlockSet(cache.Ranges)
	if err != nil {
		fmt.Println("[geo_block] failed to restore nft set from cache:", err)
		return
	}

	gGeoMtx.Lock()
	gGeoStatus = GeoBlockStatus{
		Enabled:          true,
		LastRefresh:      cache.LastRefresh,
		RangesProgrammed: len(cache.Ranges),
		Sources:          cache.Sources,
	}
	gGeoMtx.Unlock()
}

func geoBlockTicker() {
	for {
		time.Sleep(time.Minute)

		config := geoBlockConfigCopy()
		if !config.Enabled {
			continue
		}

		gGeoMtx.Lock()
		lastRefresh := gGeoStatus.LastRefresh
		gGeoMtx.Unlock()

		stale := true
		if lastRefresh != "" {
			if last, err := time.Parse(time.RFC3339, lastRefresh); err == nil {
				stale = time.Since(last) >= time.Duration(config.RefreshSeconds)*time.Second
			}
		}

		if stale {
			geoBlockRefresh()
		}
	}
}

func initGeoBlock() {
	loadGeoBlockConfig()
	go func() {
		applyGeoBlockFromCache()
		geoBlockTicker()
	}()
}

func validateGeoBlockConfig(config *GeoBlockConfig) error {
	countries := []string{}
	for _, cc := range config.DenyCountries {
		cc = strings.ToUpper(strings.TrimSpace(cc))
		if len(cc) != 2 || cc[0] < 'A' || cc[0] > 'Z' || cc[1] < 'A' || cc[1] > 'Z' {
			return fmt.Errorf("invalid country code: %s", cc)
		}
		countries = append(countries, cc)
	}
	config.DenyCountries = countries

	for _, entry := range config.DenyASNs {
		if entry.ASN <= 0 {
			return fmt.Errorf("invalid ASN: %d", entry.ASN)
		}
	}

	for _, list := range config.Lists {
		if !strings.HasPrefix(list.URI, "https://") && !strings.HasPrefix(list.URI, "http://") {
			return fmt.Errorf("invalid list URI: %s", list.URI)
		}
	}

	if config.RefreshSeconds < 3600 {
		config.RefreshSeconds = 86400
	}

	return nil
}

func geoBlockConfigHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPut {
		config := GeoBlockConfig{}
		if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		if err := validateGeoBlockConfig(&config); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		gGeoMtx.Lock()
		gGeoConfig = config
		err := saveGeoBlockConfigLocked()
		gGeoMtx.Unlock()
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		go geoBlockRefresh()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(geoBlockConfigCopy())
}

func geoBlockStatusHandler(w http.ResponseWriter, r *http.Request) {
	gGeoMtx.Lock()
	status := gGeoStatus
	gGeoMtx.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

func geoBlockRefreshHandler(w http.ResponseWriter, r *http.Request) {
	status := geoBlockRefresh()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

func geoBlockCountryHandler(w http.ResponseWriter, r *http.Request) {
	cc := strings.ToUpper(strings.TrimSpace(mux.Vars(r)["cc"]))
	if len(cc) != 2 || cc[0] < 'A' || cc[0] > 'Z' || cc[1] < 'A' || cc[1] > 'Z' {
		http.Error(w, "invalid country code", 400)
		return
	}

	gGeoMtx.Lock()
	countries := []string{}
	for _, entry := range gGeoConfig.DenyCountries {
		if entry != cc {
			countries = append(countries, entry)
		}
	}
	if r.Method == http.MethodPut {
		countries = append(countries, cc)
	}
	gGeoConfig.DenyCountries = countries
	err := saveGeoBlockConfigLocked()
	gGeoMtx.Unlock()
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	go geoBlockRefresh()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(geoBlockConfigCopy())
}

func geoBlockASNHandler(w http.ResponseWriter, r *http.Request) {
	asn, err := strconv.Atoi(mux.Vars(r)["asn"])
	if err != nil || asn <= 0 {
		http.Error(w, "invalid ASN", 400)
		return
	}

	name := ""
	if r.Method == http.MethodPut {
		info := []lookupASNRanges{}
		if lookupPluginGet("/asn_ranges/"+strconv.Itoa(asn), &info) == nil && len(info) == 1 {
			name = info[0].Name
		}
	}

	gGeoMtx.Lock()
	asns := []GeoASN{}
	for _, entry := range gGeoConfig.DenyASNs {
		if entry.ASN != asn {
			asns = append(asns, entry)
		}
	}
	if r.Method == http.MethodPut {
		asns = append(asns, GeoASN{ASN: asn, Name: name})
	}
	gGeoConfig.DenyASNs = asns
	err = saveGeoBlockConfigLocked()
	gGeoMtx.Unlock()
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	go geoBlockRefresh()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(geoBlockConfigCopy())
}
