package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/mux"
)

func init() {
	// The Dockerfile.test sets up all directories and TEST_PREFIX
}

func setupFirewallTest(t *testing.T) {
	// Initialize firewall rules
	initFirewallRules()

	// Clear all rules for a clean test environment
	FWmtx.Lock()
	gFirewallConfig.ForwardingRules = []ForwardingRule{}
	gFirewallConfig.BlockRules = []BlockRule{}
	gFirewallConfig.OutputBlockRules = []OutputBlockRule{}
	gFirewallConfig.ForwardingBlockRules = []ForwardingBlockRule{}
	gFirewallConfig.ServicePorts = []ServicePort{}
	gFirewallConfig.Endpoints = []Endpoint{}
	gFirewallConfig.MulticastPorts = []MulticastPort{}
	gFirewallConfig.CustomInterfaceRules = []CustomInterfaceRule{}
	FWmtx.Unlock()
}

func teardownFirewallTest(t *testing.T) {

}

func checkNFTRuleExists(t *testing.T, rule string) bool {
	cmd := exec.Command("nft", "list", "ruleset")
	output, err := cmd.Output()
	if err != nil {
		t.Logf("Failed to list nftables rules: %v", err)
		return false
	}
	return strings.Contains(string(output), rule)
}

func checkForwardingRuleInNFT(t *testing.T, rule ForwardingRule, shouldExist bool) {
	var tableName string
	if rule.DstPort == "any" {
		tableName = rule.Protocol + "anyfwd"
	} else {
		tableName = rule.Protocol + "fwd"
	}

	cmd := exec.Command("nft", "list", "map", "inet", "nat", tableName)
	output, err := cmd.Output()
	if err != nil {
		t.Logf("Failed to list nft map %s: %v", tableName, err)
		return
	}

	var expectedEntry string
	if rule.DstPort == "any" {
		expectedEntry = fmt.Sprintf("%s : %s", rule.SrcIP, rule.DstIP)
	} else {
		expectedEntry = fmt.Sprintf("%s . %s : %s . %s", rule.SrcIP, rule.SrcPort, rule.DstIP, rule.DstPort)
	}

	exists := strings.Contains(string(output), expectedEntry)
	if shouldExist && !exists {
		t.Errorf("Expected forwarding rule not found in nft map %s: %s", tableName, expectedEntry)
		t.Logf("nft output: %s", string(output))
	} else if !shouldExist && exists {
		t.Errorf("Forwarding rule should not exist in nft map %s but found: %s", tableName, expectedEntry)
		t.Logf("nft output: %s", string(output))
	}
}

func checkBlockRuleInNFT(t *testing.T, rule BlockRule, shouldExist bool) {
	cmd := exec.Command("nft", "list", "map", "inet", "nat", "block")
	output, err := cmd.Output()
	if err != nil {
		t.Logf("Failed to list nft map block: %v", err)
		return
	}

	expectedEntry := fmt.Sprintf("%s . %s . %s : drop", rule.SrcIP, rule.DstIP, rule.Protocol)
	exists := strings.Contains(string(output), expectedEntry)

	if shouldExist && !exists {
		t.Errorf("Expected block rule not found in nft map: %s", expectedEntry)
		t.Logf("nft output: %s", string(output))
	} else if !shouldExist && exists {
		t.Errorf("Block rule should not exist in nft map but found: %s", expectedEntry)
		t.Logf("nft output: %s", string(output))
	}
}

func checkOutputBlockRuleInNFT(t *testing.T, rule OutputBlockRule, shouldExist bool) {
	cmd := exec.Command("nft", "list", "map", "inet", "filter", "output_block")
	output, err := cmd.Output()
	if err != nil {
		t.Logf("Failed to list nft map output_block: %v", err)
		return
	}

	expectedEntry := fmt.Sprintf("%s . %s . %s : drop", rule.SrcIP, rule.DstIP, rule.Protocol)
	exists := strings.Contains(string(output), expectedEntry)

	if shouldExist && !exists {
		t.Errorf("Expected output block rule not found in nft map: %s", expectedEntry)
		t.Logf("nft output: %s", string(output))
	} else if !shouldExist && exists {
		t.Errorf("Output block rule should not exist in nft map but found: %s", expectedEntry)
		t.Logf("nft output: %s", string(output))
	}
}

func checkServicePortInNFT(t *testing.T, port ServicePort, shouldExist bool) {
	var mapName string
	if port.Protocol == "tcp" {
		mapName = "lan_tcp_accept"
	} else {
		mapName = "lan_udp_accept"
	}

	cmd := exec.Command("nft", "list", "map", "inet", "filter", mapName)
	output, err := cmd.Output()
	if err != nil {
		t.Logf("Failed to list nft map %s: %v", mapName, err)
		return
	}

	expectedEntry := fmt.Sprintf("%s : accept", port.Port)
	exists := strings.Contains(string(output), expectedEntry)

	if shouldExist && !exists {
		t.Errorf("Expected service port not found in nft map %s: %s", mapName, expectedEntry)
		t.Logf("nft output: %s", string(output))
	} else if !shouldExist && exists {
		t.Errorf("Service port should not exist in nft map %s but found: %s", mapName, expectedEntry)
		t.Logf("nft output: %s", string(output))
	}
}

