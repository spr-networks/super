package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
)

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

func main() {
	if len(os.Args) != 4 {
		fmt.Println("Usage: add/remove iface mac")
		os.Exit(1)
	}

	action := os.Args[1]
	iface := os.Args[2]
	mac := os.Args[3]

	existingSet := getExistingDhcpSet()

	if action == "add" {
		//if this iface or mac is in an existing key, remove it
		for _, e := range existingSet {
			if e.iface == iface || e.mac == mac {
				exec.Command("nft", "delete", "element", "inet", "filter", "dhcp_access", "{", e.iface, ".", e.mac, ":", "accept", "}").Run()
			}
		}
		//attach the filter to this interface
		os.Chdir("/code/xdp-tools/xdp-loader/")
		exec.Command("./xdp-loader", "load", "-m", "skb", iface, "/code/filter_dhcp_mismatch.o").Run()

		//add it to the dhcp set
		exec.Command("nft", "add", "element", "inet", "filter", "dhcp_access", "{", iface, ".", mac, ":", "accept", "}").Run()
	} else if action == "remove" {
		for _, e := range existingSet {
			if e.iface == iface || e.mac == mac {
				exec.Command("nft", "delete", "element", "inet", "filter", "dhcp_access", "{", e.iface, ".", e.mac, ":", "accept", "}").Run()
			}
		}

	} else {
		log.Fatal("unknown command", action)
	}

}
