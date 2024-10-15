package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"regexp"
	"strings"
)

type DNSSettings struct {
	UpstreamTLSHost   string
	UpstreamIPAddress string
	TlsDisable        bool
}

func parseDNSCorefile() DNSSettings {
	settings := DNSSettings{}

	file, err := os.Open(DNSConfigFile)
	if err != nil {
		fmt.Printf("Error opening file: %v\n", err)
		return settings
	}
	defer file.Close()

	ipRegex := regexp.MustCompile(`\b(?:[a-zA-Z]+:\/\/)?\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b`)
	serverNameRegex := regexp.MustCompile(`tls_servername\s+([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,})`)

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, "forward . ") {
			ipMatch := ipRegex.FindStringSubmatch(line)
			if len(ipMatch) > 1 {
				settings.UpstreamIPAddress = ipMatch[1]
			}
		}
		if strings.Contains(line, "tls_servername") {
			serverNameMatch := serverNameRegex.FindStringSubmatch(line)
			if len(serverNameMatch) > 1 {
				settings.UpstreamTLSHost = serverNameMatch[1]
			}
		}
	}

	if settings.UpstreamIPAddress != "" && settings.UpstreamTLSHost == "" {
		settings.TlsDisable = true
	}

	return settings
}

func updateDNSCorefile(dns DNSSettings) {
	// Read the file
	file, err := os.Open(DNSConfigFile)
	if err != nil {
		fmt.Printf("Error opening file: %v\n", err)
		return
	}
	defer file.Close()

	ipRegex := regexp.MustCompile(`\b(?:[a-zA-Z]+:\/\/)?\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b`)
	serverNameRegex := regexp.MustCompile(`tls_servername\s+([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,})`)

	var updatedLines []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, "forward . ") {
			if dns.TlsDisable == true {
				line = ipRegex.ReplaceAllString(line, dns.UpstreamIPAddress) // Replace with the new IP
			} else {
				line = ipRegex.ReplaceAllString(line, "tls://"+dns.UpstreamIPAddress) // Replace with the new IP
			}

			//only pick one for now
			matches := ipRegex.FindAllStringIndex(line, -1)
			if len(matches) > 1 {
				for _, match := range matches[1:] {
					line = line[:match[0]] + "" + line[match[1]:]
				}
			}

		}
		if !dns.TlsDisable && strings.Contains(line, "tls_servername") {
			line = serverNameRegex.ReplaceAllString(line, "tls_servername "+dns.UpstreamTLSHost) // Replace with the new server name
		}
		updatedLines = append(updatedLines, line)
	}
	if err := scanner.Err(); err != nil {
		fmt.Printf("Error reading file: %v\n", err)
		return
	}

	// Write the updated content back to the file
	outputFile, err := os.Create(DNSConfigFile)
	if err != nil {
		fmt.Printf("Error creating file: %v\n", err)
		return
	}
	defer outputFile.Close()
	writer := bufio.NewWriter(outputFile)
	for _, line := range updatedLines {
		_, err := writer.WriteString(line + "\n")
		if err != nil {
			fmt.Printf("Error writing to file: %v\n", err)
			return
		}
	}
	writer.Flush()
}

func dnsSettings(w http.ResponseWriter, r *http.Request) {
	Configmtx.Lock()
	defer Configmtx.Unlock()

	if r.Method == http.MethodPut {
		settings := DNSSettings{}
		err := json.NewDecoder(r.Body).Decode(&settings)
		if err != nil {
			http.Error(w, fmt.Errorf("failed to deserialize settings").Error(), 400)
			return
		}

		new_ip := net.ParseIP(settings.UpstreamIPAddress)
		if new_ip == nil {
			http.Error(w, fmt.Errorf("Invalid IP Address for DNS").Error(), 400)
			return
		}

		if settings.TlsDisable == true && settings.UpstreamTLSHost != "" {
			http.Error(w, fmt.Errorf("Unexpected TLS Host when TLS is disabled").Error(), 400)
			return
		}

		const dnsPattern = `^(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,6}\.?)$`
		dnsRegex := regexp.MustCompile(dnsPattern)
		if settings.TlsDisable == false && !dnsRegex.MatchString(settings.UpstreamTLSHost) {
			http.Error(w, fmt.Errorf("Invalid DNS TLS host name").Error(), 400)
			return
		}

		config.DNS = settings
		saveConfigLocked()
		updateDNSCorefile(config.DNS)
		callSuperdRestart("", "dns")
	} else {
		//migrate the settings, if dns is empty, parse the file
		if config.DNS.UpstreamIPAddress == "" {
			ret := parseDNSCorefile()
			if ret.UpstreamIPAddress != "" {
				config.DNS = ret
				saveConfigLocked()
				updateDNSCorefile(config.DNS)
				callSuperdRestart("", "dns")
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config.DNS)
}

func migrateDNSSettings() {
	//add fam dns
}
