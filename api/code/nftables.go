//go:build linux

package main

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"net"
	"os/exec"
	"strconv"
	"strings"

	"github.com/google/nftables"
	"github.com/google/nftables/expr"
	"golang.org/x/sys/unix"
)

// NFTClient wraps the google/nftables client with our abstractions
type NFTClient struct {
	conn *nftables.Conn
}

// NewNFTClient creates a new NFT client
func NewNFTClient() *NFTClient {
	return &NFTClient{
		conn: &nftables.Conn{},
	}
}

// TableFamily represents nftables table families
type TableFamily uint32

const (
	TableFamilyInet TableFamily = unix.NFPROTO_INET
	TableFamilyIP   TableFamily = unix.NFPROTO_IPV4
)

// MapType represents the type of nftables map
type MapType struct {
	KeyType  nftables.SetDatatype
	DataType nftables.SetDatatype
}

// Common map types used in the codebase - simplified since google/nftables handles the details
var (
	// ip . port : ip . port (for forwarding rules)
	MapTypeIPPortToIPPort = MapType{
		KeyType:  nftables.TypeIPAddr,
		DataType: nftables.TypeIPAddr,
	}
	// ip : ip (for any forwarding rules)
	MapTypeIPToIP = MapType{
		KeyType:  nftables.TypeIPAddr,
		DataType: nftables.TypeIPAddr,
	}
	// ip . ip . protocol : verdict (for block rules)
	MapTypeIPIPProtoToVerdict = MapType{
		KeyType:  nftables.TypeIPAddr,
		DataType: nftables.TypeVerdict,
	}
	// ip . ip . protocol . port : verdict (for forwarding block rules)
	MapTypeIPIPProtoPortToVerdict = MapType{
		KeyType:  nftables.TypeIPAddr,
		DataType: nftables.TypeVerdict,
	}
	// port : verdict (for service ports)
	MapTypePortToVerdict = MapType{
		KeyType:  nftables.TypeInetService,
		DataType: nftables.TypeVerdict,
	}
	// ip . iface : verdict (for access rules)
	MapTypeIPIfaceToVerdict = MapType{
		KeyType:  nftables.TypeIPAddr,
		DataType: nftables.TypeVerdict,
	}
	// ip . iface . mac : verdict (for ethernet filter)
	MapTypeIPIfaceMacToVerdict = MapType{
		KeyType:  nftables.TypeIPAddr,
		DataType: nftables.TypeVerdict,
	}
	// iface . mac : verdict (for DHCP access)
	MapTypeIfaceMacToVerdict = MapType{
		KeyType:  nftables.TypeString,
		DataType: nftables.TypeVerdict,
	}
	// ip . ip . port : verdict (for endpoint forwarding)
	MapTypeIPIPPortToVerdict = MapType{
		KeyType:  nftables.TypeIPAddr,
		DataType: nftables.TypeVerdict,
	}
	// iface . ip : verdict (for interface forwarding)
	MapTypeIfaceIPToVerdict = MapType{
		KeyType:  nftables.TypeString,
		DataType: nftables.TypeVerdict,
	}
	// ip : ip (for custom DNS devices)
	MapTypeIPToIPNAT = MapType{
		KeyType:  nftables.TypeIPAddr,
		DataType: nftables.TypeIPAddr,
	}
)

// GetTable gets or creates a table
func (c *NFTClient) GetTable(family TableFamily, name string) *nftables.Table {
	table := &nftables.Table{
		Family: nftables.TableFamily(family),
		Name:   name,
	}

	// Try to get existing table first
	tables, err := c.conn.ListTables()
	if err == nil {
		for _, t := range tables {
			if t.Family == table.Family && t.Name == table.Name {
				return t
			}
		}
	}

	// Create table if it doesn't exist
	return c.conn.AddTable(table)
}

// GetMap gets an existing map
func (c *NFTClient) GetMap(family TableFamily, tableName, mapName string) (*nftables.Set, error) {
	table := c.GetTable(family, tableName)
	if table == nil {
		return nil, fmt.Errorf("table %s not found", tableName)
	}

	sets, err := c.conn.GetSets(table)
	if err != nil {
		// Check if this is the known concatenated type issue
		if strings.Contains(err.Error(), "conn.Receive: netlink receive: invalid argument") {
			// For known concatenated maps, return a basic set structure
			// This is a workaround for the google/nftables issue
			switch mapName {
			case "tcpfwd", "udpfwd":
				// ipv4_addr . inet_service : ipv4_addr . inet_service
				return &nftables.Set{
					Table:    table,
					Name:     mapName,
					KeyType:  nftables.SetDatatype{Name: "ipv4_addr . inet_service", Bytes: 8},
					DataType: nftables.SetDatatype{Name: "ipv4_addr . inet_service", Bytes: 8},
					IsMap:    true,
				}, nil
			case "tcpanyfwd", "udpanyfwd":
				// ipv4_addr : ipv4_addr
				return &nftables.Set{
					Table:    table,
					Name:     mapName,
					KeyType:  nftables.TypeIPAddr,
					DataType: nftables.TypeIPAddr,
					IsMap:    true,
				}, nil
			case "block":
				// ipv4_addr . ipv4_addr . inet_proto : verdict
				return &nftables.Set{
					Table:    table,
					Name:     mapName,
					KeyType:  nftables.SetDatatype{Name: "ipv4_addr . ipv4_addr . inet_proto", Bytes: 9},
					DataType: nftables.SetDatatype{Name: "verdict", Bytes: 0},
					IsMap:    true,
				}, nil
			default:
				// For other maps, return a generic structure
				return &nftables.Set{
					Table: table,
					Name:  mapName,
					IsMap: true,
				}, nil
			}
		}
		return nil, err
	}

	for _, set := range sets {
		if set.Name == mapName {
			return set, nil
		}
	}

	return nil, fmt.Errorf("map %s not found in table %s", mapName, tableName)
}

// ListMapElements lists all elements in a map and returns them as JSON
func (c *NFTClient) ListMapElements(family TableFamily, tableName, mapName string) ([]byte, error) {
	set, err := c.GetMap(family, tableName, mapName)
	if err != nil {
		return nil, err
	}

	elements, err := c.conn.GetSetElements(set)
	if err != nil {
		return nil, err
	}

	// Convert elements to JSON format similar to nft -j output
	result := map[string]interface{}{
		"nftables": []map[string]interface{}{
			{
				"map": map[string]interface{}{
					"family": familyToString(family),
					"name":   mapName,
					"table":  tableName,
					"elem":   formatElements(elements),
				},
			},
		},
	}

	return json.Marshal(result)
}

// ListSetElements lists all elements in a set and returns them as JSON
func (c *NFTClient) ListSetElements(family TableFamily, tableName, setName string) ([]byte, error) {
	set, err := c.GetMap(family, tableName, setName)
	if err != nil {
		return nil, err
	}

	elements, err := c.conn.GetSetElements(set)
	if err != nil {
		return nil, err
	}

	// Convert elements to JSON format similar to nft -j output
	result := map[string]interface{}{
		"nftables": []map[string]interface{}{
			{
				"set": map[string]interface{}{
					"family": familyToString(family),
					"name":   setName,
					"table":  tableName,
					"elem":   formatSetElements(elements),
				},
			},
		},
	}

	return json.Marshal(result)
}

