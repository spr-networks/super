package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type hostapdCall struct {
	iface   string
	command []string
}

type fakeHostapd struct {
	responses map[string]string
	calls     []hostapdCall
}

func fakeKey(iface string, command ...string) string {
	return iface + "\x00" + strings.Join(command, "\x00")
}

func (f *fakeHostapd) Command(iface string, command ...string) (string, error) {
	f.calls = append(f.calls, hostapdCall{iface: iface, command: append([]string(nil), command...)})
	if response, ok := f.responses[fakeKey(iface, command...)]; ok {
		return response, nil
	}
	if len(command) > 0 && command[0] == "bss_tm_req" {
		return "OK", nil
	}
	return "", os.ErrNotExist
}

func writeTestRadioConfig(t *testing.T, dir, iface, body string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, "hostapd_"+iface+".conf"), []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
}

func useTestConfigDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	old := wifiConfigDir
	wifiConfigDir = dir
	t.Cleanup(func() { wifiConfigDir = old })
	return dir
}

func setTestRoamingFlag(t *testing.T, enabled bool) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "roam_enable")
	old := roamEnablePath
	roamEnablePath = path
	if enabled {
		if err := os.WriteFile(path, nil, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() { roamEnablePath = old })
	return path
}

func successfulFakeHostapd() *fakeHostapd {
	return &fakeHostapd{responses: map[string]string{
		fakeKey("wlan0", "sta", "aa:bb:cc:dd:ee:ff"): "aa:bb:cc:dd:ee:ff\nsignal=-72\n",
		fakeKey("wlan0", "get_config"):               "bssid=02:00:00:00:00:01\nssid=spr\n",
		fakeKey("wlan1", "get_config"):               "bssid=02:00:00:00:00:02\nssid=spr\n",
		fakeKey("wlan1", "status"):                   "state=ENABLED\nfreq=5180\nchannel=36\nieee80211ax=1\n",
	}}
}

func TestTransitionBuildsAdvisoryBSSTMRequest(t *testing.T) {
	dir := useTestConfigDir(t)
	writeTestRadioConfig(t, dir, "wlan0", "interface=wlan0\nssid=spr\nbss_transition=1\nchannel=1\n")
	writeTestRadioConfig(t, dir, "wlan1", "interface=wlan1\nssid=spr\nbss_transition=1\nop_class=115\nchannel=36\n")

	fake := successfulFakeHostapd()
	controller := &bssTransitionController{hostapd: fake}
	response, err := controller.transition(bssTransitionRequest{
		SourceInterface: "wlan0",
		MAC:             "AA-BB-CC-DD-EE-FF",
		TargetInterface: "wlan1",
	})
	if err != nil {
		t.Fatal(err)
	}
	want := "bss_tm_req aa:bb:cc:dd:ee:ff pref=1 abridged=1 valid_int=30 neighbor=02:00:00:00:00:02,0x00000000,115,36,14,0301ff"
	if response.Command != want {
		t.Fatalf("command = %q, want %q", response.Command, want)
	}
	if strings.Contains(response.Command, "disassoc") {
		t.Fatalf("command must remain advisory: %q", response.Command)
	}
	if response.SourceRSSI != -72 {
		t.Fatalf("source RSSI = %d, want -72", response.SourceRSSI)
	}
	last := fake.calls[len(fake.calls)-1]
	if last.iface != "wlan0" || strings.Join(last.command, " ") != want {
		t.Fatalf("last call = %#v", last)
	}
}

func TestTransitionRequiresBSSTransitionEnabled(t *testing.T) {
	dir := useTestConfigDir(t)
	writeTestRadioConfig(t, dir, "wlan0", "interface=wlan0\nssid=spr\nbss_transition=0\n")
	controller := &bssTransitionController{hostapd: successfulFakeHostapd()}
	_, err := controller.transition(bssTransitionRequest{
		SourceInterface: "wlan0",
		MAC:             "aa:bb:cc:dd:ee:ff",
		TargetInterface: "wlan1",
	})
	if err == nil || !strings.Contains(err.Error(), "disabled") {
		t.Fatalf("error = %v, want disabled", err)
	}
}

