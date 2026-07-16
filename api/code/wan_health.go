package main

import (
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"math"
	"net"
	"net/http"
	"os"
	"os/exec"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"golang.org/x/net/icmp"
	"golang.org/x/net/ipv4"
)

var WanHealthConfigPath = TEST_PREFIX + "/configs/base/wan_health.json"
var WanHealthStatePath = TEST_PREFIX + "/state/api/wan_health.json"

type WanHealthConfig struct {
	Enabled          bool
	IntervalSeconds  int
	ProbeTargets     []string
	FailThreshold    int
	RecoverThreshold int
	FailoverEnabled  bool
	SpeedTestURL     string
}

type WanSample struct {
	Time      int64
	LatencyMs float64
	JitterMs  float64
	LossPct   float64
	Up        bool
}

type WanOutage struct {
	Iface  string
	Start  int64
	End    int64
	Reason string
}

type WanSpeedResult struct {
	Iface    string
	Time     int64
	DownMbps float64
	Seconds  float64
	Bytes    int64
	URL      string
	Error    string `json:",omitempty"`
}

type WanUplinkStatus struct {
	Iface        string
	Up           bool
	Active       bool
	Gateway      string
	LatencyMs    float64
	JitterMs     float64
	LossPct      float64
	LastChange   int64
	TotalOutages int
	Downtime24h  int64
}

type WanHealthState struct {
	Minutes map[string][]WanSample
	Hours   map[string][]WanSample
	Outages []WanOutage
	Speed   []WanSpeedResult
}

type wanTickResult struct {
	ok  bool
	rtt float64
}

type wanUplinkRuntime struct {
	window     []wanTickResult
	minuteAgg  []wanTickResult
	consecFail int
	consecOK   int
	up         bool
	seen       bool
	lastChange int64
}

const (
	wanMinuteCap       = 1440
	wanHourCap         = 720
	wanOutageCap       = 500
	wanSpeedCap        = 100
	wanWindowCap       = 60
	wanProbeWait       = 2 * time.Second
	wanSpeedLimit      = int64(64 * 1024 * 1024)
	wanProbeTableBase  = 200
	wanProbeTableLimit = 40
	wanProbeRulePref   = "100"
)

var WanHealthmtx sync.Mutex
var gWanHealthConfig = defaultWanHealthConfig()
var gWanHealthState = WanHealthState{
	Minutes: map[string][]WanSample{},
	Hours:   map[string][]WanSample{},
	Outages: []WanOutage{},
	Speed:   []WanSpeedResult{},
}
var gWanRuntime = map[string]*wanUplinkRuntime{}

var gWanDeadMtx sync.Mutex
var gWanDead = map[string]bool{}

var gWanProbeCounter uint32

func defaultWanHealthConfig() WanHealthConfig {
	return WanHealthConfig{
		Enabled:          false,
		IntervalSeconds:  5,
		ProbeTargets:     []string{"1.1.1.1", "8.8.8.8"},
		FailThreshold:    4,
		RecoverThreshold: 3,
		FailoverEnabled:  true,
		SpeedTestURL:     "https://speed.cloudflare.com/__down?bytes=33554432",
	}
}

func loadWanHealthConfig() WanHealthConfig {
	config := defaultWanHealthConfig()
	data, err := os.ReadFile(WanHealthConfigPath)
	if err == nil {
		json.Unmarshal(data, &config)
	}
	return sanitizeWanHealthConfig(config)
}

