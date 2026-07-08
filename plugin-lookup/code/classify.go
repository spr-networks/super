package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
	sprbus "github.com/spr-networks/sprbus-json"
)

var ServerEventSock = "/state/api/eventbus.sock"
var StorePath = "/state/plugins/plugin-lookup/classifications.json"
var FingerprintDBPath = "../data/fingerprints.json"
var CustomFingerprintsPath = "/state/plugins/plugin-lookup/custom_fingerprints.json"
var BuiltinOverridesPath = "/state/plugins/plugin-lookup/builtin_fingerprints.json"

type persistedStore struct {
	Signals         map[string]DeviceSignals  `json:"signals"`
	Classifications map[string]Classification `json:"classifications"`
}

type DHCPRequest struct {
	MAC        string
	Identifier string
	Name       string
	Iface      string
}

type PSKAuthSuccess struct {
	MAC string
}

type ZeroconfDevice struct {
	SrcIP       string
	MAC         string
	Services    []string
	TXT         map[string]string
	SSDPHeaders map[string]string
}

type CorrectionRequest struct {
	Vendor            string
	Category          string
	Model             string
	SuggestedGroups   []string
	SuggestedPolicies []string
	Evidence          []string
}

type Classifier struct {
	mu              sync.Mutex
	db              *FingerprintDB
	signals         map[string]DeviceSignals
	classifications map[string]Classification
	lastPublished   map[string]string
	publishChan     chan Classification
	client          *sprbus.Client
	shipped         []Rule //rules baked into the image
	builtin         []Rule //shipped, or the user override
	overridden      bool
	custom          []Rule
}

func normalizeMAC(mac string) string {
	return strings.ToLower(strings.TrimSpace(mac))
}

func newClassifier(db *FingerprintDB) *Classifier {
	c := &Classifier{
		db:              db,
		signals:         map[string]DeviceSignals{},
		classifications: map[string]Classification{},
		lastPublished:   map[string]string{},
		publishChan:     make(chan Classification, 512),
		shipped:         db.Rules,
	}
	c.builtin = c.shipped
	c.load()
	if rules, loaded := loadRuleFile(BuiltinOverridesPath); loaded {
		c.builtin = rules
		c.overridden = true
	}
	if rules, loaded := loadRuleFile(CustomFingerprintsPath); loaded {
		c.custom = rules
	}
	c.rebuildRulesLocked()
	go c.publishLoop()
	return c
}

func loadRuleFile(path string) ([]Rule, bool) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, false
	}

	rules := []Rule{}
	if err := json.Unmarshal(data, &rules); err != nil {
		fmt.Println("failed to load fingerprints from", path, ":", err)
		return nil, false
	}
	if err := compileRules(rules); err != nil {
		fmt.Println("invalid fingerprint in", path, ":", err)
		return nil, false
	}
	return rules, true
}

// assumes c.mu is held (or startup, before handlers run)
func (c *Classifier) rebuildRulesLocked() {
	c.db.Rules = append(append([]Rule{}, c.builtin...), c.custom...)
}

// single publisher keeps classify:result events ordered
func (c *Classifier) publishLoop() {
	for result := range c.publishChan {
		c.publish("classify:result", result)
	}
}

func (c *Classifier) load() {
	data, err := os.ReadFile(StorePath)
	if err != nil {
		return
	}

	var store persistedStore
	if err := json.Unmarshal(data, &store); err != nil {
		fmt.Println("failed to load classification store:", err)
		return
	}

	if store.Signals != nil {
		c.signals = store.Signals
	}
	if store.Classifications != nil {
		c.classifications = store.Classifications
	}
}

func (c *Classifier) saveLocked() {
	if err := os.MkdirAll(filepath.Dir(StorePath), 0700); err != nil {
		fmt.Println("failed to create classification store dir:", err)
		return
	}

	store := persistedStore{
		Signals:         c.signals,
		Classifications: c.classifications,
	}

	data, err := json.MarshalIndent(store, "", " ")
	if err != nil {
		fmt.Println("failed to marshal classification store:", err)
		return
	}

	if err := os.WriteFile(StorePath, data, 0600); err != nil {
		fmt.Println("failed to write classification store:", err)
	}
}

func (c *Classifier) publish(topic string, value interface{}) {
	data, err := json.Marshal(value)
	if err != nil {
		fmt.Println("failed to marshal event:", err)
		return
	}

	if c.client == nil {
		c.client, err = sprbus.NewClient(ServerEventSock)
		if err != nil {
			c.client = nil
			fmt.Println("failed to connect to sprbus:", err)
			return
		}
	}

	if _, err = c.client.Publish(topic, string(data)); err != nil {
		fmt.Println("failed to publish classification:", err)
		c.client.Close()
		c.client = nil
	}
}

