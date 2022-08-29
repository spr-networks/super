/*
	A proxy for udp multicast

This allows isolated interfaces to perform zeroconf (mdns or ssdp)

Requirements:
- hostapd.conf should have multicast_to_unicast=1 When disable_dgaf=1 or ap_isolate=1 are set.


Design:
- Sending Multicast packets requires joining the multicast group on each interface
- Netlink messages are used to detect new interfaces as they arrive (for example due to per_sta_vif=1)
- A message on one interface is relayed to the others, with the original peer's source address.
- IP_TRANSPARENT is required for sending from an arbitrary source
- MULTICAST_LOOP should be disabled to avoid infinite relaying.

- Each service to be relayed currently runs as its own goroutine. The services are currently hardcoded

Limitations
- No IPv6 support
- Currently has no concept of IGMP. This means that the router could be waking up wifi devices
*/
package main

import (
	"errors"
	"fmt"
	"net"
	"os"

	"encoding/json"
	"github.com/vishvananda/netlink"
	"golang.org/x/net/ipv4"
	"golang.org/x/sys/unix"
	"io/ioutil"
	"strings"
)

var debug = false

var TEST_PREFIX = os.Getenv("TEST_PREFIX")

var DevicesPublicConfigFile = TEST_PREFIX + "/state/public/devices-public.json"
var InterfacesPublicConfigFile = TEST_PREFIX + "/state/public/interfaces.json"

type PSKEntry struct {
	Type string
	Psk  string
}

type DeviceEntry struct {
	Name       string
	MAC        string
	WGPubKey   string
	VLANTag    string
	RecentIP   string
	PSKEntry   PSKEntry
	Groups     []string
	DeviceTags []string
}

func APIDevices() (map[string]DeviceEntry, error) {
	devs := map[string]DeviceEntry{}

	data, err := ioutil.ReadFile(DevicesPublicConfigFile)
	if err == nil {
		err = json.Unmarshal(data, &devs)
		if err != nil {
			fmt.Println(err)
			return nil, err
		}
	} else {
		fmt.Println(err)
		return nil, err
	}

	return devs, nil
}

type InterfaceConfig struct {
	Name    string
	Type    string
	Enabled bool
}

func APIInterfaces() ([]InterfaceConfig, error) {
	data, err := os.ReadFile(InterfacesPublicConfigFile)
	config := []InterfaceConfig{}
	if err == nil {
		err = json.Unmarshal(data, &config)
	}
	return config, err
}

func NewIPv4UDPConn(addr *net.UDPAddr) (*net.UDPConn, error) {
	fd, err := unix.Socket(unix.AF_INET, unix.SOCK_DGRAM, unix.IPPROTO_UDP)
	if err != nil {
		return nil, fmt.Errorf("cannot get a UDP socket: %v", err)
	}
	f := os.NewFile(uintptr(fd), "")
	// net.FilePacketConn dups the FD, so we have to close this in any case.
	defer f.Close()

	// Allow reusing the addr to aid debugging.
	if err := unix.SetsockoptInt(fd, unix.SOL_SOCKET, unix.SO_REUSEADDR, 1); err != nil {
		return nil, fmt.Errorf("cannot set reuseaddr on socket: %v", err)
	}

	if err := unix.SetsockoptInt(fd, unix.SOL_SOCKET, unix.SO_BROADCAST, 1); err != nil {
		return nil, fmt.Errorf("cannot set broadcast on socket: %v", err)
	}

	if err := unix.SetsockoptInt(fd, unix.IPPROTO_IP, unix.IP_TRANSPARENT, 1); err != nil {
		return nil, fmt.Errorf("cannot set transparent on socket: %v", err)
	}

	// Disable MULTICAST LOOP
	if err := unix.SetsockoptInt(fd, unix.IPPROTO_IP, unix.IP_MULTICAST_LOOP, 0); err != nil {
		return nil, fmt.Errorf("cannot set multicast on socket: %v", err)
	}

	// Bind to the port.
	saddr := unix.SockaddrInet4{Port: addr.Port}
	if addr.IP != nil && addr.IP.To4() == nil {
		return nil, fmt.Errorf("wrong address family (expected v4) for %s", addr.IP)
	}
	copy(saddr.Addr[:], addr.IP.To4())
	if err := unix.Bind(fd, &saddr); err != nil {
		return nil, fmt.Errorf("cannot bind to port %d: %v", addr.Port, err)
	}

	conn, err := net.FilePacketConn(f)
	if err != nil {
		return nil, err
	}
	udpconn, ok := conn.(*net.UDPConn)
	if !ok {
		return nil, errors.New("BUG(??): incorrect socket type, expected UDP")
	}
	return udpconn, nil
}

