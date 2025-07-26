package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net"
	"net/http"
	"sync"
	"time"
)

import (
	"github.com/gorilla/mux"
	"github.com/influxdata/influxdb-client-go/v2"
	"github.com/spr-networks/sprbus"
)

var IFDB influxdb2.Client = nil

type TrafficElement struct {
	IP      string
	Domain  string
	Packets uint64
	Bytes   uint64
}

type IPTrafficElement struct {
	Interface string
	Src       string
	Dst       string
	SrcDomain string
	DstDomain string
	Packets   uint64
	Bytes     uint64
	Timeout   uint64
	Expires   uint64
}

func parseTrafficElements(elements []interface{}) []TrafficElement {
	traffic := []TrafficElement{}
	for _, _entry := range elements {
		entry, ok := _entry.(map[string]interface{})
		if ok {
			ele, ok := entry["elem"].(map[string]interface{})
			if ok {
				counter, ok := ele["counter"].(map[string]interface{})
				if ok {
					ip := ele["val"].(string)
					domain := ""
					DNSCachemtx.RLock()
					src_domain, exists := DNSCache[ip]
					if exists {
						domain = src_domain
					}
					DNSCachemtx.RUnlock()
					traffic = append(traffic,
						TrafficElement{IP: ip,
							Domain:  domain,
							Bytes:   uint64(counter["bytes"].(float64)),
							Packets: uint64(counter["packets"].(float64))})
				}
			}
		}
	}
	return traffic
}

func parseIPTrafficElements(elements []interface{}) []IPTrafficElement {
	traffic := []IPTrafficElement{}
	for _, _entry := range elements {
		entry, ok := _entry.(map[string]interface{})
		if ok {
			ele, ok := entry["elem"].(map[string]interface{})
			if ok {
				counter, ok := ele["counter"].(map[string]interface{})
				if ok {
					val, ok := ele["val"].(map[string]interface{})
					if ok {

						timeout, ok := ele["timeout"].(float64)
						expires, ok := ele["expires"].(float64)

						concat, ok := val["concat"].([]interface{})
						if ok && len(concat) == 3 {
							ifname, _ := concat[0].(string)
							src_ip, _ := concat[1].(string)
							dst_ip, _ := concat[2].(string)

							SrcDomain := ""
							DstDomain := ""
							DNSCachemtx.RLock()
							src_domain, exists := DNSCache[src_ip]
							if exists {
								SrcDomain = src_domain
							}
							dst_domain, exists := DNSCache[dst_ip]
							if exists {
								DstDomain = dst_domain
							}
							DNSCachemtx.RUnlock()

							traffic = append(traffic,
								IPTrafficElement{Interface: ifname,
									Src:       src_ip,
									Dst:       dst_ip,
									SrcDomain: SrcDomain,
									DstDomain: DstDomain,
									Bytes:     uint64(counter["bytes"].(float64)),
									Packets:   uint64(counter["packets"].(float64)),
									Timeout:   uint64(timeout),
									Expires:   uint64(expires)})

						}
					}
				}
			}
		}
	}
	return traffic
}

func getDeviceTrafficSet(setName string) []TrafficElement {
	stdout, err := ListSetJSON("ip", "accounting", setName)

	if err != nil {
		fmt.Println("getDeviceTrafficSet failed to list ip accounting", setName, "->", err)
		return nil
	}

	var data map[string]interface{}
	err = json.Unmarshal(stdout, &data)

	data2, ok := data["nftables"].([]interface{})
	if ok != true {
		log.Fatal("invalid json")
	}

	for _, s := range data2 {
		map_entry, ok := s.(map[string]interface{})
		if ok {
			set, exists := map_entry["set"].(map[string]interface{})
			if exists {
				if set["name"] == setName {
					elements, ok := set["elem"].([]interface{})
					if ok {
						return parseTrafficElements(elements)
					}
				}
			}
		}
	}

	return nil
}

