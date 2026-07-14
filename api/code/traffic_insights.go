package main

import (
	"compress/gzip"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

import (
	"github.com/gorilla/mux"
)

var TrafficInsightsConfigPath = TEST_PREFIX + "/configs/base/traffic_insights.json"
var TrafficInsightsStatePath = TEST_PREFIX + "/state/api/traffic_insights.json.gz"

const gInsightMaxDstPerDevice = 512
const gInsightOtherKey = "other"

type TrafficInsightsConfig struct {
	Enabled       bool
	RetentionDays int
}

type InsightDstStat struct {
	BytesIn    uint64
	BytesOut   uint64
	PacketsIn  uint64
	PacketsOut uint64
	ASN        int    `json:",omitempty"`
	ASNName    string `json:",omitempty"`
	Country    string `json:",omitempty"`
	Domain     string `json:",omitempty"`
	LastSeen   time.Time
}

type insightBucket struct {
	Start   time.Time
	Devices map[string]map[string]*InsightDstStat
}

type insightCounter struct {
	Bytes   uint64
	Packets uint64
}

type asnCacheEntry struct {
	ASN     int
	Name    string
	Country string
}

var gInsightsMtx sync.Mutex
var gInsightsConfig = TrafficInsightsConfig{Enabled: true, RetentionDays: 7}
var gInsightBuckets = []*insightBucket{}
var gInsightPrev = map[string]insightCounter{}
var gInsightASNCache = map[string]asnCacheEntry{}
var gInsightDirty = false

func loadTrafficInsightsConfig() {
	data, err := os.ReadFile(TrafficInsightsConfigPath)
	if err != nil {
		return
	}
	config := TrafficInsightsConfig{}
	if err := json.Unmarshal(data, &config); err != nil {
		fmt.Println("[traffic_insights] invalid config:", err)
		return
	}
	if config.RetentionDays < 1 {
		config.RetentionDays = 7
	}
	if config.RetentionDays > 90 {
		config.RetentionDays = 90
	}
	gInsightsMtx.Lock()
	gInsightsConfig = config
	gInsightsMtx.Unlock()
}

func loadTrafficInsightsState() {
	f, err := os.Open(TrafficInsightsStatePath)
	if err != nil {
		return
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		return
	}
	defer gz.Close()

	buckets := []*insightBucket{}
	if err := json.NewDecoder(gz).Decode(&buckets); err != nil {
		fmt.Println("[traffic_insights] failed to load state:", err)
		return
	}

	gInsightsMtx.Lock()
	gInsightBuckets = buckets
	gInsightsMtx.Unlock()
}

func saveTrafficInsightsState() {
	gInsightsMtx.Lock()
	if !gInsightDirty {
		gInsightsMtx.Unlock()
		return
	}
	data, err := json.Marshal(gInsightBuckets)
	gInsightDirty = false
	gInsightsMtx.Unlock()

	if err != nil {
		return
	}

	tmp := TrafficInsightsStatePath + ".tmp"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if err != nil {
		return
	}

	gz := gzip.NewWriter(f)
	_, werr := gz.Write(data)
	if err := gz.Close(); werr == nil {
		werr = err
	}
	if err := f.Close(); werr == nil {
		werr = err
	}

	if werr != nil {
		os.Remove(tmp)
		return
	}
	os.Rename(tmp, TrafficInsightsStatePath)
}

func insightSupernets() []*net.IPNet {
	DHCPmtx.Lock()
	tinyNets := append([]string{}, gDhcpConfig.TinyNets...)
	DHCPmtx.Unlock()

	nets := []*net.IPNet{}
	for _, subnet := range tinyNets {
		_, ipnet, err := net.ParseCIDR(subnet)
		if err == nil {
			nets = append(nets, ipnet)
		}
	}
	return nets
}

func ipInNets(ip net.IP, nets []*net.IPNet) bool {
	for _, ipnet := range nets {
		if ipnet.Contains(ip) {
			return true
		}
	}
	return false
}

func insightSkipRemote(ip net.IP) bool {
	return ip.IsMulticast() || ip.IsUnspecified() || ip.IsLoopback() ||
		ip.IsLinkLocalUnicast() || ip.Equal(net.IPv4bcast)
}

func insightLookupASNs(ips []string) map[string]asnCacheEntry {
	result := map[string]asnCacheEntry{}
	missing := []string{}

	gInsightsMtx.Lock()
	if len(gInsightASNCache) > 65536 {
		gInsightASNCache = map[string]asnCacheEntry{}
	}
	for _, ip := range ips {
		if entry, exists := gInsightASNCache[ip]; exists {
			result[ip] = entry
		} else {
			missing = append(missing, ip)
		}
	}
	gInsightsMtx.Unlock()

	for start := 0; start < len(missing); start += 100 {
		end := start + 100
		if end > len(missing) {
			end = len(missing)
		}

		entries := []struct {
			IP      string
			ASN     int
			Name    string
			Country string
		}{}
		err := lookupPluginGet("/asns/"+strings.Join(missing[start:end], ","), &entries)
		if err != nil {
			break
		}

		gInsightsMtx.Lock()
		for _, entry := range entries {
			cached := asnCacheEntry{ASN: entry.ASN, Name: entry.Name, Country: entry.Country}
			gInsightASNCache[entry.IP] = cached
			result[entry.IP] = cached
		}
		for _, ip := range missing[start:end] {
			if _, exists := gInsightASNCache[ip]; !exists {
				gInsightASNCache[ip] = asnCacheEntry{}
			}
		}
		gInsightsMtx.Unlock()
	}

	return result
}

func insightCurrentBucketLocked(now time.Time) *insightBucket {
	start := now.UTC().Truncate(time.Hour)
	if len(gInsightBuckets) > 0 {
		last := gInsightBuckets[len(gInsightBuckets)-1]
		if last.Start.Equal(start) {
			return last
		}
	}
	bucket := &insightBucket{Start: start, Devices: map[string]map[string]*InsightDstStat{}}
	gInsightBuckets = append(gInsightBuckets, bucket)

	cutoff := now.UTC().Add(-time.Duration(gInsightsConfig.RetentionDays) * 24 * time.Hour)
	trimmed := gInsightBuckets[:0]
	for _, b := range gInsightBuckets {
		if b.Start.Add(time.Hour).After(cutoff) {
			trimmed = append(trimmed, b)
		}
	}
	gInsightBuckets = trimmed

	return bucket
}

type insightDelta struct {
	device  string
	remote  string
	out     bool
	bytes   uint64
	packets uint64
}

func computeInsightDeltas(entries []IPTrafficElement, nets []*net.IPNet, prev map[string]insightCounter) ([]insightDelta, map[string]insightCounter) {
	deltas := []insightDelta{}
	current := map[string]insightCounter{}

	for _, entry := range entries {
		src := net.ParseIP(entry.Src)
		dst := net.ParseIP(entry.Dst)
		if src == nil || dst == nil {
			continue
		}

		srcLocal := ipInNets(src, nets)
		dstLocal := ipInNets(dst, nets)
		if srcLocal == dstLocal {
			continue
		}

		device, remote := entry.Src, entry.Dst
		out := true
		if dstLocal {
			device, remote = entry.Dst, entry.Src
			out = false
		}

		if insightSkipRemote(net.ParseIP(remote)) {
			continue
		}

		key := entry.Interface + "|" + entry.Src + "|" + entry.Dst
		counter := insightCounter{Bytes: entry.Bytes, Packets: entry.Packets}
		current[key] = counter

		bytes := entry.Bytes
		packets := entry.Packets
		if last, exists := prev[key]; exists {
			if entry.Bytes >= last.Bytes {
				bytes = entry.Bytes - last.Bytes
				packets = entry.Packets - last.Packets
			}
		}

		if bytes == 0 && packets == 0 {
			continue
		}

		deltas = append(deltas, insightDelta{
			device:  device,
			remote:  remote,
			out:     out,
			bytes:   bytes,
			packets: packets,
		})
	}

	return deltas, current
}

func collectTrafficInsights() {
	gInsightsMtx.Lock()
	enabled := gInsightsConfig.Enabled
	gInsightsMtx.Unlock()
	if !enabled {
		return
	}

	entries := getIPTrafficSet()
	if entries == nil {
		return
	}

	nets := insightSupernets()
	if len(nets) == 0 {
		return
	}

	gInsightsMtx.Lock()
	prev := gInsightPrev
	gInsightsMtx.Unlock()

	deltas, current := computeInsightDeltas(entries, nets, prev)

	remotes := map[string]bool{}
	for _, delta := range deltas {
		remotes[delta.remote] = true
	}
	remoteList := []string{}
	for remote := range remotes {
		if !net.ParseIP(remote).IsPrivate() {
			remoteList = append(remoteList, remote)
		}
	}
	asns := insightLookupASNs(remoteList)

	now := time.Now()

	gInsightsMtx.Lock()
	defer gInsightsMtx.Unlock()

	gInsightPrev = current

	bucket := insightCurrentBucketLocked(now)
	for _, delta := range deltas {
		devStats, exists := bucket.Devices[delta.device]
		if !exists {
			devStats = map[string]*InsightDstStat{}
			bucket.Devices[delta.device] = devStats
		}

		remote := delta.remote
		stat, exists := devStats[remote]
		if !exists {
			if len(devStats) >= gInsightMaxDstPerDevice {
				remote = gInsightOtherKey
				stat = devStats[remote]
			}
			if stat == nil {
				stat = &InsightDstStat{}
				devStats[remote] = stat
			}
		}

		if delta.out {
			stat.BytesOut += delta.bytes
			stat.PacketsOut += delta.packets
		} else {
			stat.BytesIn += delta.bytes
			stat.PacketsIn += delta.packets
		}
		stat.LastSeen = now.UTC()

		if remote != gInsightOtherKey {
			if entry, exists := asns[delta.remote]; exists && entry.ASN != 0 {
				stat.ASN = entry.ASN
				stat.ASNName = entry.Name
				stat.Country = entry.Country
			}
			if stat.Domain == "" {
				DNSCachemtx.RLock()
				stat.Domain = DNSCache[delta.remote]
				DNSCachemtx.RUnlock()
			}
		}
	}

	gInsightDirty = true
}

func initTrafficInsights() {
	loadTrafficInsightsConfig()
	loadTrafficInsightsState()

	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		for range ticker.C {
			saveTrafficInsightsState()
		}
	}()
}