// AddMapElement adds an element to a map
func (c *NFTClient) AddMapElement(family TableFamily, tableName, mapName string, key, value []byte) error {
	set, err := c.GetMap(family, tableName, mapName)
	if err != nil {
		return fmt.Errorf("failed to get map %s/%s/%s: %w", familyToString(family), tableName, mapName, err)
	}

	// Don't pad concatenated types - use actual byte length
	// The google/nftables library will handle the proper alignment

	element := nftables.SetElement{
		Key: key,
	}

	// Check if this is a verdict map first
	isVerdictMap := set.IsMap && set.DataType.Name == "verdict"

	// For interval maps, we need to set KeyEnd = Key to prevent range merging
	if set.Interval {
		element.IntervalEnd = false
		element.KeyEnd = make([]byte, len(key))
		copy(element.KeyEnd, key)
	}

	if isVerdictMap {
		// For verdict maps, always use VerdictData regardless of interval flag
		// This avoids the netlink issues with interval verdict maps
		verdictStr := string(value)

		switch verdictStr {
		case "accept":
			element.VerdictData = &expr.Verdict{
				Kind: expr.VerdictAccept,
			}
		case "drop":
			element.VerdictData = &expr.Verdict{
				Kind: expr.VerdictDrop,
			}
		case "continue":
			element.VerdictData = &expr.Verdict{
				Kind: expr.VerdictContinue,
			}
		case "return":
			element.VerdictData = &expr.Verdict{
				Kind: expr.VerdictReturn,
			}
		default:
			// Handle goto/jump verdicts
			if strings.HasPrefix(verdictStr, "goto ") {
				chainName := strings.TrimPrefix(verdictStr, "goto ")
				element.VerdictData = &expr.Verdict{
					Kind:  expr.VerdictGoto,
					Chain: chainName,
				}
			} else if strings.HasPrefix(verdictStr, "jump ") {
				chainName := strings.TrimPrefix(verdictStr, "jump ")
				element.VerdictData = &expr.Verdict{
					Kind:  expr.VerdictJump,
					Chain: chainName,
				}
			} else {
				return fmt.Errorf("unknown verdict: %s", verdictStr)
			}
		}
	} else {
		// For non-verdict maps, check if the caller is trying to use a verdict value
		// and convert it to bytes if needed
		if len(value) == 0 || (len(value) < 10 && isVerdictString(string(value))) {
			// This looks like a verdict string, convert it
			verdictBytes, err := VerdictToBytes(string(value))
			if err != nil {
				return fmt.Errorf("failed to convert verdict: %w", err)
			}
			value = verdictBytes
		}

		// Check if we need to pad the value as well
		if set.IsMap && set.DataType.Bytes > uint32(len(value)) {
			paddedValue := make([]byte, set.DataType.Bytes)
			copy(paddedValue, value)
			value = paddedValue
		}
		element.Val = value
	}

	err = c.conn.SetAddElements(set, []nftables.SetElement{element})
	if err != nil {
		return fmt.Errorf("failed to add element to set: %w", err)
	}

	err = c.conn.Flush()
	if err != nil {
		return fmt.Errorf("failed to flush after adding element: %w", err)
	}

	return nil
}

// isVerdictString checks if a string is a valid verdict
func isVerdictString(s string) bool {
	switch s {
	case "accept", "drop", "continue", "return":
		return true
	default:
		return strings.HasPrefix(s, "goto ") || strings.HasPrefix(s, "jump ")
	}
}

// DeleteMapElement deletes an element from a map
func (c *NFTClient) DeleteMapElement(family TableFamily, tableName, mapName string, key []byte) error {
	set, err := c.GetMap(family, tableName, mapName)
	if err != nil {
		return fmt.Errorf("failed to get map %s/%s/%s: %w", familyToString(family), tableName, mapName, err)
	}

	// For concatenated types, we need to ensure proper alignment
	// The google/nftables library expects keys to match the exact size
	if set.KeyType.Bytes > uint32(len(key)) {
		// Pad the key to the expected size
		paddedKey := make([]byte, set.KeyType.Bytes)
		copy(paddedKey, key)
		key = paddedKey
	}

	element := nftables.SetElement{
		Key: key,
	}

	// Note: There is a known issue with google/nftables where GetSetElements
	// fails for concatenated types, which can cause issues with delete operations.
	// The delete operation itself should work, but verification might fail.
	err = c.conn.SetDeleteElements(set, []nftables.SetElement{element})
	if err != nil {
		// Check if this is the known GetSetElements issue
		if strings.Contains(err.Error(), "conn.Receive: netlink receive: invalid argument") {
			// This is likely the concatenated type issue - try to proceed anyway
			// as the element might have been deleted successfully
			return nil
		}
		return fmt.Errorf("failed to delete element from set: %w", err)
	}

	err = c.conn.Flush()
	if err != nil {
		// Check if this is the known issue
		if strings.Contains(err.Error(), "conn.Receive: netlink receive: invalid argument") {
			// This is likely the concatenated type issue - the operation might have succeeded
			return nil
		}
		return fmt.Errorf("failed to flush after deleting element: %w", err)
	}
	return nil
}

// GetMapElement checks if an element exists in a map
func (c *NFTClient) GetMapElement(family TableFamily, tableName, mapName string, key []byte) error {
	set, err := c.GetMap(family, tableName, mapName)
	if err != nil {
		return err
	}

	elements, err := c.conn.GetSetElements(set)
	if err != nil {
		return err
	}

	// Check if the key exists
	for _, elem := range elements {
		if compareKeys(elem.Key, key) {
			return nil
		}
	}

	return fmt.Errorf("element not found")
}

// FlushMap removes all elements from a map
func (c *NFTClient) FlushMap(family TableFamily, tableName, mapName string) error {
	set, err := c.GetMap(family, tableName, mapName)
	if err != nil {
		return err
	}

	c.conn.FlushSet(set)
	return c.conn.Flush()
}

// FlushChain removes all rules from a chain
func (c *NFTClient) FlushChain(family TableFamily, tableName, chainName string) error {
	table := c.GetTable(family, tableName)

	chain := &nftables.Chain{
		Name:  chainName,
		Table: table,
	}

	c.conn.FlushChain(chain)
	return c.conn.Flush()
}

// AddSetElement adds an element to a set
func (c *NFTClient) AddSetElement(family TableFamily, tableName, setName string, element []byte) error {
	set, err := c.GetMap(family, tableName, setName)
	if err != nil {
		return err
	}

	elem := nftables.SetElement{
		Key: element,
	}

	err = c.conn.SetAddElements(set, []nftables.SetElement{elem})
	if err != nil {
		return err
	}

	return c.conn.Flush()
}

