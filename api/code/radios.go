package main

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"
	"github.com/gorilla/mux"
	"io"
	"io/ioutil"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
)

func getHostapdConfigPath(iface string) string {
	if !isValidIface(iface) {
		return ""
	}

	return TEST_PREFIX + "/configs/wifi/hostapd_" + iface + ".conf"
}

/*
Generate a list of link devices in AP mode
*/
func getAP_Ifaces() []string {
	ret := []string{}

	files, err := ioutil.ReadDir(TEST_PREFIX + "/state/wifi")
	if err != nil {
		fmt.Println("failed to list /state/wifi for control files", err)
		return ret
	}
	for _, f := range files {
		if strings.HasPrefix(f.Name(), "control_") {
			pieces := strings.Split(f.Name(), "_")
			ret = append(ret, pieces[1])
		}
	}

	return ret
}

func doReloadPSKFiles() {
	//generate PSK files for hostapd
	devices := getDevicesJson()

	wpa2 := ""
	sae := ""

	for keyval, entry := range devices {
		if keyval == "pending" {
			//set wildcard password at front. hostapd uses a FILO for the sae keys
			if entry.PSKEntry.Type == "sae" {
				sae = entry.PSKEntry.Psk + "|mac=ff:ff:ff:ff:ff:ff" + "\n" + sae
				//apple downgrade workaround https://feedbackassistant.apple.com/feedback/9991042
				wpa2 = "00:00:00:00:00:00 " + entry.PSKEntry.Psk + "\n" + wpa2
			} else if entry.PSKEntry.Type == "wpa2" {
				wpa2 = "00:00:00:00:00:00 " + entry.PSKEntry.Psk + "\n" + wpa2
			}
		} else {
			if entry.PSKEntry.Type == "sae" {
				sae += entry.PSKEntry.Psk + "|mac=" + entry.MAC + "\n"
				//apple downgrade workaround https://feedbackassistant.apple.com/feedback/9991042
				wpa2 += entry.MAC + " " + entry.PSKEntry.Psk + "\n"
			} else if entry.PSKEntry.Type == "wpa2" {
				wpa2 += entry.MAC + " " + entry.PSKEntry.Psk + "\n"
			}
		}
	}

	err := ioutil.WriteFile(TEST_PREFIX+"/configs/wifi/sae_passwords", []byte(sae), 0644)
	if err != nil {
		log.Fatal(err)
	}
	err = ioutil.WriteFile(TEST_PREFIX+"/configs/wifi/wpa2pskfile", []byte(wpa2), 0644)
	if err != nil {
		log.Fatal(err)
	}

	for _, iface := range getAP_Ifaces() {
		//reload the hostapd passwords
		cmd := exec.Command("hostapd_cli", "-p", "/state/wifi/control_"+iface, "-s", "/state/wifi/", "reload_wpa_psk")
		err = cmd.Run()
		if err != nil {
			fmt.Println(err)
		}
	}

	//if we are re-loading PSK files, update the mesh plugin to run a device sync
	updateMeshPluginPSKReload(devices)
}

func hostapdSyncMesh(w http.ResponseWriter, r *http.Request) {
	devices := getDevicesJson()
	updateMeshPluginPSKReload(devices)
}

type HostapdConfigEntry struct {
	Country_code                 string
	Vht_capab                    string
	Ht_capab                     string
	Hw_mode                      string
	Ieee80211ax                  int
	He_su_beamformer             int
	He_su_beamformee             int
	He_mu_beamformer             int
	Ssid                         string
	Channel                      int
	Vht_oper_centr_freq_seg0_idx int
	He_oper_centr_freq_seg0_idx  int
	Vht_oper_chwidth             int
	He_oper_chwidth              int
	Bss_transition               int
	Time_advertisement           int
	Rrm_neighbor_report          int
	Rrm_beacon_report            int
}

