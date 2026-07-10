package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type staticTopologyFetcher struct {
	topology roamingTopology
	err      error
}

func (fetcher staticTopologyFetcher) Fetch(context.Context) (roamingTopology, error) {
	return fetcher.topology, fetcher.err
}

func useTestRoamingPaths(t *testing.T) {
	t.Helper()
	setTestRoamingFlag(t, true)
	dir := t.TempDir()
	oldConfig, oldHistory, oldModel := roamingConfigPath, roamingHistoryPath, roamingModelPath
	roamingConfigPath = filepath.Join(dir, "roaming.json")
	roamingHistoryPath = filepath.Join(dir, "history.json")
	roamingModelPath = filepath.Join(dir, "model.json")
	t.Cleanup(func() {
		roamingConfigPath, roamingHistoryPath, roamingModelPath = oldConfig, oldHistory, oldModel
	})
}

func testRoamingTopology() roamingTopology {
	return roamingTopology{Nodes: []topologyNode{
		{Kind: "ap_radio", Iface: "wlan0", SSID: "spr", Online: true, Radio: &topologyRadio{Stations: 1}},
		{Kind: "ap_radio", Iface: "wlan1", SSID: "spr", Online: true, Radio: &topologyRadio{Stations: 0}},
		{Kind: "device", MAC: "aa:bb:cc:dd:ee:ff", ConnType: "wifi", Iface: "wlan0", Online: true, Signal: &topologySignal{RSSI: -72}},
	}}
}

func TestDefaultRoamingConfigIsSafe(t *testing.T) {
	config := defaultRoamingConfig()
	if !config.DryRun {
		t.Fatal("automatic roaming must default to dry-run")
	}
	if config.ExplorationRate != 0 {
		t.Fatalf("default exploration = %v, want 0", config.ExplorationRate)
	}
}

func TestBanditRequiresLearnedImprovementWithoutExploration(t *testing.T) {
	useTestRoamingPaths(t)
	manager := newRoamingManager(nil, staticTopologyFetcher{})
	config := defaultRoamingConfig()
	target, exploring := manager.selectTarget("aa:bb:cc:dd:ee:ff", "wlan0", -72, []string{"wlan1"}, config)
	if target != "" || exploring {
		t.Fatalf("untrained selection = %q, %v", target, exploring)
	}

	manager.updateModel(roamingRecord{
		MAC:             "aa:bb:cc:dd:ee:ff",
		SourceInterface: "wlan0",
		TargetInterface: "wlan1",
		SourceRSSI:      -72,
		Reward:          connectedReward(-50),
	})
	target, exploring = manager.selectTarget("aa:bb:cc:dd:ee:ff", "wlan0", -72, []string{"wlan1"}, config)
	if target != "wlan1" || exploring {
		t.Fatalf("learned selection = %q, %v", target, exploring)
	}
}

func TestDryRunRecordsRecommendationWithoutCallingActuator(t *testing.T) {
	useTestRoamingPaths(t)
	manager := newRoamingManager(nil, staticTopologyFetcher{topology: testRoamingTopology()})
	config := defaultRoamingConfig()
	config.DryRun = true
	manager.config = config
	manager.autoOnce(context.Background())

	history := manager.historyCopy()
	if len(history) != 1 {
		t.Fatalf("history count = %d, want 1", len(history))
	}
	if history[0].State != "recommended" || history[0].TargetInterface != "wlan1" || !history[0].DryRun {
		t.Fatalf("record = %+v", history[0])
	}
}

func TestLiveAutoDoesNotUseUntrainedArm(t *testing.T) {
	useTestRoamingPaths(t)
	manager := newRoamingManager(nil, staticTopologyFetcher{topology: testRoamingTopology()})
	config := defaultRoamingConfig()
	config.DryRun = false
	manager.config = config
	manager.autoOnce(context.Background())
	if len(manager.historyCopy()) != 0 {
		t.Fatal("untrained live policy attempted a transition")
	}
}

func TestAutoPolicyDoesNothingWithoutRoamEnable(t *testing.T) {
	useTestRoamingPaths(t)
	if err := os.Remove(roamEnablePath); err != nil {
		t.Fatal(err)
	}
	manager := newRoamingManager(nil, staticTopologyFetcher{topology: testRoamingTopology()})
	config := defaultRoamingConfig()
	config.DryRun = true
	manager.config = config
	manager.autoOnce(context.Background())
	if len(manager.historyCopy()) != 0 {
		t.Fatal("disabled roaming feature evaluated the automatic policy")
	}
}

func TestRoamingStatusRemainsVisibleWhileFeatureIsDisabled(t *testing.T) {
	useTestRoamingPaths(t)
	if err := os.Remove(roamEnablePath); err != nil {
		t.Fatal(err)
	}
	manager := newRoamingManager(nil, staticTopologyFetcher{})
	handler := controlHandler(&bssTransitionController{hostapd: successfulFakeHostapd()}, manager)

	request := httptest.NewRequest(http.MethodGet, "/roaming/status", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"RoamingEnabled":false`) {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	request = httptest.NewRequest(http.MethodGet, "/roaming/config", nil)
	recorder = httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("config status = %d, want %d", recorder.Code, http.StatusNotFound)
	}
}

func TestRSSIBucketUsesLowerTenDBMRange(t *testing.T) {
	if got := rssiBucket(-72); got != -80 {
		t.Fatalf("rssiBucket(-72) = %d, want -80", got)
	}
	if got := rssiBucket(-70); got != -70 {
		t.Fatalf("rssiBucket(-70) = %d, want -70", got)
	}
}
