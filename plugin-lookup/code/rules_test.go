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
			{SignalType: "vendor_class", Pattern: `^android-dhcp`, Category: "phone", Weight: 2},
			{SignalType: "dhcp_params", Pattern: `^1,121,3,6`, Vendor: "Apple", Weight: 2},
			{SignalType: "dns", Pattern: `\.ring\.com$`, Vendor: "Ring", Category: "camera", Weight: 2},
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

// real-device fixtures against the shipped fingerprint db
func TestShippedDBRealDevices(t *testing.T) {
	db, err := loadFingerprintDB("../data/fingerprints.json")
	if err != nil {
		t.Fatalf("load shipped db: %v", err)
	}

	cases := []struct {
		name       string
		signals    DeviceSignals
		category   string
		vendor     string
		confidence string
	}{
		{
			name: "mac laptop via mdns txt model",
			signals: DeviceSignals{
				MAC: "aa:bb:cc:dd:ee:01",
				TXT: map[string]string{"model": "MacBookPro18,3"},
			},
			category:   "laptop",
			vendor:     "Apple",
			confidence: "High",
		},
		{
			name: "home assistant",
			signals: DeviceSignals{
				MAC:       "20:f8:3b:dd:ee:02",
				OUIVendor: "Nabu Casa, Inc.",
				Hostname:  "homeassistant",
			},
			category:   "iot-sensor",
			vendor:     "Nabu Casa, Inc.",
			confidence: "High",
		},
		{
			name: "honeywell thermostat",
			signals: DeviceSignals{
				MAC:          "5c:fc:e1:dd:ee:03",
				OUIVendor:    "Resideo",
				ParamReqList: "1,3,6",
				Domains: []string{
					"tccprod01.honeywell.com",
					"tccprod02.honeywell.com",
					"lyric.alarmnet.com",
				},
			},
			category: "iot-sensor",
			vendor:   "Resideo",
		},
		{
			name: "flo water monitor",
			signals: DeviceSignals{
				MAC:          "88:0c:e0:dd:ee:04",
				OUIVendor:    "Texas Instruments",
				ParamReqList: "1,3,12,15,6,33,121,42",
				Domains: []string{
					"mqtt.flosecurecloud.com",
					"api-bulk.meetflo.com",
				},
			},
			category: "iot-sensor",
			vendor:   "Flo Smart Water Monitor",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			result := classifyDevice(&tc.signals, db)
			if result.Category != tc.category {
				t.Fatalf("category = %q, want %q (%#v)", result.Category, tc.category, result)
			}
			if result.Vendor != tc.vendor {
				t.Fatalf("vendor = %q, want %q (%#v)", result.Vendor, tc.vendor, result)
			}
			if tc.confidence != "" && result.Confidence != tc.confidence {
				t.Fatalf("confidence = %q, want %q (%#v)", result.Confidence, tc.confidence, result)
			}
			if result.Confidence == "Low" {
				t.Fatalf("confidence Low, want at least Medium (%#v)", result)
			}
		})
	}
}
