package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"os"
	"strings"
)

import (
	"github.com/bradfitz/ip2asn"
	"github.com/dutchcoders/go-ouitools"
	"github.com/gorilla/mux"
)

var TEST_PREFIX = ""

var UNIX_PLUGIN_LISTENER = "/state/plugins/plugin-lookup/lookup_plugin"

//var UNIX_PLUGIN_LISTENER = "./http.sock"

var ASN_FILENAME = "../data/ip2asn-v4.tsv"
var OUI_FILENAME = "../data/manuf"

var mIp2Asn *ip2asn.Map
var mOUI *ouidb.OuiDb

type ASNEntry struct {
	IP      string
	ASN     int
	Name    string
	Country string
}

type OUIEntry struct {
	MAC    string
	Vendor string
}

func initDb() error {
	m, err := ip2asn.OpenFile(ASN_FILENAME)
	if err != nil {
		fmt.Println("error:", err)
		return err
	}

	mIp2Asn = m

	db := ouidb.New(OUI_FILENAME)
	if db == nil {
		return errors.New("OUI database not initialized")
	}

	mOUI = db

	return nil
}

func lookupASN(ipAddress string) (ASNEntry, error) {
	asn := ASNEntry{}

	ip := net.ParseIP(ipAddress)
	if ip == nil {
		return asn, fmt.Errorf("failed to parse IP")
	}

	netip, err := netip.ParseAddr(ip.String())
	if err != nil {
		return asn, err
	}

	asn.IP = ip.String()
	asn.ASN = mIp2Asn.ASofIP(netip)
	asn.Name = mIp2Asn.ASName(asn.ASN)
	asn.Country = mIp2Asn.ASCountry(asn.ASN)

	return asn, nil
}

// get single asn as json object
func pluginGetASN(w http.ResponseWriter, r *http.Request) {
	ip := mux.Vars(r)["ip"]
	result, err := lookupASN(ip)

	if err != nil {
		http.Error(w, "Not found", 404)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// get asns as json array
func pluginGetASNs(w http.ResponseWriter, r *http.Request) {
	ips := mux.Vars(r)["ip"]

	result := []ASNEntry{}
	for _, ip := range strings.Split(ips, ",") {
		asn, err := lookupASN(ip)
		if err != nil {
			continue
		}

		result = append(result, asn)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// get single oui as json object
func pluginGetOUI(w http.ResponseWriter, r *http.Request) {
	mac := mux.Vars(r)["mac"]

	vendor, err := mOUI.VendorLookup(mac)
	if err != nil {
		http.Error(w, "Not found", 404)
		return
	}

	result := OUIEntry{
		MAC:    mac,
		Vendor: vendor,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// get ouis as json array
func pluginGetOUIs(w http.ResponseWriter, r *http.Request) {
	macs := mux.Vars(r)["mac"]

	result := []OUIEntry{}
	for _, mac := range strings.Split(macs, ",") {
		vendor, err := mOUI.VendorLookup(mac)
		if err != nil {
			continue
		}

		oui := OUIEntry{
			MAC:    mac,
			Vendor: vendor,
		}

		result = append(result, oui)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func logRequest(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if os.Getenv("DEBUGHTTP") {
			fmt.Printf("%s %s %s\n", r.RemoteAddr, r.Method, r.URL)
		}
		handler.ServeHTTP(w, r)
	})
}

func main() {
	err := initDb()
	if err != nil {
		fmt.Println("init error:", err)
		return
	}

	unix_plugin_router := mux.NewRouter().StrictSlash(true)

	unix_plugin_router.HandleFunc("/asn/{ip}", pluginGetASN).Methods("GET")
	unix_plugin_router.HandleFunc("/asns/{ip}", pluginGetASNs).Methods("GET")
	unix_plugin_router.HandleFunc("/oui/{mac}", pluginGetOUI).Methods("GET")
	unix_plugin_router.HandleFunc("/ouis/{mac}", pluginGetOUIs).Methods("GET")

	os.Remove(UNIX_PLUGIN_LISTENER)
	unixPluginListener, err := net.Listen("unix", UNIX_PLUGIN_LISTENER)
	if err != nil {
		panic(err)
	}

	pluginServer := http.Server{Handler: logRequest(unix_plugin_router)}

	pluginServer.Serve(unixPluginListener)
}