func sanitizeWanHealthConfig(config WanHealthConfig) WanHealthConfig {
	if config.IntervalSeconds < 2 || config.IntervalSeconds > 60 {
		config.IntervalSeconds = 5
	}
	if config.FailThreshold < 1 || config.FailThreshold > 60 {
		config.FailThreshold = 4
	}
	if config.RecoverThreshold < 1 || config.RecoverThreshold > 60 {
		config.RecoverThreshold = 3
	}
	targets := []string{}
	for _, target := range config.ProbeTargets {
		ip := net.ParseIP(target)
		if ip != nil && ip.To4() != nil {
			targets = append(targets, target)
		}
	}
	if len(targets) == 0 {
		targets = defaultWanHealthConfig().ProbeTargets
	}
	config.ProbeTargets = targets
	if !strings.HasPrefix(config.SpeedTestURL, "https://") &&
		!strings.HasPrefix(config.SpeedTestURL, "http://") {
		config.SpeedTestURL = defaultWanHealthConfig().SpeedTestURL
	}
	return config
}

func saveWanHealthConfig(config WanHealthConfig) error {
	file, err := json.MarshalIndent(config, "", " ")
	if err != nil {
		return err
	}
	return ioutil.WriteFile(WanHealthConfigPath, file, 0600)
}

func loadWanHealthState() {
	data, err := os.ReadFile(WanHealthStatePath)
	if err != nil {
		return
	}
	state := WanHealthState{}
	if json.Unmarshal(data, &state) != nil {
		return
	}
	if state.Minutes == nil {
		state.Minutes = map[string][]WanSample{}
	}
	if state.Hours == nil {
		state.Hours = map[string][]WanSample{}
	}
	if state.Outages == nil {
		state.Outages = []WanOutage{}
	}
	if state.Speed == nil {
		state.Speed = []WanSpeedResult{}
	}
	gWanHealthState = state
}

func saveWanHealthStateLocked() {
	file, err := json.MarshalIndent(gWanHealthState, "", " ")
	if err != nil {
		return
	}
	ioutil.WriteFile(WanHealthStatePath, file, 0600)
}

func wanHealthIfaceDead(name string) bool {
	gWanDeadMtx.Lock()
	defer gWanDeadMtx.Unlock()
	return gWanDead[name]
}

func setWanIfaceDead(name string, dead bool) {
	gWanDeadMtx.Lock()
	defer gWanDeadMtx.Unlock()
	if dead {
		gWanDead[name] = true
	} else {
		delete(gWanDead, name)
	}
}

func wanHealthUplinks() []string {
	Interfacesmtx.Lock()
	defer Interfacesmtx.Unlock()
	interfaces := loadInterfacesConfigLocked()
	uplinks := []string{}
	for _, iface := range interfaces {
		if iface.Type == "Uplink" && iface.Subtype != "pppup" && iface.Enabled {
			uplinks = append(uplinks, iface.Name)
		}
	}
	return uplinks
}

var gWanProbeRules = map[string]string{}

func wanIfaceSubnets(iface string) []string {
	subnets := []string{}
	netIface, err := net.InterfaceByName(iface)
	if err != nil {
		return subnets
	}
	addrs, err := netIface.Addrs()
	if err != nil {
		return subnets
	}
	for _, addr := range addrs {
		ipnet, ok := addr.(*net.IPNet)
		if !ok || ipnet.IP.To4() == nil {
			continue
		}
		network := &net.IPNet{IP: ipnet.IP.Mask(ipnet.Mask), Mask: ipnet.Mask}
		subnets = append(subnets, network.String())
	}
	return subnets
}

//device-bound sockets need a default route with matching oif; these rules
//only match bound sockets so forwarded traffic is unaffected
func wanSyncProbeRoutes(uplinks []string) {
	sorted := append([]string{}, uplinks...)
	sort.Strings(sorted)
	if len(sorted) > wanProbeTableLimit {
		sorted = sorted[:wanProbeTableLimit]
	}

	desired := map[string]string{}
	for index, iface := range sorted {
		desired[iface] = strconv.Itoa(wanProbeTableBase + index)
	}

	for iface, table := range gWanProbeRules {
		if desired[iface] != table {
			exec.Command("ip", "rule", "del", "oif", iface, "table", table,
				"priority", wanProbeRulePref).Run()
			exec.Command("ip", "route", "flush", "table", table).Run()
			delete(gWanProbeRules, iface)
		}
	}

	for iface, table := range desired {
		Interfacesmtx.Lock()
		gw, _ := getDefaultGatewayLocked(iface)
		Interfacesmtx.Unlock()
		if gw == "" {
			continue
		}
		tableNum, err := strconv.Atoi(table)
		if err != nil {
			continue
		}
		for _, subnet := range wanIfaceSubnets(iface) {
			replaceLinkRoute(subnet, iface, tableNum)
		}
		replaceDefaultRouteOnlink(gw, iface, tableNum)
		if gWanProbeRules[iface] != table {
			exec.Command("ip", "rule", "add", "oif", iface, "table", table,
				"priority", wanProbeRulePref).Run()
			gWanProbeRules[iface] = table
		}
	}
}

