package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gorilla/mux"
)

func setupDNSHostnamesTest(t *testing.T, initial string) {
	t.Helper()
	oldPath := LocalMappingsPath
	LocalMappingsPath = filepath.Join(t.TempDir(), "local_mappings")
	t.Cleanup(func() { LocalMappingsPath = oldPath })
	if initial != "" {
		if err := os.WriteFile(LocalMappingsPath, []byte(initial), 0o600); err != nil {
			t.Fatal(err)
		}
	}
}

func dnsHostnameRequest(t *testing.T, method, hostname, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, "/dns/hostnames/"+hostname, strings.NewReader(body))
	req = mux.SetURLVars(req, map[string]string{"hostname": hostname})
	recorder := httptest.NewRecorder()
	dnsHostname(recorder, req)
	return recorder
}

func TestDNSHostnameCRUDOneRecordAtATime(t *testing.T) {
	setupDNSHostnamesTest(t, "192.168.2.10 camera.lan\n")

	put := dnsHostnameRequest(t, http.MethodPut, "Vault.Home.Example.COM.", `{"IPAddress":"192.168.2.20"}`)
	if put.Code != http.StatusOK {
		t.Fatalf("PUT status %d: %s", put.Code, put.Body.String())
	}

	get := dnsHostnameRequest(t, http.MethodGet, "vault.home.example.com", "")
	if get.Code != http.StatusOK {
		t.Fatalf("GET status %d: %s", get.Code, get.Body.String())
	}
	var mapping DNSHostnameMapping
	if err := json.Unmarshal(get.Body.Bytes(), &mapping); err != nil {
		t.Fatal(err)
	}
	if mapping.Hostname != "vault.home.example.com" || mapping.IPAddress != "192.168.2.20" {
		t.Fatalf("unexpected mapping: %#v", mapping)
	}

	// An upsert changes only the addressed hostname without duplicating it.
	put = dnsHostnameRequest(t, http.MethodPut, "vault.home.example.com", `{"IPAddress":"192.168.2.21"}`)
	if put.Code != http.StatusOK {
		t.Fatalf("upsert status %d: %s", put.Code, put.Body.String())
	}

	del := dnsHostnameRequest(t, http.MethodDelete, "vault.home.example.com", `{}`)
	if del.Code != http.StatusNoContent {
		t.Fatalf("DELETE status %d: %s", del.Code, del.Body.String())
	}
	data, err := os.ReadFile(LocalMappingsPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "192.168.2.10 camera.lan\n" {
		t.Fatalf("unexpected file content: %q", data)
	}
}

func TestDNSHostnameValidation(t *testing.T) {
	setupDNSHostnamesTest(t, "")
	tests := []struct {
		hostname string
		body     string
	}{
		{"*.example.com", `{"IPAddress":"192.168.2.2"}`},
		{"bad_name.example.com", `{"IPAddress":"192.168.2.2"}`},
		{"good.example.com", `{"IPAddress":"not-an-ip"}`},
		{"good.example.com", `{"IPAddress":"224.0.0.1"}`},
		{"good.example.com", `{"IPAddress":"203.0.113.10"}`},
		{"good.example.com", `{"IPAddress":"127.0.0.1"}`},
		{"good.example.com", `{"IPAddress":"192.168.2.2","Unknown":true}`},
	}
	for _, test := range tests {
		recorder := dnsHostnameRequest(t, http.MethodPut, test.hostname, test.body)
		if recorder.Code != http.StatusBadRequest {
			t.Errorf("hostname %q body %s: got status %d", test.hostname, test.body, recorder.Code)
		}
	}
}

func TestDNSHostnameNotFound(t *testing.T) {
	setupDNSHostnamesTest(t, "192.168.2.10 camera.lan\n")
	for _, method := range []string{http.MethodGet, http.MethodDelete} {
		body := ""
		if method == http.MethodDelete {
			body = `{}`
		}
		recorder := dnsHostnameRequest(t, method, "missing.example.com", body)
		if recorder.Code != http.StatusNotFound {
			t.Fatalf("%s got status %d", method, recorder.Code)
		}
	}
}

func TestDNSHostnameConditionalMutations(t *testing.T) {
	setupDNSHostnamesTest(t, "192.168.2.10 vault.example.com\n")

	createConflict := dnsHostnameRequest(t, http.MethodPut, "vault.example.com", `{"IPAddress":"192.168.2.20","CreateOnly":true}`)
	if createConflict.Code != http.StatusConflict {
		t.Fatalf("create-only status %d: %s", createConflict.Code, createConflict.Body.String())
	}

	updateConflict := dnsHostnameRequest(t, http.MethodPut, "vault.example.com", `{"IPAddress":"192.168.2.20","PreviousIPAddress":"192.168.2.99"}`)
	if updateConflict.Code != http.StatusConflict {
		t.Fatalf("conditional update status %d: %s", updateConflict.Code, updateConflict.Body.String())
	}

	update := dnsHostnameRequest(t, http.MethodPut, "vault.example.com", `{"IPAddress":"192.168.2.20","PreviousIPAddress":"192.168.2.10"}`)
	if update.Code != http.StatusOK {
		t.Fatalf("conditional update status %d: %s", update.Code, update.Body.String())
	}

	deleteConflict := dnsHostnameRequest(t, http.MethodDelete, "vault.example.com", `{"IPAddress":"192.168.2.10"}`)
	if deleteConflict.Code != http.StatusConflict {
		t.Fatalf("conditional delete status %d: %s", deleteConflict.Code, deleteConflict.Body.String())
	}

	deleteMapping := dnsHostnameRequest(t, http.MethodDelete, "vault.example.com", `{"IPAddress":"192.168.2.20"}`)
	if deleteMapping.Code != http.StatusNoContent {
		t.Fatalf("conditional delete status %d: %s", deleteMapping.Code, deleteMapping.Body.String())
	}
}

func TestDNSHostnameScopedPathPermissions(t *testing.T) {
	paths := []string{"/dns/hostnames:rw"}
	for _, method := range []string{http.MethodGet, http.MethodPut, http.MethodDelete} {
		if !scopedPathMatch(method, "/dns/hostnames/vault.example.com", paths) {
			t.Errorf("expected %s to match rw scope", method)
		}
	}
	if scopedPathMatch(http.MethodGet, "/devices", paths) {
		t.Fatal("hostname scope unexpectedly matched another endpoint")
	}
}