func RunHostapdAllStations(iface string) (map[string]map[string]string, error) {
	m := map[string]map[string]string{}
	out, err := RunHostapdCommand(iface, "all_sta")
	if err != nil {
		return nil, err
	}

	mac := ""
	for _, line := range strings.Split(out, "\n") {
		if strings.Contains(line, "=") {
			pair := strings.Split(line, "=")
			if mac != "" {
				m[mac][pair[0]] = pair[1]
			}
		} else if strings.Contains(line, ":") {
			mac = line
			m[mac] = map[string]string{}
		}

	}

	return m, nil
}

func RunHostapdStatus(iface string) (map[string]string, error) {
	m := map[string]string{}

	out, err := RunHostapdCommand(iface, "status")
	if err != nil {
		return nil, err
	}

	for _, line := range strings.Split(out, "\n") {
		if strings.Contains(line, "=") {
			pair := strings.Split(line, "=")
			m[pair[0]] = pair[1]
		}

	}
	return m, nil
}

type ChannelParameters struct {
	Mode       string
	Channel    int
	Bandwidth  int
	HT_Enable  bool
	VHT_Enable bool
	HE_Enable  bool
}

type CalculatedChannelParameters struct {
	Vht_oper_centr_freq_seg0_idx int
	He_oper_centr_freq_seg0_idx  int
	Vht_oper_chwidth             int
	He_oper_chwidth              int
	Freq1                        int
	Freq2                        int
	Freq3                        int
}

func ChanCalc(mode string, channel int, bw int, ht_enabled bool, vht_enabled bool, he_enabled bool) CalculatedChannelParameters {
	freq1 := 0
	freq2 := 0
	freq3 := 0 //for 80+80, not supported right now

	calculated := CalculatedChannelParameters{-1, -1, 0, 0, 0, 0, 0}

	base := 5000
	if mode == "b" || mode == "g" {
		//2.4ghz
		base = 2407
		freq1 = 2407 + channel*5
		if channel == 14 {
			//channel 14 goes higher
			freq1 += 7
		}
	} else if mode == "a" {
		//5 ghz
		freq1 = base + channel*5
	}

	center_channel := 0

	switch bw {
	case 20:
		//freq1 was all needed
	case 40:
		//center is 10 mhz above freq1 center
		center_channel = channel + 2
	case 80:
		//center is 30 mhz above freq1 center
		center_channel = channel + 6
		if vht_enabled {
			calculated.Vht_oper_chwidth = 1
		}
		if he_enabled {
			calculated.He_oper_chwidth = 1
		}
	case 160:
		center_channel = channel + 14
		if vht_enabled {
			calculated.Vht_oper_chwidth = 2
		}
		if he_enabled {
			calculated.He_oper_chwidth = 2
		}
	}

	if center_channel != 0 {
		freq2 = base + center_channel*5
		if vht_enabled {
			calculated.Vht_oper_centr_freq_seg0_idx = center_channel
		}
		if he_enabled {
			calculated.He_oper_centr_freq_seg0_idx = center_channel
		}
	}

	calculated.Freq1 = freq1
	calculated.Freq2 = freq2
	calculated.Freq3 = freq3

	//chan_switch 1 5180 sec_channel_offset=1 center_freq1=5210 bandwidth=80 vht
	return calculated
}

func ChanSwitch(iface string, bw int, freq1 int, freq2 int, ht_enabled bool, vht_enabled bool, he_enabled bool) error {
	cmd := ""
	if bw == 20 {
		cmd = fmt.Sprintf("chan_switch 1 %d bandwidth=20", freq1)
	} else if bw == 40 || bw == 80 || bw == 160 {
		cmd = fmt.Sprintf("chan_switch 1 %d sec_channel_offset=1 center_freq1=%d bandwidth=%d", freq1, freq2, bw)
	} else if bw == 8080 {
		//80 + 80 unsupported for now
		// center_freq1, center_freq2
		return fmt.Errorf("80+80 not supported")
	}

	if ht_enabled {
		cmd += " ht"
	}

	if vht_enabled {
		cmd += " vht"
	}

	if he_enabled {
		cmd += " he"
	}

	fmt.Println("chan_switch command:", cmd)

	result, err := RunHostapdCommandArray(iface, strings.Split(cmd, " "))

	if !strings.Contains(result, "OK") && err == nil {
		err = fmt.Errorf("Failed to run chan_switch %s", result)
	}

	return err
}

