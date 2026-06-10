package main

import (
	"bytes"
	"os/exec"
	"strings"
	"testing"
)

func TestGetTable(t *testing.T) {
	// Initialize the NFT client
	client := NewNFTClient()

	// GetTable is get-or-create, so asserting on its return value alone proves
	// nothing. For existing tables, first confirm the table is really in the
	// kernel (so GetTable exercises its lookup path), then check the handle.
	tests := []struct {
		name      string
		family    TableFamily
		familyStr string
		tableName string
	}{
		{
			name:      "Get inet filter table",
			family:    TableFamilyInet,
			familyStr: "inet",
			tableName: "filter",
		},
		{
			name:      "Get inet nat table",
			family:    TableFamilyInet,
			familyStr: "inet",
			tableName: "nat",
		},
		{
			name:      "Get inet mangle table",
			family:    TableFamilyInet,
			familyStr: "inet",
			tableName: "mangle",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := CheckTableExists(tt.familyStr, tt.tableName); err != nil {
				t.Fatalf("fixture table %s %s missing from kernel: %v", tt.familyStr, tt.tableName, err)
			}

			table := client.GetTable(tt.family, tt.tableName)
			if table == nil {
				t.Fatalf("GetTable() returned nil for %s %s", familyToString(tt.family), tt.tableName)
			}
			if table.Name != tt.tableName {
				t.Errorf("Table name mismatch: got %s, want %s", table.Name, tt.tableName)
			}
			if uint32(table.Family) != uint32(tt.family) {
				t.Errorf("Table family mismatch: got %d, want %d", table.Family, tt.family)
			}
		})
	}

	// GetTable on a missing table queues an AddTable on the connection; it only
	// reaches the kernel on the next Flush. Verify that get-or-create behavior
	// explicitly, with cleanup.
	t.Run("get-or-create on missing table", func(t *testing.T) {
		const tmpTable = "test_getorcreate"
		_ = exec.Command("nft", "delete", "table", "ip", tmpTable).Run()
		if err := CheckTableExists("ip", tmpTable); err == nil {
			t.Fatalf("table ip %s unexpectedly exists before GetTable", tmpTable)
		}

		table := client.GetTable(TableFamilyIP, tmpTable)
		if table == nil {
			t.Fatal("GetTable() returned nil for missing table, want created handle")
		}
		if err := client.conn.Flush(); err != nil {
			t.Fatalf("Flush() after GetTable error = %v", err)
		}
		t.Cleanup(func() { _ = exec.Command("nft", "delete", "table", "ip", tmpTable).Run() })

		if err := CheckTableExists("ip", tmpTable); err != nil {
			t.Errorf("GetTable did not create missing table after Flush: %v", err)
		}
	})
}

func TestListTables(t *testing.T) {
	client := NewNFTClient()

	// Test listing tables
	jsonData, err := client.ListTables()
	if err != nil {
		t.Fatalf("ListTables() error = %v", err)
	}

	if len(jsonData) == 0 {
		t.Error("ListTables() returned empty data")
	}

	// The JSON should be valid and contain nftables structure
	// We can add more detailed JSON parsing tests here if needed
}

func TestCheckTableExists(t *testing.T) {
	tests := []struct {
		name        string
		family      string
		tableName   string
		shouldExist bool
	}{
		{
			name:        "Check existing inet filter table",
			family:      "inet",
			tableName:   "filter",
			shouldExist: true,
		},
		{
			name:        "Check existing inet nat table",
			family:      "inet",
			tableName:   "nat",
			shouldExist: true,
		},
		{
			name:        "Check non-existent table",
			family:      "inet",
			tableName:   "nonexistent",
			shouldExist: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := CheckTableExists(tt.family, tt.tableName)
			if tt.shouldExist && err != nil {
				t.Errorf("CheckTableExists() error = %v, table %s %s should exist", err, tt.family, tt.tableName)
			} else if !tt.shouldExist && err == nil {
				t.Errorf("CheckTableExists() should have returned error for non-existent table %s %s", tt.family, tt.tableName)
			}
		})
	}
}

func TestIPToBytes(t *testing.T) {
	tests := []struct {
		name        string
		ip          string
		expected    []byte
		shouldBeNil bool
	}{
		{
			name:        "Valid IPv4",
			ip:          "192.168.1.1",
			expected:    []byte{192, 168, 1, 1},
			shouldBeNil: false,
		},
		{
			name:        "Invalid IP",
			ip:          "not.an.ip",
			expected:    nil,
			shouldBeNil: true,
		},
		{
			name:        "Empty string",
			ip:          "",
			expected:    nil,
			shouldBeNil: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := IPToBytes(tt.ip)
			if tt.shouldBeNil {
				if result != nil {
					t.Errorf("IPToBytes(%s) = %v, want nil", tt.ip, result)
				}
			} else {
				if len(result) != len(tt.expected) {
					t.Errorf("IPToBytes(%s) = %v, want %v", tt.ip, result, tt.expected)
				}
				for i := range result {
					if result[i] != tt.expected[i] {
						t.Errorf("IPToBytes(%s) = %v, want %v", tt.ip, result, tt.expected)
						break
					}
				}
			}
		})
	}
}