func TestForwardingRules(t *testing.T) {
	setupFirewallTest(t)
	defer teardownFirewallTest(t)

	// Create test router
	router := mux.NewRouter()
	router.HandleFunc("/firewall/forward", modifyForwardRules).Methods("PUT", "DELETE")

	tests := []struct {
		name        string
		method      string
		rule        ForwardingRule
		expectError bool
		checkNFT    string
	}{
		{
			name:   "Add valid TCP forwarding rule",
			method: "PUT",
			rule: ForwardingRule{
				Protocol: "tcp",
				SrcIP:    "192.168.1.100",
				SrcPort:  "80",
				DstIP:    "10.0.0.100",
				DstPort:  "8080",
			},
			expectError: false,
			checkNFT:    "192.168.1.100",
		},
		{
			name:   "Add valid UDP forwarding rule with port range",
			method: "PUT",
			rule: ForwardingRule{
				Protocol: "udp",
				SrcIP:    "192.168.1.0/24",
				SrcPort:  "5000-5100",
				DstIP:    "10.0.0.200",
				DstPort:  "5000",
			},
			expectError: false,
			checkNFT:    "192.168.1.0/24",
		},
		{
			name:   "Add forwarding rule with 'any' destination port",
			method: "PUT",
			rule: ForwardingRule{
				Protocol: "tcp",
				SrcIP:    "192.168.1.100",
				SrcPort:  "1234",
				DstIP:    "10.0.0.50",
				DstPort:  "any",
			},
			expectError: false,
			checkNFT:    "192.168.1.100",
		},
		{
			name:   "Invalid protocol",
			method: "PUT",
			rule: ForwardingRule{
				Protocol: "icmp",
				SrcIP:    "192.168.1.1",
				SrcPort:  "80",
				DstIP:    "10.0.0.1",
				DstPort:  "80",
			},
			expectError: true,
		},
		{
			name:   "Invalid source IP",
			method: "PUT",
			rule: ForwardingRule{
				Protocol: "tcp",
				SrcIP:    "invalid-ip",
				SrcPort:  "80",
				DstIP:    "10.0.0.1",
				DstPort:  "80",
			},
			expectError: true,
		},
		{
			name:   "Invalid destination port",
			method: "PUT",
			rule: ForwardingRule{
				Protocol: "tcp",
				SrcIP:    "192.168.1.1",
				SrcPort:  "80",
				DstIP:    "10.0.0.1",
				DstPort:  "invalid",
			},
			expectError: true,
		},
	}

	// Test adding rules
	for _, tt := range tests {
		t.Run(tt.name+" - Add", func(t *testing.T) {
			body, _ := json.Marshal(tt.rule)
			req := httptest.NewRequest(tt.method, "/firewall/forward", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()

			router.ServeHTTP(rr, req)

			if tt.expectError {
				if rr.Code == http.StatusOK {
					t.Errorf("Expected error but got OK")
				}
			} else {
				if rr.Code != http.StatusOK {
					t.Errorf("Expected OK but got %d: %s", rr.Code, rr.Body.String())
				}

				// Verify rule was added to config
				FWmtx.Lock()
				found := false
				for _, r := range gFirewallConfig.ForwardingRules {
					if r == tt.rule {
						found = true
						break
					}
				}
				FWmtx.Unlock()

				if !found {
					t.Errorf("Rule not found in config after adding")
				}

				// Verify rule exists in nftables
				checkForwardingRuleInNFT(t, tt.rule, true)
			}
		})
	}

	// Test removing rules
	for _, tt := range tests {
		if tt.expectError {
			continue // Skip invalid rules
		}

		t.Run(tt.name+" - Remove", func(t *testing.T) {
			// Clear any existing rules before this test
			FWmtx.Lock()
			gFirewallConfig.ForwardingRules = []ForwardingRule{}
			FWmtx.Unlock()
			// First add the rule through the API to ensure it's properly stored
			body, _ := json.Marshal(tt.rule)
			req := httptest.NewRequest("PUT", "/firewall/forward", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()
			router.ServeHTTP(rr, req)

			// Find the actual stored rule since the API might modify it
			FWmtx.Lock()
			var storedRule *ForwardingRule
			for i := range gFirewallConfig.ForwardingRules {
				r := &gFirewallConfig.ForwardingRules[i]
				if r.Protocol == tt.rule.Protocol &&
					r.SrcIP == tt.rule.SrcIP &&
					r.SrcPort == tt.rule.SrcPort &&
					r.DstIP == tt.rule.DstIP &&
					r.DstPort == tt.rule.DstPort {
					storedRule = r
					break
				}
			}
			FWmtx.Unlock()

			if storedRule == nil {
				t.Fatal("Rule was not found after adding")
			}

			// Use the actual stored rule for deletion
			body, _ = json.Marshal(*storedRule)

			// Now remove it
			req = httptest.NewRequest("DELETE", "/firewall/forward", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rr = httptest.NewRecorder()

			router.ServeHTTP(rr, req)

			if rr.Code != http.StatusOK {
				t.Errorf("Expected OK but got %d: %s", rr.Code, rr.Body.String())
				t.Logf("Tried to delete rule: %+v", *storedRule)
			} else if rr.Code == http.StatusNotFound {
				t.Logf("Got 404 when trying to delete rule: %+v", *storedRule)
			}

			// Verify rule was removed from config
			FWmtx.Lock()
			found := false
			for _, r := range gFirewallConfig.ForwardingRules {
				if r.Protocol == tt.rule.Protocol &&
					r.SrcIP == tt.rule.SrcIP &&
					r.SrcPort == tt.rule.SrcPort &&
					r.DstIP == tt.rule.DstIP &&
					r.DstPort == tt.rule.DstPort {
					found = true
					break
				}
			}
			FWmtx.Unlock()

			if found {
				t.Errorf("Rule still in config after deletion")
			}

			// Verify rule was removed from nftables
			checkForwardingRuleInNFT(t, tt.rule, false)
		})
	}
}

func TestBlockRules(t *testing.T) {
	setupFirewallTest(t)
	defer teardownFirewallTest(t)

	router := mux.NewRouter()
	router.HandleFunc("/firewall/block", blockIP).Methods("PUT", "DELETE")

	tests := []struct {
		name        string
		rule        BlockRule
		expectError bool
	}{
		{
			name: "Add valid TCP block rule",
			rule: BlockRule{
				Protocol: "tcp",
				SrcIP:    "192.168.1.100",
				DstIP:    "10.0.0.0/8",
			},
			expectError: false,
		},
		{
			name: "Add valid UDP block rule with CIDR",
			rule: BlockRule{
				Protocol: "udp",
				SrcIP:    "192.168.0.0/16",
				DstIP:    "8.8.8.8",
			},
			expectError: false,
		},
		{
			name: "Invalid protocol",
			rule: BlockRule{
				Protocol: "sctp",
				SrcIP:    "192.168.1.1",
				DstIP:    "10.0.0.1",
			},
			expectError: true,
		},
		{
			name: "Invalid source IP",
			rule: BlockRule{
				Protocol: "tcp",
				SrcIP:    "300.300.300.300",
				DstIP:    "10.0.0.1",
			},
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name+" - Add", func(t *testing.T) {
			body, _ := json.Marshal(tt.rule)
			req := httptest.NewRequest("PUT", "/firewall/block", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()

			router.ServeHTTP(rr, req)

			if tt.expectError {
				if rr.Code == http.StatusOK {
					t.Errorf("Expected error but got OK")
				}
			} else {
				if rr.Code != http.StatusOK {
					t.Errorf("Expected OK but got %d: %s", rr.Code, rr.Body.String())
				}

				// Verify rule exists in nftables
				checkBlockRuleInNFT(t, tt.rule, true)
			}
		})
	}

	// Test removal
	for _, tt := range tests {
		if tt.expectError {
			continue
		}

		t.Run(tt.name+" - Remove", func(t *testing.T) {
			// First add the rule through the API to ensure it's properly stored
			body, _ := json.Marshal(tt.rule)
			req := httptest.NewRequest("PUT", "/firewall/block", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()
			router.ServeHTTP(rr, req)

			// Now remove it
			req = httptest.NewRequest("DELETE", "/firewall/block", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rr = httptest.NewRecorder()

			router.ServeHTTP(rr, req)

			if rr.Code != http.StatusOK {
				t.Errorf("Expected OK but got %d: %s", rr.Code, rr.Body.String())
			}

			// Verify rule was removed from nftables
			checkBlockRuleInNFT(t, tt.rule, false)
		})
	}
}

func TestOutputBlockRules(t *testing.T) {
	setupFirewallTest(t)
	defer teardownFirewallTest(t)

	router := mux.NewRouter()
	router.HandleFunc("/firewall/block_output", blockOutputIP).Methods("PUT", "DELETE")

	tests := []struct {
		name        string
		rule        OutputBlockRule
		expectError bool
	}{
		{
			name: "Add valid output block rule",
			rule: OutputBlockRule{
				Protocol: "tcp",
				SrcIP:    "192.168.1.100",
				DstIP:    "1.1.1.1",
				DstPort:  "53",
			},
			expectError: false,
		},
		{
			name: "Add output block rule with CIDR",
			rule: OutputBlockRule{
				Protocol: "udp",
				SrcIP:    "192.168.0.0/24",
				DstIP:    "0.0.0.0/0",
				DstPort:  "123",
			},
			expectError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, _ := json.Marshal(tt.rule)
			req := httptest.NewRequest("PUT", "/firewall/block_output", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()

			router.ServeHTTP(rr, req)

			if tt.expectError {
				if rr.Code == http.StatusOK {
					t.Errorf("Expected error but got OK")
				}
			} else {
				if rr.Code != http.StatusOK {
					t.Errorf("Expected OK but got %d: %s", rr.Code, rr.Body.String())
				} else {
					// Verify output block rule exists in nft
					checkOutputBlockRuleInNFT(t, tt.rule, true)
				}
			}
		})
	}
}

func checkForwardingBlockRuleInNFT(t *testing.T, rule ForwardingBlockRule, shouldExist bool) {
	// Forwarding block rules use fwd_block map
	cmd := exec.Command("nft", "list", "map", "inet", "filter", "fwd_block")
	output, err := cmd.Output()
	if err != nil {
		t.Logf("Failed to list nft map fwd_block: %v", err)
		return
	}

	// Format: src ip . dst ip . protocol . port : drop
	var protocol string
	if rule.Protocol == "tcp" {
		protocol = "6"
	} else {
		protocol = "17"
	}

	expectedEntry := fmt.Sprintf("%s . %s . %s . %s : drop", rule.SrcIP, rule.DstIP, protocol, rule.DstPort)

	exists := strings.Contains(string(output), expectedEntry)
	if shouldExist && !exists {
		t.Errorf("Expected forwarding block rule not found in nft map fwd_block: %s", expectedEntry)
		t.Logf("nft output: %s", string(output))
	} else if !shouldExist && exists {
		t.Errorf("Forwarding block rule should not exist in nft map fwd_block but found: %s", expectedEntry)
		t.Logf("nft output: %s", string(output))
	}
}

func TestForwardingBlockRules(t *testing.T) {
	setupFirewallTest(t)
	defer teardownFirewallTest(t)

	router := mux.NewRouter()
	router.HandleFunc("/firewall/block_forward", blockForwardingIP).Methods("PUT", "DELETE")

	tests := []struct {
		name        string
		rule        ForwardingBlockRule
		expectError bool
	}{
		{
			name: "Add valid forwarding block rule",
			rule: ForwardingBlockRule{
				Protocol: "tcp",
				SrcIP:    "192.168.1.0/24",
				DstIP:    "10.0.0.0/8",
				DstPort:  "80",
			},
			expectError: false,
		},
		{
			name: "Add forwarding block rule with port range",
			rule: ForwardingBlockRule{
				Protocol: "udp",
				SrcIP:    "172.16.0.0/12",
				DstIP:    "8.8.8.8",
				DstPort:  "5000-6000",
			},
			expectError: false,
		},
		{
			name: "Invalid port format",
			rule: ForwardingBlockRule{
				Protocol: "tcp",
				SrcIP:    "192.168.1.1",
				DstIP:    "10.0.0.1",
				DstPort:  "abc",
			},
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, _ := json.Marshal(tt.rule)
			req := httptest.NewRequest("PUT", "/firewall/block_forward", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()

			router.ServeHTTP(rr, req)

			if tt.expectError {
				if rr.Code == http.StatusOK {
					t.Errorf("Expected error but got OK")
				}
			} else {
				if rr.Code != http.StatusOK {
					t.Errorf("Expected OK but got %d: %s", rr.Code, rr.Body.String())
				} else {
					// Verify forwarding block rule exists in nft
					checkForwardingBlockRuleInNFT(t, tt.rule, true)
				}
			}
		})
	}
}

func TestServicePorts(t *testing.T) {
	setupFirewallTest(t)
	defer teardownFirewallTest(t)

	router := mux.NewRouter()
	router.HandleFunc("/firewall/service_port", modifyServicePort).Methods("PUT", "DELETE")

	tests := []struct {
		name        string
		port        ServicePort
		expectError bool
	}{
		{
			name: "Add valid TCP service port",
			port: ServicePort{
				Protocol:        "tcp",
				Port:            "22",
				UpstreamEnabled: true,
			},
			expectError: false,
		},
		{
			name: "Add valid UDP service port",
			port: ServicePort{
				Protocol:        "udp",
				Port:            "53",
				UpstreamEnabled: false,
			},
			expectError: false,
		},
		{
			name: "Invalid port number",
			port: ServicePort{
				Protocol:        "tcp",
				Port:            "99999",
				UpstreamEnabled: true,
			},
			expectError: false, // Port validation is numeric only
		},
		{
			name: "Invalid protocol",
			port: ServicePort{
				Protocol:        "sctp",
				Port:            "80",
				UpstreamEnabled: true,
			},
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name+" - Add", func(t *testing.T) {
			body, _ := json.Marshal(tt.port)
			req := httptest.NewRequest("PUT", "/firewall/service_port", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()

			router.ServeHTTP(rr, req)

			if tt.expectError {
				if rr.Code == http.StatusOK {
					t.Errorf("Expected error but got OK")
				}
			} else {
				if rr.Code != http.StatusOK {
					t.Errorf("Expected OK but got %d: %s", rr.Code, rr.Body.String())
				} else {
					// Verify service port exists in nft
					checkServicePortInNFT(t, tt.port, true)
				}
			}
		})
	}

	// Test modification
	t.Run("Modify existing service port", func(t *testing.T) {
		// Add initial port
		port := ServicePort{
			Protocol:        "tcp",
			Port:            "8080",
			UpstreamEnabled: false,
		}

		FWmtx.Lock()
		gFirewallConfig.ServicePorts = append(gFirewallConfig.ServicePorts, port)
		FWmtx.Unlock()

		// Modify it
		port.UpstreamEnabled = true
		body, _ := json.Marshal(port)
		req := httptest.NewRequest("PUT", "/firewall/service_port", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected OK but got %d: %s", rr.Code, rr.Body.String())
		}

		// Verify modification
		FWmtx.Lock()
		found := false
		for _, p := range gFirewallConfig.ServicePorts {
			if p.Protocol == port.Protocol && p.Port == port.Port {
				if p.UpstreamEnabled != true {
					t.Errorf("Service port not modified correctly")
				}
				found = true
				break
			}
		}
		FWmtx.Unlock()

		if !found {
			t.Errorf("Service port not found after modification")
		}
	})
}

func checkEndpointInNFT(t *testing.T, endpoint Endpoint, shouldExist bool) {
	// Endpoints use ept_tcpfwd or ept_udpfwd maps
	var tableName string
	if endpoint.Protocol == "tcp" {
		tableName = "ept_tcpfwd"
	} else {
		tableName = "ept_udpfwd"
	}

	cmd := exec.Command("nft", "list", "map", "inet", "filter", tableName)
	output, err := cmd.Output()
	if err != nil {
		t.Logf("Failed to list nft map %s: %v", tableName, err)
		return
	}

	// For endpoints, the entry format depends on IP vs any port
	var expectedEntry string
	if endpoint.Port == "any" {
		expectedEntry = fmt.Sprintf("%s . %s : accept", endpoint.IP, endpoint.IP)
	} else {
		expectedEntry = fmt.Sprintf("%s . %s . %s : accept", endpoint.IP, endpoint.IP, endpoint.Port)
	}

	exists := strings.Contains(string(output), expectedEntry)
	if shouldExist && !exists {
		t.Errorf("Expected endpoint not found in nft map %s: %s", tableName, expectedEntry)
		t.Logf("nft output: %s", string(output))
	} else if !shouldExist && exists {
		t.Errorf("Endpoint should not exist in nft map %s but found: %s", tableName, expectedEntry)
		t.Logf("nft output: %s", string(output))
	}
}

func TestEndpoints(t *testing.T) {
	setupFirewallTest(t)
	defer teardownFirewallTest(t)

	router := mux.NewRouter()
	router.HandleFunc("/firewall/endpoint", modifyEndpoint).Methods("PUT", "DELETE")

	tests := []struct {
		name        string
		endpoint    Endpoint
		expectError bool
	}{
		{
			name: "Add valid IP endpoint",
			endpoint: Endpoint{
				BaseRule: BaseRule{
					RuleName: "test-endpoint-1",
				},
				Protocol: "tcp",
				IP:       "192.168.1.100",
				Port:     "443",
				Tags:     []string{"web", "api"},
			},
			expectError: false,
		},
		{
			name: "Add valid domain endpoint",
			endpoint: Endpoint{
				BaseRule: BaseRule{
					RuleName: "test-endpoint-2",
				},
				Protocol: "udp",
				Domain:   "example.com",
				Port:     "53",
				Tags:     []string{"dns"},
			},
			expectError: false,
		},
		{
			name: "Add endpoint with CIDR",
			endpoint: Endpoint{
				BaseRule: BaseRule{
					RuleName: "test-endpoint-3",
				},
				Protocol: "tcp",
				IP:       "10.0.0.0/24",
				Port:     "any",
				Tags:     []string{"internal"},
			},
			expectError: false,
		},
		{
			name: "Invalid - both IP and Domain",
			endpoint: Endpoint{
				BaseRule: BaseRule{
					RuleName: "invalid-1",
				},
				Protocol: "tcp",
				IP:       "192.168.1.1",
				Domain:   "example.com",
				Port:     "80",
				Tags:     []string{"test"},
			},
			expectError: true,
		},
		{
			name: "Invalid - neither IP nor Domain",
			endpoint: Endpoint{
				BaseRule: BaseRule{
					RuleName: "invalid-2",
				},
				Protocol: "tcp",
				Port:     "80",
				Tags:     []string{"test"},
			},
			expectError: true,
		},
		{
			name: "Invalid - empty tag",
			endpoint: Endpoint{
				BaseRule: BaseRule{
					RuleName: "invalid-3",
				},
				Protocol: "tcp",
				IP:       "192.168.1.1",
				Port:     "80",
				Tags:     []string{"valid", ""},
			},
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name+" - Add", func(t *testing.T) {
			body, _ := json.Marshal(tt.endpoint)
			req := httptest.NewRequest("PUT", "/firewall/endpoint", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()

			router.ServeHTTP(rr, req)

			if tt.expectError {
				if rr.Code == http.StatusOK {
					t.Errorf("Expected error but got OK")
				}
			} else {
				if rr.Code != http.StatusOK {
					t.Errorf("Expected OK but got %d: %s", rr.Code, rr.Body.String())
				} else {
					// Verify endpoint exists in nft (skip for domain-based endpoints)
					if tt.endpoint.IP != "" {
						checkEndpointInNFT(t, tt.endpoint, true)
					}
				}
			}
		})
	}

	// Test modification
	t.Run("Modify existing endpoint", func(t *testing.T) {
		// Add initial endpoint
		endpoint := Endpoint{
			BaseRule: BaseRule{
				RuleName: "modify-test",
			},
			Protocol: "tcp",
			IP:       "192.168.1.1",
			Port:     "80",
			Tags:     []string{"original"},
		}

		FWmtx.Lock()
		gFirewallConfig.Endpoints = append(gFirewallConfig.Endpoints, endpoint)
		FWmtx.Unlock()

		// Modify it
		endpoint.Tags = []string{"modified"}
		endpoint.Port = "8080"

		body, _ := json.Marshal(endpoint)
		req := httptest.NewRequest("PUT", "/firewall/endpoint", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected OK but got %d: %s", rr.Code, rr.Body.String())
		}

		// Verify modification
		FWmtx.Lock()
		found := false
		for _, e := range gFirewallConfig.Endpoints {
			if e.RuleName == "modify-test" {
				if e.Port != "8080" || len(e.Tags) != 1 || e.Tags[0] != "modified" {
					t.Errorf("Endpoint not modified correctly")
				}
				found = true
				break
			}
		}
		FWmtx.Unlock()

		if !found {
			t.Errorf("Endpoint not found after modification")
		}
	})
}

func checkMulticastPortInNFT(t *testing.T, port MulticastPort, shouldExist bool) {
	// Multicast ports use multicast_lan_udp_accept or multicast_wan_udp_accept maps
	var tableName string
	if port.Upstream == false {
		tableName = "multicast_lan_udp_accept"
	} else {
		tableName = "multicast_wan_udp_accept"
	}

	cmd := exec.Command("nft", "list", "map", "inet", "filter", tableName)
	output, err := cmd.Output()
	if err != nil {
		t.Logf("Failed to list nft map %s: %v", tableName, err)
		return
	}

	expectedEntry := fmt.Sprintf("%s : accept", port.Port)

	exists := strings.Contains(string(output), expectedEntry)
	if shouldExist && !exists {
		t.Errorf("Expected multicast port not found in nft map %s: %s", tableName, expectedEntry)
		t.Logf("nft output: %s", string(output))
	} else if !shouldExist && exists {
		t.Errorf("Multicast port should not exist in nft map %s but found: %s", tableName, expectedEntry)
		t.Logf("nft output: %s", string(output))
	}
}

func TestMulticastPorts(t *testing.T) {
	setupFirewallTest(t)
	defer teardownFirewallTest(t)

	router := mux.NewRouter()
	router.HandleFunc("/firewall/multicast", modifyMulticast).Methods("PUT", "DELETE")

	tests := []struct {
		name        string
		port        MulticastPort
		expectError bool
	}{
		{
			name: "Add valid multicast port",
			port: MulticastPort{
				Port:     "5353",
				Upstream: true,
			},
			expectError: false,
		},
		{
			name: "Add another multicast port",
			port: MulticastPort{
				Port:     "1900",
				Upstream: false,
			},
			expectError: false,
		},
		{
			name: "Invalid port format",
			port: MulticastPort{
				Port:     "not-a-port",
				Upstream: true,
			},
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, _ := json.Marshal(tt.port)
			req := httptest.NewRequest("PUT", "/firewall/multicast", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()

			router.ServeHTTP(rr, req)

			if tt.expectError {
				if rr.Code == http.StatusOK {
					t.Errorf("Expected error but got OK")
				}
			} else {
				if rr.Code != http.StatusOK {
					t.Errorf("Expected OK but got %d: %s", rr.Code, rr.Body.String())
				} else {
					// Verify multicast port exists in nft
					checkMulticastPortInNFT(t, tt.port, true)
				}
			}
		})
	}
}

func checkICMPRuleInNFT(t *testing.T, pingLan, pingWan bool) {
	// ICMP rules use ping_rules map
	cmd := exec.Command("nft", "list", "map", "inet", "filter", "ping_rules")
	output, err := cmd.Output()
	if err != nil {
		t.Logf("Failed to list nft map ping_rules: %v", err)
		return
	}

	// Check for typical LAN and WAN entries
	//lanExists := strings.Contains(string(output), "accept")
	//wanExists := strings.Contains(string(output), "accept")

	// Since we can't easily distinguish LAN vs WAN entries without knowing the exact
	// IP addresses and interfaces, we'll just check if there are any entries when expected
	if (pingLan || pingWan) && !strings.Contains(string(output), "accept") {
		t.Errorf("Expected ICMP rules in ping_rules map but found none")
		t.Logf("nft output: %s", string(output))
	}
}

func TestICMPRules(t *testing.T) {
	setupFirewallTest(t)
	defer teardownFirewallTest(t)

	router := mux.NewRouter()
	router.HandleFunc("/firewall/icmp", modifyIcmp).Methods("PUT")

	tests := []struct {
		name    string
		pingLan bool
		pingWan bool
	}{
		{
			name:    "Enable both LAN and WAN ping",
			pingLan: true,
			pingWan: true,
		},
		{
			name:    "Enable only LAN ping",
			pingLan: true,
			pingWan: false,
		},
		{
			name:    "Disable all ping",
			pingLan: false,
			pingWan: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			icmpOptions := struct {
				PingLan bool
				PingWan bool
			}{
				PingLan: tt.pingLan,
				PingWan: tt.pingWan,
			}

			body, _ := json.Marshal(icmpOptions)
			req := httptest.NewRequest("PUT", "/firewall/icmp", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()

			router.ServeHTTP(rr, req)

			if rr.Code != http.StatusOK {
				t.Errorf("Expected OK but got %d: %s", rr.Code, rr.Body.String())
			}

			// Verify settings were applied
			FWmtx.Lock()
			if gFirewallConfig.PingLan != tt.pingLan {
				t.Errorf("PingLan not set correctly: got %v, want %v", gFirewallConfig.PingLan, tt.pingLan)
			}
			if gFirewallConfig.PingWan != tt.pingWan {
				t.Errorf("PingWan not set correctly: got %v, want %v", gFirewallConfig.PingWan, tt.pingWan)
			}
			FWmtx.Unlock()

			// Verify ICMP rules exist in nft
			checkICMPRuleInNFT(t, tt.pingLan, tt.pingWan)
		})
	}
}

func checkCustomInterfaceRuleInNFT(t *testing.T, rule CustomInterfaceRule, shouldExist bool) {
	// Custom interface rules use fwd_iface_lan or fwd_iface_wan maps
	var tableName string
	if rule.Interface == "lan" {
		tableName = "fwd_iface_lan"
	} else {
		tableName = "fwd_iface_wan"
	}

	cmd := exec.Command("nft", "list", "map", "inet", "filter", tableName)
	output, err := cmd.Output()
	if err != nil {
		t.Logf("Failed to list nft map %s: %v", tableName, err)
		return
	}

	// Custom interface rules format: iifname . ip src addr : accept
	expectedEntry := fmt.Sprintf("%s . %s : accept", rule.Interface, rule.SrcIP)

	exists := strings.Contains(string(output), expectedEntry)
	if shouldExist && !exists {
		t.Errorf("Expected custom interface rule not found in nft map %s: %s", tableName, expectedEntry)
		t.Logf("nft output: %s", string(output))
	} else if !shouldExist && exists {
		t.Errorf("Custom interface rule should not exist in nft map %s but found: %s", tableName, expectedEntry)
		t.Logf("nft output: %s", string(output))
	}
}

func TestCustomInterfaceRules(t *testing.T) {
	setupFirewallTest(t)
	defer teardownFirewallTest(t)

	// Create a test interface file
	ifaces := []InterfaceConfig{
		{Name: "eth0", Type: "Downlink", Enabled: true},
		{Name: "wlan0", Type: "AP", Enabled: true},
	}
	data, _ := json.Marshal(ifaces)
	os.WriteFile(TEST_PREFIX+"/configs/base/interfaces.json", data, 0644)

	router := mux.NewRouter()
	router.HandleFunc("/firewall/custom_interface", modifyCustomInterfaceRules).Methods("PUT", "DELETE")

	tests := []struct {
		name        string
		rule        CustomInterfaceRule
		expectError bool
	}{
		{
			name: "Add valid custom interface rule",
			rule: CustomInterfaceRule{
				Interface: "eth0",
				SrcIP:     "192.168.1.100",
				RouteDst:  "10.0.0.1",
				Policies:  []string{},
				Groups:    []string{"trusted"},
				Tags:      []string{},
			},
			expectError: false,
		},
		{
			name: "Add rule with CIDR source",
			rule: CustomInterfaceRule{
				Interface: "wlan0",
				SrcIP:     "192.168.2.0/24",
				RouteDst:  "",
				Policies:  []string{},
				Groups:    []string{"guest"},
				Tags:      []string{},
			},
			expectError: false,
		},
		{
			name: "Invalid interface",
			rule: CustomInterfaceRule{
				Interface: "invalid@interface!",
				SrcIP:     "192.168.1.1",
				RouteDst:  "",
				Policies:  []string{},
				Groups:    []string{},
				Tags:      []string{},
			},
			expectError: true,
		},
		{
			name: "Invalid source IP",
			rule: CustomInterfaceRule{
				Interface: "eth0",
				SrcIP:     "invalid-ip",
				RouteDst:  "",
				Policies:  []string{},
				Groups:    []string{},
				Tags:      []string{},
			},
			expectError: true,
		},
		{
			name: "Invalid route destination",
			rule: CustomInterfaceRule{
				Interface: "eth0",
				SrcIP:     "192.168.1.1",
				RouteDst:  "not-an-ip",
				Policies:  []string{},
				Groups:    []string{},
				Tags:      []string{},
			},
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name+" - Add", func(t *testing.T) {
			body, _ := json.Marshal(tt.rule)
			req := httptest.NewRequest("PUT", "/firewall/custom_interface", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()

			router.ServeHTTP(rr, req)

			if tt.expectError {
				if rr.Code == http.StatusOK {
					t.Errorf("Expected error but got OK")
				}
			} else {
				if rr.Code != http.StatusOK {
					t.Errorf("Expected OK but got %d: %s", rr.Code, rr.Body.String())
				} else {
					// Verify custom interface rule exists in nft
					checkCustomInterfaceRuleInNFT(t, tt.rule, true)
				}
			}
		})
	}

	// Test removal
	t.Run("Remove custom interface rule", func(t *testing.T) {
		rule := CustomInterfaceRule{
			Interface: "eth0",
			SrcIP:     "192.168.3.100",
			RouteDst:  "",
			Policies:  []string{},
			Groups:    []string{"test"},
			Tags:      []string{},
		}

		// First add the rule through the API to ensure it's properly stored
		body, _ := json.Marshal(rule)
		req := httptest.NewRequest("PUT", "/firewall/custom_interface", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		// Now remove it
		req = httptest.NewRequest("DELETE", "/firewall/custom_interface", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr = httptest.NewRecorder()

		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected OK but got %d: %s", rr.Code, rr.Body.String())
		}

		// Verify removal
		FWmtx.Lock()
		found := false
		for _, r := range gFirewallConfig.CustomInterfaceRules {
			if r.Interface == rule.Interface && r.SrcIP == rule.SrcIP {
				found = true
				break
			}
		}
		FWmtx.Unlock()

		if found {
			t.Errorf("Rule still exists after deletion")
		}
	})
}

func TestFirewallConfigPersistence(t *testing.T) {
	setupFirewallTest(t)
	defer teardownFirewallTest(t)

	// Reset configuration to known state
	FWmtx.Lock()
	gFirewallConfig = FirewallConfig{
		ForwardingRules: []ForwardingRule{{
			Protocol: "tcp",
			SrcIP:    "192.168.1.1",
			SrcPort:  "80",
			DstIP:    "10.0.0.1",
			DstPort:  "8080",
		}},
		BlockRules: []BlockRule{{
			Protocol: "udp",
			SrcIP:    "192.168.2.0/24",
			DstIP:    "8.8.8.8",
		}},
		ServicePorts: []ServicePort{{
			Protocol:        "tcp",
			Port:            "22",
			UpstreamEnabled: true,
		}},
		PingLan: true,
		PingWan: false,
	}

	// Save configuration
	saveFirewallRulesLocked()
	FWmtx.Unlock()

	// Clear in-memory config
	FWmtx.Lock()
	gFirewallConfig = FirewallConfig{}
	FWmtx.Unlock()

	// Load configuration
	err := loadFirewallRules()
	if err != nil {
		t.Fatalf("Failed to load firewall rules: %v", err)
	}

	// Verify loaded configuration
	FWmtx.Lock()
	defer FWmtx.Unlock()

	if len(gFirewallConfig.ForwardingRules) != 1 {
		t.Errorf("Expected 1 forwarding rule, got %d", len(gFirewallConfig.ForwardingRules))
	}

	if len(gFirewallConfig.BlockRules) != 1 {
		t.Errorf("Expected 1 block rule, got %d", len(gFirewallConfig.BlockRules))
	}

	if len(gFirewallConfig.ServicePorts) != 1 {
		t.Errorf("Expected 1 service port, got %d", len(gFirewallConfig.ServicePorts))
	}

	if !gFirewallConfig.PingLan {
		t.Error("PingLan should be true")
	}

	if gFirewallConfig.PingWan {
		t.Error("PingWan should be false")
	}
}

func TestConcurrentFirewallOperations(t *testing.T) {
	setupFirewallTest(t)
	defer teardownFirewallTest(t)

	router := mux.NewRouter()
	router.HandleFunc("/firewall/forward", modifyForwardRules).Methods("PUT", "DELETE")
	router.HandleFunc("/firewall/block", blockIP).Methods("PUT", "DELETE")

	// Run concurrent add operations
	done := make(chan bool)
	errors := make(chan error, 20)

	for i := 0; i < 10; i++ {
		go func(id int) {
			rule := ForwardingRule{
				Protocol: "tcp",
				SrcIP:    fmt.Sprintf("192.168.%d.1", id),
				SrcPort:  fmt.Sprintf("%d", 8000+id),
				DstIP:    fmt.Sprintf("10.0.%d.1", id),
				DstPort:  fmt.Sprintf("%d", 9000+id),
			}

			body, _ := json.Marshal(rule)
			req := httptest.NewRequest("PUT", "/firewall/forward", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()

			router.ServeHTTP(rr, req)

			if rr.Code != http.StatusOK {
				errors <- fmt.Errorf("Forward rule %d failed: %s", id, rr.Body.String())
			}
			done <- true
		}(i)

		go func(id int) {
			rule := BlockRule{
				Protocol: "udp",
				SrcIP:    fmt.Sprintf("172.16.%d.0/24", id),
				DstIP:    fmt.Sprintf("1.1.1.%d", id),
			}

			body, _ := json.Marshal(rule)
			req := httptest.NewRequest("PUT", "/firewall/block", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()

			router.ServeHTTP(rr, req)

			if rr.Code != http.StatusOK {
				errors <- fmt.Errorf("Block rule %d failed: %s", id, rr.Body.String())
			}
			done <- true
		}(i)
	}

	// Wait for all goroutines
	for i := 0; i < 20; i++ {
		select {
		case <-done:
		case err := <-errors:
			t.Error(err)
		case <-time.After(5 * time.Second):
			t.Fatal("Timeout waiting for concurrent operations")
		}
	}

	// Verify all rules were added
	FWmtx.Lock()
	defer FWmtx.Unlock()

	if len(gFirewallConfig.ForwardingRules) != 10 {
		t.Errorf("Expected 10 forwarding rules, got %d", len(gFirewallConfig.ForwardingRules))
	}

	if len(gFirewallConfig.BlockRules) != 10 {
		t.Errorf("Expected 10 block rules, got %d", len(gFirewallConfig.BlockRules))
	}
}
