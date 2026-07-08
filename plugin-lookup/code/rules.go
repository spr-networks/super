package main

import (
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"sort"
	"strings"
)

type Rule struct {
	SignalType string //oui (mac prefix), mac_vendor, hostname, mdns_service, mdns_txt, ssdp
	Pattern    string
	Vendor     string
	Category   string
	Model      string
	Weight     int
	Decisive   bool

	compiled *regexp.Regexp
}

type CategorySuggestion struct {
	Groups   []string
	Policies []string
}

type FingerprintDB struct {
	Version             string
	CategorySuggestions map[string]CategorySuggestion
	Rules               []Rule
}

type DeviceSignals struct {
	MAC         string
	RandomMAC   bool
	OUIVendor   string
	Hostname    string
	Services    []string
	TXT         map[string]string
	SSDPHeaders map[string]string
}

type Classification struct {
	MAC               string
	Vendor            string
	Category          string
	Model             string
	Confidence        string //High, Medium, Low, Unknown
	Evidence          []string
	SuggestedGroups   []string
	SuggestedPolicies []string
	DBVersion         string
	UserCorrection    bool
	Pinned            bool
	LastUpdated       string
}

func loadFingerprintDB(path string) (*FingerprintDB, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	db := FingerprintDB{}
	err = json.Unmarshal(data, &db)
	if err != nil {
		return nil, err
	}

	for i := range db.Rules {
		compiled, err := compileRulePattern(db.Rules[i].Pattern)
		if err != nil {
			return nil, fmt.Errorf("bad pattern %q: %v", db.Rules[i].Pattern, err)
		}
		db.Rules[i].compiled = compiled
	}

	return &db, nil
}

func compileRulePattern(pattern string) (*regexp.Regexp, error) {
	return regexp.Compile("(?i)" + pattern)
}

var validSignalTypes = []string{"oui", "mac_vendor", "hostname", "mdns_service", "mdns_txt", "ssdp"}

// validate and compile user-supplied rules in place
func compileRules(rules []Rule) error {
	for i := range rules {
		rule := &rules[i]

		validType := false
		for _, signalType := range validSignalTypes {
			if rule.SignalType == signalType {
				validType = true
				break
			}
		}
		if !validType {
			return fmt.Errorf("invalid SignalType %q", rule.SignalType)
		}

		if rule.Pattern == "" {
			return fmt.Errorf("rule needs a Pattern")
		}
		if rule.Category == "" && rule.Vendor == "" {
			return fmt.Errorf("rule needs a Category or Vendor")
		}
		if rule.Weight <= 0 {
			rule.Weight = 1
		}

		compiled, err := compileRulePattern(rule.Pattern)
		if err != nil {
			return fmt.Errorf("bad pattern %q: %v", rule.Pattern, err)
		}
		rule.compiled = compiled
	}
	return nil
}

func signalValues(signals *DeviceSignals) map[string][]string {
	values := map[string][]string{}

	if signals.MAC != "" && !signals.RandomMAC {
		values["oui"] = []string{signals.MAC}
	}
	if signals.OUIVendor != "" {
		values["mac_vendor"] = []string{signals.OUIVendor}
	}
	if signals.Hostname != "" {
		values["hostname"] = []string{signals.Hostname}
	}
	values["mdns_service"] = signals.Services
	for key, value := range signals.TXT {
		values["mdns_txt"] = append(values["mdns_txt"], key+"="+value)
	}
	for key, value := range signals.SSDPHeaders {
		values["ssdp"] = append(values["ssdp"], key+": "+value)
	}

	return values
}

type hypothesis struct {
	score       int
	signalTypes map[string]bool
}

func addEvidence(scores map[string]*hypothesis, name string, signalType string, weight int) {
	if name == "" {
		return
	}
	entry, exists := scores[name]
	if !exists {
		entry = &hypothesis{0, map[string]bool{}}
		scores[name] = entry
	}
	entry.score += weight
	entry.signalTypes[signalType] = true
}

