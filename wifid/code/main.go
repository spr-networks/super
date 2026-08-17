package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"
)

const wifiXDPLoader = "/code/xdp-tools/xdp-loader/xdp-loader"
const wifiXDPObject = "/code/filter_dhcp_mismatch.o"
const wifiXDPKernelProgramName = "xdp_block_dhcp_"

var runDHCPCommand = func(name string, args ...string) ([]byte, error) {
	return exec.Command(name, args...).CombinedOutput()
}

type ifaceMacKey struct {
	iface string
	mac   string
}

func getExistingDhcpSet() []ifaceMacKey {
	//google/nftables is incomplete and does not support custom set key types

	existing := []ifaceMacKey{}

	//nft -j list map inet filter dhcp_access
	cmd := exec.Command("nft", "-j", "list", "map", "inet", "filter", "dhcp_access")
	stdout, err := cmd.Output()
	if err != nil {
		log.Fatal(err)
		return existing
	}

	//jq .nftables[1].map.elem[][0].concat
	var data map[string]interface{}
	err = json.Unmarshal(stdout, &data)
	data2, ok := data["nftables"].([]interface{})
	if ok != true {
		log.Fatal("invalid json")
	}
	data3, ok := data2[1].(map[string]interface{})
	data4, ok := data3["map"].(map[string]interface{})
	data5, ok := data4["elem"].([]interface{})
	for _, d := range data5 {
		e, ok := d.([]interface{})
		f, ok := e[0].(map[string]interface{})
		g, ok := f["concat"].([]interface{})
		if ok {
			iface, ok := g[0].(string)
			mac, ok := g[1].(string)
			if ok {
				existing = append(existing, ifaceMacKey{iface, mac})
			}
		}
	}
	return existing
}

func dhcpCommandError(operation string, output []byte, err error) error {
	detail := strings.TrimSpace(string(output))
	if detail == "" {
		return fmt.Errorf("%s: %w", operation, err)
	}
	return fmt.Errorf("%s: %w: %s", operation, err, detail)
}

func removeExistingDHCPAccess(existingSet []ifaceMacKey, iface string, mac string) error {
	for _, e := range existingSet {
		if e.iface != iface && e.mac != mac {
			continue
		}
		output, err := runDHCPCommand("nft", "delete", "element", "inet", "filter", "dhcp_access", "{", e.iface, ".", e.mac, ":", "accept", "}")
		if err != nil {
			return dhcpCommandError("remove existing DHCP authorization", output, err)
		}
	}
	return nil
}

func ensureWiFiDHCPXDP(iface string) error {
	status, statusErr := runDHCPCommand(wifiXDPLoader, "status", iface)
	if statusErr == nil && bytes.Contains(status, []byte(wifiXDPKernelProgramName)) {
		return nil
	}

	output, err := runDHCPCommand(wifiXDPLoader, "load", "-m", "skb", iface, wifiXDPObject)
	if err != nil {
		return dhcpCommandError("attach DHCP XDP filter", output, err)
	}
	return nil
}

func authorizeWiFiDHCP(existingSet []ifaceMacKey, iface string, mac string) error {
	if err := removeExistingDHCPAccess(existingSet, iface, mac); err != nil {
		return err
	}
	if err := ensureWiFiDHCPXDP(iface); err != nil {
		return err
	}
	output, err := runDHCPCommand("nft", "add", "element", "inet", "filter", "dhcp_access", "{", iface, ".", mac, ":", "accept", "}")
	if err != nil {
		return dhcpCommandError("add DHCP authorization", output, err)
	}
	return nil
}

func main() {
	if len(os.Args) == 2 && os.Args[1] == "serve" {
		if err := serveControl(defaultControlSocket); err != nil {
			log.Fatal(err)
		}
		return
	}

	if len(os.Args) != 4 {
		fmt.Println("Usage: add/remove iface mac | serve")
		os.Exit(1)
	}

	action := os.Args[1]
	iface := os.Args[2]
	mac := os.Args[3]

	existingSet := getExistingDhcpSet()

	if action == "add" {
		if err := authorizeWiFiDHCP(existingSet, iface, mac); err != nil {
			log.Fatal(err)
		}
	} else if action == "remove" {
		if err := removeExistingDHCPAccess(existingSet, iface, mac); err != nil {
			log.Fatal(err)
		}
	} else {
		log.Fatal("unknown command", action)
	}

}