func (c *Classifier) publishIfChangedLocked(result Classification) {
	dedupe := result
	dedupe.LastUpdated = ""
	data, err := json.Marshal(dedupe)
	if err != nil {
		return
	}

	encoded := string(data)
	if c.lastPublished[result.MAC] == encoded {
		return
	}

	c.lastPublished[result.MAC] = encoded
	c.publishChan <- result
}

func mergeStrings(dst []string, src []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, value := range dst {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	for _, value := range src {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	sort.Strings(out)
	return out
}

func mergeMap(dst map[string]string, src map[string]string) map[string]string {
	if dst == nil {
		dst = map[string]string{}
	}
	for key, value := range src {
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if key != "" && value != "" {
			dst[key] = value
		}
	}
	return dst
}

func (c *Classifier) updateSignals(mac string, fn func(*DeviceSignals)) (Classification, bool) {
	mac = normalizeMAC(mac)
	if mac == "" {
		return Classification{}, false
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	signals := c.signals[mac]
	signals.MAC = mac
	signals.RandomMAC = isRandomMAC(mac)
	if signals.TXT == nil {
		signals.TXT = map[string]string{}
	}
	if signals.SSDPHeaders == nil {
		signals.SSDPHeaders = map[string]string{}
	}

	fn(&signals)
	c.signals[mac] = signals

	if pinned := c.classifications[mac]; pinned.Pinned {
		c.saveLocked()
		return pinned, true
	}

	result := classifyDevice(&signals, c.db)
	result.LastUpdated = time.Now().UTC().Format(time.RFC3339)

	c.classifications[mac] = result
	c.saveLocked()
	c.publishIfChangedLocked(result)
	return result, true
}

func (c *Classifier) handleDHCP(req DHCPRequest) {
	mac := normalizeMAC(req.MAC)
	if mac == "" {
		return
	}

	ouiVendor := ""
	if !isRandomMAC(mac) {
		ouiVendor = lookupOUI(mac)
	}

	c.updateSignals(mac, func(signals *DeviceSignals) {
		if req.Name != "" {
			signals.Hostname = req.Name
		}
		if ouiVendor != "" {
			signals.OUIVendor = ouiVendor
		}
	})
}

// join trigger for devices that never send a useful dhcp request
func (c *Classifier) handleWifiAuth(auth PSKAuthSuccess) {
	mac := normalizeMAC(auth.MAC)
	if mac == "" {
		return
	}

	ouiVendor := ""
	if !isRandomMAC(mac) {
		ouiVendor = lookupOUI(mac)
	}

	c.updateSignals(mac, func(signals *DeviceSignals) {
		if ouiVendor != "" {
			signals.OUIVendor = ouiVendor
		}
	})
}

func (c *Classifier) handleZeroconf(event ZeroconfDevice) {
	mac := normalizeMAC(event.MAC)
	if mac == "" {
		return
	}

	c.updateSignals(mac, func(signals *DeviceSignals) {
		signals.Services = mergeStrings(signals.Services, event.Services)
		signals.TXT = mergeMap(signals.TXT, event.TXT)
		signals.SSDPHeaders = mergeMap(signals.SSDPHeaders, event.SSDPHeaders)
	})
}

func (c *Classifier) classifyNow(w http.ResponseWriter, r *http.Request) {
	signals := DeviceSignals{}
	if err := json.NewDecoder(r.Body).Decode(&signals); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	result, ok := c.updateSignals(signals.MAC, func(existing *DeviceSignals) {
		if signals.RandomMAC {
			existing.RandomMAC = true
		}
		if signals.OUIVendor != "" {
			existing.OUIVendor = signals.OUIVendor
		}
		if signals.Hostname != "" {
			existing.Hostname = signals.Hostname
		}
		existing.Services = mergeStrings(existing.Services, signals.Services)
		existing.TXT = mergeMap(existing.TXT, signals.TXT)
		existing.SSDPHeaders = mergeMap(existing.SSDPHeaders, signals.SSDPHeaders)
	})
	if !ok {
		http.Error(w, "missing MAC", http.StatusBadRequest)
		return
	}

	writeJSON(w, result)
}

func (c *Classifier) listClassifications(w http.ResponseWriter, r *http.Request) {
	c.mu.Lock()
	defer c.mu.Unlock()

	results := make([]Classification, 0, len(c.classifications))
	for _, result := range c.classifications {
		results = append(results, result)
	}
	sort.Slice(results, func(i, j int) bool {
		return results[i].MAC < results[j].MAC
	})

	writeJSON(w, results)
}

func (c *Classifier) getClassification(w http.ResponseWriter, r *http.Request) {
	mac := normalizeMAC(mux.Vars(r)["mac"])
	c.mu.Lock()
	result, exists := c.classifications[mac]
	c.mu.Unlock()

	if !exists {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	writeJSON(w, result)
}

func (c *Classifier) putCorrection(w http.ResponseWriter, r *http.Request) {
	mac := normalizeMAC(mux.Vars(r)["mac"])
	if mac == "" {
		http.Error(w, "missing MAC", http.StatusBadRequest)
		return
	}

	req := CorrectionRequest{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.Category) == "" {
		http.Error(w, "missing Category", http.StatusBadRequest)
		return
	}

	c.mu.Lock()
	result := c.classifications[mac]
	result.MAC = mac
	result.Vendor = strings.TrimSpace(req.Vendor)
	result.Category = strings.TrimSpace(req.Category)
	result.Model = strings.TrimSpace(req.Model)
	result.Confidence = "High"
	result.UserCorrection = true
	result.Pinned = true
	result.LastUpdated = time.Now().UTC().Format(time.RFC3339)
	result.Evidence = req.Evidence
	if len(result.Evidence) == 0 {
		result.Evidence = []string{"user correction"}
	}
	result.SuggestedGroups = req.SuggestedGroups
	result.SuggestedPolicies = req.SuggestedPolicies
	if len(result.SuggestedGroups) == 0 && len(result.SuggestedPolicies) == 0 {
		if suggestion, exists := c.db.CategorySuggestions[result.Category]; exists {
			result.SuggestedGroups = suggestion.Groups
			result.SuggestedPolicies = suggestion.Policies
		}
	}

	c.classifications[mac] = result
	c.saveLocked()
	c.publishIfChangedLocked(result)
	c.mu.Unlock()

	writeJSON(w, result)
}

func (c *Classifier) deleteCorrection(w http.ResponseWriter, r *http.Request) {
	mac := normalizeMAC(mux.Vars(r)["mac"])

	c.mu.Lock()
	signals, exists := c.signals[mac]
	if !exists {
		if _, hasResult := c.classifications[mac]; !hasResult {
			c.mu.Unlock()
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		//pinned by correction before any signals arrived
		signals = DeviceSignals{MAC: mac, RandomMAC: isRandomMAC(mac)}
	}

	result := classifyDevice(&signals, c.db)
	result.LastUpdated = time.Now().UTC().Format(time.RFC3339)
	c.classifications[mac] = result
	c.saveLocked()
	c.publishIfChangedLocked(result)
	c.mu.Unlock()

	writeJSON(w, result)
}

func lookupOUI(mac string) string {
	if mOUI == nil {
		return ""
	}

	vendor, err := mOUI.VendorLookup(mac)
	if err != nil {
		return ""
	}
	return vendor
}

func writeJSON(w http.ResponseWriter, value interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(value)
}

func busListener(classifier *Classifier) {
	handleDHCP := func(topic string, value string) {
		req := DHCPRequest{}
		if err := json.Unmarshal([]byte(value), &req); err != nil {
			fmt.Println("invalid dhcp event:", err)
			return
		}
		classifier.handleDHCP(req)
	}

	handleZeroconf := func(topic string, value string) {
		event := ZeroconfDevice{}
		if err := json.Unmarshal([]byte(value), &event); err != nil {
			fmt.Println("invalid zeroconf event:", err)
			return
		}
		classifier.handleZeroconf(event)
	}

	handleWifiAuth := func(topic string, value string) {
		auth := PSKAuthSuccess{}
		if err := json.Unmarshal([]byte(value), &auth); err != nil {
			fmt.Println("invalid wifi auth event:", err)
			return
		}
		classifier.handleWifiAuth(auth)
	}

	go retryEventBus("dhcp:request", handleDHCP)
	go retryEventBus("zeroconf:device", handleZeroconf)
	go retryEventBus("wifi:auth:success", handleWifiAuth)
}

func retryEventBus(topic string, handler func(string, string)) {
	for {
		err := sprbus.HandleEvent(topic, handler)
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			fmt.Println("sprbus listener error:", topic, err)
		}
		time.Sleep(3 * time.Second)
	}
}

func (c *Classifier) getSignals(w http.ResponseWriter, r *http.Request) {
	mac := normalizeMAC(mux.Vars(r)["mac"])

	c.mu.Lock()
	defer c.mu.Unlock()

	signals, exists := c.signals[mac]
	if !exists {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	//strip the identifier, this payload is meant for sharing
	signals.MAC = ""
	writeJSON(w, signals)
}

func (c *Classifier) getCustomRules(w http.ResponseWriter, r *http.Request) {
	c.mu.Lock()
	rules := append([]Rule{}, c.custom...)
	c.mu.Unlock()

	writeJSON(w, rules)
}

func decodeRules(w http.ResponseWriter, r *http.Request) ([]Rule, bool) {
	rules := []Rule{}
	if err := json.NewDecoder(r.Body).Decode(&rules); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return nil, false
	}
	if err := compileRules(rules); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return nil, false
	}
	return rules, true
}

func writeRuleFile(path string, rules []Rule) error {
	data, err := json.MarshalIndent(rules, "", " ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}

func (c *Classifier) putCustomRules(w http.ResponseWriter, r *http.Request) {
	rules, ok := decodeRules(w, r)
	if !ok {
		return
	}

	c.mu.Lock()
	if err := writeRuleFile(CustomFingerprintsPath, rules); err != nil {
		c.mu.Unlock()
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	c.custom = rules
	c.rebuildRulesLocked()
	c.rescoreLocked()
	c.mu.Unlock()

	writeJSON(w, rules)
}

type BuiltinRules struct {
	Overridden bool
	Rules      []Rule
}

func (c *Classifier) getBuiltinRules(w http.ResponseWriter, r *http.Request) {
	c.mu.Lock()
	result := BuiltinRules{
		Overridden: c.overridden,
		Rules:      append([]Rule{}, c.builtin...),
	}
	c.mu.Unlock()

	writeJSON(w, result)
}

func (c *Classifier) putBuiltinRules(w http.ResponseWriter, r *http.Request) {
	rules, ok := decodeRules(w, r)
	if !ok {
		return
	}

	c.mu.Lock()
	if err := writeRuleFile(BuiltinOverridesPath, rules); err != nil {
		c.mu.Unlock()
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	c.builtin = rules
	c.overridden = true
	c.rebuildRulesLocked()
	c.rescoreLocked()
	c.mu.Unlock()

	writeJSON(w, BuiltinRules{Overridden: true, Rules: rules})
}

func (c *Classifier) deleteBuiltinRules(w http.ResponseWriter, r *http.Request) {
	c.mu.Lock()
	os.Remove(BuiltinOverridesPath)
	c.builtin = c.shipped
	c.overridden = false
	c.rebuildRulesLocked()
	c.rescoreLocked()
	c.mu.Unlock()

	writeJSON(w, BuiltinRules{Overridden: false, Rules: c.shipped})
}

// re-run classification for unpinned devices after a rule change
// assumes c.mu is held
func (c *Classifier) rescoreLocked() {
	for mac, signals := range c.signals {
		if c.classifications[mac].Pinned {
			continue
		}

		result := classifyDevice(&signals, c.db)
		result.LastUpdated = time.Now().UTC().Format(time.RFC3339)
		c.classifications[mac] = result
		c.publishIfChangedLocked(result)
	}
	c.saveLocked()
}

func startClassifier() (*Classifier, error) {
	db, err := loadFingerprintDB(FingerprintDBPath)
	if err != nil {
		return nil, err
	}

	classifier := newClassifier(db)
	busListener(classifier)
	return classifier, nil
}

func (c *Classifier) registerRoutes(router *mux.Router) {
	router.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]string{"status": "ok", "dbVersion": c.db.Version})
	}).Methods("GET")
	router.HandleFunc("/classify", c.classifyNow).Methods("PUT")
	router.HandleFunc("/classifications", c.listClassifications).Methods("GET")
	router.HandleFunc("/classification/{mac}", c.getClassification).Methods("GET")
	router.HandleFunc("/classification/{mac}/correction", c.putCorrection).Methods("PUT")
	router.HandleFunc("/classification/{mac}/correction", c.deleteCorrection).Methods("DELETE")
	router.HandleFunc("/classification/{mac}/signals", c.getSignals).Methods("GET")
	router.HandleFunc("/fingerprints/custom", c.getCustomRules).Methods("GET")
	router.HandleFunc("/fingerprints/custom", c.putCustomRules).Methods("PUT")
	router.HandleFunc("/fingerprints/builtin", c.getBuiltinRules).Methods("GET")
	router.HandleFunc("/fingerprints/builtin", c.putBuiltinRules).Methods("PUT")
	router.HandleFunc("/fingerprints/builtin", c.deleteBuiltinRules).Methods("DELETE")
}
