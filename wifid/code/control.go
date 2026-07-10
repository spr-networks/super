package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const defaultControlSocket = "/state/wifi/wifid-control.sock"

var wifiConfigDir = "/configs/wifi"
var hostapdStateDir = "/state/wifi"

var (
	controlIfaceRE = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z0-9][a-zA-Z0-9-]*)*$`)
	controlMACRE   = regexp.MustCompile(`^([0-9a-f]{2}:){5}[0-9a-f]{2}$`)
)

type bssTransitionRequest struct {
	SourceInterface string `json:"SourceInterface"`
	MAC             string `json:"MAC"`
	TargetInterface string `json:"TargetInterface"`
}

type bssTransitionResponse struct {
	SourceInterface string `json:"SourceInterface"`
	TargetInterface string `json:"TargetInterface"`
	MAC             string `json:"MAC"`
	SourceRSSI      int    `json:"SourceRSSI,omitempty"`
	TargetBSSID     string `json:"TargetBSSID"`
	OperatingClass  int    `json:"OperatingClass"`
	Channel         int    `json:"Channel"`
	PHYType         int    `json:"PHYType"`
	Command         string `json:"Command"`
	HostapdResponse string `json:"HostapdResponse"`
}

type commandRunner interface {
	Command(iface string, command ...string) (string, error)
}

type hostapdCLI struct{}

func validControlIface(iface string) bool {
	return controlIfaceRE.MatchString(iface) && !strings.HasPrefix(iface, "-")
}

func normalizeControlMAC(mac string) string {
	return strings.ToLower(strings.ReplaceAll(strings.TrimSpace(mac), "-", ":"))
}

func (hostapdCLI) Command(iface string, command ...string) (string, error) {
	if !validControlIface(iface) {
		return "", fmt.Errorf("invalid interface %q", iface)
	}
	controlDir := filepath.Join(hostapdStateDir, "control_"+iface)
	controlSocket := filepath.Join(controlDir, iface)
	if info, err := os.Stat(controlSocket); err != nil || info.Mode()&os.ModeSocket == 0 {
		return "", fmt.Errorf("exact hostapd control socket for %s is unavailable", iface)
	}
	args := []string{"-p", controlDir, "-s", hostapdStateDir, "-i", iface}
	args = append(args, command...)
	out, err := exec.Command("hostapd_cli", args...).CombinedOutput()
	response := strings.TrimSpace(string(out))
	if err != nil {
		return response, fmt.Errorf("hostapd_cli %s: %w: %s", iface, err, response)
	}
	if response == "" {
		return "", errors.New("hostapd returned an empty response")
	}
	if strings.HasPrefix(response, "FAIL") || strings.HasPrefix(response, "UNKNOWN COMMAND") {
		return response, fmt.Errorf("hostapd rejected command: %s", response)
	}
	return response, nil
}

type bssTransitionController struct {
	hostapd commandRunner
}

func newBSSTransitionController() *bssTransitionController {
	return &bssTransitionController{hostapd: hostapdCLI{}}
}

func parseHostapdValues(output string) map[string]string {
	values := map[string]string{}
	for _, line := range strings.Split(output, "\n") {
		key, value, ok := strings.Cut(strings.TrimSpace(line), "=")
		if ok {
			values[key] = value
		}
	}
	return values
}

// readBSSConfig returns values from the requested BSS section. Radio-wide
// values are inherited from the primary section; bss_transition is not.
func readBSSConfig(iface string) (map[string]string, error) {
	if !validControlIface(iface) {
		return nil, fmt.Errorf("invalid interface %q", iface)
	}
	base := strings.SplitN(iface, ".", 2)[0]
	path := filepath.Join(wifiConfigDir, "hostapd_"+base+".conf")
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("read hostapd config for %s: %w", iface, err)
	}
	defer file.Close()

	sections := map[string]map[string]string{base: {}}
	current := base
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 4096), 1<<20)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key, value = strings.TrimSpace(key), strings.TrimSpace(value)
		if key == "bss" {
			current = value
			if sections[current] == nil {
				sections[current] = map[string]string{}
			}
		}
		sections[current][key] = value
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	section, ok := sections[iface]
	if !ok {
		return nil, fmt.Errorf("interface %s is not configured in %s", iface, path)
	}
	values := map[string]string{}
	for key, value := range section {
		values[key] = value
	}
	for _, key := range []string{"channel", "op_class", "hw_mode"} {
		if values[key] == "" {
			values[key] = sections[base][key]
		}
	}
	return values, nil
}

func operatingClass(freq, channel int) int {
	switch {
	case freq >= 5950 && freq <= 7125:
		return 131
	case channel >= 1 && channel <= 13:
		return 81
	case channel == 14:
		return 82
	case channel >= 36 && channel <= 48:
		return 115
	case channel >= 52 && channel <= 64:
		return 118
	case channel >= 100 && channel <= 144:
		return 121
	case channel >= 149 && channel <= 161:
		return 124
	case channel >= 165 && channel <= 177:
		return 125
	default:
		return 0
	}
}

func phyType(status map[string]string, freq int) int {
	if status["ieee80211ax"] == "1" || status["ieee80211be"] == "1" {
		return 14 // HE; the Neighbor Report PHY enum has no EHT value.
	}
	if status["ieee80211ac"] == "1" {
		return 9
	}
	if status["ieee80211n"] == "1" {
		return 7
	}
	if freq >= 2400 && freq < 2500 {
		return 6
	}
	return 4
}

func (c *bssTransitionController) transition(request bssTransitionRequest) (bssTransitionResponse, error) {
	request.MAC = normalizeControlMAC(request.MAC)
	if !validControlIface(request.SourceInterface) || !validControlIface(request.TargetInterface) {
		return bssTransitionResponse{}, errors.New("invalid source or target interface")
	}
	if !controlMACRE.MatchString(request.MAC) {
		return bssTransitionResponse{}, errors.New("invalid station MAC")
	}
	if request.SourceInterface == request.TargetInterface {
		return bssTransitionResponse{}, errors.New("source and target interfaces must differ")
	}

	sourceFileConfig, err := readBSSConfig(request.SourceInterface)
	if err != nil {
		return bssTransitionResponse{}, err
	}
	if sourceFileConfig["bss_transition"] != "1" {
		return bssTransitionResponse{}, fmt.Errorf("802.11v BSS transition is disabled on %s", request.SourceInterface)
	}
	stationRaw, err := c.hostapd.Command(request.SourceInterface, "sta", request.MAC)
	if err != nil {
		return bssTransitionResponse{}, fmt.Errorf("station is not associated with %s: %w", request.SourceInterface, err)
	}
	station := parseHostapdValues(stationRaw)
	sourceRSSI := 0
	if fields := strings.Fields(station["signal"]); len(fields) > 0 {
		sourceRSSI, _ = strconv.Atoi(fields[0])
	}
	sourceConfigRaw, err := c.hostapd.Command(request.SourceInterface, "get_config")
	if err != nil {
		return bssTransitionResponse{}, err
	}
	targetConfigRaw, err := c.hostapd.Command(request.TargetInterface, "get_config")
	if err != nil {
		return bssTransitionResponse{}, err
	}
	sourceConfig := parseHostapdValues(sourceConfigRaw)
	targetConfig := parseHostapdValues(targetConfigRaw)
	if sourceConfig["ssid"] == "" || sourceConfig["ssid"] != targetConfig["ssid"] {
		return bssTransitionResponse{}, errors.New("source and target must advertise the same SSID")
	}
	for _, key := range []string{"wpa", "key_mgmt", "group_cipher", "rsn_pairwise_cipher"} {
		if sourceConfig[key] != targetConfig[key] {
			return bssTransitionResponse{}, fmt.Errorf("source and target security differ (%s)", key)
		}
	}
	targetBSSID := normalizeControlMAC(targetConfig["bssid"])
	if !controlMACRE.MatchString(targetBSSID) {
		return bssTransitionResponse{}, errors.New("target returned an invalid BSSID")
	}
	if targetBSSID == normalizeControlMAC(sourceConfig["bssid"]) {
		return bssTransitionResponse{}, errors.New("source and target BSSIDs must differ")
	}

	statusRaw, err := c.hostapd.Command(request.TargetInterface, "status")
	if err != nil {
		return bssTransitionResponse{}, err
	}
	status := parseHostapdValues(statusRaw)
	if status["state"] != "ENABLED" {
		return bssTransitionResponse{}, fmt.Errorf("target interface %s is not enabled", request.TargetInterface)
	}
	channel, _ := strconv.Atoi(status["channel"])
	freq, _ := strconv.Atoi(status["freq"])
	targetFileConfig, err := readBSSConfig(request.TargetInterface)
	if err != nil {
		return bssTransitionResponse{}, err
	}
	if targetFileConfig["bss_transition"] != "1" {
		return bssTransitionResponse{}, fmt.Errorf("802.11v BSS transition is disabled on target %s", request.TargetInterface)
	}
	opClass, _ := strconv.Atoi(targetFileConfig["op_class"])
	if opClass == 0 {
		opClass = operatingClass(freq, channel)
	}
	phy := phyType(status, freq)
	if channel <= 0 || opClass <= 0 {
		return bssTransitionResponse{}, errors.New("could not derive target channel and operating class")
	}

	neighbor := fmt.Sprintf("%s,0x00000000,%d,%d,%d,0301ff", targetBSSID, opClass, channel, phy)
	commandArgs := []string{"bss_tm_req", request.MAC, "pref=1", "abridged=1", "valid_int=30", "neighbor=" + neighbor}
	hostapdResponse, err := c.hostapd.Command(request.SourceInterface, commandArgs...)
	if err != nil {
		return bssTransitionResponse{}, err
	}
	return bssTransitionResponse{
		SourceInterface: request.SourceInterface,
		TargetInterface: request.TargetInterface,
		MAC:             request.MAC,
		SourceRSSI:      sourceRSSI,
		TargetBSSID:     targetBSSID,
		OperatingClass:  opClass,
		Channel:         channel,
		PHYType:         phy,
		Command:         strings.Join(commandArgs, " "),
		HostapdResponse: hostapdResponse,
	}, nil
}

func controlHandler(controller *bssTransitionController, roaming *roamingManager) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /status", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]bool{"Ready": true})
	})
	mux.HandleFunc("PUT /bss-transition", func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
		var request bssTransitionRequest
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&request); err != nil {
			http.Error(w, "invalid request: "+err.Error(), http.StatusBadRequest)
			return
		}
		response, err := controller.transition(request)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if roaming != nil {
			roaming.transitionSent(request, response, "manual", response.SourceRSSI)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(response)
	})
	if roaming != nil {
		mux.Handle("/roaming/", roamingHandler(roaming))
	}
	return mux
}

func serveControl(socketPath string) error {
	if err := os.MkdirAll(filepath.Dir(socketPath), 0o755); err != nil {
		return err
	}
	_ = os.Remove(socketPath)
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		return err
	}
	defer listener.Close()
	if err := os.Chmod(socketPath, 0o660); err != nil {
		return err
	}
	log.Println("wifid control listening on", socketPath)
	controller := newBSSTransitionController()
	roaming := newRoamingManager(controller, unixTopologyFetcher{socketPath: apiWifidSocketPath})
	go roaming.run(context.Background())
	server := http.Server{
		Handler:           controlHandler(controller, roaming),
		ReadHeaderTimeout: 5 * time.Second,
	}
	return server.Serve(listener)
}