func TestPortToBytes(t *testing.T) {
	tests := []struct {
		name        string
		port        string
		expected    []byte
		shouldBeNil bool
	}{
		{
			name:        "Valid port 80",
			port:        "80",
			expected:    []byte{0, 80},
			shouldBeNil: false,
		},
		{
			name:        "Valid port 8080",
			port:        "8080",
			expected:    []byte{31, 144}, // 8080 = 0x1F90
			shouldBeNil: false,
		},
		{
			name:        "Invalid port",
			port:        "not-a-port",
			expected:    nil,
			shouldBeNil: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := PortToBytes(tt.port)
			if tt.shouldBeNil {
				if result != nil {
					t.Errorf("PortToBytes(%s) = %v, want nil", tt.port, result)
				}
			} else {
				if len(result) != 2 {
					t.Errorf("PortToBytes(%s) = %v, want length 2", tt.port, result)
				} else if result[0] != tt.expected[0] || result[1] != tt.expected[1] {
					t.Errorf("PortToBytes(%s) = %v, want %v", tt.port, result, tt.expected)
				}
			}
		})
	}
}

func TestProtocolToBytes(t *testing.T) {
	tests := []struct {
		name     string
		protocol string
		expected []byte
	}{
		{
			name:     "TCP",
			protocol: "tcp",
			expected: []byte{6},
		},
		{
			name:     "UDP",
			protocol: "udp",
			expected: []byte{17},
		},
		{
			name:     "ICMP",
			protocol: "icmp",
			expected: []byte{1},
		},
		{
			name:     "Numeric protocol",
			protocol: "50",
			expected: []byte{50},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ProtocolToBytes(tt.protocol)
			if len(result) != 1 || result[0] != tt.expected[0] {
				t.Errorf("ProtocolToBytes(%s) = %v, want %v", tt.protocol, result, tt.expected)
			}
		})
	}
}

func TestInterfaceToBytes(t *testing.T) {
	tests := []struct {
		name     string
		iface    string
		expected string
	}{
		{
			name:     "Short interface name",
			iface:    "eth0",
			expected: "eth0",
		},
		{
			name:     "Long interface name",
			iface:    "enp0s31f6",
			expected: "enp0s31f6",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := InterfaceToBytes(tt.iface)
			if len(result) != 16 {
				t.Errorf("InterfaceToBytes(%s) length = %d, want 16", tt.iface, len(result))
			}
			// Check that the interface name is at the beginning
			for i := 0; i < len(tt.expected); i++ {
				if result[i] != tt.expected[i] {
					t.Errorf("InterfaceToBytes(%s) = %v, expected %s at beginning", tt.iface, result, tt.expected)
					break
				}
			}
			// Check that the rest is padded with zeros
			for i := len(tt.expected); i < 16; i++ {
				if result[i] != 0 {
					t.Errorf("InterfaceToBytes(%s) padding not zero at position %d", tt.iface, i)
				}
			}
		})
	}
}

func TestVerdictToBytes(t *testing.T) {
	tests := []struct {
		name      string
		verdict   string
		wantBytes []byte
		wantErr   bool
	}{
		{
			name:      "Accept verdict",
			verdict:   "accept",
			wantBytes: []byte{0, 0, 0, 1}, // VerdictAccept = 1
			wantErr:   false,
		},
		{
			name:      "Drop verdict",
			verdict:   "drop",
			wantBytes: []byte{0, 0, 0, 0}, // VerdictDrop = 0
			wantErr:   false,
		},
		{
			name:      "Continue verdict",
			verdict:   "continue",
			wantBytes: []byte{255, 255, 255, 255}, // VerdictContinue = -1
			wantErr:   false,
		},
		{
			name:      "Return verdict",
			verdict:   "return",
			wantBytes: []byte{255, 255, 255, 251}, // VerdictReturn = -5
			wantErr:   false,
		},
		{
			name:      "Jump verdict",
			verdict:   "jump",
			wantBytes: []byte{255, 255, 255, 253}, // VerdictJump = -3
			wantErr:   false,
		},
		{
			name:      "Unknown verdict returns error",
			verdict:   "unknown",
			wantBytes: nil,
			wantErr:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := VerdictToBytes(tt.verdict)
			if (err != nil) != tt.wantErr {
				t.Errorf("VerdictToBytes(%s) error = %v, wantErr %v", tt.verdict, err, tt.wantErr)
				return
			}
			if !tt.wantErr && !bytes.Equal(result, tt.wantBytes) {
				t.Errorf("VerdictToBytes(%s) = %v, want %v", tt.verdict, result, tt.wantBytes)
			}
		})
	}
}

