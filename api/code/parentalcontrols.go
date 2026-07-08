package main

import (
	"encoding/json"
	"io/ioutil"
	"net/http"
	"os/exec"
	"slices"
	"strings"
	"sync"
	"time"
)

var ParentalMtx sync.RWMutex
var TimeLimitsFile = TEST_PREFIX + "/configs/base/timelimits.json"
var TimeUsageFile = TEST_PREFIX + "/state/api/timeusage.json"

const PersonaTagPrefix = "persona:"

const usageResetHour = 6

type TimeWindow struct {
	Days  [7]int
	Start string
	End   string
}

type Persona struct {
	Name              string
	Tag               string
	DailyLimitMinutes int
	Schedules         []TimeWindow
	Disabled          bool
	PauseUntil        int64
	GrantUntil        int64
}

type UsageState struct {
	Date        string
	UsedMinutes map[string]int
}

var gParentalConfig = []Persona{}
var gUsageState = UsageState{UsedMinutes: map[string]int{}}
var gPersonaBlocked = map[string]bool{}
var gBlockedIPs = map[string]bool{}
var gLastWanBytes = map[string]uint64{}
var gDeviceBlocked = map[string]bool{}

func loadParentalConfig() {
	data, err := ioutil.ReadFile(TimeLimitsFile)
	if err != nil {
		return
	}
	cfg := []Persona{}
	if json.Unmarshal(data, &cfg) == nil {
		gParentalConfig = cfg
	}
}

func saveParentalConfig() {
	file, _ := json.MarshalIndent(gParentalConfig, "", " ")
	if err := ioutil.WriteFile(TimeLimitsFile, file, 0600); err != nil {
		log.Println("failed to save timelimits.json", err)
	}
}

func loadUsageState() {
	data, err := ioutil.ReadFile(TimeUsageFile)
	if err != nil {
		return
	}
	st := UsageState{}
	if json.Unmarshal(data, &st) == nil {
		if st.UsedMinutes == nil {
			st.UsedMinutes = map[string]int{}
		}
		gUsageState = st
	}
}

func saveUsageState() {
	file, _ := json.MarshalIndent(gUsageState, "", " ")
	if err := ioutil.WriteFile(TimeUsageFile, file, 0600); err != nil {
		log.Println("failed to save timeusage.json", err)
	}
}

func deviceHasTag(dev DeviceEntry, tag string) bool {
	return slices.Contains(dev.DeviceTags, tag)
}

func deviceHasAnyPersona(dev DeviceEntry) bool {
	for _, t := range dev.DeviceTags {
		if strings.HasPrefix(t, PersonaTagPrefix) {
			return true
		}
	}
	return false
}

func parseHHMM(s string) int {
	t, err := time.Parse("15:04", s)
	if err != nil {
		return -1
	}
	return t.Hour()*60 + t.Minute()
}

func inScheduleWindow(w TimeWindow, now time.Time) bool {
	start := parseHHMM(w.Start)
	end := parseHHMM(w.End)
	if start < 0 || end < 0 {
		return false
	}
	cur := now.Hour()*60 + now.Minute()
	wd := int(now.Weekday())

	if start <= end {
		return w.Days[wd] == 1 && cur >= start && cur < end
	}
	if w.Days[wd] == 1 && cur >= start {
		return true
	}
	prev := (wd + 6) % 7
	return w.Days[prev] == 1 && cur < end
}

func personaBlockedNow(p Persona, now time.Time, used int) bool {
	if p.Disabled {
		return false
	}
	if p.GrantUntil > now.Unix() {
		return false
	}
	if p.PauseUntil > now.Unix() {
		return true
	}
	if p.DailyLimitMinutes > 0 && used >= p.DailyLimitMinutes {
		return true
	}
	for _, w := range p.Schedules {
		if inScheduleWindow(w, now) {
			return true
		}
	}
	return false
}

func personaInternetBlocked(ip string) bool {
	if ip == "" {
		return false
	}
	ParentalMtx.RLock()
	defer ParentalMtx.RUnlock()
	return gBlockedIPs[ip]
}

