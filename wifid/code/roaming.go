package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand/v2"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

var (
	roamingConfigPath  = "/configs/wifi/roaming.json"
	roamingHistoryPath = "/state/wifi/roaming-history.json"
	roamingModelPath   = "/state/wifi/roaming-model.json"
	apiWifidSocketPath = "/state/wifi/apisock"
)

type roamingConfig struct {
	Enabled                 bool     `json:"Enabled"`
	DryRun                  bool     `json:"DryRun"`
	PollIntervalSeconds     int      `json:"PollIntervalSeconds"`
	ObservationDelaySeconds int      `json:"ObservationDelaySeconds"`
	RSSIThresholdDBM        int      `json:"RSSIThresholdDBM"`
	MinimumImprovementDBM   int      `json:"MinimumImprovementDBM"`
	CooldownSeconds         int      `json:"CooldownSeconds"`
	MaxTransitionsPerHour   int      `json:"MaxTransitionsPerHour"`
	ExplorationRate         float64  `json:"ExplorationRate"`
	AllowedInterfaces       []string `json:"AllowedInterfaces"`
}

func defaultRoamingConfig() roamingConfig {
	return roamingConfig{
		DryRun:                  true,
		PollIntervalSeconds:     15,
		ObservationDelaySeconds: 20,
		RSSIThresholdDBM:        -70,
		MinimumImprovementDBM:   5,
		CooldownSeconds:         900,
		MaxTransitionsPerHour:   4,
		ExplorationRate:         0,
		AllowedInterfaces:       []string{},
	}
}

func validateRoamingConfig(config *roamingConfig) error {
	if config.PollIntervalSeconds < 5 || config.PollIntervalSeconds > 300 {
		return fmt.Errorf("PollIntervalSeconds must be between 5 and 300")
	}
	if config.ObservationDelaySeconds < 5 || config.ObservationDelaySeconds > 180 {
		return fmt.Errorf("ObservationDelaySeconds must be between 5 and 180")
	}
	if config.RSSIThresholdDBM < -100 || config.RSSIThresholdDBM > -30 {
		return fmt.Errorf("RSSIThresholdDBM must be between -100 and -30")
	}
	if config.MinimumImprovementDBM < 0 || config.MinimumImprovementDBM > 40 {
		return fmt.Errorf("MinimumImprovementDBM must be between 0 and 40")
	}
	if config.CooldownSeconds < 30 || config.CooldownSeconds > 86400 {
		return fmt.Errorf("CooldownSeconds must be between 30 and 86400")
	}
	if config.MaxTransitionsPerHour < 1 || config.MaxTransitionsPerHour > 100 {
		return fmt.Errorf("MaxTransitionsPerHour must be between 1 and 100")
	}
	if config.ExplorationRate < 0 || config.ExplorationRate > 1 {
		return fmt.Errorf("ExplorationRate must be between 0 and 1")
	}
	if config.AllowedInterfaces == nil {
		config.AllowedInterfaces = []string{}
	}
	seen := map[string]bool{}
	for _, iface := range config.AllowedInterfaces {
		if !validControlIface(iface) {
			return fmt.Errorf("invalid allowed interface %q", iface)
		}
		if seen[iface] {
			return fmt.Errorf("duplicate allowed interface %q", iface)
		}
		seen[iface] = true
	}
	sort.Strings(config.AllowedInterfaces)
	return nil
}

type topologySignal struct {
	RSSI int `json:"RSSI"`
}

type topologyRadio struct {
	Stations int `json:"Stations"`
}

type topologyNode struct {
	Kind     string          `json:"Kind"`
	MAC      string          `json:"MAC"`
	ConnType string          `json:"ConnType"`
	Iface    string          `json:"Iface"`
	SSID     string          `json:"SSID"`
	Online   bool            `json:"Online"`
	Signal   *topologySignal `json:"Signal"`
	Radio    *topologyRadio  `json:"Radio"`
}

type roamingTopology struct {
	Nodes []topologyNode `json:"Nodes"`
}

type topologyFetcher interface {
	Fetch(context.Context) (roamingTopology, error)
}

type unixTopologyFetcher struct {
	socketPath string
}

func (fetcher unixTopologyFetcher) Fetch(ctx context.Context) (roamingTopology, error) {
	client := http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{Dial: func(_, _ string) (net.Conn, error) {
			return net.DialTimeout("unix", fetcher.socketPath, 2*time.Second)
		}},
	}
	defer client.CloseIdleConnections()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://api/topology", nil)
	if err != nil {
		return roamingTopology{}, err
	}
	response, err := client.Do(request)
	if err != nil {
		return roamingTopology{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return roamingTopology{}, fmt.Errorf("topology: %s: %s", response.Status, strings.TrimSpace(string(body)))
	}
	topology := roamingTopology{}
	if err := json.NewDecoder(io.LimitReader(response.Body, 4<<20)).Decode(&topology); err != nil {
		return roamingTopology{}, err
	}
	return topology, nil
}

