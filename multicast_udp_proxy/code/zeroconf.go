/*
Passive zeroconf decoding for device classification.

Relayed mDNS/SSDP packets are also decoded (on a copy, off the relay path)
and published to sprbus as "zeroconf:device" events. Parse errors drop the
packet silently, the relay path is never blocked.
*/
package main

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	sprbus "github.com/spr-networks/sprbus-json"
	"golang.org/x/net/dns/dnsmessage"
)

var ServerEventSock = TEST_PREFIX + "/state/api/eventbus.sock"

type ZeroconfDevice struct {
	SrcIP       string
	MAC         string
	Services    []string
	TXT         map[string]string
	SSDPHeaders map[string]string
}

type zeroconfPacket struct {
	srcIP string
	port  int
	data  []byte
}

var zeroconfChan = make(chan zeroconfPacket, 128)

// only descriptive metadata is collected, everything else (auth material,
// device ids, friendly names) is dropped at the source
var allowedTXTKeys = map[string]bool{
	"model":        true, //generic + airplay
	"md":           true, //homekit, googlecast: model name
	"am":           true, //airplay: model
	"ty":           true, //ipp: make and model
	"product":      true, //ipp
	"usb_mdl":      true, //ipp: usb model
	"usb_mfg":      true, //ipp: usb manufacturer
	"mfg":          true,
	"manufacturer": true,
	"ci":           true, //homekit: accessory category
	"pv":           true, //homekit: protocol version
	"pdl":          true, //ipp: page description languages
	"ve":           true, //googlecast: version
	"ver":          true,
	"srcvers":      true, //airplay: source version
	"platform":     true,
	"protovers":    true,
}

func queueZeroconf(srcIP string, port int, data []byte) {
	packet := zeroconfPacket{srcIP, port, make([]byte, len(data))}
	copy(packet.data, data)

	select {
	case zeroconfChan <- packet:
	default:
		//decoder is behind, drop rather than block the relay path
	}
}

func decodeMDNS(data []byte, zdev *ZeroconfDevice) {
	var parser dnsmessage.Parser
	header, err := parser.Start(data)
	if err != nil || !header.Response {
		return
	}

	if err := parser.SkipAllQuestions(); err != nil {
		return
	}

	addService := func(name string) {
		if strings.Contains(name, "._tcp.local.") || strings.Contains(name, "._udp.local.") {
			zdev.Services = append(zdev.Services, strings.TrimSuffix(name, "local."))
		}
	}

	handleResource := func(resource dnsmessage.Resource) {
		name := resource.Header.Name.String()

		switch body := resource.Body.(type) {
		case *dnsmessage.PTRResource:
			if name == "_services._dns-sd._udp.local." {
				//service enumeration carries the type in the record data
				addService(body.PTR.String())
			} else {
				addService(name)
			}
		case *dnsmessage.TXTResource:
			for _, txt := range body.TXT {
				key, value, found := strings.Cut(txt, "=")
				if found && allowedTXTKeys[strings.ToLower(key)] {
					zdev.TXT[key] = value
				}
			}
		}
	}

	answers, err := parser.AllAnswers()
	if err != nil {
		return
	}
	for _, answer := range answers {
		handleResource(answer)
	}

	parser.SkipAllAuthorities()

	additionals, err := parser.AllAdditionals()
	if err != nil {
		return
	}
	for _, additional := range additionals {
		handleResource(additional)
	}
}

var wantedSSDPHeaders = []string{"server", "st", "nt", "usn"}

func decodeSSDP(data []byte, zdev *ZeroconfDevice) {
	lines := strings.Split(string(data), "\r\n")
	if len(lines) == 0 {
		return
	}

	firstLine := strings.ToUpper(lines[0])
	if !strings.HasPrefix(firstLine, "NOTIFY") && !strings.HasPrefix(firstLine, "HTTP/") {
		return
	}

	for _, line := range lines[1:] {
		key, value, found := strings.Cut(line, ":")
		if !found {
			continue
		}
		key = strings.ToUpper(strings.TrimSpace(key))
		for _, wanted := range wantedSSDPHeaders {
			if key == strings.ToUpper(wanted) {
				zdev.SSDPHeaders[key] = strings.TrimSpace(value)
			}
		}
	}
}

func lookupDeviceMAC(srcIP string) string {
	devices, err := APIDevices()
	if err != nil {
		return ""
	}

	for _, device := range devices {
		if device.RecentIP == srcIP {
			return device.MAC
		}
	}
	return ""
}

func zeroconfKey(zdev ZeroconfDevice) string {
	parts := append([]string{zdev.SrcIP}, zdev.Services...)
	for key, value := range zdev.TXT {
		parts = append(parts, key+"="+value)
	}
	for key, value := range zdev.SSDPHeaders {
		parts = append(parts, key+":"+value)
	}
	sort.Strings(parts[1:])
	return strings.Join(parts, "|")
}

func zeroconfPublisher() {
	var client *sprbus.Client
	published := map[string]bool{}

	for packet := range zeroconfChan {
		zdev := ZeroconfDevice{
			SrcIP:       packet.srcIP,
			TXT:         map[string]string{},
			SSDPHeaders: map[string]string{},
		}

		if packet.port == 5353 {
			decodeMDNS(packet.data, &zdev)
		} else if packet.port == 1900 {
			decodeSSDP(packet.data, &zdev)
		}

		if len(zdev.Services) == 0 && len(zdev.TXT) == 0 && len(zdev.SSDPHeaders) == 0 {
			continue
		}

		//dedupe only once the device is known, mdns announcements
		//can race the dhcp device write
		zdev.MAC = lookupDeviceMAC(packet.srcIP)
		if zdev.MAC == "" {
			continue
		}

		key := zdev.MAC + "|" + zeroconfKey(zdev)
		if published[key] {
			continue
		}

		if len(published) > 4096 {
			published = map[string]bool{}
		}
		published[key] = true

		data, err := json.Marshal(zdev)
		if err != nil {
			continue
		}

		if client == nil {
			client, err = sprbus.NewClient(ServerEventSock)
			if err != nil {
				client = nil
				continue
			}
		}

		_, err = client.Publish("zeroconf:device", string(data))
		if err != nil {
			fmt.Println("zeroconf publish failed:", err)
			client.Close()
			client = nil
		}
	}
}
