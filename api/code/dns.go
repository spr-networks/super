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
	UpstreamTLSHost         string
	UpstreamIPAddress       string
	UpstreamFamilyIPAddress string
	UpstreamFamilyTLSHost   string
	DisableTls              bool
	DisableFamilyTls        bool
}

func parseDNSCorefile() DNSSettings {
	settings := DNSSettings{}

	file, err := os.Open(DNSConfigFile)
	if err != nil {
		fmt.Printf("Error opening file: %v\n", err)
		return settings
	}

	var lines []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	if err := scanner.Err(); err != nil {
		fmt.Printf("error reading file: %v\n", err)
		return settings
	}
	file.Close()

	ipRegex := regexp.MustCompile(`\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b`)
	serverNameRegex := regexp.MustCompile(`tls_servername\s+([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,})`)

	hasDnsFamilyPolicy := false
	inDnsFamilyPolicy := false

	for i, line := range lines {
		if strings.Contains(line, "forward . ") {
			for index := i; index < len(lines); index++ {
				if strings.Contains(lines[index], "spr_policy") && strings.Contains(lines[index], "dns:family") {
					hasDnsFamilyPolicy = true
					inDnsFamilyPolicy = true
				}
				if strings.Contains(lines[index], "}") {
					break
				}
			}

			ipMatch := ipRegex.FindStringSubmatch(line)
			if len(ipMatch) >= 1 {
				if inDnsFamilyPolicy {
					settings.UpstreamFamilyIPAddress = ipMatch[0]
				} else {
					settings.UpstreamIPAddress = ipMatch[0]
				}
			}
		}

		if strings.Contains(line, "tls_servername") {
			serverNameMatch := serverNameRegex.FindStringSubmatch(line)
			if len(serverNameMatch) > 1 {
				if inDnsFamilyPolicy {
					settings.UpstreamFamilyTLSHost = serverNameMatch[1]
				} else {
					settings.UpstreamTLSHost = serverNameMatch[1]
				}
			}
		}

		if inDnsFamilyPolicy && strings.Contains(line, "}") {
			inDnsFamilyPolicy = false
		}

	}

	if settings.UpstreamIPAddress != "" && settings.UpstreamTLSHost == "" {
		settings.DisableTls = true
	}

	if settings.UpstreamFamilyIPAddress != "" && settings.UpstreamFamilyTLSHost == "" {
		settings.DisableFamilyTls = true
	}

	if hasDnsFamilyPolicy == false {
		settings.UpstreamFamilyTLSHost = "cloudflare-dns.com"
		settings.UpstreamFamilyIPAddress = "1.1.1.3"
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

	var lines []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	if err := scanner.Err(); err != nil {
		fmt.Printf("error reading file: %v\n", err)
		return
	}
	file.Close()

	ipRegex := regexp.MustCompile(`\b(?:[a-zA-Z]+:\/\/)?\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b`)
	serverNameRegex := regexp.MustCompile(`tls_servername\s+([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,})`)

	var updatedLines []string

	hasDnsFamilyPolicy := false
	inDnsFamilyPolicy := false
	lastForward := -1

	for i, line := range lines {
		if strings.Contains(line, "forward . ") {
			lastForward = i

			for index := i; index < len(lines); index++ {
				if strings.Contains(lines[index], "spr_policy") && strings.Contains(lines[index], "dns:family") {
					hasDnsFamilyPolicy = true
					inDnsFamilyPolicy = true
				}
				if strings.Contains(lines[index], "}") {
					break
				}
			}

			targetIP := dns.UpstreamIPAddress
			targetTlsDisabled := dns.DisableTls

			if inDnsFamilyPolicy {
				targetIP = dns.UpstreamFamilyIPAddress
				targetTlsDisabled = dns.DisableFamilyTls
			}

			//only pick one for now
			matches := ipRegex.FindAllStringIndex(line, -1)
			if len(matches) > 1 {
				for _, match := range matches[1:] {
					line = line[:match[0]] + "" + line[match[1]:]
				}
			}

			if targetTlsDisabled == true {
				line = ipRegex.ReplaceAllString(line, targetIP) // Replace with the new IP
			} else {
				line = ipRegex.ReplaceAllString(line, "tls://"+targetIP) // Replace with the new IP
			}

		}

		if inDnsFamilyPolicy && strings.Contains(line, "}") {
			inDnsFamilyPolicy = false
		}

		if strings.Contains(line, "tls_servername") {
			if inDnsFamilyPolicy && !dns.DisableFamilyTls {
				line = serverNameRegex.ReplaceAllString(line, "tls_servername "+dns.UpstreamFamilyTLSHost) // Replace with the new server name
				updatedLines = append(updatedLines, line)
			} else if !dns.DisableTls {
				line = serverNameRegex.ReplaceAllString(line, "tls_servername "+dns.UpstreamTLSHost) // Replace with the new server name
				updatedLines = append(updatedLines, line)
			}
		} else {
			updatedLines = append(updatedLines, line)
		}
	}

	if !hasDnsFamilyPolicy && lastForward != -1 {
		//we did not see a dns:family forwarded. populate one
		newForwarder := []string{"  forward . tls://" + dns.UpstreamFamilyIPAddress + " {",
			"    spr_policy dns:family",
			"    tls_servername " + dns.UpstreamFamilyTLSHost,
			"    max_concurrent 1000",
			"  }"}

		updatedLines = append(updatedLines[:lastForward], append(newForwarder, updatedLines[lastForward:]...)...)
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

		if settings.DisableTls == true && settings.UpstreamTLSHost != "" {
			http.Error(w, fmt.Errorf("Unexpected TLS Host when TLS is disabled").Error(), 400)
			return
		}

		const dnsPattern = `^(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,6}\.?)$`
		dnsRegex := regexp.MustCompile(dnsPattern)
		if settings.DisableTls == false && !dnsRegex.MatchString(settings.UpstreamTLSHost) {
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
	Configmtx.Lock()
	defer Configmtx.Unlock()
	restart := false
	if config.DNS.UpstreamIPAddress == "" {
		ret := parseDNSCorefile()
		if ret.UpstreamIPAddress != "" {
			config.DNS = ret
			saveConfigLocked()
			updateDNSCorefile(config.DNS)
			restart = true
		}
	}

	//add fam dns
	if config.DNS.UpstreamFamilyIPAddress == "" {
		config.DNS.UpstreamFamilyTLSHost = "cloudflare-dns.com"
		config.DNS.UpstreamFamilyIPAddress = "1.1.1.3"
		saveConfigLocked()
		updateDNSCorefile(config.DNS)
		restart = true
	}

	if restart {
		callSuperdRestart("", "dns")
	}
}
