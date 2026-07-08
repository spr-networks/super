package main

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func testClassifier(t *testing.T) *Classifier {
	t.Helper()

	oldStorePath := StorePath
	oldCustomPath := CustomFingerprintsPath
	oldBuiltinPath := BuiltinOverridesPath
	oldPublicPath := DevicesPublicPath
	dir := t.TempDir()
	StorePath = filepath.Join(dir, "classifications.json")
	CustomFingerprintsPath = filepath.Join(dir, "custom_fingerprints.json")
	BuiltinOverridesPath = filepath.Join(dir, "builtin_fingerprints.json")
	DevicesPublicPath = filepath.Join(dir, "devices-public.json")
	ipMACCache = map[string]string{}
	ipMACLoaded = time.Time{}
	t.Cleanup(func() {
		StorePath = oldStorePath
		CustomFingerprintsPath = oldCustomPath
		BuiltinOverridesPath = oldBuiltinPath
		DevicesPublicPath = oldPublicPath
		ipMACCache = map[string]string{}
		ipMACLoaded = time.Time{}
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

func TestDHCPFingerprintSignals(t *testing.T) {
	classifier := testClassifier(t)
	mac := "00:11:22:33:44:55"

	classifier.handleDHCP(DHCPRequest{
		MAC:          mac,
		Name:         "unhelpful-name",
		VendorClass:  "android-dhcp-14",
		ParamReqList: "1,3,6,15,26,28,51,58,59,43",
	})

	result := classifier.classifications[mac]
	if result.Category != "phone" {
		t.Fatalf("vendor class rule not applied: %#v", result)
	}

	signals := classifier.signals[mac]
	if signals.VendorClass != "android-dhcp-14" || signals.ParamReqList == "" {
		t.Fatalf("dhcp options not stored: %#v", signals)
	}
}

func TestDNSQuerySignals(t *testing.T) {
	classifier := testClassifier(t)
	mac := "00:11:22:33:44:55"

	devices := fmt.Sprintf(
		`{"%s": {"MAC": "%s", "RecentIP": "192.168.2.16"}}`, mac, mac)
	if err := os.WriteFile(DevicesPublicPath, []byte(devices), 0600); err != nil {
		t.Fatal(err)
	}

	classifier.handleDNS(DNSEvent{
		Q:      []struct{ Name string }{{Name: "fw.ring.com."}},
		Remote: "192.168.2.16:40000",
	})

	signals := classifier.signals[mac]
	if len(signals.Domains) != 1 || signals.Domains[0] != "fw.ring.com" {
		t.Fatalf("dns query not recorded: %#v", signals)
	}

	result := classifier.classifications[mac]
	if result.Category != "camera" || result.Vendor != "Ring" {
		t.Fatalf("dns rule not applied: %#v", result)
	}
}

func TestDomainSignals(t *testing.T) {
	classifier := testClassifier(t)
	mac := "00:11:22:33:44:55"

	classifier.addDomain(mac, normalizeDomain("Something.Ring.com."))
	classifier.addDomain(mac, normalizeDomain("something.ring.com"))
	classifier.addDomain(mac, normalizeDomain("localhost"))
	classifier.addDomain(mac, normalizeDomain("printer.local"))

	signals := classifier.signals[mac]
	if len(signals.Domains) != 1 || signals.Domains[0] != "something.ring.com" {
		t.Fatalf("domains not deduped/normalized: %#v", signals.Domains)
	}

	for i := 0; i < maxDomainsPerDevice+10; i++ {
		classifier.addDomain(mac, normalizeDomain(fmt.Sprintf("host%d.example.com", i)))
	}
	if len(classifier.signals[mac].Domains) > maxDomainsPerDevice {
		t.Fatalf("domain cap not enforced: %d", len(classifier.signals[mac].Domains))
	}
}

func TestNormalizeMACOnLookups(t *testing.T) {
	classifier := testClassifier(t)

	classifier.handleDHCP(DHCPRequest{MAC: "00:11:22:33:44:AA", Name: "RingDoorbell-1234"})

	if _, exists := classifier.classifications["00:11:22:33:44:aa"]; !exists {
		t.Fatal("MAC was not normalized to lowercase")
	}
}
