package main

import (
	"testing"
	"time"
)

func at(t *testing.T, s string) time.Time {
	t.Helper()
	tm, err := time.ParseInLocation("2006-01-02 15:04", s, time.Local)
	if err != nil {
		t.Fatal(err)
	}
	return tm
}

// allDays returns a window active every day for the given HH:MM range.
func allDays(start, end string) TimeWindow {
	return TimeWindow{Days: [7]int{1, 1, 1, 1, 1, 1, 1}, Start: start, End: end}
}

func TestInScheduleWindowSameDay(t *testing.T) {
	w := allDays("00:00", "06:00") // "no internet midnight until 6am"
	cases := []struct {
		when string
		want bool
	}{
		{"2026-07-08 03:00", true},
		{"2026-07-08 05:59", true},
		{"2026-07-08 06:00", false}, // end is exclusive
		{"2026-07-08 07:00", false},
		{"2026-07-08 23:59", false},
	}
	for _, c := range cases {
		if got := inScheduleWindow(w, at(t, c.when)); got != c.want {
			t.Errorf("inScheduleWindow(%s) = %v, want %v", c.when, got, c.want)
		}
	}
}

func TestInScheduleWindowOvernight(t *testing.T) {
	w := allDays("22:00", "06:00") // spans midnight
	cases := []struct {
		when string
		want bool
	}{
		{"2026-07-08 23:00", true}, // late same day
		{"2026-07-08 05:00", true}, // early, belongs to prev day's window
		{"2026-07-08 22:00", true}, // inclusive start
		{"2026-07-08 21:59", false},
		{"2026-07-08 06:00", false},
		{"2026-07-08 12:00", false},
	}
	for _, c := range cases {
		if got := inScheduleWindow(w, at(t, c.when)); got != c.want {
			t.Errorf("inScheduleWindow(%s) = %v, want %v", c.when, got, c.want)
		}
	}
}

func TestInScheduleWindowDayBitmask(t *testing.T) {
	when := at(t, "2026-07-08 10:00")
	wd := int(when.Weekday())

	onToday := TimeWindow{Start: "09:00", End: "17:00"}
	onToday.Days[wd] = 1
	if !inScheduleWindow(onToday, when) {
		t.Errorf("window active today (%d) should match 10:00", wd)
	}

	onOtherDay := TimeWindow{Start: "09:00", End: "17:00"}
	onOtherDay.Days[(wd+1)%7] = 1
	if inScheduleWindow(onOtherDay, when) {
		t.Errorf("window active only on another day should not match")
	}
}

func TestPersonaBlockedNow(t *testing.T) {
	now := at(t, "2026-07-08 12:00")

	// over the daily limit -> blocked
	p := Persona{Tag: "persona:kids", DailyLimitMinutes: 120}
	if !personaBlockedNow(p, now, 120) {
		t.Error("used == limit should block")
	}
	if !personaBlockedNow(p, now, 200) {
		t.Error("used > limit should block")
	}
	if personaBlockedNow(p, now, 119) {
		t.Error("under limit should not block")
	}

	// no limit configured -> never blocked by usage
	if personaBlockedNow(Persona{Tag: "persona:x"}, now, 9999) {
		t.Error("DailyLimitMinutes==0 should never block on usage")
	}

	// disabled persona is never blocked, even over limit / in a window
	pd := Persona{Tag: "persona:y", DailyLimitMinutes: 1, Disabled: true,
		Schedules: []TimeWindow{allDays("00:00", "23:59")}}
	if personaBlockedNow(pd, now, 999) {
		t.Error("disabled persona should never block")
	}

	// manual pause in the future -> blocked; in the past -> not
	pp := Persona{Tag: "persona:z", PauseUntil: now.Add(time.Hour).Unix()}
	if !personaBlockedNow(pp, now, 0) {
		t.Error("PauseUntil in the future should block")
	}
	pp.PauseUntil = now.Add(-time.Hour).Unix()
	if personaBlockedNow(pp, now, 0) {
		t.Error("PauseUntil in the past should not block")
	}

	// schedule window blocks regardless of usage
	ps := Persona{Tag: "persona:s", Schedules: []TimeWindow{allDays("11:00", "13:00")}}
	if !personaBlockedNow(ps, now, 0) {
		t.Error("time inside a block window should block")
	}

	// a temporary extension (GrantUntil in the future) overrides BOTH an
	// exhausted limit and an active block schedule
	pe := Persona{Tag: "persona:e", DailyLimitMinutes: 60,
		Schedules:  []TimeWindow{allDays("11:00", "13:00")},
		GrantUntil: now.Add(30 * time.Minute).Unix()}
	if personaBlockedNow(pe, now, 999) {
		t.Error("GrantUntil in the future should unblock despite limit + schedule")
	}
	pe.GrantUntil = now.Add(-time.Minute).Unix()
	if !personaBlockedNow(pe, now, 999) {
		t.Error("expired GrantUntil should fall back to blocked")
	}
}

func TestUsageDayKey6amReset(t *testing.T) {
	// the usage day runs 6am -> 6am, so quota resets at 6am (not midnight)
	cases := []struct {
		when string
		want string
	}{
		{"2026-07-08 06:00", "2026-07-08"}, // reset boundary: new day begins
		{"2026-07-08 12:00", "2026-07-08"},
		{"2026-07-08 23:59", "2026-07-08"},
		{"2026-07-09 00:30", "2026-07-08"}, // after midnight still the prior day
		{"2026-07-09 05:59", "2026-07-08"}, // right up to 6am: no reset yet
		{"2026-07-09 06:00", "2026-07-09"}, // 6am flips the day -> reset
	}
	for _, c := range cases {
		if got := usageDayKey(at(t, c.when)); got != c.want {
			t.Errorf("usageDayKey(%s) = %s, want %s", c.when, got, c.want)
		}
	}
}

func TestParseHHMM(t *testing.T) {
	cases := map[string]int{"00:00": 0, "06:00": 360, "23:59": 1439, "09:30": 570}
	for s, want := range cases {
		if got := parseHHMM(s); got != want {
			t.Errorf("parseHHMM(%q) = %d, want %d", s, got, want)
		}
	}
	// time.Parse("15:04", ...) is lenient on single-digit hours ("6:00" == 360),
	// so only genuinely malformed values return -1
	for _, bad := range []string{"", "24:00", "12:60", "abc"} {
		if parseHHMM(bad) != -1 {
			t.Errorf("parseHHMM(%q) should be -1", bad)
		}
	}
}
