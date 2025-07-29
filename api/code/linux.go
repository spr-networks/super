//go:build linux
// +build linux

package main

import (
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

	// Find the default route (0.0.0.0/0) and return its gateway
	for _, route := range routes {
		if route.Dst == nil && route.Gw != nil {
			// This is a default route
			return route.Gw.String()
		}
	}

	return ""
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
