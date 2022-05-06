package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
	"regexp"
	"io"
	"github.com/gorilla/mux"
)

var HostapdConf = "/configs/wifi/hostapd.conf"

type HostapdConfigEntry struct {
	Ssid    string
	Channel int
	Vht_oper_centr_freq_seg0_idx int
	He_oper_centr_freq_seg0_idx int
	Vht_oper_chwidth int
	He_oper_chwidth int
}

func RunHostapdAllStations() (map[string]map[string]string, error) {
	m := map[string]map[string]string{}
	out, err := RunHostapdCommand("all_sta")
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

func RunHostapdStatus() (map[string]string, error) {
	m := map[string]string{}

	out, err := RunHostapdCommand("status")
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

type ChannelParameters struct  {
	Mode string
	Channel int
	Bandwidth int
	HT_Enable bool
	VHT_Enable bool
	HE_Enable bool
}

type CalculatedParameters struct {
	Vht_oper_centr_freq_seg0_idx int
	He_oper_centr_freq_seg0_idx int
	Vht_oper_chwidth int
	He_oper_chwidth int
}

func ChanSwitch(mode string, channel int, bw int, ht_enabled bool, vht_enabled bool, he_enabled bool) (CalculatedParameters, error) {
	freq1 := 0
	freq2 := 0
	//freq3 := 0 //for 80+80, not supported right now

	calculated := CalculatedParameters{-1, -1, 0, 0}

	cmd := ""
	base := 5000
	if mode == "b" || mode == "g"  {
		//2.4ghz
		base = 2407
		freq1 = 2407 + channel * 5
		if channel == 14 {
			//channel 14 goes higher
			freq1 += 7
		}
	} else if mode == "a" {
		//5 ghz
		freq1 = base + channel * 5
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
		freq2 = base + center_channel * 5
		if vht_enabled {
			calculated.Vht_oper_centr_freq_seg0_idx = center_channel
		}
		if he_enabled {
			calculated.He_oper_centr_freq_seg0_idx = center_channel
		}
	}


	//chan_switch 1 5180 sec_channel_offset=1 center_freq1=5210 bandwidth=80 vht

	if (bw == 20) {
		cmd = fmt.Sprintf("chan_switch 1 %d bandwidth=20", freq1)
	} else if (bw == 40 || bw == 80 || bw == 160) {
		cmd = fmt.Sprintf("chan_switch 1 %d sec_channel_offset=1 center_freq1=%d bandwidth=%d", freq1, freq2, bw)
	} else if (bw == 8080) {
		//80 + 80 unsupported for now
		// center_freq1, center_freq2
		return CalculatedParameters{}, fmt.Errorf("80+80 not supported")
	}

	if ht_enabled {
		cmd += " ht"
	}

	if vht_enabled {
		cmd += " vht"
	}

	fmt.Println(cmd)

	result, err := RunHostapdCommandArray(strings.Split(cmd, " "))

	if !strings.Contains(result, "OK") && err == nil {
		err = fmt.Errorf("Failed to run chan_switch", result)
	}

	return calculated, err
}

func hostapdChannelSwitch(w http.ResponseWriter, r *http.Request) {

	channelParams := ChannelParameters{}
	err := json.NewDecoder(r.Body).Decode(&channelParams)

	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	calculated, err := ChanSwitch(channelParams.Mode, channelParams.Channel, channelParams.Bandwidth, channelParams.HT_Enable, channelParams.VHT_Enable, channelParams.HE_Enable)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(calculated)

}


func RunHostapdCommandArray(cmd []string) (string, error) {

	args := append([]string{"-p", "/state/wifi/control", "-s", "/state/wifi"}, cmd...)

	outb, err := exec.Command("hostapd_cli", args...).Output()
	if err != nil {
		return "", fmt.Errorf("Failed to execute command %s", cmd)
	}
	return string(outb), nil
}

func RunHostapdCommand(cmd string) (string, error) {

	outb, err := exec.Command("hostapd_cli", "-p", "/state/wifi/control", "-s", "/state/wifi", cmd).Output()
	if err != nil {
		return "", fmt.Errorf("Failed to execute command %s", cmd)
	}
	return string(outb), nil
}

func hostapdStatus(w http.ResponseWriter, r *http.Request) {
	status, err := RunHostapdStatus()
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

func hostapdAllStations(w http.ResponseWriter, r *http.Request) {
	stations, err := RunHostapdAllStations()
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stations)
}

func getHostapdJson() (map[string]interface{}, error) {
	data, err := ioutil.ReadFile(HostapdConf)
	if err != nil {
		fmt.Println(err)
		return nil, err
	}

	conf := map[string]interface{}{}
	for _, line := range strings.Split(string(data), "\n") {
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
	conf, err := getHostapdJson()
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(conf)
}

func hostapdUpdateConfig(w http.ResponseWriter, r *http.Request) {
	conf, err := getHostapdJson()
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	newConf := HostapdConfigEntry{}
	err = json.NewDecoder(r.Body).Decode(&newConf)

	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if len(newConf.Ssid) > 0 {
		conf["ssid"] = newConf.Ssid
	}

	if newConf.Channel > 0 {
		conf["channel"] = newConf.Channel
	}

	if newConf.Vht_oper_centr_freq_seg0_idx > 0 {
		conf["vht_oper_centr_freq_seg0_idx"] = newConf.Vht_oper_centr_freq_seg0_idx
	}

	if newConf.He_oper_centr_freq_seg0_idx > 0 {
		conf["he_oper_centr_freq_seg0_idx"] = newConf.He_oper_centr_freq_seg0_idx
	}

	if newConf.Vht_oper_chwidth >= 0 {
		conf["vht_oper_chwidth"] = newConf.Vht_oper_chwidth
	}

	if newConf.He_oper_chwidth >= 0 {
		conf["he_oper_chwidth"] = newConf.He_oper_chwidth
	}

	// write new conf
	data := ""
	for key, value := range conf {
		data += fmt.Sprint(key, "=", value, "\n")
	}

	err = ioutil.WriteFile(HostapdConf, []byte(data), 0664)
	if err != nil {
		log.Fatal(err)
		http.Error(w, err.Error(), 400)
		return
	}

	_, err = RunHostapdCommand("reload")
	if err != nil {
		log.Fatal(err)
		http.Error(w, err.Error(), 400)
		return
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

	// use json parsers if available (iw_list, iw_dev, iw-scan)
	if command == "list" || command == "dev" || strings.HasSuffix(command, "scan") {
		parser := "--iw_" + command // bug: jc dont allow - when using local parsers
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