func wanClearProbeRoutes() {
	for iface, table := range gWanProbeRules {
		exec.Command("ip", "rule", "del", "oif", iface, "table", table,
			"priority", wanProbeRulePref).Run()
		exec.Command("ip", "route", "flush", "table", table).Run()
		delete(gWanProbeRules, iface)
	}
}

func wanProbeICMP(iface string, target string, timeout time.Duration) (float64, error) {
	counter := atomic.AddUint32(&gWanProbeCounter, 1)
	id := int(counter & 0x7fff)
	seq := int((counter >> 15) & 0x7fff)

	fd, err := syscall.Socket(syscall.AF_INET, syscall.SOCK_RAW, syscall.IPPROTO_ICMP)
	if err != nil {
		return 0, err
	}

	if err := bindToDevice(fd, iface); err != nil {
		syscall.Close(fd)
		return 0, err
	}

	f := os.NewFile(uintptr(fd), "wanprobe")
	conn, err := net.FilePacketConn(f)
	f.Close()
	if err != nil {
		return 0, err
	}
	defer conn.Close()

	msg := icmp.Message{
		Type: ipv4.ICMPTypeEcho,
		Code: 0,
		Body: &icmp.Echo{
			ID:   id,
			Seq:  seq,
			Data: []byte("sprwanhealth"),
		},
	}

	msgBytes, err := msg.Marshal(nil)
	if err != nil {
		return 0, err
	}

	ipAddr := &net.IPAddr{IP: net.ParseIP(target)}
	start := time.Now()

	if _, err := conn.WriteTo(msgBytes, ipAddr); err != nil {
		return 0, err
	}

	deadline := start.Add(timeout)
	conn.SetReadDeadline(deadline)

	buf := make([]byte, 1500)
	for time.Now().Before(deadline) {
		n, _, err := conn.ReadFrom(buf)
		if err != nil {
			return 0, err
		}
		payload := buf[:n]
		if len(payload) >= 20 && payload[0]>>4 == 4 {
			ihl := int(payload[0]&0x0f) * 4
			if ihl < n {
				payload = payload[ihl:n]
			}
		}
		parsed, err := icmp.ParseMessage(1, payload)
		if err != nil {
			continue
		}
		if parsed.Type != ipv4.ICMPTypeEchoReply {
			continue
		}
		echo, ok := parsed.Body.(*icmp.Echo)
		if !ok || echo.ID != id || echo.Seq != seq {
			continue
		}
		return float64(time.Since(start).Microseconds()) / 1000.0, nil
	}

	return 0, fmt.Errorf("timeout")
}

func wanProbeUplink(iface string, targets []string) wanTickResult {
	type probeOut struct {
		rtt float64
		err error
	}
	results := make(chan probeOut, len(targets))
	for _, target := range targets {
		go func(target string) {
			rtt, err := wanProbeICMP(iface, target, wanProbeWait)
			results <- probeOut{rtt, err}
		}(target)
	}

	best := math.MaxFloat64
	ok := false
	for range targets {
		out := <-results
		if out.err == nil {
			ok = true
			if out.rtt < best {
				best = out.rtt
			}
		}
	}
	if !ok {
		return wanTickResult{ok: false}
	}
	return wanTickResult{ok: true, rtt: best}
}