func hostapdChannelSwitch(w http.ResponseWriter, r *http.Request) {
	iface := mux.Vars(r)["interface"]
	if !isValidIface(iface) {
		http.Error(w, "Invalid interface", 400)
		return
	}

	channelParams := ChannelParameters{}
	err := json.NewDecoder(r.Body).Decode(&channelParams)

	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	calculated := ChanCalc(channelParams.Mode, channelParams.Channel, channelParams.Bandwidth, channelParams.HT_Enable, channelParams.VHT_Enable, channelParams.HE_Enable)
	err = ChanSwitch(iface, channelParams.Bandwidth, calculated.Freq1, calculated.Freq2, channelParams.HT_Enable, channelParams.VHT_Enable, channelParams.HE_Enable)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(calculated)

}

func hostapdChannelCalc(w http.ResponseWriter, r *http.Request) {
	channelParams := ChannelParameters{}
	err := json.NewDecoder(r.Body).Decode(&channelParams)

	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	calculated := ChanCalc(channelParams.Mode, channelParams.Channel, channelParams.Bandwidth, channelParams.HT_Enable, channelParams.VHT_Enable, channelParams.HE_Enable)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(calculated)

}

func RunHostapdCommandArray(iface string, cmd []string) (string, error) {

	args := append([]string{"-p", "/state/wifi/control_" + iface, "-s", "/state/wifi"}, cmd...)

	outb, err := exec.Command("hostapd_cli", args...).Output()
	if err != nil {
		return "", fmt.Errorf("Failed to execute command %s", cmd)
	}
	return string(outb), nil
}

func RunHostapdCommand(iface string, cmd string) (string, error) {

	outb, err := exec.Command("hostapd_cli", "-p", "/state/wifi/control_"+iface, "-s", "/state/wifi", cmd).Output()
	if err != nil {
		return "", fmt.Errorf("Failed to execute command %s", cmd)
	}
	return string(outb), nil
}

func hostapdStatus(w http.ResponseWriter, r *http.Request) {
	iface := mux.Vars(r)["interface"]
	if !isValidIface(iface) {
		http.Error(w, "Invalid interface", 400)
		return
	}

	status, err := RunHostapdStatus(iface)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

func hostapdAllStations(w http.ResponseWriter, r *http.Request) {
	iface := mux.Vars(r)["interface"]
	if !isValidIface(iface) {
		http.Error(w, "Invalid interface", 400)
		return
	}

	stations, err := RunHostapdAllStations(iface)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stations)
}

func getHostapdJson(iface string) (map[string]interface{}, error) {
	data, err := ioutil.ReadFile(getHostapdConfigPath(iface))
	if err != nil {
		fmt.Println(err)
		return nil, err
	}

	conf := map[string]interface{}{}

	for _, line := range strings.Split(string(data), "\n") {
		if strings.Contains(line, "#spr-gen-bss") {
			//ignore rest of config
			break
		}

		if strings.HasPrefix(line, "#") || !strings.Contains(line, "=") {
			continue
		}

		pieces := strings.Split(line, "=")
		key := pieces[0]
		//value := pieces[1]
		value, err := strconv.ParseUint(pieces[1], 10, 64)
		if err != nil {
			conf[key] = pieces[1]
		} else {
			conf[key] = value
		}
	}

	return conf, nil
}

func hostapdConfig(w http.ResponseWriter, r *http.Request) {
	iface := mux.Vars(r)["interface"]
	if !isValidIface(iface) {
		http.Error(w, "Invalid interface", 400)
		return
	}

	conf, err := getHostapdJson(iface)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(conf)
}