func TestAddForwardingRule(t *testing.T) {
	// Initialize the client
	InitNFTClient()

	// First, let's check if the map exists
	client := GetNFTClient()
	tcpMap, err := client.GetMap(TableFamilyInet, "nat", "tcpfwd")
	if err != nil {
		t.Logf("Failed to get tcpfwd map: %v", err)
	} else {
		t.Logf("tcpfwd map found: KeyType=%v, DataType=%v, IsMap=%v", tcpMap.KeyType, tcpMap.DataType, tcpMap.IsMap)
		t.Logf("tcpfwd map details: Constant=%v, Interval=%v, Anonymous=%v", tcpMap.Constant, tcpMap.Interval, tcpMap.Anonymous)
	}

	tests := []struct {
		name     string
		protocol string
		srcIP    string
		srcPort  string
		dstIP    string
		dstPort  string
		wantErr  bool
	}{
		{
			name:     "Add TCP forwarding rule",
			protocol: "tcp",
			srcIP:    "192.168.1.100",
			srcPort:  "80",
			dstIP:    "10.0.0.100",
			dstPort:  "8080",
			wantErr:  false,
		},
		{
			name:     "Add UDP forwarding rule",
			protocol: "udp",
			srcIP:    "192.168.1.100",
			srcPort:  "53",
			dstIP:    "10.0.0.100",
			dstPort:  "5353",
			wantErr:  false,
		},
		{
			name:     "Add TCP any port forwarding rule",
			protocol: "tcp",
			srcIP:    "192.168.1.100",
			srcPort:  "any",
			dstIP:    "10.0.0.100",
			dstPort:  "any",
			wantErr:  false,
		},
		{
			name:     "Add UDP any port forwarding rule",
			protocol: "udp",
			srcIP:    "192.168.1.100",
			srcPort:  "any",
			dstIP:    "10.0.0.100",
			dstPort:  "any",
			wantErr:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := AddForwardingRule(tt.protocol, tt.srcIP, tt.srcPort, tt.dstIP, tt.dstPort)
			if (err != nil) != tt.wantErr {
				t.Errorf("AddForwardingRule() error = %v, wantErr %v", err, tt.wantErr)
			}

			// Clean up after test
			if err == nil {
				// Delete the rule we just added
				_ = DeleteForwardingRule(tt.protocol, tt.srcIP, tt.srcPort, tt.dstIP, tt.dstPort)
			}
		})
	}
}

func TestDeleteForwardingRule(t *testing.T) {
	// Initialize the client
	InitNFTClient()

	tests := []struct {
		name     string
		protocol string
		srcIP    string
		srcPort  string
		dstIP    string
		dstPort  string
	}{
		{
			name:     "Delete TCP forwarding rule",
			protocol: "tcp",
			srcIP:    "192.168.1.200",
			srcPort:  "80",
			dstIP:    "10.0.0.200",
			dstPort:  "8080",
		},
		{
			name:     "Delete UDP forwarding rule",
			protocol: "udp",
			srcIP:    "192.168.1.200",
			srcPort:  "53",
			dstIP:    "10.0.0.200",
			dstPort:  "5353",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// The port-specific forwarding rules live in inet nat tcpfwd/udpfwd.
			mapName := tt.protocol + "fwd"
			listMap := func() string {
				out, err := exec.Command("nft", "list", "map", "inet", "nat", mapName).CombinedOutput()
				if err != nil {
					t.Fatalf("nft list map inet nat %s: %v\n%s", mapName, err, out)
				}
				return string(out)
			}

			// First add the rule and confirm it landed in the kernel.
			err := AddForwardingRule(tt.protocol, tt.srcIP, tt.srcPort, tt.dstIP, tt.dstPort)
			if err != nil {
				t.Fatalf("Failed to add rule before deletion test: %v", err)
			}
			t.Cleanup(func() {
				_ = exec.Command("nft", "delete", "element", "inet", "nat", mapName,
					"{", tt.srcIP, ".", tt.srcPort, "}").Run()
			})
			if !strings.Contains(listMap(), tt.srcIP) {
				t.Fatalf("forwarding rule for %s not present in %s after add", tt.srcIP, mapName)
			}

			// Now delete it. The google/nftables library has a known issue with
			// GetSets for concatenated types which can surface as "conn.Receive:
			// netlink receive: invalid argument" even when the delete succeeded,
			// so the error alone is not trusted either way - the kernel state
			// check below is authoritative.
			err = DeleteForwardingRule(tt.protocol, tt.srcIP, tt.srcPort, tt.dstIP, tt.dstPort)
			if err != nil {
				if strings.Contains(err.Error(), "conn.Receive: netlink receive: invalid argument") {
					t.Logf("Known google/nftables concatenated type error: %v", err)
				} else {
					t.Errorf("DeleteForwardingRule() unexpected error = %v", err)
				}
			}

			if strings.Contains(listMap(), tt.srcIP) {
				t.Errorf("forwarding rule for %s still present in %s after DeleteForwardingRule", tt.srcIP, mapName)
			}
		})
	}
}