func wanAliveCount(uplinks []string, exclude string) int {
	alive := 0
	for _, name := range uplinks {
		if name == exclude {
			continue
		}
		if !wanHealthIfaceDead(name) {
			alive++
		}
	}
	return alive
}

func wanRebuildUplinks() {
	Interfacesmtx.Lock()
	defer Interfacesmtx.Unlock()
	rebuildUplink()
}

func wanHandleTransitions(iface string, runtime *wanUplinkRuntime, config WanHealthConfig, uplinks []string) {
	now := time.Now().Unix()

	if runtime.up && runtime.consecFail >= config.FailThreshold {
		runtime.up = false
		runtime.lastChange = now
		gWanHealthState.Outages = append([]WanOutage{{
			Iface:  iface,
			Start:  now,
			Reason: "probe timeouts",
		}}, gWanHealthState.Outages...)
		if len(gWanHealthState.Outages) > wanOutageCap {
			gWanHealthState.Outages = gWanHealthState.Outages[:wanOutageCap]
		}
		saveWanHealthStateLocked()

		log.Println("wan_health: uplink down", iface)
		SprbusPublish("wan:uplink:down", map[string]string{"Iface": iface})
		WSNotifyValue("wan:uplink:down", map[string]string{"Iface": iface})

		if config.FailoverEnabled && wanAliveCount(uplinks, iface) > 0 {
			setWanIfaceDead(iface, true)
			wanRebuildUplinks()
			log.Println("wan_health: failover, removed", iface, "from load balancing")
			SprbusPublish("wan:failover", map[string]string{"Iface": iface, "Action": "removed"})
		}
		return
	}

	if !runtime.up && runtime.consecOK >= config.RecoverThreshold {
		runtime.up = true
		runtime.lastChange = now
		for index := range gWanHealthState.Outages {
			if gWanHealthState.Outages[index].Iface == iface && gWanHealthState.Outages[index].End == 0 {
				gWanHealthState.Outages[index].End = now
				break
			}
		}
		saveWanHealthStateLocked()

		log.Println("wan_health: uplink up", iface)
		SprbusPublish("wan:uplink:up", map[string]string{"Iface": iface})
		WSNotifyValue("wan:uplink:up", map[string]string{"Iface": iface})

		if wanHealthIfaceDead(iface) {
			setWanIfaceDead(iface, false)
			wanRebuildUplinks()
			log.Println("wan_health: restored", iface, "to load balancing")
			SprbusPublish("wan:failover", map[string]string{"Iface": iface, "Action": "restored"})
		}
	}
}

func wanAggregateMinute(agg []wanTickResult) WanSample {
	sample := WanSample{Time: time.Now().Unix()}
	if len(agg) == 0 {
		return sample
	}

	failures := 0
	rtts := []float64{}
	for _, tick := range agg {
		if tick.ok {
			rtts = append(rtts, tick.rtt)
		} else {
			failures++
		}
	}
	sample.LossPct = float64(failures) / float64(len(agg)) * 100.0
	sample.Up = len(rtts) > 0

	if len(rtts) > 0 {
		sum := 0.0
		for _, rtt := range rtts {
			sum += rtt
		}
		sample.LatencyMs = sum / float64(len(rtts))

		if len(rtts) > 1 {
			diffs := 0.0
			for index := 1; index < len(rtts); index++ {
				diffs += math.Abs(rtts[index] - rtts[index-1])
			}
			sample.JitterMs = diffs / float64(len(rtts)-1)
		}
	}
	return sample
}

