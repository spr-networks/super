package main

import "testing"

func testDB(t *testing.T) *FingerprintDB {
	t.Helper()

	db := &FingerprintDB{
		Version: "test",
		CategorySuggestions: map[string]CategorySuggestion{
			"camera": {Groups: []string{"IoT"}, Policies: []string{"wan", "dns"}},
		},
		Rules: []Rule{
			{SignalType: "hostname", Pattern: `^Ring`, Vendor: "Ring", Category: "camera", Weight: 3, Decisive: true},
			{SignalType: "mdns_service", Pattern: `_ipp\._tcp`, Category: "printer", Weight: 3, Decisive: true},
		},
	}
	for i := range db.Rules {
		compiled, err := compileRulePattern(db.Rules[i].Pattern)
		if err != nil {
			t.Fatalf("compile pattern: %v", err)
		}
		db.Rules[i].compiled = compiled
	}
	return db
}

func TestLoadShippedFingerprintDB(t *testing.T) {
	db, err := loadFingerprintDB("../data/fingerprints.json")
	if err != nil {
		t.Fatalf("load shipped db: %v", err)
	}
	if db.Version == "" || len(db.Rules) == 0 {
		t.Fatalf("shipped db is empty")
	}
}

func TestClassifyOUIPrefix(t *testing.T) {
	db := &FingerprintDB{
		Rules: []Rule{
			{SignalType: "oui", Pattern: `^b8:27:eb`, Vendor: "Raspberry Pi", Category: "iot-sensor", Weight: 3},
		},
	}
	for i := range db.Rules {
		compiled, err := compileRulePattern(db.Rules[i].Pattern)
		if err != nil {
			t.Fatalf("compile pattern: %v", err)
		}
		db.Rules[i].compiled = compiled
	}

	result := classifyDevice(&DeviceSignals{MAC: "b8:27:eb:aa:bb:cc"}, db)
	if result.Category != "iot-sensor" || result.Vendor != "Raspberry Pi" {
		t.Fatalf("oui prefix rule not applied: %#v", result)
	}

	random := classifyDevice(&DeviceSignals{MAC: "ba:27:eb:aa:bb:cc", RandomMAC: true}, db)
	if random.Vendor == "Raspberry Pi" {
		t.Fatalf("randomized MAC must not match oui prefix rules: %#v", random)
	}
}

func TestClassifyDecisiveHostname(t *testing.T) {
	result := classifyDevice(&DeviceSignals{
		MAC:      "00:11:22:33:44:55",
		Hostname: "RingDoorbell-1234",
	}, testDB(t))

	if result.Category != "camera" {
		t.Fatalf("category = %q, want camera", result.Category)
	}
	if result.Vendor != "Ring" {
		t.Fatalf("vendor = %q, want Ring", result.Vendor)
	}
	if result.Confidence != "High" {
		t.Fatalf("confidence = %q, want High", result.Confidence)
	}
	if len(result.SuggestedGroups) != 1 || result.SuggestedGroups[0] != "IoT" {
		t.Fatalf("unexpected suggested groups: %#v", result.SuggestedGroups)
	}
}

func TestClassifyRandomMACIsLowConfidence(t *testing.T) {
	result := classifyDevice(&DeviceSignals{
		MAC:       "02:11:22:33:44:55",
		RandomMAC: true,
	}, testDB(t))

	if result.Category != "phone" {
		t.Fatalf("category = %q, want phone", result.Category)
	}
	if result.Confidence != "Low" {
		t.Fatalf("confidence = %q, want Low", result.Confidence)
	}
	if len(result.SuggestedGroups) != 0 {
		t.Fatalf("low confidence should not suggest groups: %#v", result.SuggestedGroups)
	}
}

func TestClassifyKeepsOUIVendorWhenCategoryUnknown(t *testing.T) {
	result := classifyDevice(&DeviceSignals{
		MAC:       "00:11:22:33:44:55",
		OUIVendor: "Acme Devices",
	}, testDB(t))

	if result.Category != "unknown" {
		t.Fatalf("category = %q, want unknown", result.Category)
	}
	if result.Vendor != "Acme Devices" {
		t.Fatalf("vendor = %q, want Acme Devices", result.Vendor)
	}
	if result.Confidence != "Unknown" {
		t.Fatalf("confidence = %q, want Unknown", result.Confidence)
	}
}

func TestClassifyModelFromTXTIsHighConfidence(t *testing.T) {
	result := classifyDevice(&DeviceSignals{
		MAC: "00:11:22:33:44:55",
		TXT: map[string]string{"model": "OfficeJet 9000"},
		Services: []string{
			"_ipp._tcp.",
		},
	}, testDB(t))

	if result.Category != "printer" {
		t.Fatalf("category = %q, want printer", result.Category)
	}
	if result.Model != "OfficeJet 9000" {
		t.Fatalf("model = %q, want OfficeJet 9000", result.Model)
	}
	if result.Confidence != "High" {
		t.Fatalf("confidence = %q, want High", result.Confidence)
	}
}
