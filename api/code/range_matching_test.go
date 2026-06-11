package main

// Matching tests for the interval maps: a concrete packet key must resolve
// (or not) through the stored element, incl. 0.0.0.0 vs 0.0.0.0/0 and port ranges.

import (
	"testing"
)

func matches(t *testing.T, family, table, mapName string, key ...string) bool {
	t.Helper()
	return nftGetElement(t, family, table, mapName, key...)
}

func TestForwardingPointVsRange(t *testing.T) {
	InitNFTClient()
	const dst, dport = "10.168.250.14", "8554"

	t.Run("0.0.0.0 is a single host, not a wildcard", func(t *testing.T) {
		if err := AddForwardingRule("tcp", "0.0.0.0", "8554", dst, dport); err != nil {
			t.Fatalf("add: %v", err)
		}
		t.Cleanup(func() { _ = DeleteForwardingRule("tcp", "0.0.0.0", "8554", dst, dport) })

		if !matches(t, "inet", "nat", "tcpfwd", "0.0.0.0", ".", "8554") {
			t.Error("0.0.0.0 rule should match destination 0.0.0.0")
		}
		if matches(t, "inet", "nat", "tcpfwd", "10.168.0.42", ".", "8554") {
			t.Error("0.0.0.0 rule must NOT match a real destination - it is a single host")
		}
	})

	t.Run("0.0.0.0/0 matches any destination", func(t *testing.T) {
		if err := AddForwardingRule("tcp", "0.0.0.0/0", "8554", dst, dport); err != nil {
			t.Fatalf("add: %v", err)
		}
		t.Cleanup(func() { _ = DeleteForwardingRule("tcp", "0.0.0.0/0", "8554", dst, dport) })

		for _, ip := range []string{"10.168.0.42", "1.2.3.4", "8.8.8.8", "255.255.255.254"} {
			if !matches(t, "inet", "nat", "tcpfwd", ip, ".", "8554") {
				t.Errorf("0.0.0.0/0 rule should match destination %s", ip)
			}
		}
		if matches(t, "inet", "nat", "tcpfwd", "10.168.0.42", ".", "9999") {
			t.Error("0.0.0.0/0 rule matched the wrong port")
		}
	})
}

func TestBlockRuleMatching(t *testing.T) {
	InitNFTClient()

	t.Run("specific src and dst", func(t *testing.T) {
		if err := AddBlockRule("192.168.2.10", "8.8.8.8", "tcp"); err != nil {
			t.Fatalf("add: %v", err)
		}
		t.Cleanup(func() { _ = DeleteBlockRule("192.168.2.10", "8.8.8.8", "tcp") })

		if !matches(t, "inet", "nat", "block", "192.168.2.10", ".", "8.8.8.8", ".", "tcp") {
			t.Error("exact block rule did not match")
		}
		if matches(t, "inet", "nat", "block", "192.168.2.11", ".", "8.8.8.8", ".", "tcp") {
			t.Error("block rule matched a different source")
		}
	})

	t.Run("block any destination from a host (dst 0.0.0.0/0)", func(t *testing.T) {
		if err := AddBlockRule("192.168.2.20", "0.0.0.0/0", "tcp"); err != nil {
			t.Fatalf("add: %v", err)
		}
		t.Cleanup(func() { _ = DeleteBlockRule("192.168.2.20", "0.0.0.0/0", "tcp") })

		for _, dst := range []string{"8.8.8.8", "1.1.1.1", "10.0.0.5"} {
			if !matches(t, "inet", "nat", "block", "192.168.2.20", ".", dst, ".", "tcp") {
				t.Errorf("range block rule should match dst %s", dst)
			}
		}
		if matches(t, "inet", "nat", "block", "192.168.2.21", ".", "8.8.8.8", ".", "tcp") {
			t.Error("range block rule matched a different source")
		}
	})
}

func TestForwardingBlockPortRange(t *testing.T) {
	InitNFTClient()
	const src, dst = "192.168.2.30", "10.50.0.7"

	t.Run("single port", func(t *testing.T) {
		if err := AddForwardingBlockRule(src, dst, "tcp", "8443"); err != nil {
			t.Fatalf("add: %v", err)
		}
		t.Cleanup(func() { _ = DeleteForwardingBlockRule(src, dst, "tcp", "8443") })

		if !matches(t, "inet", "filter", "fwd_block", src, ".", dst, ".", "tcp", ".", "8443") {
			t.Error("single-port fwd_block rule did not match")
		}
		if matches(t, "inet", "filter", "fwd_block", src, ".", dst, ".", "tcp", ".", "8444") {
			t.Error("single-port fwd_block rule matched the wrong port")
		}
	})

	t.Run("port range", func(t *testing.T) {
		if err := AddForwardingBlockRule(src, dst, "tcp", "1000-2000"); err != nil {
			t.Fatalf("add: %v", err)
		}
		t.Cleanup(func() { _ = DeleteForwardingBlockRule(src, dst, "tcp", "1000-2000") })

		for _, p := range []string{"1000", "1500", "2000"} {
			if !matches(t, "inet", "filter", "fwd_block", src, ".", dst, ".", "tcp", ".", p) {
				t.Errorf("port-range rule should match port %s", p)
			}
		}
		for _, p := range []string{"999", "2001", "3000"} {
			if matches(t, "inet", "filter", "fwd_block", src, ".", dst, ".", "tcp", ".", p) {
				t.Errorf("port-range rule should NOT match port %s", p)
			}
		}
	})

	t.Run("full port range 0-65535", func(t *testing.T) {
		if err := AddForwardingBlockRule(src, dst, "udp", "0-65535"); err != nil {
			t.Fatalf("add: %v", err)
		}
		t.Cleanup(func() { _ = DeleteForwardingBlockRule(src, dst, "udp", "0-65535") })

		for _, p := range []string{"0", "1", "53", "8554", "65535"} {
			if !matches(t, "inet", "filter", "fwd_block", src, ".", dst, ".", "udp", ".", p) {
				t.Errorf("0-65535 rule should match port %s", p)
			}
		}
	})
}

func TestIsForwardBlockInstalled(t *testing.T) {
	InitNFTClient()

	br := ForwardingBlockRule{SrcIP: "192.168.2.40", DstIP: "10.60.0.1", Protocol: "tcp", DstPort: "7000"}

	if isForwardBlockInstalled(br) {
		t.Fatal("rule reported installed before add")
	}
	if err := addForwardBlock(br); err != nil {
		t.Fatalf("addForwardBlock: %v", err)
	}
	t.Cleanup(func() { _ = deleteForwardBlock(br) })

	if !isForwardBlockInstalled(br) {
		t.Error("isForwardBlockInstalled = false after add (string-key regression)")
	}

	if err := deleteForwardBlock(br); err != nil {
		t.Fatalf("deleteForwardBlock: %v", err)
	}
	if isForwardBlockInstalled(br) {
		t.Error("isForwardBlockInstalled = true after delete")
	}
}
