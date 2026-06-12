//go:build linux

package main

import (
	"os/exec"
	"testing"
)

// The route snapshot must resolve device IPs to the same interface that the
// live getRouteInterface (netlink RouteGet) returns, including longest-prefix.
func TestRouteSnapshotMatchesLive(t *testing.T) {
	mk := func(args ...string) {
		if out, err := exec.Command("ip", args...).CombinedOutput(); err != nil {
			t.Fatalf("ip %v: %v\n%s", args, err, out)
		}
	}
	exec.Command("ip", "link", "del", "rtest0").Run()
	mk("link", "add", "rtest0", "type", "dummy")
	mk("addr", "add", "10.77.0.1/24", "dev", "rtest0")
	mk("link", "set", "rtest0", "up")
	// a more-specific /30 on the same iface (device tinynet style)
	mk("route", "add", "10.77.0.16/30", "dev", "rtest0")
	t.Cleanup(func() { exec.Command("ip", "link", "del", "rtest0").Run() })

	snap := SnapshotRoutes()

	for _, ip := range []string{"10.77.0.5", "10.77.0.17", "10.77.0.250"} {
		live := getRouteInterface(ip)
		got := snap.InterfaceForIP(ip)
		if live != got {
			t.Errorf("%s: live=%q snapshot=%q (must match)", ip, live, got)
		}
		if live == "" {
			t.Errorf("%s: expected to resolve to rtest0, got empty live", ip)
		}
	}

	// an IP with no route resolves the same (default route or empty)
	if got, live := snap.InterfaceForIP("10.88.0.1"), getRouteInterface("10.88.0.1"); got != live {
		t.Errorf("unrouted IP: live=%q snapshot=%q", live, got)
	}
}