func insightWindow(r *http.Request) (time.Time, time.Time) {
	minutes := 1440
	if arg := r.URL.Query().Get("minutes"); arg != "" {
		if n, err := strconv.Atoi(arg); err == nil && n > 0 {
			minutes = n
		}
	}

	end := time.Now().UTC()
	return end.Add(-time.Duration(minutes) * time.Minute), end
}

func insightBucketsInWindow(start time.Time) []*insightBucket {
	buckets := []*insightBucket{}
	for _, bucket := range gInsightBuckets {
		if bucket.Start.Add(time.Hour).After(start) {
			buckets = append(buckets, bucket)
		}
	}
	return buckets
}

type InsightDevBytes struct {
	IP       string
	BytesIn  uint64
	BytesOut uint64
}

type InsightASNBytes struct {
	ASN      int
	Name     string
	Country  string `json:",omitempty"`
	BytesIn  uint64
	BytesOut uint64
	Devices  []InsightDevBytes `json:",omitempty"`
}

type InsightCountry struct {
	Country  string
	BytesIn  uint64
	BytesOut uint64
	Devices  []InsightDevBytes
	ASNs     []InsightASNBytes
}

type InsightOverview struct {
	Start     time.Time
	End       time.Time
	TotalIn   uint64
	TotalOut  uint64
	Countries []InsightCountry
	ASNs      []InsightASNBytes
}

