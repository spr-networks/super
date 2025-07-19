package main

import (
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Import the actual DNS code from the parent directory
// Note: This assumes the test is run with proper Go module/path setup
// For a truly standalone test, you might need to adjust the import path

// SetupDNSTest creates a temporary directory and config file for testing
func SetupDNSTest() (string, func(), error) {
	// Create a temporary directory for test files
	tmpDir, err := ioutil.TempDir("", "dns_test")
	if err != nil {
		return "", nil, err
	}

	// Save original paths
	originalDNSConfigFile := DNSConfigFile
	originalTestPrefix := TEST_PREFIX

	// Set test paths
	TEST_PREFIX = tmpDir
	DNSConfigFile = filepath.Join(tmpDir, "Corefile")

	// Create a basic Corefile for testing
	corefileContent := `.:53 {
  errors
  health
  prometheus :9053
  forward . tls://1.1.1.1 {
    tls_servername cloudflare-dns.com
    max_concurrent 1000
  }
  cache 30
  loop
  reload
  loadbalance
}
`
	err = ioutil.WriteFile(DNSConfigFile, []byte(corefileContent), 0644)
	if err != nil {
		os.RemoveAll(tmpDir)
		return "", nil, err
	}

	// Cleanup function
	cleanup := func() {
		DNSConfigFile = originalDNSConfigFile
		TEST_PREFIX = originalTestPrefix
		os.RemoveAll(tmpDir)
	}

	return tmpDir, cleanup, nil
}

// Test functions
func testMigration() {
	fmt.Println("=== Testing DNS Settings Migration ===")

	// Test 1: Legacy to new format
	legacy := DNSSettings{
		UpstreamIPAddress:       "1.1.1.1",
		UpstreamTLSHost:         "cloudflare-dns.com",
		DisableTls:              false,
		UpstreamFamilyIPAddress: "1.1.1.3",
		UpstreamFamilyTLSHost:   "cloudflare-dns.com",
		DisableFamilyTls:        false,
	}

	legacy.migrateToProviders()

	if len(legacy.UpstreamProviders) != 1 {
		fmt.Printf("FAIL: Expected 1 upstream provider, got %d\n", len(legacy.UpstreamProviders))
	} else if legacy.UpstreamProviders[0].IPAddress != "1.1.1.1" {
		fmt.Printf("FAIL: Expected upstream IP 1.1.1.1, got %s\n", legacy.UpstreamProviders[0].IPAddress)
	} else {
		fmt.Println("PASS: Legacy migration successful")
	}

	// Test 2: Already migrated format
	migrated := DNSSettings{
		UpstreamProviders: []DNSProvider{
			{IPAddress: "9.9.9.9", TLSHost: "dns.quad9.net", DisableTls: false},
		},
		FamilyProviders: []DNSProvider{
			{IPAddress: "208.67.222.123", TLSHost: "doh.opendns.com", DisableTls: false},
		},
	}

	migrated.migrateToProviders()

	if migrated.UpstreamIPAddress != "9.9.9.9" {
		fmt.Printf("FAIL: Expected legacy IP to be set to 9.9.9.9, got %s\n", migrated.UpstreamIPAddress)
	} else {
		fmt.Println("PASS: Already migrated format preserved")
	}
}

func testConfigGeneration() {
	fmt.Println("\n=== Testing CoreDNS Config Generation ===")

	_, cleanup, err := SetupDNSTest()
	if err != nil {
		fmt.Printf("FAIL: Could not setup test: %v\n", err)
		return
	}
	defer cleanup()

	// Test with multiple providers
	settings := DNSSettings{
		UpstreamProviders: []DNSProvider{
			{IPAddress: "1.1.1.1", TLSHost: "cloudflare-dns.com", DisableTls: false},
			{IPAddress: "8.8.8.8", TLSHost: "", DisableTls: true},
			{IPAddress: "9.9.9.9", TLSHost: "dns.quad9.net", DisableTls: false},
		},
		FamilyProviders: []DNSProvider{
			{IPAddress: "1.1.1.3", TLSHost: "cloudflare-dns.com", DisableTls: false},
			{IPAddress: "208.67.222.123", TLSHost: "doh.opendns.com", DisableTls: false},
		},
	}

	// Write the config using the actual function
	updateDNSCorefileMulti(settings)

	// Read back the generated config
	content, err := ioutil.ReadFile(DNSConfigFile)
	if err != nil {
		fmt.Printf("FAIL: Could not read generated config: %v\n", err)
		return
	}

	config := string(content)

	// Check for expected content
	expectedPatterns := []string{
		"forward . tls://1.1.1.1 8.8.8.8 tls://9.9.9.9 {",
		"tls_servername 1.1.1.1 cloudflare-dns.com",
		"tls_servername 9.9.9.9 dns.quad9.net",
		"forward . tls://1.1.1.3 tls://208.67.222.123 {",
		"spr_policy dns:family",
		"tls_servername 1.1.1.3 cloudflare-dns.com",
		"tls_servername 208.67.222.123 doh.opendns.com",
	}

	allPassed := true
	for _, pattern := range expectedPatterns {
		if !strings.Contains(config, pattern) {
			fmt.Printf("FAIL: Expected config to contain '%s'\n", pattern)
			allPassed = false
		}
	}

	if allPassed {
		fmt.Println("PASS: Config generation successful")
	}

	// Verify no TLS servername for non-TLS server
	if strings.Contains(config, "tls_servername 8.8.8.8") {
		fmt.Println("FAIL: Config should not contain tls_servername for non-TLS server")
	} else {
		fmt.Println("PASS: Non-TLS server handled correctly")
	}
}

func testConfigParsing() {
	fmt.Println("\n=== Testing CoreDNS Config Parsing ===")

	_, cleanup, err := SetupDNSTest()
	if err != nil {
		fmt.Printf("FAIL: Could not setup test: %v\n", err)
		return
	}
	defer cleanup()

	// Write a test config
	config := `.:53 {
  errors
  health
  prometheus :9053
  forward . tls://1.1.1.1 {
    tls_servername cloudflare-dns.com
    max_concurrent 1000
  }
  forward . tls://1.1.1.3 {
    spr_policy dns:family
    tls_servername cloudflare-dns.com
    max_concurrent 1000
  }
  cache 30
  loop
  reload
  loadbalance
}`

	err = ioutil.WriteFile(DNSConfigFile, []byte(config), 0644)
	if err != nil {
		fmt.Printf("FAIL: Could not write test config: %v\n", err)
		return
	}

	// Parse using the actual function
	settings := parseDNSCorefile()

	if settings.UpstreamIPAddress != "1.1.1.1" {
		fmt.Printf("FAIL: Expected upstream IP 1.1.1.1, got %s\n", settings.UpstreamIPAddress)
	} else if settings.UpstreamTLSHost != "cloudflare-dns.com" {
		fmt.Printf("FAIL: Expected upstream TLS host cloudflare-dns.com, got %s\n", settings.UpstreamTLSHost)
	} else if settings.DisableTls != false {
		fmt.Println("FAIL: Expected TLS to be enabled")
	} else {
		fmt.Println("PASS: Primary DNS parsed correctly")
	}

	if settings.UpstreamFamilyIPAddress != "1.1.1.3" {
		fmt.Printf("FAIL: Expected family IP 1.1.1.3, got %s\n", settings.UpstreamFamilyIPAddress)
	} else if settings.UpstreamFamilyTLSHost != "cloudflare-dns.com" {
		fmt.Printf("FAIL: Expected family TLS host cloudflare-dns.com, got %s\n", settings.UpstreamFamilyTLSHost)
	} else {
		fmt.Println("PASS: Family DNS parsed correctly")
	}
}

func testBuildForwardLine() {
	fmt.Println("\n=== Testing Forward Line Building ===")

	tests := []struct {
		name      string
		providers []DNSProvider
		expected  string
	}{
		{
			name: "Single provider with TLS",
			providers: []DNSProvider{
				{IPAddress: "1.1.1.1", TLSHost: "cloudflare-dns.com", DisableTls: false},
			},
			expected: "  forward . tls://1.1.1.1 {",
		},
		{
			name: "Single provider without TLS",
			providers: []DNSProvider{
				{IPAddress: "8.8.8.8", TLSHost: "", DisableTls: true},
			},
			expected: "  forward . 8.8.8.8 {",
		},
		{
			name: "Multiple providers mixed TLS",
			providers: []DNSProvider{
				{IPAddress: "1.1.1.1", TLSHost: "cloudflare-dns.com", DisableTls: false},
				{IPAddress: "8.8.8.8", TLSHost: "", DisableTls: true},
				{IPAddress: "9.9.9.9", TLSHost: "dns.quad9.net", DisableTls: false},
			},
			expected: "  forward . tls://1.1.1.1 8.8.8.8 tls://9.9.9.9 {",
		},
	}

	allPassed := true
	for _, tt := range tests {
		result := buildForwardLine(tt.providers)
		if result != tt.expected {
			fmt.Printf("FAIL [%s]: Expected '%s', got '%s'\n", tt.name, tt.expected, result)
			allPassed = false
		}
	}

	if allPassed {
		fmt.Println("PASS: All forward line tests passed")
	}
}

func testFileOperations() {
	fmt.Println("\n=== Testing File Operations ===")

	_, cleanup, err := SetupDNSTest()
	if err != nil {
		fmt.Printf("FAIL: Could not setup test: %v\n", err)
		return
	}
	defer cleanup()

	// Test writing config with multiple providers
	settings := DNSSettings{
		UpstreamProviders: []DNSProvider{
			{IPAddress: "1.1.1.1", TLSHost: "cloudflare-dns.com", DisableTls: false},
			{IPAddress: "9.9.9.9", TLSHost: "dns.quad9.net", DisableTls: false},
		},
		FamilyProviders: []DNSProvider{
			{IPAddress: "1.1.1.3", TLSHost: "cloudflare-dns.com", DisableTls: false},
		},
	}

	// Write using actual function
	updateDNSCorefileMulti(settings)

	// Read it back and parse
	parsedSettings := parseDNSCorefile()

	// The parsed settings will have the legacy format populated from the first provider
	if parsedSettings.UpstreamIPAddress == "1.1.1.1" {
		fmt.Println("PASS: File write/read/parse cycle successful")
	} else {
		fmt.Printf("FAIL: Parse after write failed, got IP %s\n", parsedSettings.UpstreamIPAddress)
	}
}

// TestDNSConfiguration runs all DNS configuration tests
func TestDNSConfiguration(t *testing.T) {
	fmt.Println("DNS Configuration Unit Tests")
	fmt.Println("============================")

	testMigration()
	testBuildForwardLine()
	testConfigGeneration()
	testConfigParsing()
	testFileOperations()

	fmt.Println("\n=== Test Summary ===")
	fmt.Println("Check output above for PASS/FAIL results")
}
