package main

import (
	"bufio"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// HostapdCtrl represents a connection to hostapd control interface
type HostapdCtrl struct {
	conn       net.Conn
	socketPath string
	localPath  string
	mu         sync.Mutex
}

// NewHostapdCtrl creates a new hostapd control interface connection
// Based on patterns from github.com/hdiniz/wpa_supplicant-go
func NewHostapdCtrl(iface string) (*HostapdCtrl, error) {
	socketPath := fmt.Sprintf("%s/state/wifi/control_%s/%s", TEST_PREFIX, iface, iface)
	
	// Create a unique local socket path
	localPath := fmt.Sprintf("/tmp/hostapd_ctrl_%s_%d_%d", iface, os.Getpid(), time.Now().UnixNano())
	
	// Clean up any existing socket
	os.Remove(localPath)
	
	// Create local address
	laddr, err := net.ResolveUnixAddr("unixgram", localPath)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve local address: %v", err)
	}
	
	// Create remote address
	raddr, err := net.ResolveUnixAddr("unixgram", socketPath)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve remote address: %v", err)
	}
	
	// Connect
	conn, err := net.DialUnix("unixgram", laddr, raddr)
	if err != nil {
		os.Remove(localPath)
		return nil, fmt.Errorf("failed to connect to hostapd: %v", err)
	}
	
	h := &HostapdCtrl{
		conn:       conn,
		socketPath: socketPath,
		localPath:  localPath,
	}
	
	// Test connection
	resp, err := h.SendCommand("PING")
	if err != nil {
		conn.Close()
		os.Remove(localPath)
		return nil, fmt.Errorf("hostapd not responding: %v", err)
	}
	if resp != "PONG" {
		conn.Close()
		os.Remove(localPath)
		return nil, fmt.Errorf("unexpected PING response: %s", resp)
	}
	
	// Attach to receive events
	resp, err = h.SendCommand("ATTACH")
	if err != nil {
		conn.Close()
		os.Remove(localPath)
		return nil, fmt.Errorf("failed to attach: %v", err)
	}
	if resp != "OK" {
		conn.Close()
		os.Remove(localPath)
		return nil, fmt.Errorf("ATTACH failed: %s", resp)
	}
	
	return h, nil
}

// Close closes the connection
func (h *HostapdCtrl) Close() error {
	h.mu.Lock()
	defer h.mu.Unlock()
	
	if h.conn != nil {
		// Send DETACH (ignore errors)
		h.conn.SetDeadline(time.Now().Add(100 * time.Millisecond))
		h.conn.Write([]byte("DETACH"))
		
		// Close connection
		err := h.conn.Close()
		h.conn = nil
		
		// Clean up local socket
		os.Remove(h.localPath)
		
		return err
	}
	
	return nil
}

// SendCommand sends a command and waits for response
func (h *HostapdCtrl) SendCommand(cmd string) (string, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	
	if h.conn == nil {
		return "", fmt.Errorf("connection closed")
	}
	
	// Set a reasonable timeout
	h.conn.SetDeadline(time.Now().Add(5 * time.Second))
	defer h.conn.SetDeadline(time.Time{})
	
	// Send command
	_, err := h.conn.Write([]byte(cmd))
	if err != nil {
		return "", fmt.Errorf("failed to send command: %v", err)
	}
	
	// Read response
	buf := make([]byte, 4096)
	n, err := h.conn.Read(buf)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %v", err)
	}
	
	resp := strings.TrimSpace(string(buf[:n]))
	
	// Skip event messages (they start with <priority>)
	for strings.HasPrefix(resp, "<") {
		n, err = h.conn.Read(buf)
		if err != nil {
			return "", fmt.Errorf("failed to read response: %v", err)
		}
		resp = strings.TrimSpace(string(buf[:n]))
	}
	
	return resp, nil
}

