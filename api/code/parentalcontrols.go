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
var PersonasConfigFile = TEST_PREFIX + "/configs/base/personas.json"
var PersonasStateFile = TEST_PREFIX + "/state/api/personas.json"

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
	Description       string
	DailyLimitMinutes int
	Schedules         []TimeWindow
	Disabled          bool
}

type PersonasState struct {
	Date        string
	UsedMinutes map[string]int
	PauseUntil  map[string]int64
	GrantUntil  map[string]int64
}

var gParentalConfig = []Persona{}
var gPersonasState = PersonasState{
	UsedMinutes: map[string]int{},
	PauseUntil:  map[string]int64{},
	GrantUntil:  map[string]int64{},
}
var gPersonaBlocked = map[string]bool{}
var gBlockedIPs = map[string]bool{}
var gLastWanBytes = map[string]uint64{}
var gDeviceBlocked = map[string]bool{}

func loadParentalConfig() {
	data, err := ioutil.ReadFile(PersonasConfigFile)
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
	if err := ioutil.WriteFile(PersonasConfigFile, file, 0600); err != nil {
		log.Println("failed to save personas.json", err)
	}
}

func ensureStateMaps() {
	if gPersonasState.UsedMinutes == nil {
		gPersonasState.UsedMinutes = map[string]int{}
	}
	if gPersonasState.PauseUntil == nil {
		gPersonasState.PauseUntil = map[string]int64{}
	}
	if gPersonasState.GrantUntil == nil {
		gPersonasState.GrantUntil = map[string]int64{}
	}
}

func loadPersonasState() {
	data, err := ioutil.ReadFile(PersonasStateFile)
	if err != nil {
		return
	}
	st := PersonasState{}
	if json.Unmarshal(data, &st) == nil {
		gPersonasState = st
	}
	ensureStateMaps()
}

func savePersonasState() {
	file, _ := json.MarshalIndent(gPersonasState, "", " ")
	if err := ioutil.WriteFile(PersonasStateFile, file, 0600); err != nil {
		log.Println("failed to save personas state", err)
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

func personaBlockedNow(p Persona, now time.Time, used int, pauseUntil, grantUntil int64) bool {
	if p.Disabled {
		return false
	}
	if grantUntil > now.Unix() {
		return false
	}
	if pauseUntil > now.Unix() {
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

	if gPersonasState.Date != dayKey {
		gPersonasState.Date = dayKey
		gPersonasState.UsedMinutes = map[string]int{}
		for tag, until := range gPersonasState.PauseUntil {
			if until <= now.Unix() {
				delete(gPersonasState.PauseUntil, tag)
			}
		}
		for tag, until := range gPersonasState.GrantUntil {
			if until <= now.Unix() {
				delete(gPersonasState.GrantUntil, tag)
			}
		}
	}

	for _, p := range gParentalConfig {
		if p.Disabled || p.DailyLimitMinutes <= 0 {
			continue
		}
		for _, dev := range devices {
			if deviceHasTag(dev, p.Tag) && activeIPs[dev.RecentIP] {
				gPersonasState.UsedMinutes[p.Tag]++
				break
			}
		}
	}

	nextBlocked := map[string]bool{}
	for _, p := range gParentalConfig {
		used := gPersonasState.UsedMinutes[p.Tag]
		blocked := personaBlockedNow(p, now, used,
			gPersonasState.PauseUntil[p.Tag], gPersonasState.GrantUntil[p.Tag])
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

	savePersonasState()
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
	loadPersonasState()
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
			tag := gParentalConfig[idx].Tag
			gParentalConfig = append(gParentalConfig[:idx], gParentalConfig[idx+1:]...)
			delete(gPersonasState.UsedMinutes, tag)
			delete(gPersonasState.PauseUntil, tag)
			delete(gPersonasState.GrantUntil, tag)
			savePersonasState()
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
		used := gPersonasState.UsedMinutes[p.Tag]
		pause := gPersonasState.PauseUntil[p.Tag]
		grant := gPersonasState.GrantUntil[p.Tag]
		out[p.Tag] = UsageInfo{
			Used:       used,
			Limit:      p.DailyLimitMinutes,
			Blocked:    personaBlockedNow(p, now, used, pause, grant),
			PauseUntil: pause,
			GrantUntil: grant,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

func resolvePersonaTag(nameOrTag string) string {
	for _, p := range gParentalConfig {
		if p.Tag == nameOrTag || p.Name == nameOrTag {
			return p.Tag
		}
	}
	return ""
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

	tag := resolvePersonaTag(req.Tag)
	if tag == "" {
		http.Error(w, "persona not found", 404)
		return
	}

	ensureStateMaps()
	if req.Minutes <= 0 {
		delete(gPersonasState.PauseUntil, tag)
	} else {
		gPersonasState.PauseUntil[tag] = time.Now().Add(time.Duration(req.Minutes) * time.Minute).Unix()
	}
	savePersonasState()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gPersonasState)
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

	tag := resolvePersonaTag(req.Tag)
	if tag == "" {
		http.Error(w, "persona not found", 404)
		return
	}

	ensureStateMaps()
	if req.Minutes <= 0 {
		delete(gPersonasState.GrantUntil, tag)
	} else {
		gPersonasState.GrantUntil[tag] = time.Now().Add(time.Duration(req.Minutes) * time.Minute).Unix()
	}
	delete(gPersonasState.PauseUntil, tag)
	savePersonasState()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gPersonasState)
}