func TestAddBlockRule(t *testing.T) {
	// Initialize the client
	InitNFTClient()

	tests := []struct {
		name     string
		srcIP    string
		dstIP    string
		protocol string
		wantErr  bool
	}{
		{
			name:     "Add TCP block rule",
			srcIP:    "192.168.1.50",
			dstIP:    "8.8.8.8",
			protocol: "tcp",
			wantErr:  false,
		},
		{
			name:     "Add UDP block rule",
			srcIP:    "192.168.1.51",
			dstIP:    "8.8.8.8",
			protocol: "udp",
			wantErr:  false,
		},
		{
			name:     "Add ICMP block rule",
			srcIP:    "192.168.1.52",
			dstIP:    "8.8.8.8",
			protocol: "icmp",
			wantErr:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := AddBlockRule(tt.srcIP, tt.dstIP, tt.protocol)
			if (err != nil) != tt.wantErr {
				t.Errorf("AddBlockRule() error = %v, wantErr %v", err, tt.wantErr)
			}

			// Clean up after test
			if err == nil {
				_ = DeleteBlockRule(tt.srcIP, tt.dstIP, tt.protocol)
			}
		})
	}
}

func TestAddServicePort(t *testing.T) {
	// Initialize the client
	InitNFTClient()

	tests := []struct {
		name     string
		protocol string
		port     string
		upstream bool
		wantErr  bool
	}{
		{
			name:     "Add LAN TCP service port",
			protocol: "tcp",
			port:     "8080",
			upstream: false,
			wantErr:  false,
		},
		{
			name:     "Add WAN TCP service port",
			protocol: "tcp",
			port:     "443",
			upstream: true,
			wantErr:  false,
		},
		{
			name:     "Add LAN UDP service port",
			protocol: "udp",
			port:     "5353",
			upstream: false,
			wantErr:  false,
		},
		{
			name:     "Add WAN UDP service port",
			protocol: "udp",
			port:     "1194",
			upstream: true,
			wantErr:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := AddServicePort(tt.protocol, tt.port, tt.upstream)
			if (err != nil) != tt.wantErr {
				t.Errorf("AddServicePort() error = %v, wantErr %v", err, tt.wantErr)
			}

			// Clean up after test
			if err == nil {
				_ = DeleteServicePort(tt.protocol, tt.port, tt.upstream)
			}
		})
	}
}

func TestAddVmap(t *testing.T) {
	InitNFTClient()

	// Test 1: Simple verdict map
	err := AddPortVerdictToMap("inet", "filter", "lan_tcp_accept", "4040", "accept")
	if err != nil {
		t.Fatalf("AddPortVerdictToMap() error = %v", err)
	}
	t.Cleanup(func() { _ = DeletePortFromMap("inet", "filter", "lan_tcp_accept", "4040") })

	// Verify the element was added
	client := GetNFTClient()
	if err := client.GetMapElement(TableFamilyInet, "filter", "lan_tcp_accept", PortToBytes("4040")); err != nil {
		t.Errorf("GetMapElement() error = %v, element should exist after AddPortVerdictToMap", err)
	}

	// Test 2: A simple non-verdict map
	t.Run("tcpanyfwd", func(t *testing.T) {
		// This map is ipv4_addr : ipv4_addr (no concatenation)
		err := AddForwardingRule("tcp", "192.168.1.50", "any", "10.0.0.50", "any")
		if err != nil {
			t.Fatalf("AddForwardingRule(any) failed: %v", err)
		}
		t.Cleanup(func() { _ = DeleteForwardingRule("tcp", "192.168.1.50", "any", "10.0.0.50", "any") })

		out, err := exec.Command("nft", "list", "map", "inet", "nat", "tcpanyfwd").CombinedOutput()
		if err != nil {
			t.Fatalf("nft list map inet nat tcpanyfwd: %v\n%s", err, out)
		}
		if !strings.Contains(string(out), "192.168.1.50") {
			t.Errorf("forwarding entry not found in tcpanyfwd after AddForwardingRule:\n%s", out)
		}
	})
}