func listenNewInterfaceUp(callback func(string)) {
	lnkupdate := make(chan netlink.LinkUpdate)
	lnkdone := make(chan struct{})
	err := netlink.LinkSubscribe(lnkupdate, lnkdone)
	if err != nil {
		fmt.Println("failed to netlink")
		return
	}

	for {
		select {
		case msg := <-lnkupdate:
			{
				if msg.Change == unix.IFF_UP {
					if debug {
						fmt.Println("link up", msg.Attrs().Name)
					}
					callback(msg.Attrs().Name)
				}
			}
		}
	}
}

type listener4 struct {
	*ipv4.PacketConn
}

func handleProxy(s_saddr string, relayableInterface func(ifaceName string) bool) {
	l4 := listener4{}

	saddr, err := net.ResolveUDPAddr("udp4", s_saddr)
	if err != nil {
		fmt.Println("error", err)
		return
	}

	conn, err := NewIPv4UDPConn(saddr)
	if err != nil {
		fmt.Println("error", err)
		return
	}

	l4.PacketConn = ipv4.NewPacketConn(conn)

	err = l4.SetControlMessage(ipv4.FlagInterface, true)
	if err != nil {
		fmt.Println("error set control message", err)
		return
	}

	foo := func(interfaceName string) {
		ief, err := net.InterfaceByName(interfaceName)
		if err != nil {
			return
		}

		//join mdns group
		if relayableInterface(interfaceName) {
			l4.JoinGroup(ief, saddr)
		} else {
			if debug {
				fmt.Println("not joining", interfaceName)
			}
		}
	}

	ifaces, err := net.Interfaces()
	if err != nil {
		fmt.Println("failed net interfaces")
		return
	}

	//join all existing interfaces for mdns
	for _, iface := range ifaces {
		foo(iface.Name)
	}

	//when new interfaces show up, join them for mdns
	go func() {
		listenNewInterfaceUp(foo)
	}()

	var buffer [1 << 16]byte

	for {

		n, oob, peer, err := l4.ReadFrom(buffer[0:])

		if err != nil {
			fmt.Println("error", err)
			continue
		}

		if debug {
			fmt.Println("got conn and data", n, peer.String(), oob.IfIndex)
		}

		if iface, err := net.InterfaceByIndex(oob.IfIndex); err != nil || !relayableInterface(iface.Name) {
			if err != nil {
				fmt.Println("got err for interface index", oob.IfIndex, err)
			} else {
				if debug {
					fmt.Println("dropping from interface not specified for relay", iface.Name)
				}
			}
			continue
		}

		//replay message out over idx
		writeit := func(idx int) {
			var woob *ipv4.ControlMessage
			//set src as the original peer address. Note: requires IP_TRANSPARENT set on the socket
			woob = &ipv4.ControlMessage{IfIndex: idx, Src: peer.(*net.UDPAddr).IP}
			// set dest as saddr (multicast)
			if _, err = l4.WriteTo(buffer[0:n], woob, saddr); err != nil {
				fmt.Println("failed to write", err)
				return
			}
		}

		ifaces, err = net.Interfaces()
		if err != nil {
			fmt.Println("failed net interfaces")
			continue
		}
		//join all existing interfaces for mdns

		for _, iface := range ifaces {

			if iface.Index == oob.IfIndex {
				//dont replay on the same interface
				continue
			}

			if relayableInterface(iface.Name) {
				if debug {
					fmt.Println(n, peer.String(), " being broadcast to -> ", iface.Name, iface.Index, n)
				}
				writeit(iface.Index)
			}
		}

	}

}

func main() {

	relayableInterface := func(ifaceName string) bool {

		//support comma separated list of interfaces to match on
		if len(os.Args) == 2 {
			ifaceNames := strings.Split(os.Args[1], ",")
			for _, target := range interfaces {
				if strings.Contains(ifaceName, target) {
					return true
				}
			}
		} else {
			interfaces, err := APIInterfaces()
			if err != nil {
				for _, target := range interfaces {
					match_name := target.Name
					if target.Type == "AP" {
						match_name += "."
					}
					if strings.Contains(ifaceName, match_name) {
						return true
					}
				}
			} else {
				fmt.Println("[-] Multicast proxy failed to read interfaces", err)
			}
		}
		//workaround for now for wireguard
		// until it is in interfaces
		if strings.Contains(ifaceName, "wg0") {
			return true
		}

		return false
	}

	//mdns
	go handleProxy("224.0.0.251:5353", relayableInterface)

	//ssdp
	handleProxy("239.255.255.250:1900", relayableInterface)

}