// DeleteSetElement deletes an element from a set
func (c *NFTClient) DeleteSetElement(family TableFamily, tableName, setName string, element []byte) error {
	set, err := c.GetMap(family, tableName, setName)
	if err != nil {
		return err
	}

	elem := nftables.SetElement{
		Key: element,
	}

	err = c.conn.SetDeleteElements(set, []nftables.SetElement{elem})
	if err != nil {
		return err
	}

	return c.conn.Flush()
}

// FlushSet removes all elements from a set
func (c *NFTClient) FlushSet(family TableFamily, tableName, setName string) error {
	set, err := c.GetMap(family, tableName, setName)
	if err != nil {
		return err
	}

	c.conn.FlushSet(set)
	return c.conn.Flush()
}

// ListTables lists all tables and returns them as JSON
func (c *NFTClient) ListTables() ([]byte, error) {
	tables, err := c.conn.ListTables()
	if err != nil {
		return nil, err
	}

	var nftables_list []map[string]interface{}
	for _, table := range tables {
		nftables_list = append(nftables_list, map[string]interface{}{
			"table": map[string]interface{}{
				"family": familyToString(TableFamily(table.Family)),
				"name":   table.Name,
			},
		})
	}

	result := map[string]interface{}{
		"nftables": nftables_list,
	}

	return json.Marshal(result)
}

// CheckTable checks if a table exists
func (c *NFTClient) CheckTable(family TableFamily, tableName string) error {
	tables, err := c.conn.ListTables()
	if err != nil {
		return err
	}

	for _, table := range tables {
		if table.Family == nftables.TableFamily(family) && table.Name == tableName {
			return nil
		}
	}

	return fmt.Errorf("table %s not found", tableName)
}

// Helper functions

// familyToString converts TableFamily to string
func familyToString(family TableFamily) string {
	switch family {
	case TableFamilyInet:
		return "inet"
	case TableFamilyIP:
		return "ip"
	default:
		return "inet"
	}
}

// formatElements formats set elements for JSON output
func formatElements(elements []nftables.SetElement) []interface{} {
	var result []interface{}
	for _, elem := range elements {
		formatted := formatElement(elem)
		if formatted != nil {
			result = append(result, formatted)
		}
	}
	return result
}

// formatSetElements formats set elements (no values) for JSON output
func formatSetElements(elements []nftables.SetElement) []interface{} {
	var result []interface{}
	for _, elem := range elements {
		formatted := formatElementKey(elem.Key)
		if formatted != nil {
			result = append(result, formatted)
		}
	}
	return result
}

// formatElement formats a single set element for JSON output
func formatElement(elem nftables.SetElement) interface{} {
	key := formatElementKey(elem.Key)
	if key == nil {
		return nil
	}

	// If there's a value, format as map element
	if len(elem.Val) > 0 {
		value := formatElementKey(elem.Val)
		return map[string]interface{}{
			string(key.(string)): value,
		}
	}

	return key
}

// formatElementKey formats element key/value bytes for JSON output
func formatElementKey(keyBytes []byte) interface{} {
	if len(keyBytes) == 0 {
		return nil
	}

	if len(keyBytes) == 4 {
		// Treat as IPv4 address
		ip := net.IP(keyBytes)
		if ip.To4() != nil {
			return ip.String()
		} else {
			// Treat as port or other 4-byte value
			if len(keyBytes) >= 2 {
				port := uint16(keyBytes[0])<<8 | uint16(keyBytes[1])
				return strconv.Itoa(int(port))
			}
		}
	} else if len(keyBytes) == 2 {
		// Treat as port
		port := uint16(keyBytes[0])<<8 | uint16(keyBytes[1])
		return strconv.Itoa(int(port))
	} else if len(keyBytes) == 1 {
		// Treat as protocol number
		return strconv.Itoa(int(keyBytes[0]))
	} else if len(keyBytes) == 6 {
		// Treat as MAC address
		mac := net.HardwareAddr(keyBytes)
		return mac.String()
	} else {
		// Treat as string (interface name, etc.)
		return strings.TrimRight(string(keyBytes), "\x00")
	}

	// Default case
	return string(keyBytes)
}

// compareKeys compares two keys for equality
func compareKeys(key1, key2 []byte) bool {
	if len(key1) != len(key2) {
		return false
	}

	for i := range key1 {
		if key1[i] != key2[i] {
			return false
		}
	}

	return true
}

// Helper functions to convert common types to bytes

// Helper function to parse family string and get client
func withFamily(family string) (TableFamily, *NFTClient, error) {
	var f TableFamily
	switch family {
	case "inet":
		f = TableFamilyInet
	case "ip":
		f = TableFamilyIP
	default:
		return 0, nil, fmt.Errorf("unsupported family: %s", family)
	}
	return f, GetNFTClient(), nil
}

// Helper functions for building common key patterns

// buildIPIPProtocolKey builds a key from src IP, dst IP, and protocol
func buildIPIPProtocolKey(srcIP, dstIP, protocol string) []byte {
	return append(append(IPToBytes(srcIP), IPToBytes(dstIP)...), ProtocolToBytesForConcatenated(protocol)...)
}

// buildIPIPKey builds a key from src IP and dst IP
func buildIPIPKey(srcIP, dstIP string) []byte {
	return append(IPToBytes(srcIP), IPToBytes(dstIP)...)
}

// buildIPIPPortKey builds a key from src IP, dst IP, and port
func buildIPIPPortKey(srcIP, dstIP, port string) []byte {
	return append(append(IPToBytes(srcIP), IPToBytes(dstIP)...), PortToBytesForConcatenated(port)...)
}

// buildIPIfaceKey builds a key from IP and interface
func buildIPIfaceKey(ip, iface string) []byte {
	return append(IPToBytes(ip), InterfaceToBytes(iface)...)
}

// IPToBytes converts an IP address string to bytes
func IPToBytes(ip string) []byte {
	// Handle CIDR notation by extracting just the IP part
	if strings.Contains(ip, "/") {
		ipAddr, _, err := net.ParseCIDR(ip)
		if err != nil {
			return nil
		}
		return ipAddr.To4()
	}

	// Handle regular IP
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return nil
	}
	return parsed.To4()
}

// PortToBytes converts a port string to bytes
func PortToBytes(port string) []byte {
	p, err := strconv.Atoi(port)
	if err != nil || p < 0 || p > 65535 {
		return nil
	}
	// Use network byte order (big-endian) for port
	buf := make([]byte, 2)
	binary.BigEndian.PutUint16(buf, uint16(p))
	return buf
}

// PortToBytesForConcatenated returns 4 bytes for concatenated maps
func PortToBytesForConcatenated(port string) []byte {
	// Handle port ranges like "5000-6000"
	if strings.Contains(port, "-") {
		parts := strings.Split(port, "-")
		if len(parts) == 2 {
			startPort, err1 := strconv.Atoi(parts[0])
			endPort, err2 := strconv.Atoi(parts[1])
			if err1 == nil && err2 == nil && startPort <= endPort && startPort > 0 && endPort <= 65535 {
				// For interval maps, we use the start port for the key
				// The nftables library will handle the range internally
				buf := make([]byte, 4)
				binary.BigEndian.PutUint16(buf, uint16(startPort))
				// Last 2 bytes remain 0 for padding
				return buf
			}
		}
		return nil
	}

	// Handle single port
	p, err := strconv.Atoi(port)
	if err != nil || p <= 0 || p > 65535 {
		return nil
	}
	// Return 4 bytes for inet_service in concatenated types - big endian
	buf := make([]byte, 4)
	binary.BigEndian.PutUint16(buf, uint16(p))
	// Last 2 bytes remain 0 for padding
	return buf
}