func wanAggregateHour(minutes []WanSample) WanSample {
	sample := WanSample{Time: time.Now().Unix(), Up: false}
	if len(minutes) == 0 {
		return sample
	}
	count := len(minutes)
	if count > 60 {
		count = 60
	}
	latSum, jitSum, lossSum := 0.0, 0.0, 0.0
	upCount := 0
	for index := 0; index < count; index++ {
		minute := minutes[index]
		latSum += minute.LatencyMs
		jitSum += minute.JitterMs
		lossSum += minute.LossPct
		if minute.Up {
			upCount++
		}
	}
	sample.LatencyMs = latSum / float64(count)
	sample.JitterMs = jitSum / float64(count)
	sample.LossPct = lossSum / float64(count)
	sample.Up = upCount*2 >= count
	return sample
}

func wanHealthTick(config WanHealthConfig) {
	uplinks := wanHealthUplinks()
	wanSyncProbeRoutes(uplinks)

	type tickOut struct {
		iface  string
		result wanTickResult
	}
	results := make(chan tickOut, len(uplinks))
	for _, iface := range uplinks {
		go func(iface string) {
			results <- tickOut{iface, wanProbeUplink(iface, config.ProbeTargets)}
		}(iface)
	}

	collected := map[string]wanTickResult{}
	for range uplinks {
		out := <-results
		collected[out.iface] = out.result
	}

	WanHealthmtx.Lock()
	defer WanHealthmtx.Unlock()

	for iface, result := range collected {
		runtime, exists := gWanRuntime[iface]
		if !exists {
			runtime = &wanUplinkRuntime{up: true, lastChange: time.Now().Unix()}
			gWanRuntime[iface] = runtime
		}

		runtime.window = append(runtime.window, result)
		if len(runtime.window) > wanWindowCap {
			runtime.window = runtime.window[1:]
		}
		runtime.minuteAgg = append(runtime.minuteAgg, result)

		if result.ok {
			runtime.consecOK++
			runtime.consecFail = 0
		} else {
			runtime.consecFail++
			runtime.consecOK = 0
		}

		wanHandleTransitions(iface, runtime, config, uplinks)
	}

	for iface := range gWanRuntime {
		if _, exists := collected[iface]; !exists {
			delete(gWanRuntime, iface)
			setWanIfaceDead(iface, false)
		}
	}
}

func wanHealthFlushMinute() {
	WanHealthmtx.Lock()
	defer WanHealthmtx.Unlock()

	for iface, runtime := range gWanRuntime {
		sample := wanAggregateMinute(runtime.minuteAgg)
		runtime.minuteAgg = nil
		gWanHealthState.Minutes[iface] = append([]WanSample{sample}, gWanHealthState.Minutes[iface]...)
		if len(gWanHealthState.Minutes[iface]) > wanMinuteCap {
			gWanHealthState.Minutes[iface] = gWanHealthState.Minutes[iface][:wanMinuteCap]
		}
	}
}

func wanHealthFlushHour() {
	WanHealthmtx.Lock()
	defer WanHealthmtx.Unlock()

	for iface, minutes := range gWanHealthState.Minutes {
		if len(minutes) == 0 {
			continue
		}
		sample := wanAggregateHour(minutes)
		gWanHealthState.Hours[iface] = append([]WanSample{sample}, gWanHealthState.Hours[iface]...)
		if len(gWanHealthState.Hours[iface]) > wanHourCap {
			gWanHealthState.Hours[iface] = gWanHealthState.Hours[iface][:wanHourCap]
		}
	}
	saveWanHealthStateLocked()
}

func wanHealthLoop() {
	WanHealthmtx.Lock()
	gWanHealthConfig = loadWanHealthConfig()
	loadWanHealthState()
	WanHealthmtx.Unlock()

	lastMinute := time.Now().Unix() / 60
	lastHour := time.Now().Unix() / 3600

	for {
		WanHealthmtx.Lock()
		config := gWanHealthConfig
		WanHealthmtx.Unlock()

		if !config.Enabled {
			wanClearProbeRoutes()
			time.Sleep(time.Duration(config.IntervalSeconds) * time.Second)
			continue
		}

		wanHealthTick(config)

		now := time.Now().Unix()
		if now/60 != lastMinute {
			lastMinute = now / 60
			wanHealthFlushMinute()
		}
		if now/3600 != lastHour {
			lastHour = now / 3600
			wanHealthFlushHour()
		}

		time.Sleep(time.Duration(config.IntervalSeconds) * time.Second)
	}
}