type roamingRecord struct {
	ID              string    `json:"ID"`
	RequestedAt     time.Time `json:"RequestedAt"`
	ObservedAt      time.Time `json:"ObservedAt,omitempty"`
	Origin          string    `json:"Origin"`
	MAC             string    `json:"MAC"`
	SourceInterface string    `json:"SourceInterface"`
	TargetInterface string    `json:"TargetInterface"`
	SourceRSSI      int       `json:"SourceRSSI"`
	PostRSSI        int       `json:"PostRSSI,omitempty"`
	PostInterface   string    `json:"PostInterface,omitempty"`
	DryRun          bool      `json:"DryRun"`
	State           string    `json:"State"`
	Reward          float64   `json:"Reward,omitempty"`
	HostapdResponse string    `json:"HostapdResponse,omitempty"`
	Error           string    `json:"Error,omitempty"`
}

type armStat struct {
	Count      int       `json:"Count"`
	Value      float64   `json:"Value"`
	LastReward float64   `json:"LastReward"`
	UpdatedAt  time.Time `json:"UpdatedAt"`
}

type roamingManager struct {
	mu         sync.RWMutex
	config     roamingConfig
	history    []roamingRecord
	model      map[string]armStat
	inFlight   map[string]bool
	controller *bssTransitionController
	topology   topologyFetcher
	id         atomic.Uint64
}

func newRoamingManager(controller *bssTransitionController, topology topologyFetcher) *roamingManager {
	manager := &roamingManager{
		config:     defaultRoamingConfig(),
		history:    []roamingRecord{},
		model:      map[string]armStat{},
		inFlight:   map[string]bool{},
		controller: controller,
		topology:   topology,
	}
	manager.load()
	return manager
}

func (manager *roamingManager) load() {
	config := defaultRoamingConfig()
	if data, err := os.ReadFile(roamingConfigPath); err == nil {
		if json.Unmarshal(data, &config) != nil || validateRoamingConfig(&config) != nil {
			config = defaultRoamingConfig()
		}
	}
	manager.config = config
	if data, err := os.ReadFile(roamingHistoryPath); err == nil {
		_ = json.Unmarshal(data, &manager.history)
	}
	if len(manager.history) > 500 {
		manager.history = manager.history[len(manager.history)-500:]
	}
	if data, err := os.ReadFile(roamingModelPath); err == nil {
		_ = json.Unmarshal(data, &manager.model)
	}
}