func getDeviceTraffic(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]

	data := getDeviceTrafficSet(name)

	if data == nil {
		err := fmt.Errorf("Failed to collect traffic statistics")
		http.Error(w, err.Error(), 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func getIPTrafficSet() []IPTrafficElement {
	setName := "all_ip"
	stdout, err := ListSetJSON("ip", "accounting", setName)

	if err != nil {
		fmt.Println("getIPTrafficSet failed to list ip accounting", setName, err)
		return nil
	}

	var data map[string]interface{}
	err = json.Unmarshal(stdout, &data)

	data2, ok := data["nftables"].([]interface{})
	if ok != true {
		log.Fatal("invalid json")
	}

	for _, s := range data2 {
		map_entry, ok := s.(map[string]interface{})
		if ok {
			set, exists := map_entry["set"].(map[string]interface{})
			if exists {
				if set["name"] == setName {
					elements, ok := set["elem"].([]interface{})
					if ok {
						return parseIPTrafficElements(elements)
					}
				}
			}
		}
	}

	return nil
}
func getIPTraffic(w http.ResponseWriter, r *http.Request) {
	data := getIPTrafficSet()

	if data == nil {
		err := fmt.Errorf("Failed to collect traffic statistics")
		http.Error(w, err.Error(), 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

type NetCount struct {
	LanIn  uint64
	LanOut uint64
	WanIn  uint64
	WanOut uint64
}

type DeviceHistory struct {
	Minutes [60]NetCount
	Hours   [24]NetCount
	Days    [30]NetCount
}

type TrafficHistory struct {
	Devices map[string]DeviceHistory
}

var Trafficmtx sync.Mutex
var TrafficStatePath = "/state/api/traffic.json"
var gTrafficHistory = []map[string]*NetCount{}

func loadTrafficHistory() (TrafficHistory, error) {
	Trafficmtx.Lock()
	defer Trafficmtx.Unlock()

	data, err := ioutil.ReadFile(TrafficStatePath)
	if err != nil {
		return TrafficHistory{}, err
	}

	traffic := TrafficHistory{}
	err = json.Unmarshal(data, &traffic)
	if err != nil {
		return TrafficHistory{}, err
	}

	return traffic, nil
}

func saveTrafficHistory(t TrafficHistory) {
	Trafficmtx.Lock()
	defer Trafficmtx.Unlock()

	file, _ := json.MarshalIndent(t, "", " ")
	err := ioutil.WriteFile(TrafficStatePath, file, 0600)
	if err != nil {
		log.Fatal(err)
	}
	return
}

func collectBandwithStats() {
	historyLimit := 60 * 24

	readings := make(map[string]*NetCount)

	lan_in := getDeviceTrafficSet("incoming_traffic_lan")
	lan_out := getDeviceTrafficSet("outgoing_traffic_lan")
	wan_out := getDeviceTrafficSet("outgoing_traffic_wan")
	wan_in := getDeviceTrafficSet("incoming_traffic_wan")

	for _, entry := range lan_out {
		_, exists := readings[entry.IP]
		if !exists {
			readings[entry.IP] = &NetCount{LanOut: entry.Bytes}
		} else {
			readings[entry.IP].LanOut = entry.Bytes
		}
	}

	for _, entry := range wan_out {
		_, exists := readings[entry.IP]
		if !exists {
			readings[entry.IP] = &NetCount{WanOut: entry.Bytes}
		} else {
			readings[entry.IP].WanOut = entry.Bytes
		}
	}

	for _, entry := range lan_in {
		_, exists := readings[entry.IP]
		if !exists {
			readings[entry.IP] = &NetCount{LanIn: entry.Bytes}
		} else {
			readings[entry.IP].LanIn = entry.Bytes
		}
	}

	for _, entry := range wan_in {
		_, exists := readings[entry.IP]
		if !exists {
			readings[entry.IP] = &NetCount{WanIn: entry.Bytes}
		} else {
			readings[entry.IP].WanIn = entry.Bytes
		}
	}

	end := len(gTrafficHistory)
	if end >= historyLimit {
		end = historyLimit - 1
	}
	//prepend readings
	gTrafficHistory = append([]map[string]*NetCount{readings}, gTrafficHistory[:end]...)
}

func collectIPTrafficStats() {

	//send IP traffic data to Influx
	if IFDB != nil {
		writeAPI := IFDB.WriteAPI(config.InfluxDB.Org, config.InfluxDB.Bucket)

		for _, entry := range getIPTrafficSet() {
			p := influxdb2.NewPointWithMeasurement("IP").
				AddTag("Src", entry.Src).
				AddTag("Dst", entry.Dst).
				AddField("Bytes", entry.Bytes).
				AddField("Packets", entry.Packets)

			writeAPI.WritePoint(p)
			writeAPI.Flush()

		}
	}
}

func trafficTimer() {

	runTimer := func() {
		ticker := time.NewTicker(1 * time.Minute)
		for {
			select {
			case <-ticker.C:

				collectBandwithStats()

				collectIPTrafficStats()
			}
		}
	}

	go runTimer()
}

func getTrafficHistory(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gTrafficHistory)
}

func initTraffic(config APIConfig) {
	if config.InfluxDB.URL != "" && config.InfluxDB.Token != "" {
		IFDB = influxdb2.NewClient(config.InfluxDB.URL, config.InfluxDB.Token)
	}
}

type DNSRecord struct {
	A           []ARecord
	FirstAnswer string
	FirstName   string
	Local       string
	Q           []QueryRecord
	Remote      string
	Timestamp   string
	Type        string
	Time        string
	Bucket      string
}

type ARecord struct {
	A   string
	Hdr Header
}

type Header struct {
	Class    int
	Name     string
	Rdlength int
	Rrtype   int
	Ttl      int
}

type QueryRecord struct {
	Name   string
	Qclass int
	Qtype  int
}

// ip -> domain map
var DNSCache = map[string]string{}
var DNSCacheTime = map[string]time.Time{}

var DNSCachemtx sync.RWMutex

func handleDnsEvent(topic string, value string) {
	var jsonData DNSRecord
	if err := json.Unmarshal([]byte(value), &jsonData); err != nil {
		log.Println("dns event, invalid json", err)
		return
	}

	domain := ""
	ips := []string{}
	ttls := []int{}

	for _, q := range jsonData.Q {
		if q.Name == "" {
			continue
		}
		domain = q.Name
		if q.Qclass != 1 && q.Qclass != 28 {
			continue
		}

		for _, a := range jsonData.A {
			if a.Hdr.Class != 1 && a.Hdr.Class != 28 {
				continue
			}
			if q.Name != "" && a.A != "" {
				ip := net.ParseIP(a.A)
				if ip != nil {
					if ip.To4() != nil {
						ips = append(ips, ip.To4().String())
						ttls = append(ttls, a.Hdr.Ttl)
					}
				}
			}
		}

		//only handle first query
		break
	}

	if len(ips) != 0 {
		if len(domain) > 1 {
			//get rid if the pesky trailing .
			domain = domain[:len(domain)-1]
			updateDnsCache(domain, ips, ttls)
		}
	}
}

func updateDnsCache(domain string, ips []string, ttls []int) {
	DNSCachemtx.Lock()
	defer DNSCachemtx.Unlock()

	for _, ip := range ips {
		DNSCache[ip] = domain
		DNSCacheTime[ip] = time.Now().Add(time.Duration(5) * time.Minute)
	}
}

func cleanDNSCache() {
	for {
		time.Sleep(10 * time.Minute)
		DNSCachemtx.Lock()
		for key, value := range DNSCacheTime {
			if time.Now().After(value) {
				delete(DNSCacheTime, key)
				delete(DNSCache, key)
			}
		}
		DNSCachemtx.Unlock()
	}
}

func DNSEventListener() {
	go cleanDNSCache()
	for i := 30; i > 0; i-- {
		err := sprbus.HandleEvent("dns:serve:", handleDnsEvent)
		if err != nil {
			log.Println(err)
		}
		time.Sleep(3 * time.Second)
	}
	log.Println("[-] failed to establish connection to sprbus for dns")
}