func wanSpeedTestRun(iface string, config WanHealthConfig) WanSpeedResult {
	result := WanSpeedResult{
		Iface: iface,
		Time:  time.Now().Unix(),
		URL:   config.SpeedTestURL,
	}

	dialer := &net.Dialer{
		Timeout: 10 * time.Second,
		Control: func(network, address string, c syscall.RawConn) error {
			var bindErr error
			err := c.Control(func(fd uintptr) {
				bindErr = bindToDevice(int(fd), iface)
			})
			if err != nil {
				return err
			}
			return bindErr
		},
	}
	client := &http.Client{
		Transport: &http.Transport{
			DialContext:         dialer.DialContext,
			TLSHandshakeTimeout: 10 * time.Second,
		},
		Timeout: 60 * time.Second,
	}

	start := time.Now()
	resp, err := client.Get(config.SpeedTestURL)
	if err != nil {
		result.Error = err.Error()
		return result
	}
	defer resp.Body.Close()

	bytes, err := io.Copy(io.Discard, io.LimitReader(resp.Body, wanSpeedLimit))
	elapsed := time.Since(start).Seconds()
	if err != nil {
		result.Error = err.Error()
		return result
	}
	if elapsed <= 0 || bytes == 0 {
		result.Error = "no data transferred"
		return result
	}

	result.Bytes = bytes
	result.Seconds = elapsed
	result.DownMbps = float64(bytes) * 8 / elapsed / 1e6
	return result
}

func wanOutageStats(iface string, outages []WanOutage) (int, int64) {
	total := 0
	var downtime int64
	dayAgo := time.Now().Unix() - 86400
	now := time.Now().Unix()
	for _, outage := range outages {
		if outage.Iface != iface {
			continue
		}
		total++
		end := outage.End
		if end == 0 {
			end = now
		}
		if end > dayAgo {
			start := outage.Start
			if start < dayAgo {
				start = dayAgo
			}
			downtime += end - start
		}
	}
	return total, downtime
}

func wanRuntimeLive(runtime *wanUplinkRuntime) (float64, float64, float64) {
	recent := runtime.window
	if len(recent) > 12 {
		recent = recent[len(recent)-12:]
	}
	if len(recent) == 0 {
		return 0, 0, 0
	}
	failures := 0
	rtts := []float64{}
	for _, tick := range recent {
		if tick.ok {
			rtts = append(rtts, tick.rtt)
		} else {
			failures++
		}
	}
	loss := float64(failures) / float64(len(recent)) * 100.0
	latency, jitter := 0.0, 0.0
	if len(rtts) > 0 {
		sum := 0.0
		for _, rtt := range rtts {
			sum += rtt
		}
		latency = sum / float64(len(rtts))
		if len(rtts) > 1 {
			diffs := 0.0
			for index := 1; index < len(rtts); index++ {
				diffs += math.Abs(rtts[index] - rtts[index-1])
			}
			jitter = diffs / float64(len(rtts)-1)
		}
	}
	return latency, jitter, loss
}