func TestTransitionRequiresTargetToRemainSteerable(t *testing.T) {
	dir := useTestConfigDir(t)
	writeTestRadioConfig(t, dir, "wlan0", "interface=wlan0\nssid=spr\nbss_transition=1\nchannel=1\n")
	writeTestRadioConfig(t, dir, "wlan1", "interface=wlan1\nssid=spr\nbss_transition=0\nop_class=115\nchannel=36\n")
	controller := &bssTransitionController{hostapd: successfulFakeHostapd()}
	_, err := controller.transition(bssTransitionRequest{
		SourceInterface: "wlan0",
		MAC:             "aa:bb:cc:dd:ee:ff",
		TargetInterface: "wlan1",
	})
	if err == nil || !strings.Contains(err.Error(), "target") {
		t.Fatalf("error = %v, want target disabled", err)
	}
}

func TestTransitionRejectsDifferentSecurity(t *testing.T) {
	dir := useTestConfigDir(t)
	writeTestRadioConfig(t, dir, "wlan0", "interface=wlan0\nssid=spr\nbss_transition=1\nchannel=1\n")
	writeTestRadioConfig(t, dir, "wlan1", "interface=wlan1\nssid=spr\nbss_transition=1\nop_class=115\nchannel=36\n")
	fake := successfulFakeHostapd()
	fake.responses[fakeKey("wlan0", "get_config")] += "key_mgmt=WPA-PSK\n"
	fake.responses[fakeKey("wlan1", "get_config")] += "key_mgmt=SAE\n"
	controller := &bssTransitionController{hostapd: fake}
	_, err := controller.transition(bssTransitionRequest{
		SourceInterface: "wlan0",
		MAC:             "aa:bb:cc:dd:ee:ff",
		TargetInterface: "wlan1",
	})
	if err == nil || !strings.Contains(err.Error(), "security") {
		t.Fatalf("error = %v, want security mismatch", err)
	}
}

func TestReadBSSConfigDoesNotInheritTransitionFlag(t *testing.T) {
	dir := useTestConfigDir(t)
	writeTestRadioConfig(t, dir, "wlan0", "interface=wlan0\nbss_transition=1\nop_class=81\nbss=wlan0.ap0\nssid=guest\n")
	config, err := readBSSConfig("wlan0.ap0")
	if err != nil {
		t.Fatal(err)
	}
	if config["bss_transition"] != "" {
		t.Fatalf("extra BSS inherited bss_transition=%q", config["bss_transition"])
	}
	if config["op_class"] != "81" {
		t.Fatalf("radio-wide op_class = %q, want 81", config["op_class"])
	}
}

func TestControlHandlerRejectsUnknownFields(t *testing.T) {
	setTestRoamingFlag(t, true)
	handler := controlHandler(&bssTransitionController{hostapd: successfulFakeHostapd()}, nil)
	req := httptest.NewRequest(http.MethodPut, "/bss-transition", bytes.NewBufferString(`{"SourceInterface":"wlan0","MAC":"aa:bb:cc:dd:ee:ff","TargetInterface":"wlan1","RawCommand":"deauth"}`))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}
}

func TestControlHandlerGatesRoamingButKeepsWifidStatus(t *testing.T) {
	setTestRoamingFlag(t, false)
	handler := controlHandler(&bssTransitionController{hostapd: successfulFakeHostapd()}, nil)

	request := httptest.NewRequest(http.MethodPut, "/bss-transition", bytes.NewBufferString(`{}`))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("transition status = %d, want %d", recorder.Code, http.StatusNotFound)
	}

	request = httptest.NewRequest(http.MethodGet, "/status", nil)
	recorder = httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"RoamingEnabled":false`) {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestRoamingFlagMustBeARegularFile(t *testing.T) {
	path := setTestRoamingFlag(t, false)
	if err := os.Mkdir(path, 0o700); err != nil {
		t.Fatal(err)
	}
	if roamingFeatureEnabled() {
		t.Fatal("directory must not enable roaming")
	}
}

func TestOperatingClassFallbacks(t *testing.T) {
	tests := []struct {
		freq, channel, want int
	}{
		{2412, 1, 81},
		{5180, 36, 115},
		{5500, 100, 121},
		{5975, 5, 131},
	}
	for _, test := range tests {
		if got := operatingClass(test.freq, test.channel); got != test.want {
			t.Errorf("operatingClass(%d, %d) = %d, want %d", test.freq, test.channel, got, test.want)
		}
	}
}
