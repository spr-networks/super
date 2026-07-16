/*
	A proxy for udp multicast and mdns publishing for 'spr'

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
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"net"
	"os"
	"strings"

	"github.com/pion/mdns"
	"github.com/vishvananda/netlink"
	"golang.org/x/net/ipv4"
	"golang.org/x/sys/unix"
	"golang.zx2c4.com/wireguard/wgctrl"
	"golang.zx2c4.com/wireguard/wgctrl/wgtypes"
)

var debug = false

var TEST_PREFIX = os.Getenv("TEST_PREFIX")

var DevicesPublicConfigFile = TEST_PREFIX + "/state/public/devices-public.json"
var InterfacesPublicConfigFile = TEST_PREFIX + "/state/public/interfaces.json"
var PublicIPIfaceMapFile = TEST_PREFIX + "/state/public/ip-iface-map.json"
var MulticastConfigFile = TEST_PREFIX + "/configs/base/multicast.json"
var SetupDoneFile = TEST_PREFIX + "/configs/base/.setup_done"

const WireGuardInterface = "wg0"

type MulticastAddress struct {
	Address  string //address:port pair
	Disabled bool
	Tags     []string
}

type MulticastSettings struct {
	Disabled             bool
	Addresses            []MulticastAddress
	DisableMDNSAdvertise bool
	MDNSName             string
}

type DeviceEntry struct {
	Name     string
	MAC      string
	WGPubKey string
	VLANTag  string
	RecentIP string
	//PSKEntry       PSKEntry // not used by proxy
	Policies      []string
	Groups        []string
	DeviceTags    []string
	DHCPFirstTime string
	DHCPLastTime  string
	//Style          DeviceStyle // not used by proxy
	DeviceTimeout  string
	DeleteTimeout  bool
	DeviceDisabled bool
}

func IPIfaceMap() (map[string]string, error) {
	data, err := os.ReadFile(PublicIPIfaceMapFile)
	ifaceMap := map[string]string{}
	if err == nil {
		err = json.Unmarshal(data, &ifaceMap)
	}
	return ifaceMap, err
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

func wireGuardDevice(peer wgtypes.Peer, devices map[string]DeviceEntry) (DeviceEntry, bool) {
	publicKey := peer.PublicKey.String()
	for _, device := range devices {
		if device.WGPubKey == publicKey {
			return device, true
		}
	}

	return DeviceEntry{}, false
}

func wireGuardPeerAllowsIP(peer wgtypes.Peer, ip net.IP) bool {
	for _, allowed := range peer.AllowedIPs {
		if allowed.Contains(ip) {
			return true
		}
	}

	return false
}

func wireGuardPeerIP(peer wgtypes.Peer, devices map[string]DeviceEntry) net.IP {
	if device, ok := wireGuardDevice(peer, devices); ok {
		if ip := net.ParseIP(device.RecentIP).To4(); ip != nil && wireGuardPeerAllowsIP(peer, ip) {
			return ip
		}
	}

	for _, allowed := range peer.AllowedIPs {
		ones, bits := allowed.Mask.Size()
		ip := allowed.IP.To4()
		if bits == 32 && ones == 32 && ip != nil && !ip.IsMulticast() {
			return ip
		}
	}

	return nil
}

func deviceHasAnyTag(device DeviceEntry, tags []string) bool {
	for _, wantedTag := range tags {
		for _, currentTag := range device.DeviceTags {
			if wantedTag == currentTag {
				return true
			}
		}
	}

	return false
}

func wireGuardPeerDestinations(peers []wgtypes.Peer, devices map[string]DeviceEntry, excludeSourceIP net.IP, tags []string) []net.IP {
	destinations := []net.IP{}
	seen := map[string]bool{}

	for _, peer := range peers {
		if peer.Endpoint == nil {
			continue
		}

		if excludeSourceIP != nil && wireGuardPeerAllowsIP(peer, excludeSourceIP) {
			continue
		}

		if len(tags) != 0 {
			device, ok := wireGuardDevice(peer, devices)
			if !ok || !deviceHasAnyTag(device, tags) {
				continue
			}
		}

		ip := wireGuardPeerIP(peer, devices)
		if ip == nil || (excludeSourceIP != nil && ip.Equal(excludeSourceIP)) {
			continue
		}

		key := ip.String()
		if seen[key] {
			continue
		}
		seen[key] = true
		destinations = append(destinations, ip)
	}

	return destinations
}

func currentWireGuardPeerDestinations(interfaceName string, devices map[string]DeviceEntry, excludeSourceIP net.IP, tags []string) ([]net.IP, error) {
	client, err := wgctrl.New()
	if err != nil {
		return nil, err
	}
	defer client.Close()

	device, err := client.Device(interfaceName)
	if err != nil {
		return nil, err
	}

	return wireGuardPeerDestinations(device.Peers, devices, excludeSourceIP, tags), nil
}

func handleProxy(s_saddr string, relayableInterface func(ifaceName string) bool, tags []string) {
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

		//join multicast group
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

	//when new interfaces show up, join them for the multicast service
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

		ingressInterface, err := net.InterfaceByIndex(oob.IfIndex)
		if err != nil || !relayableInterface(ingressInterface.Name) {
			if err != nil {
				fmt.Println("got err for interface index", oob.IfIndex, err)
			} else {
				if debug {
					fmt.Println("dropping from interface not specified for relay", ingressInterface.Name)
				}
			}
			continue
		}

		//passive decode for device classification
		queueZeroconf(peer.(*net.UDPAddr).IP.String(), saddr.Port, buffer[0:n])

		//replay message out over idx
		writeit := func(iface net.Interface, destination *net.UDPAddr) {
			var woob *ipv4.ControlMessage
			//set src as the original peer address. Note: requires IP_TRANSPARENT set on the socket
			woob = &ipv4.ControlMessage{IfIndex: iface.Index, Src: peer.(*net.UDPAddr).IP}
			if _, err = l4.WriteTo(buffer[0:n], woob, destination); err != nil {

				//NOTE: this will warn often about `required key not available`
				//when sending to wireguard devices without the key
				//or an unconfigured wireguard interface.
				//suppress error
				if strings.Contains(err.Error(), "sendmsg: required key not available") {
					return
				}

				fmt.Println("failed to write on", iface.Name, "to", destination, ":", err)
				return
			}
		}

		ifaces, err = net.Interfaces()
		if err != nil {
			fmt.Println("failed net interfaces")
			continue
		}

		//for eficiency preload ip-iface and devices
		skipTags := false
		ifaceMap, err := IPIfaceMap()
		if err != nil {
			fmt.Println("[-] Failed to read iface map")
			skipTags = true
		}
		devices, err := APIDevices()
		if err != nil {
			fmt.Println("[-] Failed to read devices")
			skipTags = true
		}

		//join all existing interfaces for mdns
		for _, iface := range ifaces {

			if relayableInterface(iface.Name) {
				if iface.Name == WireGuardInterface {
					var excludeIP net.IP
					if ingressInterface.Name == WireGuardInterface {
						excludeIP = peer.(*net.UDPAddr).IP
					}
					destinations, wgErr := currentWireGuardPeerDestinations(iface.Name, devices, excludeIP, tags)
					if wgErr != nil {
						fmt.Println("failed to list wireguard peers:", wgErr)
						continue
					}
					for _, destinationIP := range destinations {
						destination := &net.UDPAddr{IP: destinationIP, Port: saddr.Port}
						if debug {
							fmt.Println(n, peer.String(), " being relayed to wireguard peer -> ", destination)
						}
						writeit(iface, destination)
					}
					continue
				}

				//if theres tags, make sure the receiver has the tag

				if len(tags) != 0 {
					if skipTags {
						//failed to load ifaceMap and devices, however tags are set, abort
						continue
					}
					if !ensureIfaceTagged(ifaceMap, devices, tags, iface.Name) {
						//a device with intersecting tags was not located on this interface,
						// do not transmit
						//note: by default, the wired downlinks will most likely
						//get the multicast message as wired downlink is the default iface for devices.
						continue
					}
				}

				if debug {
					fmt.Println(n, peer.String(), " being broadcast to -> ", iface.Name, iface.Index, n)
				}
				writeit(iface, saddr)
			}
		}

	}

}

func loadMulticastJson() MulticastSettings {
	settings := MulticastSettings{}
	data, err := ioutil.ReadFile(MulticastConfigFile)
	if err != nil {
		return settings
	}
	_ = json.Unmarshal(data, &settings)
	return settings
}

func ifaceAddr(iface *net.Interface) (string, error) {
	addrs, err := iface.Addrs()
	if err != nil {
		return "", err
	}

	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok {
			if ip4 := ipnet.IP.To4(); ip4 != nil {
				return ip4.String(), nil
			}
		}
	}

	//return addrs[0].(*net.IPNet).IP.String(), nil
	return "", fmt.Errorf("no ip addr found for iface %v", iface.Name)
}

func mdnsPublishIface(settings MulticastSettings, wanif string) {
	iface, err := net.InterfaceByName(wanif)
	if err != nil {
		fmt.Println(err)
		return
	}

	fmt.Println("wanif=", wanif, "iface=", iface)
	if !strings.Contains(iface.Flags.String(), "up") {
		fmt.Printf("err: iface=%v is not up\n", iface.Name)
		return
	}

	// verify iface has an ip address
	ip, err := ifaceAddr(iface)
	if err != nil {
		//grab the lanip then since we're coming in over LAN
		data, err := ioutil.ReadFile(TEST_PREFIX + "/configs/base/lanip")
		if err != nil {
			fmt.Println(err)
			return
		}
		ip = strings.Replace(string(data), "\n", "", 1)
	}

	addr, err := net.ResolveUDPAddr("udp", mdns.DefaultAddress)
	if err != nil {
		fmt.Println(err)
		return
	}

	l, err := net.ListenUDP("udp4", addr)
	if err != nil {
		fmt.Println(err)
		return
	}

	hostname := settings.MDNSName
	if hostname == "" {
		hostname, _ = os.Hostname()
	}

	name := fmt.Sprintf("%v.local", hostname)

	fmt.Println("mdns advertise ip=", ip, "name=", name)

	_, err = mdns.Server(ipv4.NewPacketConn(l), &mdns.Config{
		LocalNames:   []string{name},
		LocalAddress: net.ParseIP(ip),
	})

	if err != nil {
		fmt.Println(err)
		return
	}
}

// mdns publish spr.local on wanif ip addr
func mdnsPublish(settings MulticastSettings) {

	// just exit on virtual
	if os.Getenv("VIRTUAL_SPR") != "" {
		fmt.Println("spr virtual setup, skipping mdns")
		return
	}

	if settings.DisableMDNSAdvertise {
		return
	}

	wanif := os.Getenv("WANIF")
	wanif_covered := false

	interfaces, err := APIInterfaces()
	if err == nil {
		for _, target := range interfaces {
			if target.Type == "Uplink" {
				mdnsPublishIface(settings, target.Name)
				if target.Name == wanif {
					wanif_covered = true
				}
			} else if target.Type == "Downlink" {
				//mDNS advertise over wired LAN too
				mdnsPublishIface(settings, target.Name)
			}
		}
	}

	if !wanif_covered {
		mdnsPublishIface(settings, wanif)
	}

	_, err = os.Stat(SetupDoneFile)
	if err != nil {
		//in setup mode, start publishing over wlan0
		data, err := ioutil.ReadFile("/proc/cpuinfo")
		if err == nil && (strings.Contains(string(data), "Raspberry Pi 4") ||
			strings.Contains(string(data), "Raspberry Pi 5")) {
			mdnsPublishIface(settings, "wlan0")
		}
	}

	select {}
}

func ensureIfaceTagged(ifaceMap map[string]string, devices map[string]DeviceEntry, tags []string, ifaceName string) bool {
	for _, device := range devices {
		if device.RecentIP != "" {
			curIface, exists := ifaceMap[device.RecentIP]
			if exists && curIface == ifaceName {
				//check if the device tags intersect with the wanted tags
				for _, wantedTag := range tags {
					for _, currentTag := range device.DeviceTags {
						if wantedTag == currentTag {
							return true
						}
					}
				}
			}
		}
	}

	return false
}

func main() {

	fmt.Println("Multicast proxy starting")

	settings := loadMulticastJson()

	// in addition to being a proxy this code will advertise a name for spr over mdns
	go mdnsPublish(settings)

	// decode relayed mdns/ssdp and publish zeroconf:device events
	go zeroconfPublisher()

	relayableInterface := func(ifaceName string) bool {

		//support comma separated list of interfaces to match on
		if len(os.Args) == 2 {
			ifaceNames := strings.Split(os.Args[1], ",")
			for _, target := range ifaceNames {
				if strings.Contains(ifaceName, target) {
					return true
				}
			}
		} else {
			interfaces, err := APIInterfaces()
			if err == nil {
				for _, target := range interfaces {
					match_name := target.Name
					if target.Type == "Uplink" {
						continue
					}
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
		if ifaceName == WireGuardInterface {
			return true
		}

		return false
	}

	//multicast disabled outright
	if settings.Disabled == true {
		fmt.Println("[-] Multicast disabled by configuration")
		return
	}

	if len(settings.Addresses) == 0 {
		//run defaults
		//mdns
		go handleProxy("224.0.0.251:5353", relayableInterface, []string{})

		//ssdp
		handleProxy("239.255.255.250:1900", relayableInterface, []string{})
	} else {

		for _, address := range settings.Addresses {
			if address.Disabled == false {
				go handleProxy(address.Address, relayableInterface, address.Tags)
			}
		}

		select {}
	}

}
