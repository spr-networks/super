package main

// Native parsers for the command output the API used to pipe through jc
// (iw list/dev/reg/scan, uptime, ss). They reproduce jc's JSON, including
// key order and its quirks, since the UI consumes these shapes directly.
//
// jc parsers ported: api/scripts/iwlist.py, iwdev.py, iwreg.py (SPR local
// parsers) and jc's iw_scan (1.25.1, as shipped in the docker image; 1.25.6
// prefixes every later key of the scan with the last section header),
// uptime and ss (1.25.6, which fixes "1 user" and Recv-Q column parsing).

import (
	"bytes"
	"encoding/json"
	"errors"
	"math"
	"math/big"
	"strconv"
	"strings"
	"unicode"
)

// jcObj is a JSON object that keeps insertion order like a Python dict
type jcObj struct {
	keys []string
	vals map[string]any
}

func newJcObj() *jcObj {
	return &jcObj{vals: map[string]any{}}
}

func (o *jcObj) set(k string, v any) {
	if _, ok := o.vals[k]; !ok {
		o.keys = append(o.keys, k)
	}
	o.vals[k] = v
}

func (o *jcObj) get(k string) (any, bool) {
	v, ok := o.vals[k]
	return v, ok
}

func (o *jcObj) str(k string) string {
	s, _ := o.vals[k].(string)
	return s
}

func (o *jcObj) del(k string) {
	if _, ok := o.vals[k]; !ok {
		return
	}
	delete(o.vals, k)
	for i, key := range o.keys {
		if key == k {
			o.keys = append(o.keys[:i], o.keys[i+1:]...)
			break
		}
	}
}

func (o *jcObj) pop(k string) string {
	s := o.str(k)
	o.del(k)
	return s
}

func (o *jcObj) MarshalJSON() ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteByte('{')
	for i, k := range o.keys {
		if i > 0 {
			buf.WriteByte(',')
		}
		kb, err := json.Marshal(k)
		if err != nil {
			return nil, err
		}
		buf.Write(kb)
		buf.WriteByte(':')
		vb, err := json.Marshal(o.vals[k])
		if err != nil {
			return nil, err
		}
		buf.Write(vb)
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}

var errCmdParse = errors.New("failed to parse command output")

// Python str helpers, so splitting and stripping match the jc parsers

func pyIsSpace(r rune) bool {
	return unicode.IsSpace(r) || (r >= 0x1c && r <= 0x1f)
}

func pyStrip(s string) string {
	return strings.TrimFunc(s, pyIsSpace)
}

func pyFields(s string) []string {
	return strings.FieldsFunc(s, pyIsSpace)
}

// str.splitlines(), dropping empty lines like filter(None, ...) when skipEmpty
func pySplitlines(s string, skipEmpty bool) []string {
	lines := []string{}
	start := 0
	runes := []rune(s)
	for i := 0; i < len(runes); i++ {
		switch runes[i] {
		case '\n', '\r', '\v', '\f', 0x1c, 0x1d, 0x1e, 0x85, 0x2028, 0x2029:
			lines = append(lines, string(runes[start:i]))
			if runes[i] == '\r' && i+1 < len(runes) && runes[i+1] == '\n' {
				i++
			}
			start = i + 1
		}
	}
	if start < len(runes) {
		lines = append(lines, string(runes[start:]))
	}
	if !skipEmpty {
		return lines
	}
	out := lines[:0]
	for _, l := range lines {
		if l != "" {
			out = append(out, l)
		}
	}
	return out
}

func pyHasData(s string) bool {
	return pyStrip(s) != ""
}

// re.match(r"^\s+.+", line): leading whitespace and at least two characters
func pyIndented(line string) bool {
	r := []rune(line)
	return len(r) >= 2 && pyIsSpace(r[0])
}

// re.match(r"^\s{4,}", line)
func pyIndented4(line string) bool {
	r := []rune(line)
	if len(r) < 4 {
		return false
	}
	for _, c := range r[:4] {
		if !pyIsSpace(c) {
			return false
		}
	}
	return true
}