func deviceIfaceForVerdict(dev DeviceEntry) string {
	if dev.DHCPLastInterface != "" {
		return dev.DHCPLastInterface
	}
	for _, entry := range getNFTVerdictMap("dhcp_access") {
		if equalMAC(entry.mac, dev.MAC) {
			return entry.ifname
		}
	}
	return getRouteInterface(dev.RecentIP)
}

func enforceDeviceInternet(dev DeviceEntry, blocked bool) {
	if dev.RecentIP == "" {
		return
	}
	iface := deviceIfaceForVerdict(dev)
	if iface == "" {
		return
	}
	if blocked {
		DeleteElementFromMapComplex("inet", "filter", "internet_access", []string{dev.RecentIP, iface})
		return
	}
	if slices.Contains(dev.Policies, "wan") {
		addInternetVerdict(dev.RecentIP, iface)
	}
}

func sampleActiveIPs() map[string]bool {
	cur := map[string]uint64{}
	for _, e := range getDeviceTrafficSet("outgoing_traffic_wan") {
		cur[e.IP] += e.Bytes
	}
	for _, e := range getDeviceTrafficSet("incoming_traffic_wan") {
		cur[e.IP] += e.Bytes
	}
	active := map[string]bool{}
	for ip, bytes := range cur {
		if last, ok := gLastWanBytes[ip]; ok && bytes > last {
			active[ip] = true
		}
	}
	gLastWanBytes = cur
	return active
}

func usageDayKey(now time.Time) string {
	day := now
	if now.Hour() < usageResetHour {
		day = now.AddDate(0, 0, -1)
	}
	return day.Format("2006-01-02")
}

func parentalTick() {
	now := time.Now()
	dayKey := usageDayKey(now)

	activeIPs := sampleActiveIPs()
	devices := getDevicesJson()

	newlyLimited := []Persona{}
	blockedByTag := map[string]bool{}

	ParentalMtx.Lock()
	loadParentalConfig()

	if gUsageState.Date != dayKey {
		gUsageState.Date = dayKey
		gUsageState.UsedMinutes = map[string]int{}
	}

	for _, p := range gParentalConfig {
		if p.Disabled || p.DailyLimitMinutes <= 0 {
			continue
		}
		for _, dev := range devices {
			if deviceHasTag(dev, p.Tag) && activeIPs[dev.RecentIP] {
				gUsageState.UsedMinutes[p.Tag]++
				break
			}
		}
	}

	nextBlocked := map[string]bool{}
	for _, p := range gParentalConfig {
		used := gUsageState.UsedMinutes[p.Tag]
		blocked := personaBlockedNow(p, now, used)
		nextBlocked[p.Tag] = blocked
		blockedByTag[p.Tag] = blocked

		overLimit := p.DailyLimitMinutes > 0 && used >= p.DailyLimitMinutes
		if blocked && overLimit && !gPersonaBlocked[p.Tag] {
			newlyLimited = append(newlyLimited, p)
		}
	}
	gPersonaBlocked = nextBlocked

	newBlockedIPs := map[string]bool{}
	for _, dev := range devices {
		if dev.RecentIP == "" {
			continue
		}
		for _, t := range dev.DeviceTags {
			if nextBlocked[t] {
				newBlockedIPs[dev.RecentIP] = true
				break
			}
		}
	}
	gBlockedIPs = newBlockedIPs

	saveUsageState()
	ParentalMtx.Unlock()

	for _, dev := range devices {
		if !deviceHasAnyPersona(dev) {
			continue
		}
		blocked := false
		for _, t := range dev.DeviceTags {
			if blockedByTag[t] {
				blocked = true
				break
			}
		}
		enforceDeviceInternet(dev, blocked)

		if blocked && !gDeviceBlocked[dev.MAC] && dev.RecentIP != "" {
			exec.Command("conntrack", "-D", "-src="+dev.RecentIP).Run()
		}
		gDeviceBlocked[dev.MAC] = blocked
	}

	for _, p := range newlyLimited {
		SprbusPublish("timelimit:reached", map[string]interface{}{
			"Persona":     p.Name,
			"Tag":         p.Tag,
			"UsedMinutes": p.DailyLimitMinutes,
			"Limit":       p.DailyLimitMinutes,
		})
	}
}

func parentalControlLoop() {
	ParentalMtx.Lock()
	loadParentalConfig()
	loadUsageState()
	ParentalMtx.Unlock()

	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		for {
			select {
			case <-ticker.C:
				parentalTick()
			}
		}
	}()
}

