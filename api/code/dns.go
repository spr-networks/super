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

type DNSProvider struct {
	IPAddress  string
	TLSHost    string
	DisableTls bool
}

type DNSSettings struct {
	// Legacy fields for backward compatibility
	UpstreamTLSHost         string
	UpstreamIPAddress       string
	UpstreamFamilyIPAddress string
	UpstreamFamilyTLSHost   string
	DisableTls              bool
	DisableFamilyTls        bool
	
	// New fields for multiple providers
	UpstreamProviders       []DNSProvider
	FamilyProviders         []DNSProvider
}

// Migrate legacy settings to new provider format
func (dns *DNSSettings) migrateToProviders() {
	// Migrate upstream providers if not already populated
	if len(dns.UpstreamProviders) == 0 && dns.UpstreamIPAddress != "" {
		dns.UpstreamProviders = []DNSProvider{{
			IPAddress:  dns.UpstreamIPAddress,
			TLSHost:    dns.UpstreamTLSHost,
			DisableTls: dns.DisableTls,
		}}
	}
	
	// Migrate family providers if not already populated
	if len(dns.FamilyProviders) == 0 && dns.UpstreamFamilyIPAddress != "" {
		dns.FamilyProviders = []DNSProvider{{
			IPAddress:  dns.UpstreamFamilyIPAddress,
			TLSHost:    dns.UpstreamFamilyTLSHost,
			DisableTls: dns.DisableFamilyTls,
		}}
	}
	
	// Update legacy fields from new format for backward compatibility
	if len(dns.UpstreamProviders) > 0 {
		dns.UpstreamIPAddress = dns.UpstreamProviders[0].IPAddress
		dns.UpstreamTLSHost = dns.UpstreamProviders[0].TLSHost
		dns.DisableTls = dns.UpstreamProviders[0].DisableTls
	}
	
	if len(dns.FamilyProviders) > 0 {
		dns.UpstreamFamilyIPAddress = dns.FamilyProviders[0].IPAddress
		dns.UpstreamFamilyTLSHost = dns.FamilyProviders[0].TLSHost
		dns.DisableFamilyTls = dns.FamilyProviders[0].DisableTls
	}
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

func buildForwardLine(providers []DNSProvider) string {
	var servers []string
	for _, provider := range providers {
		if provider.DisableTls {
			servers = append(servers, provider.IPAddress)
		} else {
			servers = append(servers, "tls://"+provider.IPAddress)
		}
	}
	return "  forward . " + strings.Join(servers, " ") + " {"
}

func updateDNSCorefileMulti(dns DNSSettings) {
	// Ensure migration to new format
	dns.migrateToProviders()
	
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

	var updatedLines []string
	skipUntilCloseBrace := false
	hasDnsFamilyPolicy := false
	lastForwardIdx := -1

	for i := 0; i < len(lines); i++ {
		line := lines[i]
		
		if skipUntilCloseBrace {
			if strings.Contains(line, "}") {
				skipUntilCloseBrace = false
			}
			continue
		}

		if strings.Contains(line, "forward . ") {
			lastForwardIdx = len(updatedLines)
			
			// Check if this is a family policy forward
			isFamilyPolicy := false
			for j := i; j < len(lines) && !strings.Contains(lines[j], "}"); j++ {
				if strings.Contains(lines[j], "spr_policy") && strings.Contains(lines[j], "dns:family") {
					isFamilyPolicy = true
					hasDnsFamilyPolicy = true
					break
				}
			}

			// Build new forward block
			providers := dns.UpstreamProviders
			if isFamilyPolicy {
				providers = dns.FamilyProviders
			}

			if len(providers) > 0 {
				updatedLines = append(updatedLines, buildForwardLine(providers))
				
				// Add spr_policy if this is family
				if isFamilyPolicy {
					updatedLines = append(updatedLines, "    spr_policy dns:family")
				}
				
				// Add tls_servername entries for each provider that uses TLS
				for _, provider := range providers {
					if !provider.DisableTls && provider.TLSHost != "" {
						updatedLines = append(updatedLines, "    tls_servername "+provider.IPAddress+" "+provider.TLSHost)
					}
				}
				
				updatedLines = append(updatedLines, "    max_concurrent 1000")
				updatedLines = append(updatedLines, "  }")
			}
			
			skipUntilCloseBrace = true
		} else {
			updatedLines = append(updatedLines, line)
		}
	}

	// Add family policy if it doesn't exist
	if !hasDnsFamilyPolicy && len(dns.FamilyProviders) > 0 && lastForwardIdx != -1 {
		newForwarder := []string{buildForwardLine(dns.FamilyProviders)}
		newForwarder = append(newForwarder, "    spr_policy dns:family")
		
		// Add tls_servername entries
		for _, provider := range dns.FamilyProviders {
			if !provider.DisableTls && provider.TLSHost != "" {
				newForwarder = append(newForwarder, "    tls_servername "+provider.IPAddress+" "+provider.TLSHost)
			}
		}
		
		newForwarder = append(newForwarder, "    max_concurrent 1000")
		newForwarder = append(newForwarder, "  }")
		
		// Insert after the last forward block
		updatedLines = append(updatedLines[:lastForwardIdx+1], 
			append(newForwarder, updatedLines[lastForwardIdx+1:]...)...)
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

		// Migrate legacy format to new format
		settings.migrateToProviders()
		
		// Validate all providers
		const dnsPattern = `^(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,6}\.?)$`
		dnsRegex := regexp.MustCompile(dnsPattern)
		
		// Validate upstream providers
		for _, provider := range settings.UpstreamProviders {
			new_ip := net.ParseIP(provider.IPAddress)
			if new_ip == nil {
				http.Error(w, fmt.Errorf("Invalid IP Address for DNS: %s", provider.IPAddress).Error(), 400)
				return
			}
			
			if provider.DisableTls == true && provider.TLSHost != "" {
				http.Error(w, fmt.Errorf("Unexpected TLS Host when TLS is disabled").Error(), 400)
				return
			}
			
			if provider.DisableTls == false && !dnsRegex.MatchString(provider.TLSHost) {
				http.Error(w, fmt.Errorf("Invalid DNS TLS host name: %s", provider.TLSHost).Error(), 400)
				return
			}
		}
		
		// Validate family providers
		for _, provider := range settings.FamilyProviders {
			new_ip := net.ParseIP(provider.IPAddress)
			if new_ip == nil {
				http.Error(w, fmt.Errorf("Invalid IP Address for Family DNS: %s", provider.IPAddress).Error(), 400)
				return
			}
			
			if provider.DisableTls == true && provider.TLSHost != "" {
				http.Error(w, fmt.Errorf("Unexpected TLS Host when TLS is disabled").Error(), 400)
				return
			}
			
			if provider.DisableTls == false && !dnsRegex.MatchString(provider.TLSHost) {
				http.Error(w, fmt.Errorf("Invalid DNS TLS host name: %s", provider.TLSHost).Error(), 400)
				return
			}
		}
		
		// Also validate legacy fields for backward compatibility
		if settings.UpstreamIPAddress != "" {
			new_ip := net.ParseIP(settings.UpstreamIPAddress)
			if new_ip == nil {
				http.Error(w, fmt.Errorf("Invalid IP Address for DNS").Error(), 400)
				return
			}
			
			if settings.DisableTls == true && settings.UpstreamTLSHost != "" {
				http.Error(w, fmt.Errorf("Unexpected TLS Host when TLS is disabled").Error(), 400)
				return
			}
			
			if settings.DisableTls == false && settings.UpstreamTLSHost != "" && !dnsRegex.MatchString(settings.UpstreamTLSHost) {
				http.Error(w, fmt.Errorf("Invalid DNS TLS host name").Error(), 400)
				return
			}
		}

		config.DNS = settings
		saveConfigLocked()
		updateDNSCorefileMulti(config.DNS)
		callSuperdRestart("", "dns")
	} else {
		//migrate the settings, if dns is empty, parse the file
		if config.DNS.UpstreamIPAddress == "" {
			ret := parseDNSCorefile()
			if ret.UpstreamIPAddress != "" {
				config.DNS = ret
				saveConfigLocked()
				updateDNSCorefileMulti(config.DNS)
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
