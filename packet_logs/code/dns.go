package main

import (
	"encoding/json"
	"log"
	"net"
	"sync"
	"time"

	"github.com/spr-networks/sprbus"
)

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

func busListener() {
	go cleanDNSCache()
	go func() {
		for i := 30; i > 0; i-- {
			err := sprbus.HandleEvent("dns:serve:", handleDnsEvent)
			if err != nil {
				log.Println(err)
			}
			time.Sleep(3 * time.Second)
		}
		log.Fatal("failed to establish connection to sprbus")
	}()
}