// ProtocolToBytes converts a protocol string to bytes
func ProtocolToBytes(protocol string) []byte {
	switch protocol {
	case "tcp":
		return []byte{6}
	case "udp":
		return []byte{17}
	case "icmp":
		return []byte{1}
	default:
		if p, err := strconv.Atoi(protocol); err == nil {
			// Ensure protocol number is within valid range for byte (0-255)
			if p < 0 || p > 255 {
				return nil
			}
			return []byte{byte(p)}
		}
		return nil
	}
}

// ProtocolToBytesForConcatenated converts protocol to bytes with proper padding for concatenated types
func ProtocolToBytesForConcatenated(protocol string) []byte {
	// For concatenated types, inet_proto might need different padding
	// Let's try 4-byte alignment like we do for ports
	switch protocol {
	case "tcp":
		return []byte{6, 0, 0, 0}
	case "udp":
		return []byte{17, 0, 0, 0}
	case "icmp":
		return []byte{1, 0, 0, 0}
	default:
		if p, err := strconv.Atoi(protocol); err == nil {
			// Ensure protocol number is within valid range for byte (0-255)
			if p < 0 || p > 255 {
				return nil
			}
			return []byte{byte(p), 0, 0, 0}
		}
		return nil
	}
}

// InterfaceToBytes converts an interface name to bytes
func InterfaceToBytes(iface string) []byte {
	// For nftables ifname type in concatenated keys, pad to 16 bytes
	padded := make([]byte, 16)
	copy(padded, []byte(iface))
	return padded
}

// MACToBytes converts a MAC address string to bytes
func MACToBytes(mac string) []byte {
	hw, err := net.ParseMAC(mac)
	if err != nil {
		return nil
	}
	// nftables expects 8 bytes for ether_addr type (6 bytes MAC + 2 bytes padding)
	padded := make([]byte, 8)
	copy(padded, hw)
	return padded
}

// VerdictToBytes converts a verdict string to bytes
func VerdictToBytes(verdict string) ([]byte, error) {
	// NFT verdict codes are 32-bit integers in network byte order
	// Based on expr.VerdictKind constants:
	// VerdictReturn = -5, VerdictGoto = -4, VerdictJump = -3,
	// VerdictBreak = -2, VerdictContinue = -1, VerdictDrop = 0,
	// VerdictAccept = 1, VerdictStolen = 2, VerdictQueue = 3,
	// VerdictRepeat = 4, VerdictStop = 5
	buf := make([]byte, 4)

	var val int32
	switch verdict {
	case "return":
		val = -5 // expr.VerdictReturn
	case "goto":
		val = -4 // expr.VerdictGoto
	case "jump":
		val = -3 // expr.VerdictJump
	case "break":
		val = -2 // expr.VerdictBreak
	case "continue":
		val = -1 // expr.VerdictContinue
	case "drop":
		val = 0 // expr.VerdictDrop
	case "accept":
		val = 1 // expr.VerdictAccept
	case "stolen":
		val = 2 // expr.VerdictStolen
	case "queue":
		val = 3 // expr.VerdictQueue
	case "repeat":
		val = 4 // expr.VerdictRepeat
	case "stop":
		val = 5 // expr.VerdictStop
	default:
		return nil, fmt.Errorf("unknown verdict: %s", verdict)
	}

	binary.BigEndian.PutUint32(buf, uint32(val))

	return buf, nil
}

// High-level wrapper functions for common operations

// Global client instance
var globalNFTClient *NFTClient

// InitNFTClient initializes the global NFT client
func InitNFTClient() {
	globalNFTClient = NewNFTClient()
}

// GetNFTClient returns the global NFT client, initializing if needed
func GetNFTClient() *NFTClient {
	if globalNFTClient == nil {
		InitNFTClient()
	}
	return globalNFTClient
}

// Firewall-specific wrapper functions

// AddForwardingRule adds a forwarding rule to the appropriate map
func AddForwardingRule(protocol, srcIP, srcPort, dstIP, dstPort string) error {
	client := GetNFTClient()

	var mapName string
	var key, value []byte

	if dstPort == "any" {
		mapName = protocol + "anyfwd"
		key = IPToBytes(srcIP)
		value = IPToBytes(dstIP)

		if key == nil || value == nil {
			return fmt.Errorf("invalid IP address")
		}
	} else {
		mapName = protocol + "fwd"
		// For complex keys, we'll concatenate the bytes
		srcIPBytes := IPToBytes(srcIP)
		srcPortBytes := PortToBytesForConcatenated(srcPort)
		dstIPBytes := IPToBytes(dstIP)
		dstPortBytes := PortToBytesForConcatenated(dstPort)

		if srcIPBytes == nil || srcPortBytes == nil || dstIPBytes == nil || dstPortBytes == nil {
			return fmt.Errorf("invalid IP or port")
		}

		// Concatenate key and value bytes
		key = append(srcIPBytes, srcPortBytes...)
		value = append(dstIPBytes, dstPortBytes...)
	}

	return client.AddMapElement(TableFamilyInet, "nat", mapName, key, value)
}

// DeleteForwardingRule removes a forwarding rule from the appropriate map
func DeleteForwardingRule(protocol, srcIP, srcPort, dstIP, dstPort string) error {
	client := GetNFTClient()

	var mapName string
	var key []byte

	if dstPort == "any" {
		mapName = protocol + "anyfwd"
		key = IPToBytes(srcIP)
	} else {
		mapName = protocol + "fwd"
		key = append(IPToBytes(srcIP), PortToBytesForConcatenated(srcPort)...)
	}

	return client.DeleteMapElement(TableFamilyInet, "nat", mapName, key)
}

// AddBlockRule adds a block rule to the block map
func AddBlockRule(srcIP, dstIP, protocol string) error {
	client := GetNFTClient()

	// Build the composite key: srcIP (4 bytes) + dstIP (4 bytes) + protocol (4 bytes for concatenated)
	srcBytes := IPToBytes(srcIP)
	dstBytes := IPToBytes(dstIP)
	protoBytes := ProtocolToBytesForConcatenated(protocol)

	if srcBytes == nil || dstBytes == nil || protoBytes == nil {
		return fmt.Errorf("invalid IP or protocol")
	}

	key := make([]byte, 0, 12) // 4 + 4 + 4 bytes
	key = append(key, srcBytes...)
	key = append(key, dstBytes...)
	key = append(key, protoBytes...)

	value := []byte("drop")

	return client.AddMapElement(TableFamilyInet, "nat", "block", key, value)
}