func updateExtraBSS(iface string, data string) string {
	// skip previous generation
	idx := strings.Index(data, "#spr-gen-bss")
	if idx != -1 {
		data = data[:idx]
	}

	Interfacesmtx.Lock()
	defer Interfacesmtx.Unlock()

	//read theinterfaces configuration
	config := loadInterfacesConfigLocked()

	for _, entry := range config {
		if entry.Name == iface && entry.Type == "AP" {

			// populate extra bss info
			for i := 0; i < len(entry.ExtraBSS); i++ {

				bssid := entry.ExtraBSS[i].Bssid
				//main bssid should have LLA to 0, others to 1? bit unclear
				// hostapd said it depends on the driver.
				hexInt, _ := strconv.ParseInt(bssid[:2], 16, 64)
				hexStr := strconv.FormatInt(hexInt&^2, 16)
				main_bssid := fmt.Sprintf("%02s", hexStr) + bssid[2:]

				data += "#spr-gen-bss\n"
				data += "bssid=" + main_bssid + "\n"
				data += "bss=" + iface + "." + strconv.Itoa(i) + "\n"
				data += "bssid=" + entry.ExtraBSS[i].Bssid + "\n"
				data += "ssid=" + entry.ExtraBSS[i].Ssid + "\n"
				if entry.ExtraBSS[i].Wpa == "0" {
					// Open AP
				} else {
					data += "wpa=" + entry.ExtraBSS[i].Wpa + "\n"
					data += "wpa_key_mgmt=" + entry.ExtraBSS[i].WpaKeyMgmt + "\n"
					data += "rsn_pairwise=CCMP\n"
					data += "wpa_psk_file=/configs/wifi/wpa2pskfile\n"
				}

				// default enabled
				if !entry.ExtraBSS[i].DisableIsolation {
					data += "ap_isolate=1\n"
					data += "per_sta_vif=1\n"
				}

			}
		}
	}

	return data
}