func writeRoamingJSON(path string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, append(data, '\n'), 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func (manager *roamingManager) configCopy() roamingConfig {
	manager.mu.RLock()
	defer manager.mu.RUnlock()
	config := manager.config
	config.AllowedInterfaces = append([]string(nil), config.AllowedInterfaces...)
	return config
}

func (manager *roamingManager) replaceConfig(config roamingConfig) error {
	if err := validateRoamingConfig(&config); err != nil {
		return err
	}
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if err := writeRoamingJSON(roamingConfigPath, config); err != nil {
		return err
	}
	manager.config = config
	return nil
}

func rssiBucket(rssi int) int {
	if rssi >= 0 {
		return 0
	}
	bucket := (rssi / 10) * 10
	if rssi%10 != 0 {
		bucket -= 10
	}
	return bucket
}

func modelKey(mac, source, target string, rssi int) string {
	return strings.Join([]string{normalizeControlMAC(mac), source, target, strconv.Itoa(rssiBucket(rssi))}, "|")
}

func connectedReward(rssi int) float64 {
	if rssi >= 0 || rssi < -100 {
		return 0
	}
	return float64(100 + rssi)
}

func (manager *roamingManager) updateModel(record roamingRecord) {
	if record.SourceRSSI >= 0 || record.SourceRSSI < -100 || record.DryRun {
		return
	}
	key := modelKey(record.MAC, record.SourceInterface, record.TargetInterface, record.SourceRSSI)
	manager.mu.Lock()
	defer manager.mu.Unlock()
	stat := manager.model[key]
	stat.Count++
	stat.Value += (record.Reward - stat.Value) / float64(stat.Count)
	stat.LastReward = record.Reward
	stat.UpdatedAt = time.Now().UTC()
	manager.model[key] = stat
	_ = writeRoamingJSON(roamingModelPath, manager.model)
}

func (manager *roamingManager) selectTarget(mac, source string, rssi int, candidates []string, config roamingConfig) (string, bool) {
	if len(candidates) == 0 {
		return "", false
	}
	candidates = append([]string(nil), candidates...)
	sort.Strings(candidates)
	if config.ExplorationRate > 0 && rand.Float64() < config.ExplorationRate {
		return candidates[rand.IntN(len(candidates))], true
	}
	manager.mu.RLock()
	defer manager.mu.RUnlock()
	best := ""
	bestValue := connectedReward(rssi) + float64(config.MinimumImprovementDBM)
	for _, candidate := range candidates {
		stat, ok := manager.model[modelKey(mac, source, candidate, rssi)]
		if ok && stat.Count > 0 && stat.Value >= bestValue {
			best = candidate
			bestValue = stat.Value
		}
	}
	return best, false
}

func topologyDevice(topology roamingTopology, mac string) (topologyNode, bool) {
	mac = normalizeControlMAC(mac)
	for _, node := range topology.Nodes {
		if node.Kind == "device" && normalizeControlMAC(node.MAC) == mac {
			return node, true
		}
	}
	return topologyNode{}, false
}

func (manager *roamingManager) sourceRSSI(request bssTransitionRequest) int {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	topology, err := manager.topology.Fetch(ctx)
	if err != nil {
		return 0
	}
	device, ok := topologyDevice(topology, request.MAC)
	if !ok || device.Iface != request.SourceInterface || device.Signal == nil {
		return 0
	}
	return device.Signal.RSSI
}

func (manager *roamingManager) transitionSent(request bssTransitionRequest, response bssTransitionResponse, origin string, sourceRSSI int) roamingRecord {
	if sourceRSSI == 0 {
		sourceRSSI = manager.sourceRSSI(request)
	}
	record := roamingRecord{
		ID:              fmt.Sprintf("%d-%d", time.Now().UnixNano(), manager.id.Add(1)),
		RequestedAt:     time.Now().UTC(),
		Origin:          origin,
		MAC:             normalizeControlMAC(request.MAC),
		SourceInterface: request.SourceInterface,
		TargetInterface: request.TargetInterface,
		SourceRSSI:      sourceRSSI,
		State:           "sent",
		HostapdResponse: response.HostapdResponse,
	}
	manager.mu.Lock()
	manager.inFlight[record.MAC] = true
	manager.history = append(manager.history, record)
	if len(manager.history) > 500 {
		manager.history = append([]roamingRecord(nil), manager.history[len(manager.history)-500:]...)
	}
	_ = writeRoamingJSON(roamingHistoryPath, manager.history)
	manager.mu.Unlock()
	go manager.observe(record)
	return record
}

func (manager *roamingManager) observe(record roamingRecord) {
	delay := time.Duration(manager.configCopy().ObservationDelaySeconds) * time.Second
	time.Sleep(delay)
	var topology roamingTopology
	var err error
	for attempt := 0; attempt < 3; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		topology, err = manager.topology.Fetch(ctx)
		cancel()
		if err == nil {
			break
		}
		time.Sleep(5 * time.Second)
	}
	record.ObservedAt = time.Now().UTC()
	if err != nil {
		record.State = "observation_failed"
		record.Error = err.Error()
	} else {
		device, found := topologyDevice(topology, record.MAC)
		switch {
		case !found || !device.Online:
			record.State = "offline"
			record.Reward = -100
		case device.Iface == record.TargetInterface:
			record.State = "succeeded"
			record.PostInterface = device.Iface
			if device.Signal != nil {
				record.PostRSSI = device.Signal.RSSI
			}
			record.Reward = connectedReward(record.PostRSSI)
		case device.Iface == record.SourceInterface:
			record.State = "ignored"
			record.PostInterface = device.Iface
			record.Reward = -15
		case device.Online:
			record.State = "moved_elsewhere"
			record.PostInterface = device.Iface
			record.Reward = -25
		}
	}

	manager.mu.Lock()
	for i := range manager.history {
		if manager.history[i].ID == record.ID {
			manager.history[i] = record
			break
		}
	}
	delete(manager.inFlight, record.MAC)
	_ = writeRoamingJSON(roamingHistoryPath, manager.history)
	manager.mu.Unlock()
	if record.State != "observation_failed" {
		manager.updateModel(record)
	}
}

func (manager *roamingManager) allowedInterface(config roamingConfig, iface string) bool {
	if len(config.AllowedInterfaces) == 0 {
		return true
	}
	for _, allowed := range config.AllowedInterfaces {
		if allowed == iface {
			return true
		}
	}
	return false
}

func (manager *roamingManager) withinLimits(mac string, config roamingConfig, now time.Time) bool {
	manager.mu.RLock()
	defer manager.mu.RUnlock()
	if manager.inFlight[mac] {
		return false
	}
	liveLastHour := 0
	for i := len(manager.history) - 1; i >= 0; i-- {
		record := manager.history[i]
		if record.RequestedAt.Before(now.Add(-time.Hour)) {
			break
		}
		if !record.DryRun {
			liveLastHour++
		}
		if record.MAC == mac && record.RequestedAt.After(now.Add(-time.Duration(config.CooldownSeconds)*time.Second)) {
			return false
		}
	}
	return liveLastHour < config.MaxTransitionsPerHour
}