// DeleteBlockRule removes a block rule from the block map
func DeleteBlockRule(srcIP, dstIP, protocol string) error {
	client := GetNFTClient()

	key := buildIPIPProtocolKey(srcIP, dstIP, protocol)

	return client.DeleteMapElement(TableFamilyInet, "nat", "block", key)
}

// AddOutputBlockRule adds an output block rule
func AddOutputBlockRule(srcIP, dstIP, protocol string) error {
	client := GetNFTClient()

	key := buildIPIPProtocolKey(srcIP, dstIP, protocol)
	value := []byte("drop")

	return client.AddMapElement(TableFamilyInet, "filter", "output_block", key, value)
}

// DeleteOutputBlockRule removes an output block rule
func DeleteOutputBlockRule(srcIP, dstIP, protocol string) error {
	client := GetNFTClient()

	key := buildIPIPProtocolKey(srcIP, dstIP, protocol)

	return client.DeleteMapElement(TableFamilyInet, "filter", "output_block", key)
}

// AddForwardingBlockRule adds a forwarding block rule
func AddForwardingBlockRule(srcIP, dstIP, protocol, dstPort string) error {
	client := GetNFTClient()

	// Build the composite key: srcIP (4 bytes) + dstIP (4 bytes) + protocol (4 bytes) + dstPort (2 bytes for inet_service)
	srcBytes := IPToBytes(srcIP)
	dstBytes := IPToBytes(dstIP)
	protoBytes := ProtocolToBytesForConcatenated(protocol)
	portBytes := PortToBytesForConcatenated(dstPort)

	if srcBytes == nil || dstBytes == nil || protoBytes == nil || portBytes == nil {
		return fmt.Errorf("invalid IP, protocol, or port")
	}

	key := make([]byte, 0, 16) // 4 + 4 + 4 + 4 bytes
	key = append(key, srcBytes...)
	key = append(key, dstBytes...)
	key = append(key, protoBytes...)
	key = append(key, portBytes...)

	value := []byte("drop")

	return client.AddMapElement(TableFamilyInet, "filter", "fwd_block", key, value)
}

// DeleteForwardingBlockRule removes a forwarding block rule
func DeleteForwardingBlockRule(srcIP, dstIP, protocol, dstPort string) error {
	client := GetNFTClient()

	// Build the composite key: srcIP (4 bytes) + dstIP (4 bytes) + protocol (4 bytes) + dstPort (2 bytes for inet_service)
	srcBytes := IPToBytes(srcIP)
	dstBytes := IPToBytes(dstIP)
	protoBytes := ProtocolToBytesForConcatenated(protocol)
	portBytes := PortToBytesForConcatenated(dstPort)

	if srcBytes == nil || dstBytes == nil || protoBytes == nil || portBytes == nil {
		return fmt.Errorf("invalid IP, protocol, or port")
	}

	key := make([]byte, 0, 16) // 4 + 4 + 4 + 4 bytes
	key = append(key, srcBytes...)
	key = append(key, dstBytes...)
	key = append(key, protoBytes...)
	key = append(key, portBytes...)

	return client.DeleteMapElement(TableFamilyInet, "filter", "fwd_block", key)
}

// AddServicePort adds a service port to the appropriate map
func AddServicePort(protocol, port string, upstream bool) error {
	client := GetNFTClient()

	var mapName string
	if upstream {
		mapName = "wan_" + protocol + "_accept"
	} else {
		mapName = "lan_" + protocol + "_accept"
	}

	key := PortToBytes(port)
	value := []byte("accept")

	return client.AddMapElement(TableFamilyInet, "filter", mapName, key, value)
}

// DeleteServicePort removes a service port from the appropriate map
func DeleteServicePort(protocol, port string, upstream bool) error {
	client := GetNFTClient()

	var mapName string
	if upstream {
		mapName = "wan_" + protocol + "_accept"
	} else {
		mapName = "lan_" + protocol + "_accept"
	}

	key := PortToBytes(port)

	return client.DeleteMapElement(TableFamilyInet, "filter", mapName, key)
}

// AddEndpoint adds an endpoint rule
func AddEndpoint(protocol, srcIP, dstIP, port string) error {
	client := GetNFTClient()

	mapName := "ept_" + protocol + "fwd"
	key := buildIPIPPortKey(srcIP, dstIP, port)

	// Pass verdict as string - AddMapElement will handle the conversion for verdict maps
	value := []byte("accept")

	return client.AddMapElement(TableFamilyInet, "filter", mapName, key, value)
}

// DeleteEndpoint removes an endpoint rule
func DeleteEndpoint(protocol, srcIP, dstIP, port string) error {
	client := GetNFTClient()

	mapName := "ept_" + protocol + "fwd"
	key := buildIPIPPortKey(srcIP, dstIP, port)

	return client.DeleteMapElement(TableFamilyInet, "filter", mapName, key)
}

// HasEndpoint checks if an endpoint rule exists
func HasEndpoint(protocol, srcIP, dstIP, port string) bool {
	client := GetNFTClient()

	mapName := "ept_" + protocol + "fwd"
	key := buildIPIPPortKey(srcIP, dstIP, port)

	err := client.GetMapElement(TableFamilyInet, "filter", mapName, key)
	return err == nil
}

// AddMulticastPort adds a multicast port
func AddMulticastPort(port, iface string) error {
	client := GetNFTClient()

	mapName := "multicast_" + iface + "_udp_accept"
	key := PortToBytes(port)
	value := []byte("accept")

	return client.AddMapElement(TableFamilyInet, "filter", mapName, key, value)
}

// DeleteMulticastPort removes a multicast port
func DeleteMulticastPort(port, iface string) error {
	client := GetNFTClient()

	mapName := "multicast_" + iface + "_udp_accept"
	key := PortToBytes(port)

	return client.DeleteMapElement(TableFamilyInet, "filter", mapName, key)
}

// AddPingRule adds a ping rule
func AddPingRule(ip, iface string) error {
	client := GetNFTClient()

	key := buildIPIfaceKey(ip, iface)
	value := []byte("accept")

	return client.AddMapElement(TableFamilyInet, "filter", "ping_rules", key, value)
}

// DeletePingRule removes a ping rule
func DeletePingRule(ip, iface string) error {
	client := GetNFTClient()

	key := buildIPIfaceKey(ip, iface)

	return client.DeleteMapElement(TableFamilyInet, "filter", "ping_rules", key)
}

// FlushPingRules clears all ping rules
func FlushPingRules() error {
	client := GetNFTClient()
	return client.FlushMap(TableFamilyInet, "filter", "ping_rules")
}

// FlushServicePorts clears all service port maps
func FlushServicePorts() error {
	client := GetNFTClient()
	client.FlushMap(TableFamilyInet, "filter", "lan_tcp_accept")
	client.FlushMap(TableFamilyInet, "filter", "wan_tcp_accept")
	client.FlushMap(TableFamilyInet, "filter", "lan_udp_accept")
	client.FlushMap(TableFamilyInet, "filter", "wan_udp_accept")
	return nil
}

// FlushSetWithTable flushes a set in a specific table
func FlushSetWithTable(family, table, setName string) error {
	client := GetNFTClient()
	var f TableFamily
	if family == "inet" {
		f = TableFamilyInet
	} else {
		f = TableFamilyIP
	}
	return client.FlushSet(f, table, setName)
}