// GetAllStations returns all connected stations
func (h *HostapdCtrl) GetAllStations() (map[string]map[string]string, error) {
	resp, err := h.SendCommand("ALL_STA")
	if err != nil {
		return nil, err
	}

	stations := make(map[string]map[string]string)
	var currentMAC string

	scanner := bufio.NewScanner(strings.NewReader(resp))
	for scanner.Scan() {
		line := scanner.Text()

		// MAC address lines don't contain '='
		if !strings.Contains(line, "=") && len(line) == 17 && strings.Contains(line, ":") {
			currentMAC = line
			stations[currentMAC] = make(map[string]string)
		} else if currentMAC != "" && strings.Contains(line, "=") {
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				stations[currentMAC][parts[0]] = parts[1]
			}
		}
	}

	return stations, nil
}

// GetStatus returns hostapd status
func (h *HostapdCtrl) GetStatus() (map[string]string, error) {
	resp, err := h.SendCommand("STATUS")
	if err != nil {
		return nil, err
	}

	status := make(map[string]string)
	scanner := bufio.NewScanner(strings.NewReader(resp))
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, "=") {
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				status[parts[0]] = parts[1]
			}
		}
	}

	return status, nil
}

// ReloadWPAPSK reloads WPA PSK file
func (h *HostapdCtrl) ReloadWPAPSK() error {
	resp, err := h.SendCommand("RELOAD_WPA_PSK")
	if err != nil {
		return err
	}
	if resp != "OK" {
		return fmt.Errorf("RELOAD_WPA_PSK failed: %s", resp)
	}
	return nil
}

// DisconnectStation disconnects a specific station
func (h *HostapdCtrl) DisconnectStation(mac string) error {
	resp, err := h.SendCommand(fmt.Sprintf("DEAUTHENTICATE %s", mac))
	if err != nil {
		return err
	}
	if resp != "OK" {
		return fmt.Errorf("DEAUTHENTICATE failed: %s", resp)
	}
	return nil
}

// HostapdCtrlManager manages multiple hostapd control connections
type HostapdCtrlManager struct {
	connections map[string]*HostapdCtrl
	mu          sync.RWMutex
}

// NewHostapdCtrlManager creates a new hostapd control manager
func NewHostapdCtrlManager() *HostapdCtrlManager {
	return &HostapdCtrlManager{
		connections: make(map[string]*HostapdCtrl),
	}
}

// GetConnection gets or creates a connection for an interface
func (m *HostapdCtrlManager) GetConnection(iface string) (*HostapdCtrl, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if conn, exists := m.connections[iface]; exists {
		return conn, nil
	}

	conn, err := NewHostapdCtrl(iface)
	if err != nil {
		return nil, err
	}

	m.connections[iface] = conn
	return conn, nil
}

// CloseAll closes all connections
func (m *HostapdCtrlManager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, conn := range m.connections {
		conn.Close()
	}
	m.connections = make(map[string]*HostapdCtrl)
}

// Global hostapd control manager
var hostapdCtrlManager = NewHostapdCtrlManager()

// init performs cleanup of stale socket files on startup
func init() {
	// Clean up any stale hostapd control sockets from previous runs
	pattern := fmt.Sprintf("/tmp/hostapd_ctrl_*_%d_*", os.Getpid())
	matches, _ := filepath.Glob(pattern)
	for _, match := range matches {
		os.Remove(match)
	}
}

// Replacement functions for existing exec-based functions

// RunHostapdCommandDirect sends a command directly to hostapd without exec
func RunHostapdCommandDirect(iface string, cmd string) (string, error) {
	ctrl, err := hostapdCtrlManager.GetConnection(iface)
	if err != nil {
		return "", err
	}
	return ctrl.SendCommand(cmd)
}

// RunHostapdAllStationsDirect gets all stations without exec
func RunHostapdAllStationsDirect(iface string) (map[string]map[string]string, error) {
	ctrl, err := hostapdCtrlManager.GetConnection(iface)
	if err != nil {
		return nil, err
	}
	return ctrl.GetAllStations()
}
