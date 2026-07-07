package main

import (
	"encoding/json"
	"net/http"
	"os"
	"regexp"
	"sync"
	"unicode"
	"unicode/utf8"
)

var CustomThemesPath = TEST_PREFIX + "/configs/base/custom_themes.json"
var CustomThemesMtx sync.Mutex

type CustomThemeSpec struct {
	ColorMode  string `json:"colorMode"`
	Accent     string `json:"accent"`
	Background string `json:"background"`
	Card       string `json:"card"`
	Text       string `json:"text"`
}

type CustomTheme struct {
	ID   string          `json:"id"`
	Name string          `json:"name"`
	Spec CustomThemeSpec `json:"spec"`
}

const maxCustomThemes = 32
const maxThemesBodyBytes = 64 * 1024

var validThemeID = regexp.MustCompile(`^custom-[a-z0-9-]{1,64}$`)
var validHexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func validThemeName(name string) bool {
	if len(name) == 0 || len(name) > 64 || !utf8.ValidString(name) {
		return false
	}
	for _, r := range name {
		if unicode.IsControl(r) {
			return false
		}
	}
	return true
}

func validateCustomTheme(t CustomTheme) bool {
	if !validThemeID.MatchString(t.ID) {
		return false
	}
	if !validThemeName(t.Name) {
		return false
	}
	if t.Spec.ColorMode != "light" && t.Spec.ColorMode != "dark" {
		return false
	}
	for _, c := range []string{t.Spec.Accent, t.Spec.Background, t.Spec.Card, t.Spec.Text} {
		if !validHexColor.MatchString(c) {
			return false
		}
	}
	return true
}

func validateCustomThemes(themes []CustomTheme) bool {
	if len(themes) > maxCustomThemes {
		return false
	}
	seen := map[string]bool{}
	for _, t := range themes {
		if !validateCustomTheme(t) || seen[t.ID] {
			return false
		}
		seen[t.ID] = true
	}
	return true
}

// invalid entries (e.g. a hand-edited file) are dropped rather than served
func loadCustomThemes() []CustomTheme {
	themes := []CustomTheme{}
	data, err := os.ReadFile(CustomThemesPath)
	if err != nil {
		return themes
	}
	if json.Unmarshal(data, &themes) != nil {
		return []CustomTheme{}
	}
	valid := []CustomTheme{}
	seen := map[string]bool{}
	for _, t := range themes {
		if validateCustomTheme(t) && !seen[t.ID] && len(valid) < maxCustomThemes {
			valid = append(valid, t)
			seen[t.ID] = true
		}
	}
	return valid
}

func customThemes(w http.ResponseWriter, r *http.Request) {
	CustomThemesMtx.Lock()
	defer CustomThemesMtx.Unlock()

	themes := []CustomTheme{}

	if r.Method == http.MethodPut {
		r.Body = http.MaxBytesReader(w, r.Body, maxThemesBodyBytes)
		err := json.NewDecoder(r.Body).Decode(&themes)
		if err != nil {
			http.Error(w, "failed to deserialize themes", 400)
			return
		}

		if !validateCustomThemes(themes) {
			http.Error(w, "invalid themes", 400)
			return
		}

		file, _ := json.MarshalIndent(themes, "", " ")
		err = os.WriteFile(CustomThemesPath, file, 0600)
		if err != nil {
			http.Error(w, "failed to save themes", 500)
			return
		}
	} else {
		themes = loadCustomThemes()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(themes)
}