func getParentalPersonas(w http.ResponseWriter, r *http.Request) {
	ParentalMtx.Lock()
	defer ParentalMtx.Unlock()
	loadParentalConfig()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gParentalConfig)
}

func modifyParentalPersonas(w http.ResponseWriter, r *http.Request) {
	ParentalMtx.Lock()
	defer ParentalMtx.Unlock()
	loadParentalConfig()

	persona := Persona{}
	if err := json.NewDecoder(r.Body).Decode(&persona); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	if persona.Name == "" {
		http.Error(w, "persona Name required", 400)
		return
	}
	if persona.Tag == "" {
		persona.Tag = PersonaTagPrefix + persona.Name
	}
	if !strings.HasPrefix(persona.Tag, PersonaTagPrefix) {
		http.Error(w, "persona Tag must start with "+PersonaTagPrefix, 400)
		return
	}
	if persona.DailyLimitMinutes < 0 {
		http.Error(w, "DailyLimitMinutes must be >= 0", 400)
		return
	}
	for _, s := range persona.Schedules {
		if parseHHMM(s.Start) < 0 || parseHHMM(s.End) < 0 {
			http.Error(w, "schedule Start/End must be HH:MM", 400)
			return
		}
	}

	idx := -1
	for i, p := range gParentalConfig {
		if p.Name == persona.Name {
			idx = i
			break
		}
	}

	if r.Method == http.MethodDelete {
		if idx >= 0 {
			gParentalConfig = append(gParentalConfig[:idx], gParentalConfig[idx+1:]...)
		}
	} else if idx >= 0 {
		gParentalConfig[idx] = persona
	} else {
		gParentalConfig = append(gParentalConfig, persona)
	}

	saveParentalConfig()
	SprbusPublish("timelimits:save", gParentalConfig)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gParentalConfig)
}

func getParentalUsage(w http.ResponseWriter, r *http.Request) {
	now := time.Now()

	ParentalMtx.RLock()
	defer ParentalMtx.RUnlock()

	type UsageInfo struct {
		Used       int
		Limit      int
		Blocked    bool
		PauseUntil int64
		GrantUntil int64
	}
	out := map[string]UsageInfo{}
	for _, p := range gParentalConfig {
		used := gUsageState.UsedMinutes[p.Tag]
		out[p.Tag] = UsageInfo{
			Used:       used,
			Limit:      p.DailyLimitMinutes,
			Blocked:    personaBlockedNow(p, now, used),
			PauseUntil: p.PauseUntil,
			GrantUntil: p.GrantUntil,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

func setParentalPause(w http.ResponseWriter, r *http.Request) {
	req := struct {
		Tag     string
		Minutes int
	}{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	ParentalMtx.Lock()
	defer ParentalMtx.Unlock()
	loadParentalConfig()

	found := false
	for i, p := range gParentalConfig {
		if p.Tag == req.Tag || p.Name == req.Tag {
			if req.Minutes <= 0 {
				gParentalConfig[i].PauseUntil = 0
			} else {
				gParentalConfig[i].PauseUntil = time.Now().Add(time.Duration(req.Minutes) * time.Minute).Unix()
			}
			found = true
			break
		}
	}
	if !found {
		http.Error(w, "persona not found", 404)
		return
	}

	saveParentalConfig()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gParentalConfig)
}

func setParentalExtend(w http.ResponseWriter, r *http.Request) {
	req := struct {
		Tag     string
		Minutes int
	}{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	ParentalMtx.Lock()
	defer ParentalMtx.Unlock()
	loadParentalConfig()

	found := false
	for i, p := range gParentalConfig {
		if p.Tag == req.Tag || p.Name == req.Tag {
			if req.Minutes <= 0 {
				gParentalConfig[i].GrantUntil = 0
			} else {
				gParentalConfig[i].GrantUntil = time.Now().Add(time.Duration(req.Minutes) * time.Minute).Unix()
			}
			gParentalConfig[i].PauseUntil = 0
			found = true
			break
		}
	}
	if !found {
		http.Error(w, "persona not found", 404)
		return
	}

	saveParentalConfig()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gParentalConfig)
}
