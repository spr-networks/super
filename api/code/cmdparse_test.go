package main

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"testing"
)

// jsonEqualOrdered compares two JSON documents token by token, so key
// order matters and numbers compare by value (20 == 20.0)
func jsonEqualOrdered(a, b []byte) bool {
	da := json.NewDecoder(bytes.NewReader(a))
	db := json.NewDecoder(bytes.NewReader(b))
	da.UseNumber()
	db.UseNumber()
	for {
		ta, errA := da.Token()
		tb, errB := db.Token()
		if errA == io.EOF && errB == io.EOF {
			return true
		}
		if errA != nil || errB != nil {
			return false
		}
		na, okA := ta.(json.Number)
		nb, okB := tb.(json.Number)
		if okA && okB {
			fa, _ := na.Float64()
			fb, _ := nb.Float64()
			if fa != fb {
				return false
			}
			continue
		}
		if ta != tb {
			return false
		}
	}
}

// testdata/cmdparse/*.json is the output of jc (and api/scripts/iw*.py)
// for the matching .out capture
func TestCmdParsersMatchJc(t *testing.T) {
	parsers := map[string]func(string) ([]byte, error){
		"iw-list": parseIwList,
		"iw-dev":  parseIwDev,
		"iw-reg":  parseIwReg,
		"iw-scan": parseIwScan,
		"uptime":  parseUptime,
		"ss":      parseSS,
	}

	for name, parse := range parsers {
		input, err := os.ReadFile(filepath.Join("testdata", "cmdparse", name+".out"))
		if err != nil {
			t.Fatal(err)
		}
		expected, err := os.ReadFile(filepath.Join("testdata", "cmdparse", name+".json"))
		if err != nil {
			t.Fatal(err)
		}

		out, err := parse(string(input))
		if err != nil {
			t.Errorf("%s: %v", name, err)
			continue
		}
		if !jsonEqualOrdered(out, expected) {
			t.Errorf("%s: output differs from jc\n%s", name, out)
		}
	}
}

func TestCmdParsersEdgeCases(t *testing.T) {
	cases := []struct {
		name  string
		parse func(string) ([]byte, error)
		input string
		want  string
	}{
		{"uptime empty", parseUptime, "", `{}`},
		{"uptime minutes", parseUptime, "10:01:02 up 3 min,  0 users,  load average: 0.10, 0.20, 0.30",
			`{"time":"10:01:02","uptime":"3 min","users":0,"load_1m":0.1,"load_5m":0.2,"load_15m":0.3,"time_hour":10,"time_minute":1,"time_second":2,"uptime_days":0,"uptime_hours":0,"uptime_minutes":3,"uptime_total_seconds":180}`},
		{"ss header only", parseSS, "Netid State Recv-Q Send-Q Local Address:Port Peer Address:Port Process\n", `[]`},
		{"iw dev empty", parseIwDev, "", `{}`},
		{"iw reg empty", parseIwReg, "", `{"country":"","dfs":null,"bands":[]}`},
		{"iw scan empty", parseIwScan, "", `[]`},
		// inf/nan stay strings instead of jc's invalid Infinity/NaN json
		{"iw scan nan ssid", parseIwScan, "BSS 02:00:00:00:00:01(on wlan0)\n\tSSID: nan\n\tfreq: 2412\n",
			`[{"bssid":"02:00:00:00:00:01","interface":"wlan0","ssid":"nan","freq":2412}]`},
	}

	for _, c := range cases {
		out, err := c.parse(c.input)
		if err != nil {
			t.Errorf("%s: %v", c.name, err)
			continue
		}
		if !jsonEqualOrdered(out, []byte(c.want)) {
			t.Errorf("%s: got %s want %s", c.name, out, c.want)
		}
	}

	if _, err := parseIwReg("country US: DFS-FCC\n\t(2402 - 2482 @ 40), (N/A)\n"); err == nil {
		t.Error("iw reg: expected error for a short band line")
	}
}