func (manager *roamingManager) recordDryRun(device topologyNode, target string) {
	record := roamingRecord{
		ID:              fmt.Sprintf("%d-%d", time.Now().UnixNano(), manager.id.Add(1)),
		RequestedAt:     time.Now().UTC(),
		Origin:          "auto",
		MAC:             normalizeControlMAC(device.MAC),
		SourceInterface: device.Iface,
		TargetInterface: target,
		DryRun:          true,
		State:           "recommended",
	}
	if device.Signal != nil {
		record.SourceRSSI = device.Signal.RSSI
	}
	manager.mu.Lock()
	manager.history = append(manager.history, record)
	if len(manager.history) > 500 {
		manager.history = append([]roamingRecord(nil), manager.history[len(manager.history)-500:]...)
	}
	_ = writeRoamingJSON(roamingHistoryPath, manager.history)
	manager.mu.Unlock()
}

func (manager *roamingManager) autoOnce(ctx context.Context) {
	config := manager.configCopy()
	if !config.Enabled {
		return
	}
	topology, err := manager.topology.Fetch(ctx)
	if err != nil {
		return
	}
	aps := map[string]topologyNode{}
	for _, node := range topology.Nodes {
		if node.Kind == "ap_radio" && node.Online && node.Iface != "" {
			aps[node.Iface] = node
		}
	}
	for _, device := range topology.Nodes {
		if device.Kind != "device" || !device.Online || device.ConnType != "wifi" || device.Signal == nil || device.Signal.RSSI == 0 || device.Signal.RSSI > config.RSSIThresholdDBM {
			continue
		}
		mac := normalizeControlMAC(device.MAC)
		if !manager.withinLimits(mac, config, time.Now()) {
			continue
		}
		sourceAP, ok := aps[device.Iface]
		if !ok || sourceAP.SSID == "" {
			continue
		}
		candidates := []string{}
		for iface, ap := range aps {
			if iface != device.Iface && ap.SSID == sourceAP.SSID && manager.allowedInterface(config, iface) {
				candidates = append(candidates, iface)
			}
		}
		target, exploring := manager.selectTarget(mac, device.Iface, device.Signal.RSSI, candidates, config)
		if config.DryRun && target == "" && len(candidates) > 0 {
			sort.Strings(candidates)
			target = candidates[0]
		}
		if target == "" {
			continue
		}
		if config.DryRun {
			manager.recordDryRun(device, target)
			return
		}
		request := bssTransitionRequest{SourceInterface: device.Iface, MAC: mac, TargetInterface: target}
		response, err := manager.controller.transition(request)
		if err != nil {
			continue
		}
		origin := "auto"
		if exploring {
			origin = "auto_explore"
		}
		manager.transitionSent(request, response, origin, device.Signal.RSSI)
		return // At most one transition per poll across the router.
	}
}

func (manager *roamingManager) run(ctx context.Context) {
	for {
		interval := time.Duration(manager.configCopy().PollIntervalSeconds) * time.Second
		timer := time.NewTimer(interval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
			manager.autoOnce(ctx)
		}
	}
}

func (manager *roamingManager) status() map[string]any {
	manager.mu.RLock()
	defer manager.mu.RUnlock()
	return map[string]any{
		"Config":            manager.config,
		"HistoryCount":      len(manager.history),
		"ModelArms":         len(manager.model),
		"TransitionsActive": len(manager.inFlight),
	}
}

func (manager *roamingManager) historyCopy() []roamingRecord {
	manager.mu.RLock()
	defer manager.mu.RUnlock()
	history := append([]roamingRecord(nil), manager.history...)
	for left, right := 0, len(history)-1; left < right; left, right = left+1, right-1 {
		history[left], history[right] = history[right], history[left]
	}
	return history
}

func (manager *roamingManager) modelCopy() map[string]armStat {
	manager.mu.RLock()
	defer manager.mu.RUnlock()
	model := make(map[string]armStat, len(manager.model))
	for key, value := range manager.model {
		model[key] = value
	}
	return model
}

func roamingHandler(manager *roamingManager) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /roaming/config", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(manager.configCopy())
	})
	mux.HandleFunc("PUT /roaming/config", func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
		config := roamingConfig{}
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&config); err != nil {
			http.Error(w, "invalid config: "+err.Error(), http.StatusBadRequest)
			return
		}
		if err := manager.replaceConfig(config); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(manager.configCopy())
	})
	mux.HandleFunc("GET /roaming/status", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(manager.status())
	})
	mux.HandleFunc("GET /roaming/history", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(manager.historyCopy())
	})
	mux.HandleFunc("GET /roaming/model", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(manager.modelCopy())
	})
	return mux
}