func sortedDevBytes(devices map[string]*InsightDevBytes) []InsightDevBytes {
	result := []InsightDevBytes{}
	for _, entry := range devices {
		result = append(result, *entry)
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].BytesIn+result[i].BytesOut > result[j].BytesIn+result[j].BytesOut
	})
	return result
}

func trafficInsightsOverviewHandler(w http.ResponseWriter, r *http.Request) {
	start, end := insightWindow(r)

	type countryAgg struct {
		in, out uint64
		devices map[string]*InsightDevBytes
		asns    map[int]*InsightASNBytes
	}
	type asnAgg struct {
		name    string
		country string
		in, out uint64
		devices map[string]*InsightDevBytes
	}

	countries := map[string]*countryAgg{}
	asns := map[int]*asnAgg{}
	totalIn, totalOut := uint64(0), uint64(0)

	gInsightsMtx.Lock()
	for _, bucket := range insightBucketsInWindow(start) {
		for device, devStats := range bucket.Devices {
			for _, stat := range devStats {
				totalIn += stat.BytesIn
				totalOut += stat.BytesOut

				cc := stat.Country
				country, exists := countries[cc]
				if !exists {
					country = &countryAgg{devices: map[string]*InsightDevBytes{}, asns: map[int]*InsightASNBytes{}}
					countries[cc] = country
				}
				country.in += stat.BytesIn
				country.out += stat.BytesOut

				dev, exists := country.devices[device]
				if !exists {
					dev = &InsightDevBytes{IP: device}
					country.devices[device] = dev
				}
				dev.BytesIn += stat.BytesIn
				dev.BytesOut += stat.BytesOut

				if stat.ASN != 0 {
					centry, exists := country.asns[stat.ASN]
					if !exists {
						centry = &InsightASNBytes{ASN: stat.ASN, Name: stat.ASNName}
						country.asns[stat.ASN] = centry
					}
					centry.BytesIn += stat.BytesIn
					centry.BytesOut += stat.BytesOut

					aentry, exists := asns[stat.ASN]
					if !exists {
						aentry = &asnAgg{name: stat.ASNName, country: stat.Country, devices: map[string]*InsightDevBytes{}}
						asns[stat.ASN] = aentry
					}
					aentry.in += stat.BytesIn
					aentry.out += stat.BytesOut

					adev, exists := aentry.devices[device]
					if !exists {
						adev = &InsightDevBytes{IP: device}
						aentry.devices[device] = adev
					}
					adev.BytesIn += stat.BytesIn
					adev.BytesOut += stat.BytesOut
				}
			}
		}
	}
	gInsightsMtx.Unlock()

	overview := InsightOverview{
		Start:     start,
		End:       end,
		TotalIn:   totalIn,
		TotalOut:  totalOut,
		Countries: []InsightCountry{},
		ASNs:      []InsightASNBytes{},
	}

	for cc, agg := range countries {
		asnList := []InsightASNBytes{}
		for _, entry := range agg.asns {
			asnList = append(asnList, *entry)
		}
		sort.Slice(asnList, func(i, j int) bool {
			return asnList[i].BytesIn+asnList[i].BytesOut > asnList[j].BytesIn+asnList[j].BytesOut
		})
		if len(asnList) > 10 {
			asnList = asnList[:10]
		}

		overview.Countries = append(overview.Countries, InsightCountry{
			Country:  cc,
			BytesIn:  agg.in,
			BytesOut: agg.out,
			Devices:  sortedDevBytes(agg.devices),
			ASNs:     asnList,
		})
	}
	sort.Slice(overview.Countries, func(i, j int) bool {
		return overview.Countries[i].BytesIn+overview.Countries[i].BytesOut >
			overview.Countries[j].BytesIn+overview.Countries[j].BytesOut
	})

	for asn, agg := range asns {
		overview.ASNs = append(overview.ASNs, InsightASNBytes{
			ASN:      asn,
			Name:     agg.name,
			Country:  agg.country,
			BytesIn:  agg.in,
			BytesOut: agg.out,
			Devices:  sortedDevBytes(agg.devices),
		})
	}
	sort.Slice(overview.ASNs, func(i, j int) bool {
		return overview.ASNs[i].BytesIn+overview.ASNs[i].BytesOut >
			overview.ASNs[j].BytesIn+overview.ASNs[j].BytesOut
	})
	if len(overview.ASNs) > 50 {
		overview.ASNs = overview.ASNs[:50]
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(overview)
}

type InsightDestination struct {
	IP       string
	Domain   string `json:",omitempty"`
	ASN      int    `json:",omitempty"`
	ASNName  string `json:",omitempty"`
	Country  string `json:",omitempty"`
	BytesIn  uint64
	BytesOut uint64
	LastSeen time.Time
}

type InsightDevice struct {
	IP           string
	BytesIn      uint64
	BytesOut     uint64
	Destinations []InsightDestination
}

func trafficInsightsDeviceHandler(w http.ResponseWriter, r *http.Request) {
	ip := mux.Vars(r)["ip"]
	if net.ParseIP(ip) == nil {
		http.Error(w, "invalid ip", 400)
		return
	}

	start, _ := insightWindow(r)

	merged := map[string]*InsightDestination{}

	gInsightsMtx.Lock()
	for _, bucket := range insightBucketsInWindow(start) {
		devStats, exists := bucket.Devices[ip]
		if !exists {
			continue
		}
		for remote, stat := range devStats {
			dest, exists := merged[remote]
			if !exists {
				dest = &InsightDestination{IP: remote}
				merged[remote] = dest
			}
			dest.BytesIn += stat.BytesIn
			dest.BytesOut += stat.BytesOut
			if stat.LastSeen.After(dest.LastSeen) {
				dest.LastSeen = stat.LastSeen
			}
			if stat.Domain != "" {
				dest.Domain = stat.Domain
			}
			if stat.ASN != 0 {
				dest.ASN = stat.ASN
				dest.ASNName = stat.ASNName
				dest.Country = stat.Country
			}
		}
	}
	gInsightsMtx.Unlock()

	device := InsightDevice{IP: ip, Destinations: []InsightDestination{}}
	for _, dest := range merged {
		device.BytesIn += dest.BytesIn
		device.BytesOut += dest.BytesOut
		device.Destinations = append(device.Destinations, *dest)
	}
	sort.Slice(device.Destinations, func(i, j int) bool {
		return device.Destinations[i].BytesIn+device.Destinations[i].BytesOut >
			device.Destinations[j].BytesIn+device.Destinations[j].BytesOut
	})
	if len(device.Destinations) > 500 {
		device.Destinations = device.Destinations[:500]
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(device)
}

func trafficInsightsConfigHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPut {
		config := TrafficInsightsConfig{}
		if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		if config.RetentionDays < 1 || config.RetentionDays > 90 {
			http.Error(w, "RetentionDays must be 1-90", 400)
			return
		}

		data, err := json.MarshalIndent(config, "", " ")
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		if err := os.WriteFile(TrafficInsightsConfigPath, data, 0600); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		gInsightsMtx.Lock()
		gInsightsConfig = config
		gInsightsMtx.Unlock()
	}

	gInsightsMtx.Lock()
	config := gInsightsConfig
	gInsightsMtx.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
}
