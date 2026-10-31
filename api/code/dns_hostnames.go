package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/gorilla/mux"
)

// LocalMappingsPath is the hosts(5)-style file consumed by CoreDNS. It is a
// variable so tests can point the API at a temporary file.
var LocalMappingsPath = TEST_PREFIX + "/state/dns/local_mappings"

// DNSHostnameMapping is one split-horizon record served by SPR's CoreDNS.
type DNSHostnameMapping struct {
	Hostname  string
	IPAddress string
}

// DNSHostnameMutation adds compare-and-swap controls to a mapping write.
// CreateOnly prevents replacing an existing hostname. PreviousIPAddress makes
// an update conditional on the mapping still having the value the caller read.
type DNSHostnameMutation struct {
	IPAddress         string
	PreviousIPAddress string
	CreateOnly        bool
}

var dnsHostnameLabelRE = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`)

func normalizeDNSHostname(hostname string) (string, error) {
	hostname = strings.ToLower(strings.TrimSuffix(strings.TrimSpace(hostname), "."))
	if hostname == "" || len(hostname) > 253 {
		return "", fmt.Errorf("invalid hostname")
	}
	for _, label := range strings.Split(hostname, ".") {
		if !dnsHostnameLabelRE.MatchString(label) {
			return "", fmt.Errorf("invalid hostname %q", hostname)
		}
	}
	return hostname, nil
}

func normalizeDNSHostnameMapping(mapping DNSHostnameMapping) (DNSHostnameMapping, error) {
	hostname, err := normalizeDNSHostname(mapping.Hostname)
	if err != nil {
		return DNSHostnameMapping{}, err
	}
	ip := net.ParseIP(strings.TrimSpace(mapping.IPAddress))
	if ip == nil || ip.IsUnspecified() || ip.IsMulticast() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || (!ip.IsPrivate() && !isDNSHostnameCGNAT(ip)) {
		return DNSHostnameMapping{}, fmt.Errorf("invalid IP address %q", mapping.IPAddress)
	}
	return DNSHostnameMapping{Hostname: hostname, IPAddress: ip.String()}, nil
}

func isReservedDNSHostname(hostname string) bool {
	return hostname == "spr.lan" || strings.HasSuffix(hostname, ".spr.lan")
}

func isDNSHostnameCGNAT(ip net.IP) bool {
	ip4 := ip.To4()
	return ip4 != nil && ip4[0] == 100 && ip4[1] >= 64 && ip4[1] <= 127
}

func decodeDNSHostnameMutation(w http.ResponseWriter, r *http.Request) (DNSHostnameMutation, error) {
	var request DNSHostnameMutation
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8*1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		return DNSHostnameMutation{}, err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return DNSHostnameMutation{}, fmt.Errorf("request body must contain one JSON value")
	}
	return request, nil
}

func findDNSHostnameMapping(mappings []DNSHostnameMapping, hostname string) (DNSHostnameMapping, bool) {
	for _, mapping := range mappings {
		if mapping.Hostname == hostname {
			return mapping, true
		}
	}
	return DNSHostnameMapping{}, false
}

func upsertDNSHostnameMapping(mappings []DNSHostnameMapping, mapping DNSHostnameMapping) []DNSHostnameMapping {
	updated := make([]DNSHostnameMapping, 0, len(mappings)+1)
	for _, existing := range mappings {
		if existing.Hostname != mapping.Hostname {
			updated = append(updated, existing)
		}
	}
	updated = append(updated, mapping)
	sort.Slice(updated, func(i, j int) bool { return updated[i].Hostname < updated[j].Hostname })
	return updated
}

func readDNSHostnameMappingsLocked() ([]DNSHostnameMapping, error) {
	file, err := os.Open(LocalMappingsPath)
	if err != nil {
		if os.IsNotExist(err) {
			return []DNSHostnameMapping{}, nil
		}
		return nil, err
	}
	defer file.Close()

	var mappings []DNSHostnameMapping
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		ip := net.ParseIP(fields[0])
		if ip == nil {
			continue
		}
		for _, hostname := range fields[1:] {
			normalized, err := normalizeDNSHostname(hostname)
			if err != nil {
				continue
			}
			mappings = append(mappings, DNSHostnameMapping{Hostname: normalized, IPAddress: ip.String()})
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	sort.Slice(mappings, func(i, j int) bool {
		if mappings[i].Hostname == mappings[j].Hostname {
			return mappings[i].IPAddress < mappings[j].IPAddress
		}
		return mappings[i].Hostname < mappings[j].Hostname
	})
	return mappings, nil
}

func writeDNSHostnameMappingsLocked(mappings []DNSHostnameMapping) error {
	dir := filepath.Dir(LocalMappingsPath)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}

	tmp, err := os.CreateTemp(dir, ".local_mappings.*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)

	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return err
	}
	writer := bufio.NewWriter(tmp)
	for _, mapping := range mappings {
		if _, err := fmt.Fprintf(writer, "%s %s\n", mapping.IPAddress, mapping.Hostname); err != nil {
			tmp.Close()
			return err
		}
	}
	if err := writer.Flush(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, LocalMappingsPath)
}

func localMappingsPinnedPath() string {
	return LocalMappingsPath + ".pinned"
}

func readPinnedDNSHostnamesLocked() (map[string]bool, error) {
	pinned := map[string]bool{}
	data, err := os.ReadFile(localMappingsPinnedPath())
	if err != nil {
		if os.IsNotExist(err) {
			return pinned, nil
		}
		return nil, err
	}
	var hostnames []string
	if err := json.Unmarshal(data, &hostnames); err != nil {
		return nil, err
	}
	for _, hostname := range hostnames {
		pinned[hostname] = true
	}
	return pinned, nil
}

func writePinnedDNSHostnamesLocked(pinned map[string]bool) error {
	hostnames := make([]string, 0, len(pinned))
	for hostname := range pinned {
		hostnames = append(hostnames, hostname)
	}
	sort.Strings(hostnames)
	return saveFileJSON(localMappingsPinnedPath(), hostnames)
}

func pinDNSHostnameLocked(hostname string) error {
	pinned, err := readPinnedDNSHostnamesLocked()
	if err != nil {
		return err
	}
	if pinned[hostname] {
		return nil
	}
	pinned[hostname] = true
	return writePinnedDNSHostnamesLocked(pinned)
}

type DNSHostnameListEntry struct {
	DNSHostnameMapping
	DeviceName string `json:",omitempty"`
	Reserved   bool   `json:",omitempty"`
	Pinned     bool   `json:",omitempty"`
}

func deviceNameForHostname(devices map[string]DeviceEntry, mapping DNSHostnameMapping) string {
	name := ""
	for _, device := range devices {
		label := localMappingLabel(device.Name)
		if label == "" || label+".lan" != mapping.Hostname {
			continue
		}
		if device.RecentIP == mapping.IPAddress {
			return device.Name
		}
		if name == "" || device.Name < name {
			name = device.Name
		}
	}
	return name
}

func dnsHostnames(w http.ResponseWriter, r *http.Request) {
	Devicesmtx.Lock()
	devices := getDevicesJson()
	Devicesmtx.Unlock()

	LocalMappingsmtx.Lock()
	mappings, err := readDNSHostnameMappingsLocked()
	var pinned map[string]bool
	if err == nil {
		pinned, err = readPinnedDNSHostnamesLocked()
	}
	LocalMappingsmtx.Unlock()
	if err != nil {
		http.Error(w, "failed to read local DNS mappings", http.StatusInternalServerError)
		return
	}

	entries := make([]DNSHostnameListEntry, 0, len(mappings)+len(pinned))
	listed := map[string]bool{}
	for _, mapping := range mappings {
		listed[mapping.Hostname] = true
		entries = append(entries, DNSHostnameListEntry{DNSHostnameMapping: mapping, Pinned: pinned[mapping.Hostname]})
	}
	for hostname := range pinned {
		if !listed[hostname] {
			entries = append(entries, DNSHostnameListEntry{DNSHostnameMapping: DNSHostnameMapping{Hostname: hostname}, Pinned: true})
		}
	}
	for i := range entries {
		entries[i].Reserved = isReservedDNSHostname(entries[i].Hostname)
		if !entries[i].Reserved {
			entries[i].DeviceName = deviceNameForHostname(devices, entries[i].DNSHostnameMapping)
		}
	}
	sort.SliceStable(entries, func(i, j int) bool { return entries[i].Hostname < entries[j].Hostname })

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entries)
}

func dnsHostnameReset(w http.ResponseWriter, r *http.Request) {
	hostname, err := normalizeDNSHostname(mux.Vars(r)["hostname"])
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()
	devices := getDevicesJson()

	LocalMappingsmtx.Lock()
	pinned, err := readPinnedDNSHostnamesLocked()
	found := err == nil && pinned[hostname]
	if found {
		delete(pinned, hostname)
		err = writePinnedDNSHostnamesLocked(pinned)
	}
	LocalMappingsmtx.Unlock()
	if err != nil {
		http.Error(w, "failed to update pinned hostnames", http.StatusInternalServerError)
		return
	}
	if !found {
		http.Error(w, "hostname is not pinned", http.StatusNotFound)
		return
	}

	keys := make([]string, 0, len(devices))
	for key := range devices {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		device := devices[key]
		if label := localMappingLabel(device.Name); label != "" && label+".lan" == hostname {
			updateDeviceLocalMappings(devices, deviceLocalMappingUpdate{
				Key:          key,
				PreviousName: device.Name,
				Name:         device.Name,
				IP:           device.RecentIP,
			})
			break
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

// dnsHostname exposes one split-horizon DNS record at a time. Plugin install
// tokens can be scoped to /dns/hostnames:rw without receiving access to the
// complete local mappings collection or broader DNS configuration.
func dnsHostname(w http.ResponseWriter, r *http.Request) {
	serveDNSHostname(w, r, false)
}

func dnsHostnameOverride(w http.ResponseWriter, r *http.Request) {
	serveDNSHostname(w, r, true)
}

func serveDNSHostname(w http.ResponseWriter, r *http.Request, pin bool) {
	w.Header().Set("Content-Type", "application/json")
	hostname, err := normalizeDNSHostname(mux.Vars(r)["hostname"])
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	LocalMappingsmtx.Lock()
	defer LocalMappingsmtx.Unlock()

	mappings, err := readDNSHostnameMappingsLocked()
	if err != nil {
		http.Error(w, "failed to read local DNS mappings", http.StatusInternalServerError)
		return
	}
	current, exists := findDNSHostnameMapping(mappings, hostname)

	switch r.Method {
	case http.MethodGet:
		if !exists {
			http.Error(w, "hostname mapping not found", http.StatusNotFound)
			return
		}
		_ = json.NewEncoder(w).Encode(current)
	case http.MethodPut:
		if isReservedDNSHostname(hostname) {
			http.Error(w, "hostname is reserved", http.StatusForbidden)
			return
		}
		request, err := decodeDNSHostnameMutation(w, r)
		if err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		desired, err := normalizeDNSHostnameMapping(DNSHostnameMapping{Hostname: hostname, IPAddress: request.IPAddress})
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if request.CreateOnly && request.PreviousIPAddress != "" {
			http.Error(w, "CreateOnly and PreviousIPAddress cannot be combined", http.StatusBadRequest)
			return
		}
		if request.CreateOnly && exists {
			http.Error(w, "hostname mapping already exists", http.StatusConflict)
			return
		}
		if request.PreviousIPAddress != "" {
			previous := net.ParseIP(strings.TrimSpace(request.PreviousIPAddress))
			if previous == nil {
				http.Error(w, "invalid previous IP address", http.StatusBadRequest)
				return
			}
			if !exists || current.IPAddress != previous.String() {
				http.Error(w, "hostname mapping changed", http.StatusConflict)
				return
			}
		}

		if pin {
			if err := pinDNSHostnameLocked(hostname); err != nil {
				http.Error(w, "failed to update pinned hostnames", http.StatusInternalServerError)
				return
			}
		}
		updated := upsertDNSHostnameMapping(mappings, desired)
		if err := writeDNSHostnameMappingsLocked(updated); err != nil {
			http.Error(w, "failed to write local DNS mappings", http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(desired)
	case http.MethodDelete:
		request, err := decodeDNSHostnameMutation(w, r)
		if err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if request.IPAddress != "" {
			expected := net.ParseIP(strings.TrimSpace(request.IPAddress))
			if expected == nil {
				http.Error(w, "invalid expected IP address", http.StatusBadRequest)
				return
			}
			if !exists || current.IPAddress != expected.String() {
				http.Error(w, "hostname mapping changed", http.StatusConflict)
				return
			}
		}

		updated := make([]DNSHostnameMapping, 0, len(mappings))
		found := false
		for _, mapping := range mappings {
			if mapping.Hostname == hostname {
				found = true
				continue
			}
			updated = append(updated, mapping)
		}
		if !found {
			http.Error(w, "hostname mapping not found", http.StatusNotFound)
			return
		}
		if pin && !isReservedDNSHostname(hostname) {
			if err := pinDNSHostnameLocked(hostname); err != nil {
				http.Error(w, "failed to update pinned hostnames", http.StatusInternalServerError)
				return
			}
		}
		if err := writeDNSHostnameMappingsLocked(updated); err != nil {
			http.Error(w, "failed to write local DNS mappings", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