func getWanStatus(w http.ResponseWriter, r *http.Request) {
	uplinks := wanHealthUplinks()

	Interfacesmtx.Lock()
	gateways := map[string]string{}
	for _, iface := range uplinks {
		gw, _ := getDefaultGatewayLocked(iface)
		gateways[iface] = gw
	}
	Interfacesmtx.Unlock()

	WanHealthmtx.Lock()
	defer WanHealthmtx.Unlock()

	statuses := []WanUplinkStatus{}
	for _, iface := range uplinks {
		status := WanUplinkStatus{
			Iface:   iface,
			Up:      true,
			Active:  !wanHealthIfaceDead(iface),
			Gateway: gateways[iface],
		}
		runtime, exists := gWanRuntime[iface]
		if exists {
			status.Up = runtime.up
			status.LastChange = runtime.lastChange
			status.LatencyMs, status.JitterMs, status.LossPct = wanRuntimeLive(runtime)
		}
		status.TotalOutages, status.Downtime24h = wanOutageStats(iface, gWanHealthState.Outages)
		statuses = append(statuses, status)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(statuses)
}

func getWanHistory(w http.ResponseWriter, r *http.Request) {
	iface := mux.Vars(r)["interface"]
	if !isValidIface(iface) {
		http.Error(w, "Invalid interface name", 400)
		return
	}

	scale := r.URL.Query().Get("scale")
	if scale == "" {
		scale = "minutes"
	}
	if scale != "minutes" && scale != "hours" {
		http.Error(w, "Invalid scale", 400)
		return
	}

	count := 0
	if countParam := r.URL.Query().Get("count"); countParam != "" {
		parsed, err := strconv.Atoi(countParam)
		if err != nil || parsed < 1 {
			http.Error(w, "Invalid count", 400)
			return
		}
		count = parsed
	}

	WanHealthmtx.Lock()
	defer WanHealthmtx.Unlock()

	samples := gWanHealthState.Minutes[iface]
	if scale == "hours" {
		samples = gWanHealthState.Hours[iface]
	}
	if samples == nil {
		samples = []WanSample{}
	}
	if count > 0 && count < len(samples) {
		samples = samples[:count]
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(samples)
}

func getWanOutages(w http.ResponseWriter, r *http.Request) {
	WanHealthmtx.Lock()
	defer WanHealthmtx.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gWanHealthState.Outages)
}

func getWanHealthConfig(w http.ResponseWriter, r *http.Request) {
	WanHealthmtx.Lock()
	defer WanHealthmtx.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gWanHealthConfig)
}

func updateWanHealthConfig(w http.ResponseWriter, r *http.Request) {
	config := WanHealthConfig{}
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	config = sanitizeWanHealthConfig(config)

	WanHealthmtx.Lock()
	gWanHealthConfig = config
	WanHealthmtx.Unlock()

	if err := saveWanHealthConfig(config); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	if !config.Enabled || !config.FailoverEnabled {
		gWanDeadMtx.Lock()
		hadDead := len(gWanDead) > 0
		gWanDead = map[string]bool{}
		gWanDeadMtx.Unlock()
		if hadDead {
			wanRebuildUplinks()
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
}

func getWanSpeedResults(w http.ResponseWriter, r *http.Request) {
	WanHealthmtx.Lock()
	defer WanHealthmtx.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gWanHealthState.Speed)
}

func runWanSpeedTest(w http.ResponseWriter, r *http.Request) {
	iface := mux.Vars(r)["interface"]
	if !isValidIface(iface) {
		http.Error(w, "Invalid interface name", 400)
		return
	}

	found := false
	for _, uplink := range wanHealthUplinks() {
		if uplink == iface {
			found = true
			break
		}
	}
	if !found {
		http.Error(w, "Not an enabled uplink", 400)
		return
	}

	WanHealthmtx.Lock()
	config := gWanHealthConfig
	WanHealthmtx.Unlock()

	if !config.Enabled {
		http.Error(w, "WAN health monitoring is disabled", 400)
		return
	}

	result := wanSpeedTestRun(iface, config)

	WanHealthmtx.Lock()
	gWanHealthState.Speed = append([]WanSpeedResult{result}, gWanHealthState.Speed...)
	if len(gWanHealthState.Speed) > wanSpeedCap {
		gWanHealthState.Speed = gWanHealthState.Speed[:wanSpeedCap]
	}
	saveWanHealthStateLocked()
	WanHealthmtx.Unlock()

	SprbusPublish("wan:speedtest", result)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