func TestInterfaceRanges(t *testing.T) {
	InitNFTClient()

	// Test adding multiple entries to an interval map to ensure they don't create ranges
	t.Run("dns_access_no_ranges", func(t *testing.T) {
		// Debug key construction first
		ip1 := IPToBytes("192.168.1.100")
		iface1 := InterfaceToBytes("eth0")
		key1 := append(ip1, iface1...)

		ip2 := IPToBytes("192.168.1.101")
		iface2 := InterfaceToBytes("eth1")
		key2 := append(ip2, iface2...)

		t.Logf("Key 1: %v (len=%d)", key1, len(key1))
		t.Logf("Key 2: %v (len=%d)", key2, len(key2))
		t.Logf("IP1: %v, Iface1: %v", ip1, iface1)
		t.Logf("IP2: %v, Iface2: %v", ip2, iface2)

		// Test with consecutive IPs (the problem case)
		// Try adding them with some separation to see if timing affects merging
		err1 := AddIPIfaceVerdictElement("inet", "filter", "dns_access", "192.168.1.100", "eth0", "accept")
		if err1 != nil {
			t.Fatalf("Failed to add first entry: %v", err1)
		}
		t.Cleanup(func() {
			_ = DeleteElementFromMapComplex("inet", "filter", "dns_access", []string{"192.168.1.100", "eth0"})
			_ = DeleteElementFromMapComplex("inet", "filter", "dns_access", []string{"192.168.1.101", "eth1"})
		})

		// Check intermediate state
		cmd := exec.Command("nft", "list", "map", "inet", "filter", "dns_access")
		output, _ := cmd.Output()
		t.Logf("After first element:\n%s", string(output))

		err2 := AddIPIfaceVerdictElement("inet", "filter", "dns_access", "192.168.1.101", "eth1", "accept")

		if err2 != nil {
			t.Fatalf("Failed to add second entry: %v", err2)
		}

		// Check the actual nftables output
		cmd2 := exec.Command("nft", "list", "map", "inet", "filter", "dns_access")
		output2, err := cmd2.Output()
		if err != nil {
			t.Fatalf("Failed to list map: %v", err)
		}

		mapOutput := string(output2)
		t.Logf("Consecutive IPs dns_access map contents:\n%s", mapOutput)

		// Check for unexpected ranges. The historical bug created open-ended IP
		// ranges (e.g. 192.168.1.100-255.255.255.255) when single IPs were added
		// to interval maps, so the IP-range checks are the important ones.
		if strings.Contains(mapOutput, "192.168.1.100-") || strings.Contains(mapOutput, "192.168.1.101-") {
			t.Error("Unexpected IP range found in map - single IPs should not become interval starts")
		}
		if strings.Contains(mapOutput, "-255.255.255.255") {
			t.Error("Open-ended IP range found in map - interval encoding regression")
		}
		if strings.Contains(mapOutput, "eth0\"-\"eth1") || strings.Contains(mapOutput, "\"eth0\"-\"eth1\"") {
			t.Error("Unexpected interface range found in map - interfaces should be individual entries")
		}
	})

	// Test with non-consecutive IPs to see if interval merging still happens
	t.Run("dns_access_non_consecutive", func(t *testing.T) {
		// Use non-consecutive IPs and different interfaces
		err1 := AddIPIfaceVerdictElement("inet", "filter", "dns_access", "192.168.5.50", "wlan0", "accept")
		err2 := AddIPIfaceVerdictElement("inet", "filter", "dns_access", "10.0.0.25", "docker0", "accept")
		t.Cleanup(func() {
			_ = DeleteElementFromMapComplex("inet", "filter", "dns_access", []string{"192.168.5.50", "wlan0"})
			_ = DeleteElementFromMapComplex("inet", "filter", "dns_access", []string{"10.0.0.25", "docker0"})
		})

		if err1 != nil {
			t.Fatalf("Failed to add first non-consecutive entry: %v", err1)
		}
		if err2 != nil {
			t.Fatalf("Failed to add second non-consecutive entry: %v", err2)
		}

		// Check the actual nftables output
		cmd := exec.Command("nft", "list", "map", "inet", "filter", "dns_access")
		output, err := cmd.Output()
		if err != nil {
			t.Fatalf("Failed to list map: %v", err)
		}

		mapOutput := string(output)
		t.Logf("Non-consecutive IPs dns_access map contents:\n%s", mapOutput)

		// These should definitely be separate entries
		if !strings.Contains(mapOutput, "192.168.5.50") {
			t.Error("First non-consecutive IP entry not found in map")
		}
		if !strings.Contains(mapOutput, "10.0.0.25") {
			t.Error("Second non-consecutive IP entry not found in map")
		}
		if !strings.Contains(mapOutput, "wlan0") {
			t.Error("wlan0 interface not found in map")
		}
		if !strings.Contains(mapOutput, "docker0") {
			t.Error("docker0 interface not found in map")
		}
	})

	// Test non-interval maps should definitely not create ranges
	t.Run("ethernet_filter_no_ranges", func(t *testing.T) {
		// Add two entries to ethernet_filter (which does NOT have flags interval)
		err1 := AddMACVerdictElement("inet", "filter", "ethernet_filter", "192.168.1.100", "eth0", "aa:bb:cc:dd:ee:01", "accept")
		err2 := AddMACVerdictElement("inet", "filter", "ethernet_filter", "192.168.1.101", "eth1", "aa:bb:cc:dd:ee:02", "accept")
		t.Cleanup(func() {
			_ = DeleteMACVerdictElement("inet", "filter", "ethernet_filter", "192.168.1.100", "eth0", "aa:bb:cc:dd:ee:01", "accept")
			_ = DeleteMACVerdictElement("inet", "filter", "ethernet_filter", "192.168.1.101", "eth1", "aa:bb:cc:dd:ee:02", "accept")
		})

		if err1 != nil {
			t.Fatalf("Failed to add first ethernet_filter entry: %v", err1)
		}
		if err2 != nil {
			t.Fatalf("Failed to add second ethernet_filter entry: %v", err2)
		}

		// Check the actual nftables output
		cmd := exec.Command("nft", "list", "map", "inet", "filter", "ethernet_filter")
		output, err := cmd.Output()
		if err != nil {
			t.Fatalf("Failed to list ethernet_filter map: %v", err)
		}

		mapOutput := string(output)
		t.Logf("ethernet_filter map contents:\n%s", mapOutput)

		// Verify individual entries exist
		if !strings.Contains(mapOutput, "192.168.1.100") {
			t.Error("First IP entry not found in ethernet_filter map")
		}
		if !strings.Contains(mapOutput, "192.168.1.101") {
			t.Error("Second IP entry not found in ethernet_filter map")
		}
		if !strings.Contains(mapOutput, "aa:bb:cc:dd:ee:01") {
			t.Error("First MAC entry not found in ethernet_filter map")
		}
		if !strings.Contains(mapOutput, "aa:bb:cc:dd:ee:02") {
			t.Error("Second MAC entry not found in ethernet_filter map")
		}

		// ethernet_filter should NEVER have ranges since it lacks flags interval
		if strings.Contains(mapOutput, "eth0\"-\"eth1") || strings.Contains(mapOutput, "\"eth0\"-\"eth1\"") {
			t.Error("Unexpected interface range found in ethernet_filter - non-interval maps should never create ranges")
		}
		if strings.Contains(mapOutput, "192.168.1.100-192.168.1.101") {
			t.Error("Unexpected IP range found in ethernet_filter - non-interval maps should never create ranges")
		}
	})
}