func hostapdUpdateConfig(w http.ResponseWriter, r *http.Request) {
	iface := mux.Vars(r)["interface"]
	if !isValidIface(iface) {
		http.Error(w, "Invalid interface", 400)
		return
	}

	conf, err := getHostapdJson(iface)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	body, err := ioutil.ReadAll(r.Body)
	if err != nil {
		log.Printf("Error reading body: %v", err)
		http.Error(w, "can't read body", http.StatusBadRequest)
		return
	}

	newConf := HostapdConfigEntry{}
	r.Body = ioutil.NopCloser(bytes.NewBuffer(body))
	err = json.NewDecoder(r.Body).Decode(&newConf)

	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	newInput := map[string]interface{}{}
	r.Body = ioutil.NopCloser(bytes.NewBuffer(body))
	err = json.NewDecoder(r.Body).Decode(&newInput)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	needRestart := true

	if len(newConf.Ssid) > 0 {
		/* mac80211 state sometimes require a restart when changing ssid name --
		attempting to do a set just creates a secondary name */
		conf["ssid"] = newConf.Ssid
	}

	if newConf.Channel > 0 {
		conf["channel"] = newConf.Channel
	}

	if _, ok := newInput["Vht_oper_centr_freq_seg0_idx"]; ok {
		if newConf.Vht_oper_centr_freq_seg0_idx == -1 {
			delete(conf, "vht_oper_centr_freq_seg0_idx")
		} else {
			conf["vht_oper_centr_freq_seg0_idx"] = newConf.Vht_oper_centr_freq_seg0_idx
		}
	}

	if _, ok := newInput["He_oper_centr_freq_seg0_idx"]; ok {
		if newConf.He_oper_centr_freq_seg0_idx == -1 {
			delete(conf, "he_oper_centr_freq_seg0_idx")
		} else {
			conf["he_oper_centr_freq_seg0_idx"] = newConf.He_oper_centr_freq_seg0_idx
		}
	}

	if _, ok := newInput["Hw_mode"]; ok {
		conf["hw_mode"] = newConf.Hw_mode
	}

	if _, ok := newInput["Vht_oper_chwidth"]; ok {
		conf["vht_oper_chwidth"] = newConf.Vht_oper_chwidth
	}

	if _, ok := newInput["He_oper_chwidth"]; ok {
		conf["he_oper_chwidth"] = newConf.He_oper_chwidth
	}

	if _, ok := newInput["Country_code"]; ok {
		conf["country_code"] = newConf.Country_code
	}

	if _, ok := newInput["Vht_capab"]; ok {
		conf["vht_capab"] = newConf.Vht_capab
	}

	if _, ok := newInput["Ht_capab"]; ok {
		conf["ht_capab"] = newConf.Ht_capab
	}

	if _, ok := newInput["Ieee80211ax"]; ok {
		conf["ieee80211ax"] = newConf.Ieee80211ax
	}

	if _, ok := newInput["He_su_beamformer"]; ok {
		conf["he_su_beamformer"] = newConf.He_su_beamformer
	}

	if _, ok := newInput["He_su_beamformee"]; ok {
		conf["he_su_beamformee"] = newConf.He_su_beamformee
	}

	if _, ok := newInput["He_mu_beamformer"]; ok {
		conf["he_mu_beamformer"] = newConf.He_mu_beamformer
	}

	if _, ok := newInput["Rrm_neighbor_report"]; ok {
		conf["rrm_neighbor_report"] = newConf.Rrm_neighbor_report
	}

	if _, ok := newInput["Rrm_beacon_report"]; ok {
		conf["rrm_beacon_report"] = newConf.Rrm_beacon_report
	}

	if _, ok := newInput["Bss_transition"]; ok {
		conf["bss_transition"] = newConf.Bss_transition
	}

	if _, ok := newInput["Time_advertisement"]; ok {
		conf["time_advertisement"] = newConf.Time_advertisement
	}

	// write new conf
	data := ""
	for key, value := range conf {
		data += fmt.Sprint(key, "=", value, "\n")
	}

	// if anything goes is configured for the interface, enable it.
	data = updateExtraBSS(iface, data)

	err = ioutil.WriteFile(getHostapdConfigPath(iface), []byte(data), 0664)
	if err != nil {
		fmt.Println(err)
		http.Error(w, err.Error(), 400)
		return
	}

	if !needRestart {
		_, err = RunHostapdCommand(iface, "reload")
		if err != nil {
			fmt.Println(err)
			http.Error(w, err.Error(), 400)
			return
		}
	} else {
		callSuperdRestart("", "wifid")
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(conf)
}

func iwCommand(w http.ResponseWriter, r *http.Request) {
	command := mux.Vars(r)["command"]

	/*
	   allowed commands for now:
	   iw/list, iw/dev iw/dev/wlan0-9/scan
	*/
	validCommand := regexp.MustCompile(`^(list|dev)/?([a-z0-9\.]+\/scan)?$`).MatchString
	if !validCommand(command) {
		fmt.Println("invalid iw command")
		http.Error(w, "Invalid command", 400)
		return
	}

	args := strings.Split(command, "/")
	cmd := exec.Command("iw", args...)
	data, err := cmd.Output()
	if err != nil {
		fmt.Println("iw command error:", err)
		http.Error(w, err.Error(), 400)
		return
	}

	// use json parsers if available (iwlist, iwdev, iw-scan)
	if command == "list" || command == "dev" || strings.HasSuffix(command, "scan") {
		parser := "--iw" + command // bug: jc dont allow - when using local parsers
		if strings.HasSuffix(command, "scan") {
			parser = "--iw-scan"
		}

		cmd = exec.Command("jc", parser)

		stdin, err := cmd.StdinPipe()
		if err != nil {
			fmt.Println("iwCommand stdin pipe error:", err)
			http.Error(w, err.Error(), 400)
			return
		}

		go func() {
			defer stdin.Close()
			io.WriteString(stdin, string(data))
		}()

		stdout, err := cmd.Output()
		if err != nil {
			fmt.Println("iwCommand stdout error:", err)
			http.Error(w, err.Error(), 400)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, string(stdout))

		return
	}

	w.Header().Set("Content-Type", "text/plain")
	fmt.Fprintf(w, string(data))
}

var Interfacesmtx sync.Mutex

type ExtraBSS struct {
	Ssid             string
	Bssid            string
	Wpa              string
	WpaKeyMgmt       string
	DisableIsolation bool
}

/*
 Simple upgrade path to using templates
*/
//go:embed hostapd_template.conf
var hostap_template string

func createHostAPTemplate() {
	err := ioutil.WriteFile(getHostapdConfigPath("template"), []byte(hostap_template), 0644)
	if err != nil {
		fmt.Println("Error creating hostap template")
		return
	}
}

// when interfaces.json is updated, the firewall rules need to
// be applied again
func resetRadioFirewall() {
	Interfacesmtx.Lock()
	config := loadInterfacesConfigLocked()
	Interfacesmtx.Unlock()
	applyRadioInterfaces(config)
}

func hostapdEnableInterface(w http.ResponseWriter, r *http.Request) {
	iface := mux.Vars(r)["interface"]
	if !isValidIface(iface) {
		http.Error(w, "Invalid interface", 400)
		return
	}

	//make a call to configure the interface,
	// which ensures that a hostapd configuration is created
	err := configureInterface("AP", "", iface)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	//toggle will also kick off the restart
	err = toggleInterface(iface, true)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	//reset firewall rules to match the configuration
	resetRadioFirewall()
}

/*
curl -u admin:sprlab localhost/hostapd/wlan1/enableExtraBSS -vv -X PUT --data '{"Ssid":"spr-extra", "Bssid": "06:a6:7e:6b:6e:35", "WpaKeyMgmt": "WPA-PSK WPA-PSK-SHA256"}'
*/
func hostapdEnableExtraBSS(w http.ResponseWriter, r *http.Request) {
	iface := mux.Vars(r)["interface"]
	if !isValidIface(iface) {
		http.Error(w, "Invalid interface", 400)
		return
	}

	if r.Method == http.MethodDelete {

		//first reset extra bss
		Interfacesmtx.Lock()
		config := loadInterfacesConfigLocked()
		foundEntry := false
		for i, _ := range config {
			if config[i].Name == iface {
				foundEntry = true
				//disable
				config[i].ExtraBSS = []ExtraBSS{}
				break
			}
		}

		if !foundEntry {
			err := fmt.Errorf("interface not found")
			log.Printf("Failed to update interface: %v", err)
			http.Error(w, "Failed to update interface", http.StatusBadRequest)
			Interfacesmtx.Unlock()
			return
		}

		writeInterfacesConfigLocked(config)
		Interfacesmtx.Unlock()

		//next, update the configuration to remove evertying after spr-gen
		path := getHostapdConfigPath(iface)
		data, err := ioutil.ReadFile(path)
		if err != nil {
			log.Printf("Error reading hostapd conf: %v", err)
			http.Error(w, "can't read hostapd config", http.StatusBadRequest)
		}
		dataString := string(data)
		idx := strings.Index(dataString, "#spr-gen-bss")
		if idx != -1 {
			dataString = dataString[:idx]

			err = ioutil.WriteFile(path, []byte(dataString), 0664)
			if err != nil {
				log.Printf("Error removing extrabss in new hostapd conf: %v", err)
				http.Error(w, "can't write new hostapd config", http.StatusBadRequest)
			}
		}
		return
	}

	body, err := ioutil.ReadAll(r.Body)
	if err != nil {
		log.Printf("Error reading body: %v", err)
		http.Error(w, "can't read body", http.StatusBadRequest)
		return
	}

	extra := ExtraBSS{}
	r.Body = ioutil.NopCloser(bytes.NewBuffer(body))
	err = json.NewDecoder(r.Body).Decode(&extra)

	if err == nil {
		//validate ExtraBSS
		if extra.Wpa != "1" && extra.Wpa != "2" {
			err = fmt.Errorf("Invalid Wpa value")
		} else if extra.Ssid == "" {
			err = fmt.Errorf("ssid needed")
		} else if extra.Bssid == "" {
			err = fmt.Errorf("bssid needed")
		}
	}

	if extra.WpaKeyMgmt == "" {
		extra.WpaKeyMgmt = "WPA-PSK WPA-PSK-SHA256"
	}

	if err != nil {
		log.Printf("Error decoding ExtraBSS: %v", err)
		http.Error(w, "can't decode ExtraBSS", http.StatusBadRequest)
		return
	}

	path := getHostapdConfigPath(iface)
	data, err := ioutil.ReadFile(path)
	if err != nil {
		log.Printf("Error reading hostapd conf: %v", err)
		http.Error(w, "can't read hostapd config", http.StatusBadRequest)
	}

	// if anything goes is configured for the interface, enable it.
	dataString := updateExtraBSS(iface, string(data))

	err = ioutil.WriteFile(path, []byte(dataString), 0664)
	if err != nil {
		log.Printf("Error writing extrabss in new hostapd conf: %v", err)
		http.Error(w, "can't write extrabss in new hostapd config", http.StatusBadRequest)
	}

	Interfacesmtx.Lock()
	config := loadInterfacesConfigLocked()

	foundEntry := false
	for i, _ := range config {
		if config[i].Name == iface {
			foundEntry = true
			// only one extra BSS is supported for now
			config[i].ExtraBSS = []ExtraBSS{extra}
			break
		}
	}

	if !foundEntry {
		err = fmt.Errorf("interface not found")
		log.Printf("Failed to update interface: %v", err)
		http.Error(w, "Failed to update interface", http.StatusBadRequest)
		Interfacesmtx.Unlock()
		return
	}

	writeInterfacesConfigLocked(config)

	Interfacesmtx.Unlock()

	//restart hostap container
	callSuperdRestart("", "wifid")
}

func hostapdDisableInterface(w http.ResponseWriter, r *http.Request) {
	iface := mux.Vars(r)["interface"]
	if !isValidIface(iface) {
		http.Error(w, "Invalid interface", 400)
		return
	}

	//toggle will also kick off the restart
	err := toggleInterface(iface, false)

	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	//apply firewall rules again
	resetRadioFirewall()
}

func getEnabledAPInterfaces(w http.ResponseWriter, r *http.Request) {
	Interfacesmtx.Lock()
	defer Interfacesmtx.Unlock()

	//read the old configuration
	config := loadInterfacesConfigLocked()

	outputString := ""
	for _, entry := range config {
		if entry.Enabled == true && entry.Type == "AP" {
			outputString += entry.Name + " "
		}
	}

	w.Write([]byte(outputString))
}

func hostapdResetInterface(w http.ResponseWriter, r *http.Request) {
	iface := mux.Vars(r)["interface"]
	if !isValidIface(iface) {
		http.Error(w, "Invalid interface", 400)
		return
	}

	//remove the interface configuration and write a fresh one
	path := getHostapdConfigPath(iface)
	_, err := os.Stat(path)
	if err == nil {
		err = os.Rename(path, path+".bak")
		if err != nil {
			http.Error(w, "Failed to rename hostapd.conf", 400)
			return
		}
	}

	//with the file renamed, configureInterface will write a default config
	configureInterface("AP", "", iface)

	//toggle will also kick off the restart
	err = toggleInterface(iface, true)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

}

func isWifiDevice(entry DeviceEntry) bool {
	//if a PSK is set, it is a wifi station
	return entry.PSKEntry.Type != ""
}

func restartWifi(w http.ResponseWriter, r *http.Request) {
	resetRadioFirewall()
	callSuperdRestart("", "wifid")
}

func initRadios() {
	copyInterfacesConfigToPublic()
}