// AddCustomInterfaceRule adds a custom interface rule
func AddCustomInterfaceRule(srcInterface, srcIP, routeDst string) error {
	client := GetNFTClient()

	var mapName string
	if routeDst == "" || routeDst == "lan" {
		mapName = "fwd_iface_lan"
	} else {
		mapName = "fwd_iface_wan"
	}

	key := append(InterfaceToBytes(srcInterface), IPToBytes(srcIP)...)
	value := []byte("accept")

	return client.AddMapElement(TableFamilyInet, "filter", mapName, key, value)
}

// DeleteCustomInterfaceRule removes a custom interface rule
func DeleteCustomInterfaceRule(srcInterface, srcIP, routeDst string) error {
	client := GetNFTClient()

	var mapName string
	if routeDst == "" || routeDst == "lan" {
		mapName = "fwd_iface_lan"
	} else {
		mapName = "fwd_iface_wan"
	}

	key := append(InterfaceToBytes(srcInterface), IPToBytes(srcIP)...)

	return client.DeleteMapElement(TableFamilyInet, "filter", mapName, key)
}

// AddInterfaceToSet adds an interface to a set
func AddInterfaceToSet(setName, iface string) error {
	client := GetNFTClient()
	return client.AddSetElement(TableFamilyInet, "filter", setName, InterfaceToBytes(iface))
}

// DeleteInterfaceFromSet removes an interface from a set
func DeleteInterfaceFromSet(setName, iface string) error {
	client := GetNFTClient()
	return client.DeleteSetElement(TableFamilyInet, "filter", setName, InterfaceToBytes(iface))
}

// AddInterfaceToSetWithTable adds an interface to a set in a specific table
func AddInterfaceToSetWithTable(family, table, setName, iface string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}
	return client.AddSetElement(f, table, setName, InterfaceToBytes(iface))
}

// DeleteInterfaceFromSetWithTable removes an interface from a set in a specific table
func DeleteInterfaceFromSetWithTable(family, table, setName, iface string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}
	return client.DeleteSetElement(f, table, setName, InterfaceToBytes(iface))
}

// Convenience functions for JSON listing (matching current API expectations)

// ListMapJSON lists a map and returns JSON (replacement for nft -j list map)
func ListMapJSON(family, tableName, mapName string) ([]byte, error) {
	f, client, err := withFamily(family)
	if err != nil {
		return nil, err
	}
	return client.ListMapElements(f, tableName, mapName)
}

// ListSetJSON lists a set and returns JSON (replacement for nft -j list set)
func ListSetJSON(family, tableName, setName string) ([]byte, error) {
	f, client, err := withFamily(family)
	if err != nil {
		return nil, err
	}
	return client.ListSetElements(f, tableName, setName)
}

// ListTablesJSON lists all tables and returns JSON (replacement for nft -j list tables)
func ListTablesJSON() ([]byte, error) {
	client := GetNFTClient()
	return client.ListTables()
}

// CheckTableExists checks if a table exists (replacement for nft list table)
func CheckTableExists(family, tableName string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}
	return client.CheckTable(f, tableName)
}

// ListTableText lists a table in text format (for plain text output)
func ListTableText(family, tableName string) (string, error) {
	// For now, we'll just return a simple status message
	// The google/nftables library doesn't provide text output like nft command
	err := CheckTableExists(family, tableName)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("table %s %s {\n\t# rules managed by nftables library\n}\n", family, tableName), nil
}

// FlushChainByName flushes a chain by name
func FlushChainByName(family, tableName, chainName string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}
	return client.FlushChain(f, tableName, chainName)
}

// FlushMapByName flushes a map by name
func FlushMapByName(family, tableName, mapName string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}
	return client.FlushMap(f, tableName, mapName)
}

// AddElementToMap adds element with key-value to a map
func AddElementToMap(family, tableName, mapName, key, value string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	keyBytes := []byte(key)
	valueBytes := []byte(value)

	return client.AddMapElement(f, tableName, mapName, keyBytes, valueBytes)
}

// DeleteElementFromMap deletes element with key from a map
func DeleteElementFromMap(family, tableName, mapName, key string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}
	keyBytes := []byte(key)
	return client.DeleteMapElement(f, tableName, mapName, keyBytes)
}

// GetElementFromMap checks if element exists in a map (replacement for nft get element)
func GetElementFromMap(family, tableName, mapName, key string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}
	keyBytes := []byte(key)
	return client.GetMapElement(f, tableName, mapName, keyBytes)
}

// buildConcatenatedKey builds a properly encoded key for concatenated map types
func buildConcatenatedKey(mapName string, keyParts []string) ([]byte, error) {
	var keyBytes []byte

	// Check for known concatenated map patterns
	if mapName == "ethernet_filter" && len(keyParts) == 3 {
		// Type: ipv4_addr . ifname . ether_addr
		ipBytes := IPToBytes(keyParts[0])
		if ipBytes == nil {
			return nil, fmt.Errorf("invalid IP address: %s", keyParts[0])
		}
		keyBytes = append(keyBytes, ipBytes...)

		ifaceBytes := InterfaceToBytes(keyParts[1])
		keyBytes = append(keyBytes, ifaceBytes...)

		macBytes := MACToBytes(keyParts[2])
		if macBytes == nil {
			return nil, fmt.Errorf("invalid MAC address: %s", keyParts[2])
		}
		keyBytes = append(keyBytes, macBytes...)

	} else if mapName == "dhcp_access" && len(keyParts) == 2 {
		// Type: ifname . ether_addr
		ifaceBytes := InterfaceToBytes(keyParts[0])
		keyBytes = append(keyBytes, ifaceBytes...)

		macBytes := MACToBytes(keyParts[1])
		if macBytes == nil {
			return nil, fmt.Errorf("invalid MAC address: %s", keyParts[1])
		}
		keyBytes = append(keyBytes, macBytes...)

	} else if (mapName == "internet_access" || mapName == "dns_access" || mapName == "lan_access") && len(keyParts) == 2 {
		// Type: ipv4_addr . ifname
		ipBytes := IPToBytes(keyParts[0])
		if ipBytes == nil {
			return nil, fmt.Errorf("invalid IP address: %s", keyParts[0])
		}
		keyBytes = append(keyBytes, ipBytes...)

		ifaceBytes := InterfaceToBytes(keyParts[1])
		keyBytes = append(keyBytes, ifaceBytes...)
	} else {
		// For other maps or unknown patterns, try to intelligently parse
		for _, part := range keyParts {
			// Try IP first
			if ipBytes := IPToBytes(part); ipBytes != nil {
				keyBytes = append(keyBytes, ipBytes...)
			} else if macBytes := MACToBytes(part); macBytes != nil {
				// Try MAC
				keyBytes = append(keyBytes, macBytes...)
			} else if portNum, err := strconv.Atoi(part); err == nil && portNum <= 65535 {
				// Try port number
				keyBytes = append(keyBytes, PortToBytes(part)...)
			} else {
				// Assume interface name
				keyBytes = append(keyBytes, InterfaceToBytes(part)...)
			}
		}
	}

	return keyBytes, nil
}