func TestUpstreamPrivateRFC1918(t *testing.T) {
	InitNFTClient()

	tests := []struct {
		name    string
		ip      string
		wantErr bool
	}{
		{
			name:    "Add private IP 10.0.0.1",
			ip:      "10.0.0.1",
			wantErr: false,
		},
		{
			name:    "Add private IP 172.16.0.1",
			ip:      "172.16.0.1",
			wantErr: false,
		},
		{
			name:    "Add private IP 192.168.1.1",
			ip:      "192.168.1.1",
			wantErr: false,
		},
		{
			name:    "Add invalid IP",
			ip:      "not.an.ip",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Test adding IP with verdict
			err := AddIPVerdictToMap("inet", "filter", "upstream_private_rfc1918_allowed", tt.ip, "return")
			if (err != nil) != tt.wantErr {
				t.Errorf("AddIPVerdictToMap() error = %v, wantErr %v", err, tt.wantErr)
			}

			if err == nil {
				// Test checking if IP exists
				checkErr := GetIPFromMap("inet", "filter", "upstream_private_rfc1918_allowed", tt.ip)
				if checkErr != nil {
					t.Errorf("GetIPFromMap() error = %v, IP should exist after adding", checkErr)
				}

				// Test deleting IP
				delErr := DeleteIPFromMap("inet", "filter", "upstream_private_rfc1918_allowed", tt.ip)
				if delErr != nil {
					t.Errorf("DeleteIPFromMap() error = %v", delErr)
				}

				// Verify IP was deleted
				checkErr2 := GetIPFromMap("inet", "filter", "upstream_private_rfc1918_allowed", tt.ip)
				if checkErr2 == nil {
					t.Error("GetIPFromMap() should return error after deletion, but returned nil")
				}
			}
		})
	}
}

func TestDropPrivateRFC1918(t *testing.T) {
	InitNFTClient()

	// The drop_private_rfc1918 map is an interval map with CIDR ranges
	// Let's verify it exists and has the expected structure
	client := GetNFTClient()
	dropMap, err := client.GetMap(TableFamilyInet, "filter", "drop_private_rfc1918")
	if err != nil {
		t.Fatalf("Failed to get drop_private_rfc1918 map: %v", err)
	}

	t.Logf("drop_private_rfc1918 map found: KeyType=%v, DataType=%v, IsMap=%v, Interval=%v",
		dropMap.KeyType, dropMap.DataType, dropMap.IsMap, dropMap.Interval)

	// ListMapElements may fail on interval maps (known library limitation);
	// log either way, but never let it gate the real assertions below.
	jsonData, err := client.ListMapElements(TableFamilyInet, "filter", "drop_private_rfc1918")
	if err != nil {
		t.Logf("ListMapElements failed (known interval map limitation): %v", err)
	} else {
		t.Logf("drop_private_rfc1918 elements (JSON): %s", string(jsonData))
	}

	// The authoritative check is the nft CLI listing, asserted unconditionally.
	cmd := exec.Command("nft", "list", "map", "inet", "filter", "drop_private_rfc1918")
	output, cmdErr := cmd.Output()
	if cmdErr != nil {
		t.Fatalf("Failed to list map with nft command: %v", cmdErr)
	}
	mapOutput := string(output)
	t.Logf("drop_private_rfc1918 map contents:\n%s", mapOutput)

	// Verify it contains expected RFC1918 ranges
	expectedRanges := []string{
		"10.0.0.0/8",
		"172.16.0.0/12",
		"192.168.0.0/16",
	}
	for _, cidr := range expectedRanges {
		if !strings.Contains(mapOutput, cidr) {
			t.Errorf("Expected CIDR range %s not found in drop_private_rfc1918 map", cidr)
		}
	}

	// Verify the verdict jumps to restrict_upstream_private_addresses
	if !strings.Contains(mapOutput, "restrict_upstream_private_addresses") {
		t.Error("Expected verdict 'jump restrict_upstream_private_addresses' not found")
	}

	// Since this is a pre-populated map with static ranges, we won't modify it in tests
	// Just verify its structure and contents
}