func isDigits(s string) bool {
	if s == "" {
		return false
	}
	for i, r := range s {
		if r == '_' {
			// python allows single underscores between digits
			if i == 0 || i == len(s)-1 || s[i-1] == '_' {
				return false
			}
			continue
		}
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// int(s) for a string, as a JSON number
func pyInt(s string) (json.Number, bool) {
	s = pyStrip(s)
	digits := strings.TrimLeft(s, "+-")
	if len(s)-len(digits) > 1 || !isDigits(digits) {
		return "", false
	}
	n, ok := new(big.Int).SetString(strings.ReplaceAll(s, "_", ""), 10)
	if !ok {
		return "", false
	}
	return json.Number(n.String()), true
}

// float(s) for a string. inf and nan stay strings: jc would emit
// Infinity/NaN, which is not valid JSON
func pyFloat(s string) (float64, bool) {
	s = pyStrip(s)
	body := strings.TrimLeft(s, "+-")
	if len(s)-len(body) > 1 || body == "" {
		return 0, false
	}
	mant, exp, hasExp := strings.Cut(strings.ToLower(body), "e")
	if hasExp {
		exp = strings.TrimLeft(exp, "+-")
		if len(body)-len(mant)-1-len(exp) > 1 || !isDigits(exp) {
			return 0, false
		}
	}
	ip, fp, hasDot := strings.Cut(mant, ".")
	if (ip == "" && fp == "") || (ip != "" && !isDigits(ip)) || (fp != "" && !isDigits(fp)) {
		return 0, false
	}
	if !hasDot && ip == "" {
		return 0, false
	}
	f, err := strconv.ParseFloat(strings.ReplaceAll(s, "_", ""), 64)
	if err != nil && !errors.Is(err, strconv.ErrRange) {
		return 0, false
	}
	if math.IsInf(f, 0) || math.IsNaN(f) {
		return 0, false
	}
	return f, true
}

// int() then float() conversion used by the iw parsers' _process
func pyNumber(v any) (any, bool) {
	s, ok := v.(string)
	if !ok {
		return v, false
	}
	if n, ok := pyInt(s); ok {
		return n, true
	}
	if f, ok := pyFloat(s); ok {
		return f, true
	}
	return v, false
}

func stripNonNumeric(s string) string {
	return strings.Map(func(r rune) rune {
		if (r >= '0' && r <= '9') || r == '-' || r == '.' {
			return r
		}
		return -1
	}, s)
}

// jc.utils.convert_to_int, nil when it would return None
func jcConvertToInt(s string) any {
	s = stripNonNumeric(s)
	if n, ok := pyInt(s); ok {
		return n
	}
	if f, ok := pyFloat(s); ok {
		f = math.Trunc(f)
		if f == 0 {
			return json.Number("0")
		}
		return json.Number(strconv.FormatFloat(f, 'f', 0, 64))
	}
	return nil
}

// jc.utils.convert_to_float
func jcConvertToFloat(s string) any {
	if f, ok := pyFloat(stripNonNumeric(s)); ok {
		return f
	}
	return nil
}

func jcIntValue(v any) (int64, bool) {
	n, ok := v.(json.Number)
	if !ok {
		return 0, false
	}
	i, err := n.Int64()
	return i, err == nil
}

func marshalJc(v any) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}

// iw dev (api/scripts/iwdev.py)
func parseIwDev(data string) ([]byte, error) {
	raw := newJcObj()
	section := newJcObj()
	phy := "null"
	kvSection := ""
	var kvKeys []string
	iface := ""

	nicekey := func(s string) string {
		s = strings.ToLower(s)
		s = strings.ReplaceAll(s, " ", "_")
		s = strings.ReplaceAll(s, "-", "_")
		return strings.ReplaceAll(s, "#", "")
	}

	for _, line := range pySplitlines(data, true) {
		stripped := pyStrip(line)
		if strings.HasPrefix(line, "phy#") {
			if len(section.keys) > 0 {
				raw.set(phy, section)
				section = newJcObj()
			}
			phy = nicekey(line)
			continue
		}

		if strings.HasPrefix(stripped, "Interface") {
			parts := strings.Split(stripped, " ")
			if len(parts) < 2 {
				return nil, errCmdParse
			}
			iface = parts[1]
			section.set(iface, newJcObj())
			continue
		}

		if strings.HasPrefix(stripped, "multicast TXQ:") {
			kvSection = "multicast_txq"
			continue
		}

		if kvSection != "" && strings.Contains(line, "qsz-byt") {
			kvKeys = []string{}
			for _, k := range strings.Split(stripped, "\t") {
				kvKeys = append(kvKeys, nicekey(k))
			}
			continue
		}

		if len(kvKeys) > 0 && !strings.Contains(line, "qsz-byt") {
			if iface != "" {
				values := []string{}
				for _, v := range strings.Split(stripped, "\t") {
					if v != "" {
						values = append(values, v)
					}
				}
				kv := newJcObj()
				for i, k := range kvKeys {
					if i >= len(values) {
						break
					}
					n, ok := pyInt(values[i])
					if !ok {
						return nil, errCmdParse
					}
					kv.set(k, n)
				}
				ifaceSection, ok := section.get(iface)
				if !ok {
					return nil, errCmdParse
				}
				ifaceSection.(*jcObj).set(kvSection, kv)
			}
			kvSection = ""
			kvKeys = nil
			continue
		}

		if iface != "" {
			if ifaceSection, ok := section.get(iface); ok {
				key, value, _ := strings.Cut(stripped, " ")
				ifaceSection.(*jcObj).set(key, value)
				continue
			}
		}
	}

	if len(section.keys) > 0 {
		raw.set(phy, section)
	}

	return marshalJc(raw)
}

// iw reg get (api/scripts/iwreg.py)
func parseIwReg(data string) ([]byte, error) {
	raw := newJcObj()
	raw.set("country", "")
	raw.set("dfs", nil)
	bands := []any{}

	optFloat := func(s string) (any, error) {
		s = pyStrip(s)
		if s == "N/A" {
			return nil, nil
		}
		f, ok := pyFloat(s)
		if !ok {
			return nil, errCmdParse
		}
		return f, nil
	}

	for _, line := range pySplitlines(data, false) {
		if strings.HasPrefix(line, "country") {
			if raw.str("country") != "" {
				break
			}
			parts := strings.Split(line, ":")
			fields := pyFields(parts[0])
			if len(fields) < 2 {
				return nil, errCmdParse
			}
			raw.set("country", fields[1])
			if len(parts) > 1 {
				raw.set("dfs", pyStrip(parts[1]))
			}
		} else if strings.HasPrefix(pyStrip(line), "(") {
			line = strings.NewReplacer("(", "", ")", "").Replace(line)
			parts := strings.Split(line, ",")
			if len(parts) < 3 {
				return nil, errCmdParse
			}
			rangePart := strings.Split(parts[0], "-")
			bwPart := strings.Split(parts[0], "@")
			if len(rangePart) < 2 || len(bwPart) < 2 {
				return nil, errCmdParse
			}
			start, ok1 := pyInt(rangePart[0])
			end, ok2 := pyInt(strings.Split(rangePart[1], "@")[0])
			bw, ok3 := pyInt(bwPart[1])
			if !ok1 || !ok2 || !ok3 {
				return nil, errCmdParse
			}
			gain, err := optFloat(parts[1])
			if err != nil {
				return nil, err
			}
			eirp, err := optFloat(parts[2])
			if err != nil {
				return nil, err
			}
			flags := []any{}
			for _, f := range parts[3:] {
				flags = append(flags, pyStrip(f))
			}
			band := newJcObj()
			band.set("start", start)
			band.set("end", end)
			band.set("max_bandwidth", bw)
			band.set("max_antenna_gain", gain)
			band.set("max_eirp", eirp)
			band.set("flags", flags)
			bands = append(bands, band)
		}
	}
	raw.set("bands", bands)

	return marshalJc(raw)
}

var iwListLists = []string{
	"Supported Ciphers",
	"Supported interface modes",
	"Supported commands",
	"software interface modes (can always be added)",
	"valid interface combinations",
	"HT Capability overrides",
	"Supported TX frame types",
	"Supported RX frame types",
	"Supported extended features",
}

var iwListBandLists = []string{
	"VHT Capabilities",
	"VHT RX MCS set",
	"VHT TX MCS set",
	"Bitrates (non-HT)",
	"Frequencies",
	"Capabilities",
}

func containsAny(s string, names []string) bool {
	for _, n := range names {
		if strings.Contains(s, n) {
			return true
		}
	}
	return false
}

// iw list (api/scripts/iwlist.py)
func parseIwList(data string) ([]byte, error) {
	raw := []any{}
	section := newJcObj()

	// subsection key is a top-level key, or a key of the last band
	// (bandKey). subsection is nil for Python's None
	var subKey *string
	bandKey := false
	var subsection []any
	subsectionNone := true

	nicekey := func(s string) string {
		s = strings.ReplaceAll(strings.ToLower(s), ":", "")
		if i := strings.Index(s, "("); i >= 0 {
			s = s[:i]
		}
		s = strings.ReplaceAll(pyStrip(s), " ", "_")
		return strings.ReplaceAll(s, "_#_", "_")
	}

	lastBand := func() (*jcObj, error) {
		bands, ok := section.get("bands")
		if !ok {
			return nil, errCmdParse
		}
		list := bands.([]any)
		return list[len(list)-1].(*jcObj), nil
	}

	// assign a pending, non-empty subsection
	flush := func() error {
		if len(subsection) == 0 {
			return nil
		}
		if subKey == nil {
			section.set("null", subsection)
		} else if bandKey {
			band, err := lastBand()
			if err != nil {
				return err
			}
			band.set(*subKey, subsection)
		} else {
			section.set(*subKey, subsection)
		}
		subKey = nil
		bandKey = false
		subsection = nil
		subsectionNone = true
		return nil
	}

	for _, line := range pySplitlines(data, true) {
		stripped := pyStrip(line)

		if strings.HasPrefix(line, "Wiphy") {
			if len(section.keys) > 0 {
				if subKey != nil && (bandKey || *subKey != "") && len(subsection) > 0 {
					// python indexes a dict with the [band, key] list here
					if bandKey {
						return nil, errCmdParse
					}
					section.set(*subKey, subsection)
					subKey = nil
					subsection = nil
					subsectionNone = true
				}
				raw = append(raw, section)
				section = newJcObj()
			}
			fields := pyFields(line)
			if len(fields) < 2 {
				return nil, errCmdParse
			}
			section.set("wiphy", fields[1])
			continue
		}

		if strings.HasPrefix(stripped, "Band ") {
			newBand := strings.Trim(stripped, ":")
			bands, ok := section.get("bands")
			if !ok {
				band := newJcObj()
				band.set("band", newBand)
				section.set("bands", []any{band})
				continue
			}
			// pending assignment to the last band, using key[1]
			if subKey == nil {
				return nil, errCmdParse
			}
			key := *subKey
			if !bandKey {
				// key is a string: python takes its second character
				r := []rune(key)
				if len(r) < 2 {
					return nil, errCmdParse
				}
				key = string(r[1])
			}
			list := bands.([]any)
			last := list[len(list)-1].(*jcObj)
			if subsectionNone {
				last.set(key, nil)
			} else {
				last.set(key, subsection)
			}
			subsection = []any{}
			subsectionNone = false
			subKey = nil
			bandKey = false

			if last.str("band") != newBand {
				band := newJcObj()
				band.set("band", newBand)
				section.set("bands", append(list, band))
			}
		}

		if containsAny(line, iwListLists) || containsAny(line, iwListBandLists) {
			if err := flush(); err != nil {
				return nil, err
			}
			subsection = []any{}
			subsectionNone = false

			// Capabilities: 0x1ff
			if split := strings.Split(line, ": "); len(split) == 2 {
				line = split[0]
				subsection = append(subsection, split[1])
			}

			key := nicekey(line)
			subKey = &key
			bandKey = containsAny(line, iwListBandLists)

			if strings.Contains(line, "VHT Capabilities") && strings.Contains(line, "(") && strings.Contains(line, ")") {
				r := []rune(strings.SplitN(line, "(", 3)[1])
				if len(r) >= 2 {
					r = r[:len(r)-2]
				} else {
					r = r[:0]
				}
				subsection = append(subsection, string(r))
			}
			continue
		}

		if subKey != nil && (*subKey != "" || bandKey) && stripped != "" {
			if subsectionNone {
				return nil, errCmdParse
			}
			subsection = append(subsection, strings.Trim(stripped, "* "))
			continue
		}

		if pyIndented4(line) && len(subsection) > 0 {
			last := len(subsection) - 1
			subsection[last] = subsection[last].(string) + " " + stripped
			continue
		}

		if strings.HasPrefix(stripped, "Device supports ") {
			list, _ := section.get("device_supports")
			supports, _ := list.([]any)
			if supports == nil {
				supports = []any{}
			}
			v := strings.Trim(strings.ReplaceAll(stripped, "Device supports ", ""), ".")
			section.set("device_supports", append(supports, v))
			continue
		}

		if pyIndented(line) {
			key, value, found := strings.Cut(line, ":")
			if found {
				if err := flush(); err != nil {
					return nil, err
				}
				if !strings.Contains(value, "(") {
					value = strings.ReplaceAll(value, ")", "")
				}
				section.set(nicekey(key), pyStrip(value))
			}
			continue
		}
	}

	if len(section.keys) > 0 {
		raw = append(raw, section)
	}

	// _process: numbers for top-level values, and for lists that are all numbers
	for _, item := range raw {
		obj := item.(*jcObj)
		for _, k := range obj.keys {
			v := obj.vals[k]
			if n, ok := pyNumber(v); ok {
				obj.vals[k] = n
				continue
			}
			list, ok := v.([]any)
			if !ok {
				continue
			}
			converted := make([]any, 0, len(list))
			for _, li := range list {
				n, ok := pyNumber(li)
				if !ok {
					converted = nil
					break
				}
				converted = append(converted, n)
			}
			if converted != nil {
				obj.vals[k] = converted
			}
		}
	}

	return marshalJc(raw)
}

// suffix renames from jc's iw_scan _post_parse
var iwScanRenames = []struct{ from, to, cut string }{
	{"sta_channel_width", "sta_channel_width_mhz", " MHz"},
	{"passive_dwell", "passive_dwell_tus", " TUs"},
	{"active_dwell", "active_dwell_tus", " TUs"},
	{"channel_width_trigger_scan_interval", "channel_width_trigger_scan_interval_s", " s"},
	{"scan_passive_total_per_channel", "scan_passive_total_per_channel_tus", " TUs"},
	{"scan_active_total_per_channel", "scan_active_total_per_channel_tus", " TUs"},
	{"beacon_interval", "beacon_interval_tus", " TUs"},
	{"signal", "signal_dbm", " dBm"},
	{"last_seen", "last_seen_ms", " ms ago"},
}

// iw dev <iface> scan (jc 1.25.1 iw_scan)
func parseIwScan(data string) ([]byte, error) {
	raw := []*jcObj{}
	section := newJcObj()

	keyCleaner := strings.NewReplacer("*", "", "(", "", ")", "", ",", "", "-", "_")

	if pyHasData(data) {
		for _, line := range pySplitlines(data, true) {
			if strings.HasPrefix(line, "BSS") {
				if len(section.keys) > 0 {
					raw = append(raw, section)
					section = newJcObj()
				}
				fields := pyFields(strings.NewReplacer("(", " ", ")", " ").Replace(line))
				if len(fields) < 4 {
					return nil, errCmdParse
				}
				section.set("bssid", fields[1])
				section.set("interface", fields[3])
				continue
			}

			if pyIndented(line) {
				if strings.Contains(line, "Maximum RX AMPDU length") {
					continue
				}
				key, value, found := strings.Cut(line, ":")
				if found {
					key = strings.ReplaceAll(pyStrip(keyCleaner.Replace(strings.ToLower(key))), " ", "_")
					section.set(key, pyStrip(value))
				}
				continue
			}
		}
	}

	if len(section.keys) > 0 {
		raw = append(raw, section)
	}

	out := []any{}
	for _, bss := range raw {
		item := newJcObj()
		for _, k := range bss.keys {
			v := bss.str(k)
			if v == "" {
				continue
			}
			if strings.HasPrefix(v, "*") {
				v = pyStrip(v[1:])
			}
			item.set(k, v)
		}

		if _, ok := item.get("country"); ok {
			fields := pyFields(item.str("country"))
			if len(fields) == 0 || len(fields) == 2 {
				return nil, errCmdParse
			}
			item.set("country", fields[0])
			if len(fields) > 1 {
				item.set("environment", fields[2])
			}
		}

		if _, ok := item.get("tsf"); ok {
			fields := pyFields(item.str("tsf"))
			if len(fields) == 0 {
				return nil, errCmdParse
			}
			item.set("tsf_usec", fields[0])
			item.del("tsf")
		}

		for _, r := range iwScanRenames {
			if _, ok := item.get(r.from); ok {
				item.set(r.to, strings.ReplaceAll(item.pop(r.from), r.cut, ""))
			}
		}

		if _, ok := item.get("supported_rates"); ok {
			rates := item.str("supported_rates")
			selected := []any{}
			for _, rate := range pyFields(rates) {
				if strings.HasSuffix(rate, "*") {
					selected = append(selected, strings.ReplaceAll(rate, "*", ""))
				}
			}
			item.set("selected_rates", selected)
			item.set("supported_rates", stringsToAny(pyFields(strings.ReplaceAll(rates, "*", ""))))
		}

		if _, ok := item.get("extended_supported_rates"); ok {
			item.set("extended_supported_rates", stringsToAny(pyFields(item.str("extended_supported_rates"))))
		}

		if _, ok := item.get("obss_scan_activity_threshold"); ok {
			item.set("obss_scan_activity_threshold_percent", strings.ReplaceAll(item.pop("obss_scan_activity_threshold"), " %", ""))
		}
		if _, ok := item.get("ds_parameter_set"); ok {
			item.set("ds_parameter_set_channel", strings.ReplaceAll(item.pop("ds_parameter_set"), "channel ", ""))
		}
		if _, ok := item.get("max_amsdu_length"); ok {
			item.set("max_amsdu_length_bytes", strings.ReplaceAll(item.pop("max_amsdu_length"), " bytes", ""))
		}
		if _, ok := item.get("available_admission_capacity"); ok {
			item.set("available_admission_capacity", strings.ReplaceAll(item.str("available_admission_capacity"), " [*32us]", ""))
		}
		if _, ok := item.get("power_constraint"); ok {
			item.set("power_constraint_db", strings.ReplaceAll(item.pop("power_constraint"), " dB", ""))
		}
		if _, ok := item.get("minimum_rx_ampdu_time_spacing"); ok {
			fields := pyFields(item.pop("minimum_rx_ampdu_time_spacing"))
			if len(fields) == 0 {
				return nil, errCmdParse
			}
			item.set("minimum_rx_ampdu_time_spacing_usec", fields[0])
		}
		if _, ok := item.get("vht_rx_highest_supported"); ok {
			item.set("vht_rx_highest_supported_mbps", strings.ReplaceAll(item.pop("vht_rx_highest_supported"), " Mbps", ""))
		}
		if _, ok := item.get("vht_tx_highest_supported"); ok {
			item.set("vht_tx_highest_supported_mbps", strings.ReplaceAll(item.pop("vht_tx_highest_supported"), " Mbps", ""))
		}

		// _process: numbers for values, lists keep only their numbers
		for _, k := range item.keys {
			v := item.vals[k]
			if n, ok := pyNumber(v); ok {
				item.vals[k] = n
				continue
			}
			if list, ok := v.([]any); ok {
				nums := []any{}
				for _, li := range list {
					if n, ok := pyNumber(li); ok {
						nums = append(nums, n)
					}
				}
				item.vals[k] = nums
			}
		}

		out = append(out, item)
	}

	return marshalJc(out)
}

func stringsToAny(s []string) []any {
	out := make([]any, 0, len(s))
	for _, v := range s {
		out = append(out, v)
	}
	return out
}

// uptime (jc 1.25.6 uptime)
func parseUptime(data string) ([]byte, error) {
	raw := newJcObj()

	if pyHasData(data) {
		fields := pyFields(data)
		if strings.Contains(data, "user") {
			// time, _, *uptime, users, _, _, _, load_1m, load_5m, load_15m
			if len(fields) < 9 {
				return nil, errCmdParse
			}
			n := len(fields)
			raw.set("time", fields[0])
			raw.set("uptime", strings.TrimRight(strings.Join(fields[2:n-7], " "), ","))
			raw.set("users", fields[n-7])
			raw.set("load_1m", strings.TrimRight(fields[n-3], ","))
			raw.set("load_5m", strings.TrimRight(fields[n-2], ","))
			raw.set("load_15m", fields[n-1])
		} else {
			// time, _, *uptime, _, _, load_1m, load_5m, load_15m
			if len(fields) < 7 {
				return nil, errCmdParse
			}
			n := len(fields)
			raw.set("time", fields[0])
			raw.set("uptime", strings.TrimRight(strings.Join(fields[2:n-5], " "), ","))
			raw.set("load_1m", strings.TrimRight(fields[n-3], ","))
			raw.set("load_5m", strings.TrimRight(fields[n-2], ","))
			raw.set("load_15m", fields[n-1])
		}
	}

	if _, ok := raw.get("time"); ok {
		timeList := strings.Split(raw.str("time"), ":")
		if len(timeList) < 2 {
			return nil, errCmdParse
		}
		raw.set("time_hour", jcConvertToInt(timeList[0]))
		raw.set("time_minute", jcConvertToInt(timeList[1]))
		if len(timeList) == 3 {
			raw.set("time_second", jcConvertToInt(timeList[2]))
		} else {
			raw.set("time_second", nil)
		}
	}

	if _, ok := raw.get("uptime"); ok {
		uptime := raw.str("uptime")
		var days, hours, minutes any = json.Number("0"), json.Number("0"), json.Number("0")
		fields := pyFields(uptime)

		if strings.Contains(uptime, "min") {
			if len(fields) < 2 {
				return nil, errCmdParse
			}
			minutes = jcConvertToInt(fields[len(fields)-2])
		}
		if strings.Contains(uptime, ":") {
			hm := strings.Split(fields[len(fields)-1], ":")
			if len(hm) < 2 {
				return nil, errCmdParse
			}
			hours = jcConvertToInt(hm[len(hm)-2])
			parts := strings.Split(uptime, ":")
			minutes = jcConvertToInt(parts[len(parts)-1])
		}
		if strings.Contains(uptime, "day") {
			days = jcConvertToInt(fields[0])
		}

		raw.set("uptime_days", days)
		raw.set("uptime_hours", hours)
		raw.set("uptime_minutes", minutes)

		d, ok1 := jcIntValue(days)
		h, ok2 := jcIntValue(hours)
		m, ok3 := jcIntValue(minutes)
		if !ok1 || !ok2 || !ok3 {
			return nil, errCmdParse
		}
		raw.set("uptime_total_seconds", d*86400+h*3600+m*60)
	}

	if _, ok := raw.get("users"); ok {
		raw.set("users", jcConvertToInt(raw.str("users")))
	}
	for _, k := range []string{"load_1m", "load_5m", "load_15m"} {
		if _, ok := raw.get(k); ok {
			raw.set(k, jcConvertToFloat(raw.str(k)))
		}
	}

	return marshalJc(raw)
}

// python slicing on a string, s[:i] and s[i:], with negative indices
func pySplitAt(s string, i int) (string, string) {
	r := []rune(s)
	if i < 0 {
		i += len(r)
		if i < 0 {
			i = 0
		}
	}
	if i > len(r) {
		i = len(r)
	}
	return string(r[:i]), string(r[i:])
}

func splitSpaces(s string, min int) []string {
	out := []string{}
	start := 0
	for i := 0; i < len(s); {
		if s[i] != ' ' {
			i++
			continue
		}
		j := i
		for j < len(s) && s[j] == ' ' {
			j++
		}
		if j-i >= min {
			out = append(out, s[start:i])
			start = j
		}
		i = j
	}
	return append(out, s[start:])
}

// ss without -e/-o/-p (jc 1.25.6 ss)
func parseSS(data string) ([]byte, error) {
	containsColon := map[string]bool{"nl": true, "p_raw": true, "raw": true, "udp": true, "tcp": true, "v_str": true, "icmp6": true}
	out := []any{}

	lines := pySplitlines(data, true)
	if !pyHasData(data) {
		return marshalJc(out)
	}

	headerText := strings.ToLower(lines[0])
	recvQPosition := len([]rune(headerText[:max(strings.Index(headerText, "recv-q"), 0)]))
	if !strings.Contains(headerText, "recv-q") {
		recvQPosition = -1
	}
	headerText = strings.NewReplacer(
		"netidstate", "netid state",
		"local address:port", "local_address local_port",
		"peer address:port", "peer_address peer_port",
		"portprocess", "port",
	).Replace(headerText)
	headerList := pyFields(strings.ReplaceAll(headerText, "-", "_"))
	extraOpts := false
	// lines starting with whitespace reuse the previous row's fields, like jc
	var entryList []string

	for _, entry := range lines[1:] {
		line := newJcObj()
		if r := []rune(entry); len(r) > 0 && !strings.ContainsRune(" \t\n\r\v\f", r[0]) {
			a, b := pySplitAt(entry, recvQPosition)
			entry = a + "  " + b
			a, b = pySplitAt(entry, 5)
			entry = a + "  " + b

			entryList = splitSpaces(pyStrip(entry), 1)
			if len(entryList) > len(headerList) || extraOpts {
				entryList = splitSpaces(pyStrip(entry), 2)
				extraOpts = true
			}
			if containsColon[entryList[0]] && len(entryList) < 5 {
				return nil, errCmdParse
			}
			if containsColon[entryList[0]] && strings.Contains(entryList[4], ":") {
				i := strings.LastIndex(entryList[4], ":")
				entryList = append(entryList[:5], append([]string{entryList[4][i+1:]}, entryList[5:]...)...)
				entryList[4] = entryList[4][:i]
			}
			if containsColon[entryList[0]] && len(entryList) < 7 {
				return nil, errCmdParse
			}
			if containsColon[entryList[0]] && strings.Contains(entryList[6], ":") {
				i := strings.LastIndex(entryList[6], ":")
				entryList = append(entryList[:7], append([]string{entryList[6][i+1:]}, entryList[7:]...)...)
				entryList[6] = entryList[6][:i]
			}
			last := entryList[len(entryList)-1]
			for _, opt := range []string{"ino:", "uid:", "sk:", "users:", "timer:", "cgroup:", "v6only:"} {
				if strings.Contains(last, opt) {
					// -e/-o/-p output is not used by the API
					return nil, errCmdParse
				}
			}
		} else if entryList == nil {
			return nil, errCmdParse
		}
		for i, h := range headerList {
			if i >= len(entryList) {
				break
			}
			line.set(h, entryList[i])
		}

		if _, ok := line.get("local_address"); !ok {
			return nil, errCmdParse
		}
		if local := line.str("local_address"); strings.Contains(local, "%") {
			i := strings.LastIndex(local, "%")
			line.set("local_address", local[:i])
			line.set("interface", local[i+1:])
		}
		netid := line.str("netid")
		if netid == "nl" {
			channel := line.pop("local_address") + ":" + line.pop("local_port")
			if i := strings.LastIndex(channel, "/"); i >= 0 {
				line.set("pid", channel[i+1:])
				channel = channel[:i]
			}
			line.set("channel", channel)
		}
		if netid == "p_raw" {
			line.set("link_layer", line.pop("local_address"))
			line.set("interface", line.pop("local_port"))
		}
		if !containsColon[netid] {
			line.set("path", line.pop("local_address"))
		}

		for _, k := range []string{"recv_q", "send_q", "pid"} {
			if _, ok := line.get(k); ok {
				line.set(k, jcConvertToInt(line.str(k)))
			}
		}
		for _, k := range []string{"local_port", "peer_port"} {
			if _, ok := line.get(k); ok {
				if n, ok := jcIntValue(jcConvertToInt(line.str(k))); ok && n >= 0 {
					line.set(k+"_num", n)
				}
			}
		}

		out = append(out, line)
	}

	return marshalJc(out)
}