func topHypothesis(scores map[string]*hypothesis) (string, *hypothesis, int) {
	names := []string{}
	for name := range scores {
		names = append(names, name)
	}
	sort.Slice(names, func(i, j int) bool {
		if scores[names[i]].score != scores[names[j]].score {
			return scores[names[i]].score > scores[names[j]].score
		}
		return names[i] < names[j]
	})

	if len(names) == 0 {
		return "", nil, 0
	}

	runnerUpScore := 0
	if len(names) > 1 {
		runnerUpScore = scores[names[1]].score
	}
	return names[0], scores[names[0]], runnerUpScore
}

func modelFromTXT(txt map[string]string) string {
	for _, key := range []string{"model", "md", "ty", "usb_MDL"} {
		if value, exists := txt[key]; exists && value != "" {
			return value
		}
	}
	return ""
}

func classifyDevice(signals *DeviceSignals, db *FingerprintDB) Classification {
	result := Classification{
		MAC:        signals.MAC,
		Category:   "unknown",
		Confidence: "Unknown",
		Evidence:   []string{},
		DBVersion:  db.Version,
	}

	categoryScores := map[string]*hypothesis{}
	vendorScores := map[string]*hypothesis{}
	decisive := false

	if signals.RandomMAC {
		result.Evidence = append(result.Evidence, "locally-administered MAC (randomized), vendor withheld by device")
		addEvidence(categoryScores, "phone", "mac", 1)
	} else if signals.OUIVendor != "" {
		result.Evidence = append(result.Evidence, fmt.Sprintf("OUI vendor is %q", signals.OUIVendor))
		addEvidence(vendorScores, signals.OUIVendor, "mac_vendor", 2)
	}

	values := signalValues(signals)

	for _, rule := range db.Rules {
		for _, value := range values[rule.SignalType] {
			if !rule.compiled.MatchString(value) {
				continue
			}

			target := rule.Category
			if target == "" {
				target = rule.Vendor
			}
			if target == "" {
				continue
			}
			result.Evidence = append(result.Evidence,
				fmt.Sprintf("%s %q indicates %s", rule.SignalType, value, target))

			addEvidence(categoryScores, rule.Category, rule.SignalType, rule.Weight)
			addEvidence(vendorScores, rule.Vendor, rule.SignalType, rule.Weight)

			if rule.Decisive {
				decisive = true
			}
			if rule.Model != "" && result.Model == "" {
				result.Model = rule.Model
			}
		}
	}

	if model := modelFromTXT(signals.TXT); model != "" {
		result.Model = model
		result.Evidence = append(result.Evidence, fmt.Sprintf("mDNS TXT advertises model %q", model))
		decisive = true
	}

	category, categoryHyp, runnerUpScore := topHypothesis(categoryScores)
	vendor, _, _ := topHypothesis(vendorScores)
	result.Vendor = vendor

	if categoryHyp == nil {
		return result
	}

	result.Category = category

	conflict := runnerUpScore >= categoryHyp.score
	onlyMAC := len(categoryHyp.signalTypes) == 1 && categoryHyp.signalTypes["mac"]

	switch {
	case conflict || onlyMAC:
		result.Confidence = "Low"
		if conflict {
			result.Evidence = append(result.Evidence, "conflicting signals, confidence reduced")
		}
	case decisive || len(categoryHyp.signalTypes) >= 3:
		result.Confidence = "High"
	default:
		result.Confidence = "Medium"
	}

	if suggestion, exists := db.CategorySuggestions[category]; exists && result.Confidence != "Low" {
		result.SuggestedGroups = suggestion.Groups
		result.SuggestedPolicies = suggestion.Policies
	}

	return result
}

func isRandomMAC(mac string) bool {
	firstOctet := strings.SplitN(mac, ":", 2)[0]
	if len(firstOctet) != 2 {
		return false
	}
	var value int
	_, err := fmt.Sscanf(firstOctet, "%x", &value)
	if err != nil {
		return false
	}
	return value&0x02 != 0 && value&0x01 == 0
}
