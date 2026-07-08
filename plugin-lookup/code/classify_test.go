package main

import (
	"path/filepath"
	"testing"
)

func testClassifier(t *testing.T) *Classifier {
	t.Helper()

	oldStorePath := StorePath
	oldCustomPath := CustomFingerprintsPath
	oldBuiltinPath := BuiltinOverridesPath
	dir := t.TempDir()
	StorePath = filepath.Join(dir, "classifications.json")
	CustomFingerprintsPath = filepath.Join(dir, "custom_fingerprints.json")
	BuiltinOverridesPath = filepath.Join(dir, "builtin_fingerprints.json")
	t.Cleanup(func() {
		StorePath = oldStorePath
		CustomFingerprintsPath = oldCustomPath
		BuiltinOverridesPath = oldBuiltinPath
	})

	return newClassifier(testDB(t))
}

func TestCompileRulesValidation(t *testing.T) {
	if err := compileRules([]Rule{{SignalType: "bogus", Pattern: "x", Category: "camera"}}); err == nil {
		t.Fatal("invalid SignalType accepted")
	}
	if err := compileRules([]Rule{{SignalType: "hostname", Pattern: "([", Category: "camera"}}); err == nil {
		t.Fatal("invalid regex accepted")
	}
	if err := compileRules([]Rule{{SignalType: "hostname", Pattern: "x"}}); err == nil {
		t.Fatal("rule without Category or Vendor accepted")
	}

	rules := []Rule{{SignalType: "hostname", Pattern: "^x", Category: "camera"}}
	if err := compileRules(rules); err != nil {
		t.Fatalf("valid rule rejected: %v", err)
	}
	if rules[0].Weight != 1 {
		t.Fatalf("weight not defaulted: %d", rules[0].Weight)
	}
}

func TestCustomRulesRescore(t *testing.T) {
	classifier := testClassifier(t)
	mac := "00:11:22:33:44:55"

	classifier.handleDHCP(DHCPRequest{MAC: mac, Name: "acmecam-1"})
	if classifier.classifications[mac].Category != "unknown" {
		t.Fatalf("expected unknown before custom rule: %#v", classifier.classifications[mac])
	}

	rules := []Rule{{SignalType: "hostname", Pattern: "^acmecam", Vendor: "Acme", Category: "camera", Weight: 3}}
	if err := compileRules(rules); err != nil {
		t.Fatalf("compile: %v", err)
	}

	classifier.mu.Lock()
	classifier.custom = rules
	classifier.rebuildRulesLocked()
	classifier.rescoreLocked()
	classifier.mu.Unlock()

	result := classifier.classifications[mac]
	if result.Category != "camera" || result.Vendor != "Acme" {
		t.Fatalf("custom rule not applied on rescore: %#v", result)
	}
}

func TestSignalsAccumulateAcrossEvents(t *testing.T) {
	classifier := testClassifier(t)
	mac := "00:11:22:33:44:55"

	classifier.handleZeroconf(ZeroconfDevice{
		MAC:      mac,
		Services: []string{"_ipp._tcp."},
	})

	result, ok := classifier.updateSignals(mac, func(signals *DeviceSignals) {
		signals.Hostname = "RingDoorbell-1234"
	})
	if !ok {
		t.Fatal("updateSignals failed")
	}

	if result.Category != "camera" && result.Category != "printer" {
		t.Fatalf("category = %q, want camera or printer", result.Category)
	}

	signals := classifier.signals[mac]
	if signals.Hostname != "RingDoorbell-1234" || len(signals.Services) != 1 {
		t.Fatalf("signals did not accumulate: %#v", signals)
	}
}

func TestClassificationsPersistAcrossRestart(t *testing.T) {
	classifier := testClassifier(t)
	mac := "00:11:22:33:44:55"

	classifier.handleDHCP(DHCPRequest{MAC: mac, Name: "RingDoorbell-1234"})

	reloaded := newClassifier(testDB(t))
	result, exists := reloaded.classifications[mac]
	if !exists || result.Category != "camera" {
		t.Fatalf("classification not persisted: %#v", result)
	}
}

func TestCorrectionPinsAgainstRescoring(t *testing.T) {
	classifier := testClassifier(t)
	mac := "00:11:22:33:44:55"

	classifier.handleDHCP(DHCPRequest{MAC: mac, Name: "RingDoorbell-1234"})

	pinned := classifier.classifications[mac]
	pinned.Category = "printer"
	pinned.UserCorrection = true
	pinned.Pinned = true
	classifier.classifications[mac] = pinned

	result, ok := classifier.updateSignals(mac, func(signals *DeviceSignals) {
		signals.Hostname = "RingDoorbell-5678"
	})
	if !ok {
		t.Fatal("updateSignals failed")
	}
	if result.Category != "printer" || !result.Pinned {
		t.Fatalf("correction did not pin device: %#v", result)
	}
}

func TestNormalizeMACOnLookups(t *testing.T) {
	classifier := testClassifier(t)

	classifier.handleDHCP(DHCPRequest{MAC: "00:11:22:33:44:AA", Name: "RingDoorbell-1234"})

	if _, exists := classifier.classifications["00:11:22:33:44:aa"]; !exists {
		t.Fatal("MAC was not normalized to lowercase")
	}
}
