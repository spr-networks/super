//go:build linux
// +build linux

package main

import (
	"fmt"
	"net"
	"strconv"
	"syscall"

	"github.com/vishvananda/netlink"
	"golang.org/x/sys/unix"
)

func bindToDevice(fd int, ifName string) error {
	return syscall.BindToDevice(fd, ifName)
}

func getRouteInterface(IP string) string {
	// Parse the IP address
	dst := net.ParseIP(IP)
	if dst == nil {
		return ""
	}

	// Get route using netlink
	routes, err := netlink.RouteGet(dst)
	if err != nil {
		return ""
	}

	// Return the output interface from the first matching route
	if len(routes) > 0 && routes[0].LinkIndex > 0 {
		// Get the link by index to get the interface name
		link, err := netlink.LinkByIndex(routes[0].LinkIndex)
		if err != nil {
			return ""
		}
		return link.Attrs().Name
	}

	return ""
}

func getRouteGatewayForTable(Table string) string {
	// Convert table name to table ID
	tableID := 0
	switch Table {
	case "main":
		tableID = unix.RT_TABLE_MAIN
	case "local":
		tableID = unix.RT_TABLE_LOCAL
	case "default":
		tableID = unix.RT_TABLE_DEFAULT
	default:
		// Try to parse as numeric table ID
		if id, err := strconv.Atoi(Table); err == nil {
			tableID = id
		} else {
			return ""
		}
	}

	// List routes for the specified table
	routes, err := netlink.RouteListFiltered(netlink.FAMILY_V4, &netlink.Route{Table: tableID}, netlink.RT_FILTER_TABLE)
	if err != nil {
		return ""
	}

	// only a table holding exactly one route identifies the gateway,
	// otherwise the caller resets the table with a route replace
	if len(routes) == 1 && routes[0].Gw != nil {
		return routes[0].Gw.String()
	}

	return ""
}

func getMainDefaultRoute() (string, string) {
	routes, err := netlink.RouteListFiltered(netlink.FAMILY_V4, &netlink.Route{Table: unix.RT_TABLE_MAIN}, netlink.RT_FILTER_TABLE)
	if err != nil {
		return "", ""
	}

	gw := ""
	dev := ""
	count := 0
	for _, route := range routes {
		if route.Dst != nil {
			continue
		}
		count++
		if route.Gw != nil {
			gw = route.Gw.String()
		}
		if link, err := netlink.LinkByIndex(route.LinkIndex); err == nil {
			dev = link.Attrs().Name
		}
	}

	if count != 1 {
		return "", ""
	}
	return gw, dev
}

func replaceDefaultRouteOnlink(gw string, dev string, table int) error {
	link, err := netlink.LinkByName(dev)
	if err != nil {
		return err
	}

	gwIP := net.ParseIP(gw)
	if gwIP == nil {
		return fmt.Errorf("invalid gateway %s", gw)
	}

	if table == 0 {
		table = unix.RT_TABLE_MAIN
	}

	return netlink.RouteReplace(&netlink.Route{
		LinkIndex: link.Attrs().Index,
		Gw:        gwIP,
		Table:     table,
		Flags:     int(netlink.FLAG_ONLINK),
	})
}

func replaceLinkRoute(subnet string, dev string, table int) error {
	link, err := netlink.LinkByName(dev)
	if err != nil {
		return err
	}

	_, dst, err := net.ParseCIDR(subnet)
	if err != nil {
		return err
	}

	return netlink.RouteReplace(&netlink.Route{
		LinkIndex: link.Attrs().Index,
		Dst:       dst,
		Table:     table,
		Scope:     netlink.SCOPE_LINK,
	})
}

func isLinkReallyUpNetlink(interfaceName string) bool {
	link, err := netlink.LinkByName(interfaceName)
	if err != nil {
		log.Printf("Failed to get link %s: %v", interfaceName, err)
		return false
	}

	attrs := link.Attrs()
	return (attrs.Flags&net.FlagUp != 0) && (attrs.RawFlags&unix.IFF_RUNNING != 0)
}

type routeNet struct {
	net   *net.IPNet
	iface string
}

// RouteSnapshot resolves device IPs to their interface from one route dump.
type RouteSnapshot struct {
	routes []routeNet
}

func SnapshotRoutes() *RouteSnapshot {
	snap := &RouteSnapshot{}

	links, err := netlink.LinkList()
	if err != nil {
		return snap
	}
	idxName := make(map[int]string, len(links))
	for _, l := range links {
		idxName[l.Attrs().Index] = l.Attrs().Name
	}

	routes, err := netlink.RouteList(nil, netlink.FAMILY_V4)
	if err != nil {
		return snap
	}
	for _, r := range routes {
		iface := idxName[r.LinkIndex]
		if iface == "" {
			continue
		}
		n := r.Dst
		if n == nil {
			n = &net.IPNet{IP: net.IPv4zero, Mask: net.CIDRMask(0, 32)}
		}
		snap.routes = append(snap.routes, routeNet{net: n, iface: iface})
	}
	return snap
}

// InterfaceForIP returns the interface of the longest-prefix route for the IP.
func (s *RouteSnapshot) InterfaceForIP(ip string) string {
	dst := net.ParseIP(ip)
	if dst == nil {
		return ""
	}
	bestOnes := -1
	best := ""
	for _, r := range s.routes {
		if r.net.Contains(dst) {
			if ones, _ := r.net.Mask.Size(); ones > bestOnes {
				bestOnes = ones
				best = r.iface
			}
		}
	}
	return best
}