func TestEndpointMaps(t *testing.T) {
	InitNFTClient()

	tests := []struct {
		name     string
		protocol string
		srcIP    string
		dstIP    string
		port     string
		wantErr  bool
	}{
		{
			name:     "Add TCP endpoint with port",
			protocol: "tcp",
			srcIP:    "192.168.1.100",
			dstIP:    "10.0.0.100",
			port:     "80",
			wantErr:  false,
		},
		{
			name:     "Add UDP endpoint with port",
			protocol: "udp",
			srcIP:    "192.168.1.100",
			dstIP:    "10.0.0.100",
			port:     "53",
			wantErr:  false,
		},
		{
			name:     "Add TCP endpoint specific port",
			protocol: "tcp",
			srcIP:    "192.168.1.200",
			dstIP:    "10.0.0.200",
			port:     "443",
			wantErr:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Test adding endpoint
			err := AddEndpoint(tt.protocol, tt.srcIP, tt.dstIP, tt.port)
			if (err != nil) != tt.wantErr {
				t.Errorf("AddEndpoint() error = %v, wantErr %v", err, tt.wantErr)
			}

			if err == nil {
				// Test checking if endpoint exists
				exists := HasEndpoint(tt.protocol, tt.srcIP, tt.dstIP, tt.port)
				if !exists {
					t.Error("HasEndpoint() returned false, expected true after adding")
				}

				// Test deleting endpoint
				delErr := DeleteEndpoint(tt.protocol, tt.srcIP, tt.dstIP, tt.port)
				if delErr != nil {
					t.Errorf("DeleteEndpoint() error = %v", delErr)
				}

				// Verify endpoint was deleted
				exists2 := HasEndpoint(tt.protocol, tt.srcIP, tt.dstIP, tt.port)
				if exists2 {
					t.Error("HasEndpoint() returned true after deletion, expected false")
				}
			}
		})
	}
}

func TestPortVerdictMaps(t *testing.T) {
	InitNFTClient()

	tests := []struct {
		name    string
		mapName string
		port    string
		verdict string
		wantErr bool
	}{
		{
			name:    "Add port 22 to lan_tcp_accept",
			mapName: "lan_tcp_accept",
			port:    "22",
			verdict: "accept",
			wantErr: false,
		},
		{
			name:    "Add port 53 to lan_udp_accept",
			mapName: "lan_udp_accept",
			port:    "53",
			verdict: "accept",
			wantErr: false,
		},
		{
			name:    "Add port 443 to wan_tcp_accept",
			mapName: "wan_tcp_accept",
			port:    "443",
			verdict: "accept",
			wantErr: false,
		},
		{
			name:    "Add invalid port",
			mapName: "lan_tcp_accept",
			port:    "not-a-port",
			verdict: "accept",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Test adding port with verdict
			err := AddPortVerdictToMap("inet", "filter", tt.mapName, tt.port, tt.verdict)
			if (err != nil) != tt.wantErr {
				t.Errorf("AddPortVerdictToMap() error = %v, wantErr %v", err, tt.wantErr)
			}

			if err == nil {
				// Check via nft command
				cmd := exec.Command("nft", "list", "map", "inet", "filter", tt.mapName)
				output, _ := cmd.Output()
				t.Logf("Map %s after add: %s", tt.mapName, string(output))

				// Test checking if port exists
				checkErr := GetPortFromMap("inet", "filter", tt.mapName, tt.port)
				if checkErr != nil {
					t.Errorf("GetPortFromMap() error = %v, port should exist after adding", checkErr)
				}

				// Test deleting port
				delErr := DeletePortFromMap("inet", "filter", tt.mapName, tt.port)
				if delErr != nil {
					t.Errorf("DeletePortFromMap() error = %v", delErr)
				}

				// Verify port was deleted
				checkErr2 := GetPortFromMap("inet", "filter", tt.mapName, tt.port)
				if checkErr2 == nil {
					t.Error("GetPortFromMap() should return error after deletion, but returned nil")
				}
			}
		})
	}
}

