//go:build darwin
// +build darwin

package main

import (
	"fmt"
)

func bindToDevice(fd int, ifName string) error {
	// No-op on macOS
	return nil
}

// NFTClient is a stub implementation for macOS
type NFTClient struct{}

// TableFamily constants
type TableFamily uint8

const (
	TableFamilyIP   TableFamily = 0
	TableFamilyIP6  TableFamily = 1
	TableFamilyInet TableFamily = 2
)

// MapType stub
type MapType struct{}

var nftClient *NFTClient

// NewNFTClient creates a new NFT client stub for macOS
func NewNFTClient() *NFTClient {
	return &NFTClient{}
}

// InitNFTClient initializes the global nftables client stub
func InitNFTClient() {
	nftClient = NewNFTClient()
}

// GetNFTClient returns the global NFT client instance
func GetNFTClient() *NFTClient {
	if nftClient == nil {
		InitNFTClient()
	}
	return nftClient
}

// Utility functions for converting values to bytes
func IPToBytes(ip string) []byte {
	return []byte(ip)
}

func PortToBytes(port string) []byte {
	return []byte(port)
}

func ProtocolToBytes(protocol string) []byte {
	return []byte(protocol)
}

func InterfaceToBytes(iface string) []byte {
	return []byte(iface)
}

func MACToBytes(mac string) []byte {
	return []byte(mac)
}

func VerdictToBytes(verdict string) ([]byte, error) {
	return []byte(verdict), nil
}

// Forwarding rules
func AddForwardingRule(protocol, srcIP, srcPort, dstIP, dstPort string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func DeleteForwardingRule(protocol, srcIP, srcPort, dstIP, dstPort string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

// Block rules
func AddBlockRule(srcIP, dstIP, protocol string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func DeleteBlockRule(srcIP, dstIP, protocol string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func AddOutputBlockRule(srcIP, dstIP, protocol string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func DeleteOutputBlockRule(srcIP, dstIP, protocol string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func AddForwardingBlockRule(srcIP, dstIP, protocol, dstPort string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func DeleteForwardingBlockRule(srcIP, dstIP, protocol, dstPort string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

// Service ports
func AddServicePort(protocol, port string, upstream bool) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func DeleteServicePort(protocol, port string, upstream bool) error {
	return fmt.Errorf("nftables not supported on macOS")
}

// Endpoints
func AddEndpoint(protocol, srcIP, dstIP, port string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func DeleteEndpoint(protocol, srcIP, dstIP, port string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func HasEndpoint(protocol, srcIP, dstIP, port string) bool {
	return false
}

// Multicast
func AddMulticastPort(port, iface string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func DeleteMulticastPort(port, iface string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

// Ping rules
func AddPingRule(ip, iface string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func DeletePingRule(ip, iface string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func FlushPingRules() error {
	return fmt.Errorf("nftables not supported on macOS")
}

// Flushing
func FlushServicePorts() error {
	return fmt.Errorf("nftables not supported on macOS")
}

func FlushSetWithTable(family, table, setName string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

// Custom interface rules
func AddCustomInterfaceRule(srcInterface, srcIP, routeDst string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func DeleteCustomInterfaceRule(srcInterface, srcIP, routeDst string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

// Interface sets
func AddInterfaceToSet(setName, iface string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func DeleteInterfaceFromSet(setName, iface string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func AddInterfaceToSetWithTable(family, table, setName, iface string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func DeleteInterfaceFromSetWithTable(family, table, setName, iface string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

// JSON listing functions
func ListMapJSON(family, tableName, mapName string) ([]byte, error) {
	return nil, fmt.Errorf("nftables not supported on macOS")
}

func ListSetJSON(family, tableName, setName string) ([]byte, error) {
	return nil, fmt.Errorf("nftables not supported on macOS")
}

func ListTablesJSON() ([]byte, error) {
	return nil, fmt.Errorf("nftables not supported on macOS")
}

// IP verdict map functions
func AddIPVerdictToMap(family, tableName, mapName, ip, verdict string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func DeleteIPFromMap(family, tableName, mapName, ip string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func GetIPFromMap(family, tableName, mapName, ip string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

// Port verdict map functions
func AddPortVerdictToMap(family, tableName, mapName, port, verdict string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func DeletePortFromMap(family, tableName, mapName, port string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

// Set functions
func GetIPFromSet(family, tableName, setName, ip string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func CheckTableExists(family, tableName string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func ListTableText(family, tableName string) (string, error) {
	return "", fmt.Errorf("nftables not supported on macOS")
}

// Chain operations
func FlushChainByName(family, tableName, chainName string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func FlushMapByName(family, tableName, mapName string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

// Map element operations
func AddElementToMap(family, tableName, mapName, key, value string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func DeleteElementFromMap(family, tableName, mapName, key string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func GetElementFromMap(family, tableName, mapName, key string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func AddElementToMapComplex(family, tableName, mapName string, keyParts []string, value string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func DeleteElementFromMapComplex(family, tableName, mapName string, keyParts []string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func GetElementFromMapComplex(family, tableName, mapName string, keyParts []string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

// MAC verdict operations
func AddMACVerdictElement(family, tableName, mapName, ip, iface, mac, verdict string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func GetMACVerdictElement(family, tableName, mapName, ip, iface, mac, verdict string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func AddIPIfaceVerdictElement(family, tableName, mapName, ip, iface, verdict string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func GetIPIfaceVerdictElement(family, tableName, mapName, ip, iface, verdict string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

// Map existence check
func CheckMapExists(family, tableName, mapName string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func CreateIPIfaceVerdictMap(family, tableName, mapName string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

// Rule operations
func AddRuleToChain(family, tableName, chainName, rule string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func InsertRuleToChain(family, tableName, chainName, rule string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

// Chain operations
func CheckChainExists(family, tableName, chainName string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func AddChain(family, tableName, chainName string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func DeleteChain(family, tableName, chainName string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

// IP set operations
func AddIPToSet(family, tableName, setName, ip string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func DeleteIPFromSet(family, tableName, setName, ip string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func AddCIDRToSet(family, tableName, setName, cidr string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

// Route operations
func getRouteInterface(IP string) string {
	// Stub implementation for macOS
	return ""
}

func getRouteGatewayForTable(Table string) string {
	// Stub implementation for macOS
	return ""
}

// CIDR operations
func AddIPIfaceCIDRVerdictElement(family, tableName, mapName, cidr, iface, verdict string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

func AddIfaceIPCIDRVerdictElement(family, tableName, mapName, iface, cidr, verdict string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

// Verdict element operations
func DeleteMACVerdictElement(family, tableName, mapName, ip, iface, mac, verdict string) error {
	return fmt.Errorf("nftables not supported on macOS")
}

// Network interface checking
func isLinkReallyUpNetlink(interfaceName string) bool {
	// Stub implementation for macOS
	return false
}
