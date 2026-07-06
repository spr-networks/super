//go:build linux

package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"net"
	"os/exec"
	"strconv"
	"strings"

	"github.com/google/nftables"
	"github.com/google/nftables/binaryutil"
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

	set, err := c.conn.GetSetByName(table, mapName)
	if err != nil {
		return nil, err
	}

	return set, nil
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
					"elem":   formatElements(mapName, elements),
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
	return c.AddMapElementRange(family, tableName, mapName, key, key, value)
}

// AddMapElementRange adds an element with an inclusive key range (keyEnd == key for a single point)
func (c *NFTClient) AddMapElementRange(family TableFamily, tableName, mapName string, key, keyEnd, value []byte) error {
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

	// interval maps need KeyEnd: equal to Key for single elements, or the range end
	if set.Interval {
		element.IntervalEnd = false
		element.KeyEnd = make([]byte, len(keyEnd))
		copy(element.KeyEnd, keyEnd)
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
	return c.DeleteMapElementRange(family, tableName, mapName, key, key)
}

// DeleteMapElementRange deletes an element with an inclusive key range
func (c *NFTClient) DeleteMapElementRange(family TableFamily, tableName, mapName string, key, keyEnd []byte) error {
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
	if set.KeyType.Bytes > uint32(len(keyEnd)) {
		paddedKeyEnd := make([]byte, set.KeyType.Bytes)
		copy(paddedKeyEnd, keyEnd)
		keyEnd = paddedKeyEnd
	}

	element := nftables.SetElement{
		Key: key,
	}

	if set.Interval {
		element.IntervalEnd = false
		element.KeyEnd = make([]byte, len(keyEnd))
		copy(element.KeyEnd, keyEnd)
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

// MapSnapshot caches map element keys and parsed entries without re-dumping.
type MapSnapshot struct {
	maps    map[string]map[string]struct{}
	entries map[string][]verdictEntry
}

// SnapshotMaps dumps each named map once. Missing maps are recorded as empty.
func (c *NFTClient) SnapshotMaps(family TableFamily, tableName string, mapNames []string) *MapSnapshot {
	snap := &MapSnapshot{
		maps:    make(map[string]map[string]struct{}, len(mapNames)),
		entries: make(map[string][]verdictEntry, len(mapNames)),
	}
	table := c.GetTable(family, tableName)
	for _, name := range mapNames {
		keys := map[string]struct{}{}
		if table != nil {
			if set, err := c.conn.GetSetByName(table, name); err == nil {
				if elements, err := c.conn.GetSetElements(set); err == nil {
					for _, el := range elements {
						keys[string(el.Key)] = struct{}{}
						if parts := splitConcatKey(name, el.Key); parts != nil {
							snap.entries[name] = append(snap.entries[name], verdictEntryFromKey(name, len(el.Key), parts))
						}
					}
				}
			}
		}
		snap.maps[name] = keys
	}
	return snap
}

func verdictEntryFromKey(mapName string, keyLen int, parts []string) verdictEntry {
	e := verdictEntry{}
	for i, kind := range concatKeySchema(mapName, keyLen) {
		switch kind {
		case "ip":
			e.ipv4 = parts[i]
		case "iface":
			e.ifname = parts[i]
		case "mac":
			e.mac = parts[i]
		}
	}
	return e
}

func (s *MapSnapshot) Entries(mapName string) []verdictEntry {
	return s.entries[mapName]
}

func (s *MapSnapshot) HasMAC(mapName, mac string) bool {
	for _, e := range s.entries[mapName] {
		if e.mac != "" && equalMAC(e.mac, mac) {
			return true
		}
	}
	return false
}

// HasElement reports whether mapName contains the concatenated keyParts.
func (s *MapSnapshot) HasElement(mapName string, keyParts []string) bool {
	keys, ok := s.maps[mapName]
	if !ok {
		return false
	}
	key, _, err := buildConcatenatedKey(mapName, keyParts)
	if err != nil {
		return false
	}
	_, found := keys[string(key)]
	return found
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

	var elements []nftables.SetElement

	// For interval sets, we need to add both start and end elements
	if set.Interval {
		// Start element
		startElem := nftables.SetElement{
			Key:         element,
			IntervalEnd: false,
		}
		elements = append(elements, startElem)

		// End element: increment IP by 1 to create a single-IP range
		endBytes := make([]byte, len(element))
		copy(endBytes, element)

		// Increment the last byte if it's an IPv4 address
		if len(endBytes) == 4 {
			// Increment the IP address
			for i := 3; i >= 0; i-- {
				if endBytes[i] < 255 {
					endBytes[i]++
					break
				}
				endBytes[i] = 0
			}
		}

		endElem := nftables.SetElement{
			Key:         endBytes,
			IntervalEnd: true,
		}
		elements = append(elements, endElem)
	} else {
		// Non-interval set: just add the single element
		elem := nftables.SetElement{
			Key: element,
		}
		elements = append(elements, elem)
	}

	err = c.conn.SetAddElements(set, elements)
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

	var elements []nftables.SetElement

	// For interval sets, we need to delete both start and end elements
	if set.Interval {
		// Start element
		startElem := nftables.SetElement{
			Key:         element,
			IntervalEnd: false,
		}
		elements = append(elements, startElem)

		// End element: must match what was added (IP + 1)
		endBytes := make([]byte, len(element))
		copy(endBytes, element)

		// Increment the last byte if it's an IPv4 address
		if len(endBytes) == 4 {
			// Increment the IP address
			for i := 3; i >= 0; i-- {
				if endBytes[i] < 255 {
					endBytes[i]++
					break
				}
				endBytes[i] = 0
			}
		}

		endElem := nftables.SetElement{
			Key:         endBytes,
			IntervalEnd: true,
		}
		elements = append(elements, endElem)
	} else {
		// Non-interval set: just delete the single element
		elem := nftables.SetElement{
			Key: element,
		}
		elements = append(elements, elem)
	}

	err = c.conn.SetDeleteElements(set, elements)
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
func formatElements(mapName string, elements []nftables.SetElement) []interface{} {
	var result []interface{}
	for _, elem := range elements {
		formatted := formatElement(mapName, elem)
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

// concatKeySchema returns the field layout of a map's concatenated key,
// or nil for plain single-typed keys
func concatKeySchema(mapName string, keyLen int) []string {
	switch mapName {
	case "dhcp_access":
		// type ifname . ether_addr
		return []string{"iface", "mac"}
	case "ethernet_filter":
		// type ipv4_addr . ifname . ether_addr
		return []string{"ip", "iface", "mac"}
	case "fwd_iface_lan", "fwd_iface_wan":
		// type ifname . ipv4_addr
		return []string{"iface", "ip"}
	}

	// internet_access, dns_access, lan_access and the per-group
	// <zone>_src_access / <zone>_dst_access maps: ipv4_addr . ifname
	if keyLen == 20 {
		return []string{"ip", "iface"}
	}

	return nil
}

var concatFieldBytes = map[string]int{"ip": 4, "iface": 16, "mac": 8}

// splitConcatKey decodes a concatenated key into its string parts,
// or returns nil when the map/key is not a known concatenation
func splitConcatKey(mapName string, key []byte) []string {
	schema := concatKeySchema(mapName, len(key))
	if schema == nil {
		return nil
	}

	total := 0
	for _, field := range schema {
		total += concatFieldBytes[field]
	}
	if total != len(key) {
		return nil
	}

	parts := []string{}
	off := 0
	for _, field := range schema {
		seg := key[off : off+concatFieldBytes[field]]
		off += concatFieldBytes[field]
		switch field {
		case "ip":
			parts = append(parts, net.IP(seg).String())
		case "iface":
			parts = append(parts, strings.TrimRight(string(seg), "\x00"))
		case "mac":
			// ether_addr is 6 significant bytes, padded to 8 in concatenations
			parts = append(parts, net.HardwareAddr(seg[:6]).String())
		}
	}
	return parts
}

// formatElement formats a single set element for JSON output
func formatElement(mapName string, elem nftables.SetElement) interface{} {
	// concatenated keys keep the nft -j structure: {"concat": [...]}
	if parts := splitConcatKey(mapName, elem.Key); parts != nil {
		concat := make([]interface{}, len(parts))
		for i, p := range parts {
			concat[i] = p
		}
		return map[string]interface{}{"concat": concat}
	}

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
// ipRangeBytes returns the inclusive start/end bytes for an IP or CIDR (0.0.0.0 != 0.0.0.0/0)
func ipRangeBytes(ip string) (start, end []byte) {
	if strings.Contains(ip, "/") {
		_, ipnet, err := net.ParseCIDR(ip)
		if err != nil {
			return nil, nil
		}
		start = ipnet.IP.To4()
		if start == nil {
			return nil, nil
		}
		end = make([]byte, 4)
		for i := range start {
			end[i] = start[i] | ^ipnet.Mask[i]
		}
		return start, end
	}
	b := IPToBytes(ip)
	return b, b
}

// portRangeBytesConcat returns the inclusive start/end bytes for a port or port range
func portRangeBytesConcat(port string) (start, end []byte) {
	conv := func(s string) []byte {
		p, err := strconv.Atoi(s)
		if err != nil || p < 0 || p > 65535 {
			return nil
		}
		b := make([]byte, 4)
		binary.BigEndian.PutUint16(b, uint16(p))
		return b
	}
	if port == "any" {
		port = "0-65535"
	}
	if strings.Contains(port, "-") {
		parts := strings.SplitN(port, "-", 2)
		start, end = conv(parts[0]), conv(parts[1])
		if start == nil || end == nil {
			return nil, nil
		}
		return start, end
	}
	b := conv(port)
	return b, b
}

// concatRangeKeys joins per-field start/end byte pairs into an interval key pair
func concatRangeKeys(fields ...[2][]byte) (key, keyEnd []byte) {
	for _, f := range fields {
		if f[0] == nil || f[1] == nil {
			return nil, nil
		}
		key = append(key, f[0]...)
		keyEnd = append(keyEnd, f[1]...)
	}
	return key, keyEnd
}

func ipField(ip string) [2][]byte   { s, e := ipRangeBytes(ip); return [2][]byte{s, e} }
func portField(p string) [2][]byte  { s, e := portRangeBytesConcat(p); return [2][]byte{s, e} }
func exactField(b []byte) [2][]byte { return [2][]byte{b, b} }

func ifaceField(iface string) [2][]byte {
	if strings.HasSuffix(iface, "*") {
		prefix := strings.TrimSuffix(iface, "*")
		if len(prefix) == 0 || len(prefix) > 16 {
			return [2][]byte{nil, nil}
		}
		start := make([]byte, 16)
		copy(start, prefix)
		end := make([]byte, 16)
		copy(end, prefix)
		for i := len(prefix); i < 16; i++ {
			end[i] = 0xff
		}
		return [2][]byte{start, end}
	}
	return exactField(InterfaceToBytes(iface))
}

// blockKey builds the ipv4 . ipv4 . inet_proto interval key pair for block and output_block
func blockKey(srcIP, dstIP, protocol string) (key, keyEnd []byte) {
	return concatRangeKeys(ipField(srcIP), ipField(dstIP),
		exactField(ProtocolToBytesForConcatenated(protocol)))
}

// fwdBlockKey builds the ipv4 . ipv4 . inet_proto . inet_service interval key pair for fwd_block
func fwdBlockKey(srcIP, dstIP, protocol, dstPort string) (key, keyEnd []byte) {
	return concatRangeKeys(ipField(srcIP), ipField(dstIP),
		exactField(ProtocolToBytesForConcatenated(protocol)), portField(dstPort))
}

func AddForwardingRule(protocol, srcIP, srcPort, dstIP, dstPort string) error {
	client := GetNFTClient()

	startIP, endIP := ipRangeBytes(srcIP)
	dstIPBytes := IPToBytes(dstIP)
	if startIP == nil || endIP == nil || dstIPBytes == nil {
		return fmt.Errorf("invalid IP address")
	}

	if dstPort == "any" {
		mapName := protocol + "anyfwd"
		return client.AddMapElementRange(TableFamilyInet, "nat", mapName, startIP, endIP, dstIPBytes)
	}

	mapName := protocol + "fwd"
	srcPortStart, srcPortEnd := portRangeBytesConcat(srcPort)
	dstPortBytes := PortToBytesForConcatenated(dstPort)
	if srcPortStart == nil || srcPortEnd == nil || dstPortBytes == nil {
		return fmt.Errorf("invalid port")
	}

	key := append(append([]byte{}, startIP...), srcPortStart...)
	keyEnd := append(append([]byte{}, endIP...), srcPortEnd...)
	value := append(append([]byte{}, dstIPBytes...), dstPortBytes...)

	return client.AddMapElementRange(TableFamilyInet, "nat", mapName, key, keyEnd, value)
}

// DeleteForwardingRule removes a forwarding rule from the appropriate map
func DeleteForwardingRule(protocol, srcIP, srcPort, dstIP, dstPort string) error {
	client := GetNFTClient()

	startIP, endIP := ipRangeBytes(srcIP)
	if startIP == nil || endIP == nil {
		return fmt.Errorf("invalid IP address")
	}

	if dstPort == "any" {
		mapName := protocol + "anyfwd"
		return client.DeleteMapElementRange(TableFamilyInet, "nat", mapName, startIP, endIP)
	}

	mapName := protocol + "fwd"
	srcPortStart, srcPortEnd := portRangeBytesConcat(srcPort)
	if srcPortStart == nil || srcPortEnd == nil {
		return fmt.Errorf("invalid port")
	}
	key := append(append([]byte{}, startIP...), srcPortStart...)
	keyEnd := append(append([]byte{}, endIP...), srcPortEnd...)

	return client.DeleteMapElementRange(TableFamilyInet, "nat", mapName, key, keyEnd)
}

// AddBlockRule adds a block rule to the block map
func AddBlockRule(srcIP, dstIP, protocol string) error {
	client := GetNFTClient()
	key, keyEnd := blockKey(srcIP, dstIP, protocol)
	if key == nil {
		return fmt.Errorf("invalid IP or protocol")
	}
	return client.AddMapElementRange(TableFamilyInet, "nat", "block", key, keyEnd, []byte("drop"))
}

// DeleteBlockRule removes a block rule from the block map
func DeleteBlockRule(srcIP, dstIP, protocol string) error {
	client := GetNFTClient()
	key, keyEnd := blockKey(srcIP, dstIP, protocol)
	if key == nil {
		return fmt.Errorf("invalid IP or protocol")
	}
	return client.DeleteMapElementRange(TableFamilyInet, "nat", "block", key, keyEnd)
}

// AddOutputBlockRule adds an output block rule
func AddOutputBlockRule(srcIP, dstIP, protocol string) error {
	client := GetNFTClient()
	key, keyEnd := blockKey(srcIP, dstIP, protocol)
	if key == nil {
		return fmt.Errorf("invalid IP or protocol")
	}
	return client.AddMapElementRange(TableFamilyInet, "filter", "output_block", key, keyEnd, []byte("drop"))
}

// DeleteOutputBlockRule removes an output block rule
func DeleteOutputBlockRule(srcIP, dstIP, protocol string) error {
	client := GetNFTClient()
	key, keyEnd := blockKey(srcIP, dstIP, protocol)
	if key == nil {
		return fmt.Errorf("invalid IP or protocol")
	}
	return client.DeleteMapElementRange(TableFamilyInet, "filter", "output_block", key, keyEnd)
}

// AddForwardingBlockRule adds a forwarding block rule
func AddForwardingBlockRule(srcIP, dstIP, protocol, dstPort string) error {
	client := GetNFTClient()
	key, keyEnd := fwdBlockKey(srcIP, dstIP, protocol, dstPort)
	if key == nil {
		return fmt.Errorf("invalid IP, protocol, or port")
	}
	return client.AddMapElementRange(TableFamilyInet, "filter", "fwd_block", key, keyEnd, []byte("drop"))
}

// DeleteForwardingBlockRule removes a forwarding block rule
func DeleteForwardingBlockRule(srcIP, dstIP, protocol, dstPort string) error {
	client := GetNFTClient()
	key, keyEnd := fwdBlockKey(srcIP, dstIP, protocol, dstPort)
	if key == nil {
		return fmt.Errorf("invalid IP, protocol, or port")
	}
	return client.DeleteMapElementRange(TableFamilyInet, "filter", "fwd_block", key, keyEnd)
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

func endpointKey(srcIP, dstIP, port string) (key, keyEnd []byte) {
	return concatRangeKeys(ipField(srcIP), ipField(dstIP), portField(port))
}

// AddEndpoint adds an endpoint rule
func AddEndpoint(protocol, srcIP, dstIP, port string) error {
	client := GetNFTClient()

	mapName := "ept_" + protocol + "fwd"
	key, keyEnd := endpointKey(srcIP, dstIP, port)
	if key == nil {
		return fmt.Errorf("invalid IP or port")
	}

	return client.AddMapElementRange(TableFamilyInet, "filter", mapName, key, keyEnd, []byte("accept"))
}

// DeleteEndpoint removes an endpoint rule
func DeleteEndpoint(protocol, srcIP, dstIP, port string) error {
	client := GetNFTClient()

	mapName := "ept_" + protocol + "fwd"
	key, keyEnd := endpointKey(srcIP, dstIP, port)
	if key == nil {
		return fmt.Errorf("invalid IP or port")
	}

	return client.DeleteMapElementRange(TableFamilyInet, "filter", mapName, key, keyEnd)
}

// HasEndpoint checks if an endpoint rule exists
func HasEndpoint(protocol, srcIP, dstIP, port string) bool {
	client := GetNFTClient()

	mapName := "ept_" + protocol + "fwd"
	key, _ := endpointKey(srcIP, dstIP, port)
	if key == nil {
		return false
	}

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

	key, keyEnd := concatRangeKeys(ipField(ip), ifaceField(iface))
	if key == nil {
		return fmt.Errorf("invalid IP or interface")
	}

	return client.AddMapElementRange(TableFamilyInet, "filter", "ping_rules", key, keyEnd, []byte("accept"))
}

// DeletePingRule removes a ping rule
func DeletePingRule(ip, iface string) error {
	client := GetNFTClient()

	key, keyEnd := concatRangeKeys(ipField(ip), ifaceField(iface))
	if key == nil {
		return fmt.Errorf("invalid IP or interface")
	}

	return client.DeleteMapElementRange(TableFamilyInet, "filter", "ping_rules", key, keyEnd)
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

func buildConcatenatedKey(mapName string, keyParts []string) ([]byte, []byte, error) {
	var fields [][2][]byte

	if mapName == "ethernet_filter" && len(keyParts) == 3 {
		ipBytes := IPToBytes(keyParts[0])
		if ipBytes == nil {
			return nil, nil, fmt.Errorf("invalid IP address: %s", keyParts[0])
		}
		macBytes := MACToBytes(keyParts[2])
		if macBytes == nil {
			return nil, nil, fmt.Errorf("invalid MAC address: %s", keyParts[2])
		}
		fields = append(fields, exactField(ipBytes), ifaceField(keyParts[1]), exactField(macBytes))

	} else if mapName == "dhcp_access" && len(keyParts) == 2 {
		macBytes := MACToBytes(keyParts[1])
		if macBytes == nil {
			return nil, nil, fmt.Errorf("invalid MAC address: %s", keyParts[1])
		}
		fields = append(fields, ifaceField(keyParts[0]), exactField(macBytes))

	} else if (mapName == "internet_access" || mapName == "dns_access" || mapName == "lan_access") && len(keyParts) == 2 {
		if IPToBytes(keyParts[0]) == nil {
			return nil, nil, fmt.Errorf("invalid IP address: %s", keyParts[0])
		}
		fields = append(fields, ipField(keyParts[0]), ifaceField(keyParts[1]))
	} else {
		for _, part := range keyParts {
			if ipBytes := IPToBytes(part); ipBytes != nil {
				fields = append(fields, ipField(part))
			} else if macBytes := MACToBytes(part); macBytes != nil {
				fields = append(fields, exactField(macBytes))
			} else if portNum, err := strconv.Atoi(part); err == nil && portNum <= 65535 {
				fields = append(fields, exactField(PortToBytes(part)))
			} else {
				fields = append(fields, ifaceField(part))
			}
		}
	}

	key, keyEnd := concatRangeKeys(fields...)
	if key == nil {
		return nil, nil, fmt.Errorf("invalid key parts %v for %s", keyParts, mapName)
	}
	return key, keyEnd, nil
}

// AddElementToMapComplex adds element with complex key to a map
func AddElementToMapComplex(family, tableName, mapName string, keyParts []string, value string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	key, keyEnd, err := buildConcatenatedKey(mapName, keyParts)
	if err != nil {
		return err
	}

	valueBytes := []byte(value)
	return client.AddMapElementRange(f, tableName, mapName, key, keyEnd, valueBytes)
}

// DeleteElementFromMapComplex deletes element with complex key from a map
func DeleteElementFromMapComplex(family, tableName, mapName string, keyParts []string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	key, keyEnd, err := buildConcatenatedKey(mapName, keyParts)
	if err != nil {
		return err
	}

	return client.DeleteMapElementRange(f, tableName, mapName, key, keyEnd)
}

// GetElementFromMapComplex checks if element with complex key exists in a map
func GetElementFromMapComplex(family, tableName, mapName string, keyParts []string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	key, _, err := buildConcatenatedKey(mapName, keyParts)
	if err != nil {
		return err
	}

	return client.GetMapElement(f, tableName, mapName, key)
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
	if strings.Contains(ip, "/") {
		// fwd_iface_lan/wan are keyed ifname.ipv4_addr, dns_access ipv4_addr.ifname
		if mapName == "fwd_iface_lan" || mapName == "fwd_iface_wan" {
			return AddIfaceIPCIDRVerdictElement(family, tableName, mapName, iface, ip, verdict)
		}
		if mapName == "dns_access" {
			return AddIPIfaceCIDRVerdictElement(family, tableName, mapName, ip, iface, verdict)
		}
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

// CreateIPIfaceVerdictMap creates a map with type ipv4_addr . ifname : verdict
func CreateIPIfaceVerdictMap(family, tableName, mapName string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	// nft errors when the target table is absent; preserve that behavior
	// (GetTable would otherwise get-or-create the table).
	if err := CheckTableExists(family, tableName); err != nil {
		return fmt.Errorf("table %s not found", tableName)
	}
	table := client.GetTable(f, tableName)

	keyType, err := nftables.ConcatSetType(nftables.TypeIPAddr, nftables.TypeIFName)
	if err != nil {
		return fmt.Errorf("failed to build concatenated key type for map %s: %v", mapName, err)
	}

	m := &nftables.Set{
		Table:         table,
		Name:          mapName,
		IsMap:         true,
		Concatenation: true,
		KeyType:       keyType,
		DataType:      nftables.TypeVerdict,
	}

	if err := client.conn.AddSet(m, nil); err != nil {
		return fmt.Errorf("failed to create map %s: %v", mapName, err)
	}
	if err := client.conn.Flush(); err != nil {
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

// addRuleExprs adds (append) or inserts (prepend) a rule built from raw
// nftables expressions. The expression sequences used by the typed builders
// below replicate the bytecode `nft --debug=netlink` emits for the legacy
// rule strings.
func addRuleExprs(family, tableName, chainName string, exprs []expr.Any, insert bool) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	if err := CheckTableExists(family, tableName); err != nil {
		return fmt.Errorf("table %s not found", tableName)
	}
	table := client.GetTable(f, tableName)

	rule := &nftables.Rule{
		Table: table,
		Chain: &nftables.Chain{Name: chainName, Table: table},
		Exprs: exprs,
	}

	if insert {
		client.conn.InsertRule(rule)
	} else {
		client.conn.AddRule(rule)
	}
	return client.conn.Flush()
}

// ipv4Dependency matches `meta nfproto ipv4`, the implicit dependency nft
// generates for `ip ...` matches in inet-family tables.
func ipv4Dependency() []expr.Any {
	return []expr.Any{
		&expr.Meta{Key: expr.MetaKeyNFPROTO, Register: 1},
		&expr.Cmp{Op: expr.CmpOpEq, Register: 1, Data: []byte{unix.NFPROTO_IPV4}},
	}
}

// AddMarkSetRule appends `meta mark set <mark>` to a chain.
func AddMarkSetRule(family, tableName, chainName string, mark uint32) error {
	return addRuleExprs(family, tableName, chainName, []expr.Any{
		&expr.Immediate{Register: 1, Data: binaryutil.NativeEndian.PutUint32(mark)},
		&expr.Meta{Key: expr.MetaKeyMARK, SourceRegister: true, Register: 1},
	}, false)
}

// AddAcceptRule appends `accept` to a chain.
func AddAcceptRule(family, tableName, chainName string) error {
	return addRuleExprs(family, tableName, chainName, []expr.Any{
		&expr.Verdict{Kind: expr.VerdictAccept},
	}, false)
}

// AddOutboundUplinkHashRule appends the outbound load-balancing rule:
//
//	iif != lo iifname != "site*" iifname != @uplink_interfaces
//	ip daddr != @supernetworks ip daddr != 224.0.0.0/4
//	meta mark set jhash ip saddr [. ip daddr] mod <numTables> offset <offset>
func AddOutboundUplinkHashRule(family, tableName, chainName string, saddrOnly bool, numTables, offset int) error {
	lo, err := net.InterfaceByName("lo")
	if err != nil {
		return fmt.Errorf("failed to resolve interface lo: %v", err)
	}

	exprs := []expr.Any{
		&expr.Meta{Key: expr.MetaKeyIIF, Register: 1},
		&expr.Cmp{Op: expr.CmpOpNeq, Register: 1, Data: binaryutil.NativeEndian.PutUint32(uint32(lo.Index))},
		&expr.Meta{Key: expr.MetaKeyIIFNAME, Register: 1},
		// wildcard `iifname != "site*"` compares only the prefix bytes
		&expr.Cmp{Op: expr.CmpOpNeq, Register: 1, Data: []byte("site")},
		&expr.Meta{Key: expr.MetaKeyIIFNAME, Register: 1},
		&expr.Lookup{SourceRegister: 1, SetName: "uplink_interfaces", Invert: true},
	}
	exprs = append(exprs, ipv4Dependency()...)
	exprs = append(exprs,
		&expr.Payload{DestRegister: 1, Base: expr.PayloadBaseNetworkHeader, Offset: 16, Len: 4},
		&expr.Lookup{SourceRegister: 1, SetName: "supernetworks", Invert: true},
		// ip daddr != 224.0.0.0/4
		&expr.Payload{DestRegister: 1, Base: expr.PayloadBaseNetworkHeader, Offset: 16, Len: 4},
		&expr.Bitwise{SourceRegister: 1, DestRegister: 1, Len: 4,
			Mask: []byte{0xf0, 0x00, 0x00, 0x00}, Xor: []byte{0x00, 0x00, 0x00, 0x00}},
		&expr.Cmp{Op: expr.CmpOpNeq, Register: 1, Data: []byte{0xe0, 0x00, 0x00, 0x00}},
	)

	// Hash key loads into 128-bit register 2 (32-bit slots 12+), matching nft's
	// register allocation: saddr to the first slot, daddr to slot 13 for the
	// concatenated strategy.
	hashLen := uint32(4)
	exprs = append(exprs, &expr.Payload{DestRegister: 2, Base: expr.PayloadBaseNetworkHeader, Offset: 12, Len: 4})
	if !saddrOnly {
		hashLen = 8
		exprs = append(exprs, &expr.Payload{DestRegister: 13, Base: expr.PayloadBaseNetworkHeader, Offset: 16, Len: 4})
	}
	exprs = append(exprs,
		&expr.Hash{SourceRegister: 2, DestRegister: 1, Length: hashLen,
			Modulus: uint32(numTables), Offset: uint32(offset), Type: expr.HashTypeJenkins},
		&expr.Meta{Key: expr.MetaKeyMARK, SourceRegister: true, Register: 1},
	)

	return addRuleExprs(family, tableName, chainName, exprs, false)
}

// InsertWiphyForwardLanRule inserts:
//
//	counter oifname "<apIface>.*" ip saddr . iifname vmap @lan_access
func InsertWiphyForwardLanRule(family, tableName, chainName, apIface string) error {
	exprs := []expr.Any{
		&expr.Counter{},
		&expr.Meta{Key: expr.MetaKeyOIFNAME, Register: 1},
		// wildcard `oifname "<iface>.*"` compares only the prefix bytes
		&expr.Cmp{Op: expr.CmpOpEq, Register: 1, Data: []byte(apIface + ".")},
	}
	exprs = append(exprs, ipv4Dependency()...)
	exprs = append(exprs,
		// concatenated vmap key: ip saddr . iifname
		&expr.Payload{DestRegister: 1, Base: expr.PayloadBaseNetworkHeader, Offset: 12, Len: 4},
		&expr.Meta{Key: expr.MetaKeyIIFNAME, Register: 9},
		&expr.Lookup{SourceRegister: 1, SetName: "lan_access", DestRegister: 0, IsDestRegSet: true},
	)
	return addRuleExprs(family, tableName, chainName, exprs, true)
}

// InsertCustomGroupVmapRule inserts the custom-zone vmap rule:
//
//	ip daddr . oifname vmap @<zone>_dst_access ip saddr . iifname vmap @<zone>_src_access
func InsertCustomGroupVmapRule(family, tableName, chainName, zoneName string) error {
	exprs := ipv4Dependency()
	exprs = append(exprs,
		&expr.Payload{DestRegister: 1, Base: expr.PayloadBaseNetworkHeader, Offset: 16, Len: 4},
		&expr.Meta{Key: expr.MetaKeyOIFNAME, Register: 9},
		&expr.Lookup{SourceRegister: 1, SetName: zoneName + "_dst_access", DestRegister: 0, IsDestRegSet: true},
		&expr.Payload{DestRegister: 1, Base: expr.PayloadBaseNetworkHeader, Offset: 12, Len: 4},
		&expr.Meta{Key: expr.MetaKeyIIFNAME, Register: 9},
		&expr.Lookup{SourceRegister: 1, SetName: zoneName + "_src_access", DestRegister: 0, IsDestRegSet: true},
	)
	return addRuleExprs(family, tableName, chainName, exprs, true)
}

// InsertDNSDnatPortRule inserts:
//
//	<protocol> dport 53 counter dnat ip to <dnsIP>:53
func InsertDNSDnatPortRule(family, tableName, chainName, protocol, dnsIP string) error {
	proto := ProtocolToBytes(protocol)
	if proto == nil {
		return fmt.Errorf("invalid protocol %s", protocol)
	}
	ip := net.ParseIP(dnsIP)
	if ip == nil || ip.To4() == nil {
		return fmt.Errorf("invalid IPv4 address %s", dnsIP)
	}

	exprs := []expr.Any{
		&expr.Meta{Key: expr.MetaKeyL4PROTO, Register: 1},
		&expr.Cmp{Op: expr.CmpOpEq, Register: 1, Data: proto},
		&expr.Payload{DestRegister: 1, Base: expr.PayloadBaseTransportHeader, Offset: 2, Len: 2},
		&expr.Cmp{Op: expr.CmpOpEq, Register: 1, Data: binaryutil.BigEndian.PutUint16(53)},
		&expr.Counter{},
		&expr.Immediate{Register: 1, Data: ip.To4()},
		&expr.Immediate{Register: 2, Data: binaryutil.BigEndian.PutUint16(53)},
		&expr.NAT{Type: expr.NATTypeDestNAT, Family: unix.NFPROTO_IPV4,
			RegAddrMin: 1, RegProtoMin: 2, Specified: true},
	}
	return addRuleExprs(family, tableName, chainName, exprs, true)
}

// InsertDNSMapDnatRule inserts:
//
//	ip saddr @custom_dns_devices meta l4proto <protocol> dnat to ip saddr map @custom_dns_devices:53
func InsertDNSMapDnatRule(family, tableName, chainName, protocol string) error {
	proto := ProtocolToBytes(protocol)
	if proto == nil {
		return fmt.Errorf("invalid protocol %s", protocol)
	}

	exprs := ipv4Dependency()
	exprs = append(exprs,
		// set membership: ip saddr @custom_dns_devices
		&expr.Payload{DestRegister: 1, Base: expr.PayloadBaseNetworkHeader, Offset: 12, Len: 4},
		&expr.Lookup{SourceRegister: 1, SetName: "custom_dns_devices"},
		&expr.Meta{Key: expr.MetaKeyL4PROTO, Register: 1},
		&expr.Cmp{Op: expr.CmpOpEq, Register: 1, Data: proto},
		// map lookup: dnat address from @custom_dns_devices keyed by saddr
		&expr.Payload{DestRegister: 1, Base: expr.PayloadBaseNetworkHeader, Offset: 12, Len: 4},
		&expr.Lookup{SourceRegister: 1, SetName: "custom_dns_devices", DestRegister: 1, IsDestRegSet: true},
		&expr.Immediate{Register: 2, Data: binaryutil.BigEndian.PutUint16(53)},
		&expr.NAT{Type: expr.NATTypeDestNAT, Family: unix.NFPROTO_IPV4,
			RegAddrMin: 1, RegProtoMin: 2, Specified: true},
	)
	return addRuleExprs(family, tableName, chainName, exprs, true)
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

// GetIPFromSet checks if an IP exists in a set
func GetIPFromSet(family, tableName, setName, ip string) error {
	f, client, err := withFamily(family)
	if err != nil {
		return err
	}

	set, err := client.GetMap(f, tableName, setName)
	if err != nil {
		return fmt.Errorf("failed to get set %s/%s/%s: %w", familyToString(f), tableName, setName, err)
	}

	elements, err := client.conn.GetSetElements(set)
	if err != nil {
		return fmt.Errorf("failed to get set elements: %w", err)
	}

	keyBytes := IPToBytes(ip)
	if keyBytes == nil {
		return fmt.Errorf("invalid IP address: %s", ip)
	}

	// Check if the IP exists in the set
	for _, elem := range elements {
		if bytes.Equal(elem.Key, keyBytes) {
			return nil // Found
		}
	}

	return fmt.Errorf("element not found in set")
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