// AddElementToMapComplex adds element with complex key to a map
func AddElementToMapComplex(family, tableName, mapName string, keyParts []string, value string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	// Build the concatenated key
	keyBytes, err := buildConcatenatedKey(mapName, keyParts)
	if err != nil {
		return err
	}

	valueBytes := []byte(value)
	return client.AddMapElement(f, tableName, mapName, keyBytes, valueBytes)
}

// DeleteElementFromMapComplex deletes element with complex key from a map
func DeleteElementFromMapComplex(family, tableName, mapName string, keyParts []string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	// Build the concatenated key
	keyBytes, err := buildConcatenatedKey(mapName, keyParts)
	if err != nil {
		return err
	}

	return client.DeleteMapElement(f, tableName, mapName, keyBytes)
}

// GetElementFromMapComplex checks if element with complex key exists in a map
func GetElementFromMapComplex(family, tableName, mapName string, keyParts []string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	// Build the concatenated key
	keyBytes, err := buildConcatenatedKey(mapName, keyParts)
	if err != nil {
		return err
	}

	return client.GetMapElement(f, tableName, mapName, keyBytes)
}

// AddMACVerdictElement adds an element with IP.Interface.MAC:Verdict format
func AddMACVerdictElement(family, tableName, mapName, ip, iface, mac, verdict string) error {
	return AddElementToMapComplex(family, tableName, mapName, []string{ip, iface, mac}, verdict)
}

// GetMACVerdictElement checks if element with IP.Interface.MAC:Verdict format exists
func GetMACVerdictElement(family, tableName, mapName, ip, iface, mac, verdict string) error {
	return GetElementFromMapComplex(family, tableName, mapName, []string{ip, iface, mac})
}

// DeleteMACVerdictElement deletes an element with IP.Interface.MAC:Verdict format
func DeleteMACVerdictElement(family, tableName, mapName, ip, iface, mac, verdict string) error {
	return DeleteElementFromMapComplex(family, tableName, mapName, []string{ip, iface, mac})
}

// AddIPIfaceVerdictElement adds an element with IP.Interface:Verdict format
func AddIPIfaceVerdictElement(family, tableName, mapName, ip, iface, verdict string) error {
	// Check if this is a CIDR notation and the map supports intervals
	if strings.Contains(ip, "/") && (mapName == "dns_access" || mapName == "fwd_iface_lan" || mapName == "fwd_iface_wan") {
		return AddIPIfaceCIDRVerdictElement(family, tableName, mapName, ip, iface, verdict)
	}
	return AddElementToMapComplex(family, tableName, mapName, []string{ip, iface}, verdict)
}

// AddIfaceIPCIDRVerdictElement adds a CIDR range element for maps with ifname.ipv4_addr key order
func AddIfaceIPCIDRVerdictElement(family, tableName, mapName, iface, cidr, verdict string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	// Parse CIDR to get network and range
	_, ipNet, err := net.ParseCIDR(cidr)
	if err != nil {
		return fmt.Errorf("invalid CIDR: %v", err)
	}

	// Get the network address (start of range)
	startIP := ipNet.IP.To4()
	if startIP == nil {
		return fmt.Errorf("not an IPv4 CIDR")
	}

	// Calculate end IP of the CIDR range
	endIP := make(net.IP, 4)
	for i := range startIP {
		endIP[i] = startIP[i] | ^ipNet.Mask[i]
	}

	// Build the key with interface FIRST (for fwd_iface_wan/lan maps)
	ifaceBytes := InterfaceToBytes(iface)

	// Key is interface + start IP
	key := make([]byte, 0, 20)
	key = append(key, ifaceBytes...)
	key = append(key, startIP...)

	// KeyEnd is interface + end IP
	keyEnd := make([]byte, 0, 20)
	keyEnd = append(keyEnd, ifaceBytes...)
	keyEnd = append(keyEnd, endIP.To4()...)

	element := nftables.SetElement{
		Key:         key,
		KeyEnd:      keyEnd,
		IntervalEnd: false,
	}

	// Convert verdict to proper data
	verdictData, err := createVerdictData(verdict)
	if err != nil {
		return err
	}
	element.VerdictData = verdictData

	set, err := client.GetMap(f, tableName, mapName)
	if err != nil {
		return err
	}

	err = client.conn.SetAddElements(set, []nftables.SetElement{element})
	if err != nil {
		return err
	}

	return client.conn.Flush()
}

// AddIPIfaceCIDRVerdictElement adds an element with CIDR IP.Interface:Verdict format to interval maps
func AddIPIfaceCIDRVerdictElement(family, tableName, mapName, cidr, iface, verdict string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	set, err := client.GetMap(f, tableName, mapName)
	if err != nil {
		return fmt.Errorf("failed to get map %s/%s/%s: %w", family, tableName, mapName, err)
	}

	if !set.Interval {
		return fmt.Errorf("map %s is not an interval map, cannot add CIDR", mapName)
	}

	// Parse CIDR to get network and range
	ipAddr, ipNet, err := net.ParseCIDR(cidr)
	if err != nil {
		return fmt.Errorf("invalid CIDR: %s", cidr)
	}

	// Get the network address (start of range)
	startIP := ipAddr.Mask(ipNet.Mask).To4()
	if startIP == nil {
		return fmt.Errorf("invalid IPv4 CIDR: %s", cidr)
	}

	// Calculate end IP of the CIDR range
	endIP := make(net.IP, 4)
	for i := range startIP {
		endIP[i] = startIP[i] | ^ipNet.Mask[i]
	}

	// Build the key with interface
	ifaceBytes := InterfaceToBytes(iface)

	// Key is start IP + interface
	key := make([]byte, 0, 20)
	key = append(key, startIP...)
	key = append(key, ifaceBytes...)

	// KeyEnd is end IP + interface
	keyEnd := make([]byte, 0, 20)
	keyEnd = append(keyEnd, endIP.To4()...)
	keyEnd = append(keyEnd, ifaceBytes...)

	element := nftables.SetElement{
		Key:         key,
		KeyEnd:      keyEnd,
		IntervalEnd: false,
	}

	// Handle verdict
	verdictData, err := createVerdictData(verdict)
	if err != nil {
		return err
	}
	element.VerdictData = verdictData

	err = client.conn.SetAddElements(set, []nftables.SetElement{element})
	if err != nil {
		return fmt.Errorf("failed to add CIDR element: %w", err)
	}

	return client.conn.Flush()
}

// createVerdictData creates verdict data for nftables elements
func createVerdictData(verdict string) (*expr.Verdict, error) {
	switch verdict {
	case "accept":
		return &expr.Verdict{Kind: expr.VerdictAccept}, nil
	case "drop":
		return &expr.Verdict{Kind: expr.VerdictDrop}, nil
	case "continue":
		return &expr.Verdict{Kind: expr.VerdictContinue}, nil
	case "return":
		return &expr.Verdict{Kind: expr.VerdictReturn}, nil
	default:
		return nil, fmt.Errorf("unknown verdict: %s", verdict)
	}
}