func TestDeleteDebug(t *testing.T) {
	InitNFTClient()
	client := GetNFTClient()

	// Add a rule
	err := AddForwardingRule("tcp", "192.168.1.100", "80", "10.0.0.100", "8080")
	if err != nil {
		t.Fatalf("Failed to add: %v", err)
	}
	t.Log("Added forwarding rule")

	// Try to delete manually
	mapName := "tcpfwd"
	key := append(IPToBytes("192.168.1.100"), PortToBytesForConcatenated("80")...)
	t.Logf("Key for delete: %v (len=%d)", key, len(key))

	// Get the map
	set, err := client.GetMap(TableFamilyInet, "nat", mapName)
	if err != nil {
		t.Fatalf("Failed to get map: %v", err)
	}
	t.Logf("Map KeyType bytes: %d", set.KeyType.Bytes)

	// List elements
	elements, err := client.conn.GetSetElements(set)
	if err != nil {
		t.Fatalf("Failed to get elements: %v", err)
	}
	t.Logf("Elements in map: %d", len(elements))
	for i, elem := range elements {
		t.Logf("Element %d: Key=%v (len=%d)", i, elem.Key, len(elem.Key))
	}

	// Now try to delete with padding
	err = client.DeleteMapElement(TableFamilyInet, "nat", mapName, key)
	if err != nil {
		t.Fatalf("Failed to delete: %v", err)
	}
	t.Log("Delete successful")
}

func TestAPIBlockSet(t *testing.T) {
	InitNFTClient()

	tests := []struct {
		name    string
		ip      string
		wantErr bool
	}{
		{
			name:    "Add valid IP to api_block",
			ip:      "192.168.1.100",
			wantErr: false,
		},
		{
			name:    "Add another valid IP",
			ip:      "10.0.0.50",
			wantErr: false,
		},
		{
			name:    "Add invalid IP",
			ip:      "not.an.ip",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Test adding IP to api_block set
			err := AddIPToSet("inet", "filter", "api_block", tt.ip)
			if (err != nil) != tt.wantErr {
				t.Errorf("AddIPToSet() error = %v, wantErr %v", err, tt.wantErr)
			}

			if err == nil {
				// Check if IP exists in set
				checkErr := GetIPFromSet("inet", "filter", "api_block", tt.ip)
				if checkErr != nil {
					t.Errorf("GetIPFromSet() error = %v, IP should exist after adding", checkErr)
				}

				// Test deleting IP from set
				delErr := DeleteIPFromSet("inet", "filter", "api_block", tt.ip)
				if delErr != nil {
					t.Errorf("DeleteIPFromSet() error = %v", delErr)
				}

				// Verify IP was deleted
				checkErr2 := GetIPFromSet("inet", "filter", "api_block", tt.ip)
				if checkErr2 == nil {
					t.Error("GetIPFromSet() should return error after deletion, but returned nil")
				}
			}
		})
	}
}

// TestIntervalSetHandling verifies that single IPs in interval sets don't create ranges.
// This guards the fix for the bug where adding a single IP like 192.168.23.30 to an
// interval set created an open-ended range 192.168.23.30-255.255.255.255 (AddSetElement
// must set KeyEnd = Key for interval sets).
func TestIntervalSetHandling(t *testing.T) {
	InitNFTClient()
	client := GetNFTClient()

	const testIP = "192.168.23.30"
	const setName = "supernetworks" // ipv4_addr set with flags interval in the fixture

	ipBytes := IPToBytes(testIP)
	if ipBytes == nil || len(ipBytes) != 4 {
		t.Fatalf("IPToBytes(%s) = %v, want 4 bytes", testIP, ipBytes)
	}

	if err := client.AddSetElement(TableFamilyInet, "filter", setName, ipBytes); err != nil {
		t.Fatalf("AddSetElement() error = %v", err)
	}
	t.Cleanup(func() {
		_ = exec.Command("nft", "delete", "element", "inet", "filter", setName, "{", testIP, "}").Run()
	})

	out, err := exec.Command("nft", "list", "set", "inet", "filter", setName).CombinedOutput()
	if err != nil {
		t.Fatalf("nft list set inet filter %s: %v\n%s", setName, err, out)
	}
	listing := string(out)

	if !strings.Contains(listing, testIP) {
		t.Fatalf("single IP %s not present in interval set after AddSetElement:\n%s", testIP, listing)
	}
	if strings.Contains(listing, testIP+"-") {
		t.Errorf("single IP %s became an interval start (range regression):\n%s", testIP, listing)
	}
	if strings.Contains(listing, "-255.255.255.255") {
		t.Errorf("open-ended range found in interval set (KeyEnd regression):\n%s", listing)
	}
}