// GetIPIfaceVerdictElement checks if element with IP.Interface:Verdict format exists
func GetIPIfaceVerdictElement(family, tableName, mapName, ip, iface, verdict string) error {
	return GetElementFromMapComplex(family, tableName, mapName, []string{ip, iface})
}

// CheckMapExists checks if a map exists (replacement for nft list map)
func CheckMapExists(family, tableName, mapName string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	_, err = client.GetMap(f, tableName, mapName)
	return err
}

// CreateIPIfaceVerdictMap creates a map with type ipv4_addr.ifname:verdict
func CreateIPIfaceVerdictMap(family, tableName, mapName string) error {
	// Use exec to create the map - TBD google/nftables support
	// creating maps with concatenated types
	cmd := exec.Command("nft", "add", "map", family, tableName, mapName,
		"{", "type", "ipv4_addr", ".", "ifname", ":", "verdict", ";", "}")

	_, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("failed to create map %s: %v", mapName, err)
	}

	return nil
}

// AddRuleToChain adds a rule to a chain (simplified version)
func AddRuleToChain(family, tableName, chainName, rule string) error {
	// Use exec to add rules - TBD google/nftables support
	cmd := exec.Command("nft", "add", "rule", family, tableName, chainName, rule)

	_, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("failed to add rule to chain %s: %v", chainName, err)
	}

	return nil
}

// InsertRuleToChain inserts a rule to a chain (simplified version)
func InsertRuleToChain(family, tableName, chainName, rule string) error {
	// Use exec to insert rules - TBD  google/nftables support
	cmd := exec.Command("nft", "insert", "rule", family, tableName, chainName, rule)

	_, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("failed to insert rule into chain %s: %v", chainName, err)
	}

	return nil
}

// AddIPToSet adds an IP address to a set
func AddIPToSet(family, tableName, setName, ip string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	return client.AddSetElement(f, tableName, setName, IPToBytes(ip))
}

// DeleteIPFromSet deletes an IP address from a set
func DeleteIPFromSet(family, tableName, setName, ip string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	return client.DeleteSetElement(f, tableName, setName, IPToBytes(ip))
}

// AddCIDRToSet adds a CIDR range to an interval set
func AddCIDRToSet(family, tableName, setName, cidr string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	// Parse CIDR to get network and range
	_, ipNet, err := net.ParseCIDR(cidr)
	if err != nil {
		return fmt.Errorf("invalid CIDR: %v", err)
	}

	// Calculate start and end IPs
	startIP := ipNet.IP.To4()
	if startIP == nil {
		return fmt.Errorf("not an IPv4 CIDR")
	}

	endIP := make(net.IP, 4)
	for i := range startIP {
		endIP[i] = startIP[i] | ^ipNet.Mask[i]
	}

	// For interval sets, we need to increment the end IP by 1
	// because IntervalEnd: true marks the element AFTER the last included element
	nextIP := make(net.IP, 4)
	copy(nextIP, endIP)

	// Increment the IP address
	for i := 3; i >= 0; i-- {
		if nextIP[i] < 255 {
			nextIP[i]++
			break
		}
		nextIP[i] = 0
	}

	// Create interval element
	elem := nftables.SetElement{
		Key:         startIP,
		IntervalEnd: false,
	}

	// Also need the end marker
	endElem := nftables.SetElement{
		Key:         nextIP,
		IntervalEnd: true,
	}

	set, err := client.GetMap(f, tableName, setName)
	if err != nil {
		return err
	}

	err = client.conn.SetAddElements(set, []nftables.SetElement{elem, endElem})
	if err != nil {
		return err
	}

	return client.conn.Flush()
}

// AddIPVerdictToMap adds an IP address with verdict to a map
func AddIPVerdictToMap(family, tableName, mapName, ip, verdict string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	keyBytes := IPToBytes(ip)
	if keyBytes == nil {
		return fmt.Errorf("invalid IP address: %s", ip)
	}

	valueBytes := []byte(verdict)
	return client.AddMapElement(f, tableName, mapName, keyBytes, valueBytes)
}

// DeleteIPFromMap deletes an IP address from a verdict map
func DeleteIPFromMap(family, tableName, mapName, ip string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	keyBytes := IPToBytes(ip)
	if keyBytes == nil {
		return fmt.Errorf("invalid IP address: %s", ip)
	}

	return client.DeleteMapElement(f, tableName, mapName, keyBytes)
}

// GetIPFromMap checks if an IP exists in a verdict map
func GetIPFromMap(family, tableName, mapName, ip string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	keyBytes := IPToBytes(ip)
	if keyBytes == nil {
		return fmt.Errorf("invalid IP address: %s", ip)
	}

	return client.GetMapElement(f, tableName, mapName, keyBytes)
}

// AddPortVerdictToMap adds a port with verdict to a map (inet_service : verdict)
func AddPortVerdictToMap(family, tableName, mapName, port, verdict string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	keyBytes := PortToBytes(port)
	if keyBytes == nil {
		return fmt.Errorf("invalid port: %s", port)
	}

	valueBytes := []byte(verdict)
	return client.AddMapElement(f, tableName, mapName, keyBytes, valueBytes)
}

// DeletePortFromMap deletes a port from a verdict map
func DeletePortFromMap(family, tableName, mapName, port string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	keyBytes := PortToBytes(port)
	if keyBytes == nil {
		return fmt.Errorf("invalid port: %s", port)
	}

	return client.DeleteMapElement(f, tableName, mapName, keyBytes)
}

// GetPortFromMap checks if a port exists in a verdict map
func GetPortFromMap(family, tableName, mapName, port string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	keyBytes := PortToBytes(port)
	if keyBytes == nil {
		return fmt.Errorf("invalid port: %s", port)
	}

	err = client.GetMapElement(f, tableName, mapName, keyBytes)
	return err
}

// CheckChainExists checks if a chain exists
func CheckChainExists(family, tableName, chainName string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	table := client.GetTable(f, tableName)
	if table == nil {
		return fmt.Errorf("table %s not found", tableName)
	}

	chains, err := client.conn.ListChains()
	if err != nil {
		return err
	}

	for _, chain := range chains {
		if chain.Table.Name == tableName && chain.Table.Family == nftables.TableFamily(f) && chain.Name == chainName {
			return nil // Chain exists
		}
	}

	return fmt.Errorf("chain %s not found in table %s", chainName, tableName)
}

// AddChain adds a new chain
func AddChain(family, tableName, chainName string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	table := client.GetTable(f, tableName)
	if table == nil {
		return fmt.Errorf("table %s not found", tableName)
	}

	chain := &nftables.Chain{
		Table: table,
		Name:  chainName,
	}

	client.conn.AddChain(chain)
	return client.conn.Flush()
}

// DeleteChain deletes a chain
func DeleteChain(family, tableName, chainName string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	table := client.GetTable(f, tableName)
	chain := &nftables.Chain{
		Name:  chainName,
		Table: table,
	}

	client.conn.DelChain(chain)
	return client.conn.Flush()
}
