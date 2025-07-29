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
	iface          string
	conn           *net.UnixConn
	socketPath     string
	clientPath     string
	mu             sync.Mutex
	responseBuffer chan string
}

// NewHostapdCtrl creates a new hostapd control interface connection
func NewHostapdCtrl(iface string) (*HostapdCtrl, error) {
	h := &HostapdCtrl{
		iface:          iface,
		socketPath:     fmt.Sprintf("%s/state/wifi/control_%s/%s", TEST_PREFIX, iface, iface),
		responseBuffer: make(chan string, 10),
	}

	// Create a unique client socket path with timestamp to avoid conflicts
	h.clientPath = fmt.Sprintf("/tmp/hostapd_ctrl_%s_%d_%d", iface, os.Getpid(), time.Now().UnixNano())

	// Remove any existing client socket
	os.Remove(h.clientPath)

	// Create Unix domain socket
	conn, err := net.Dial("unixgram", h.socketPath)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to hostapd: %v", err)
	}

	// Bind to our client socket
	clientAddr, err := net.ResolveUnixAddr("unixgram", h.clientPath)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to resolve client address: %v", err)
	}

	clientConn, err := net.ListenUnixgram("unixgram", clientAddr)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to create client socket: %v", err)
	}

	h.conn = clientConn

	// Start reading responses before sending commands
	go h.readLoop()

	// Test connection with PING before ATTACH
	resp, err := h.SendCommand("PING")
	if err != nil {
		h.Close()
		return nil, fmt.Errorf("hostapd not responding: %v", err)
	}
	if resp != "PONG" {
		h.Close()
		return nil, fmt.Errorf("unexpected PING response: %s", resp)
	}

	// Send ATTACH command to receive unsolicited messages
	if err := h.attach(); err != nil {
		h.Close()
		return nil, err
	}

	return h, nil
}

// Close closes the hostapd control interface connection
func (h *HostapdCtrl) Close() error {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.conn != nil {
		// Send DETACH command
		h.detach()
		h.conn.Close()
		h.conn = nil
	}

	// Clean up client socket
	os.Remove(h.clientPath)

	return nil
}

// attach sends ATTACH command to receive unsolicited messages
func (h *HostapdCtrl) attach() error {
	resp, err := h.SendCommand("ATTACH")
	if err != nil {
		return err
	}
	if resp != "OK" {
		return fmt.Errorf("ATTACH failed: %s", resp)
	}
	return nil
}

// detach sends DETACH command
func (h *HostapdCtrl) detach() error {
	// Don't check response as we're closing anyway
	// Note: caller must hold h.mu lock
	h.sendRawUnlocked("DETACH")
	return nil
}

// readLoop continuously reads responses from hostapd
func (h *HostapdCtrl) readLoop() {
	buf := make([]byte, 4096)
	for {
		n, _, err := h.conn.ReadFrom(buf)
		if err != nil {
			// Connection closed
			return
		}

		resp := string(buf[:n])
		// Filter out unsolicited messages (they start with <priority>)
		if !strings.HasPrefix(resp, "<") {
			select {
			case h.responseBuffer <- resp:
			default:
				// Buffer full, drop oldest
				<-h.responseBuffer
				h.responseBuffer <- resp
			}
		}
	}
}

// sendRawUnlocked sends raw command without waiting for response (caller must hold lock)
func (h *HostapdCtrl) sendRawUnlocked(cmd string) error {
	if h.conn == nil {
		return fmt.Errorf("connection closed")
	}

	serverAddr, err := net.ResolveUnixAddr("unixgram", h.socketPath)
	if err != nil {
		return err
	}

	_, err = h.conn.WriteTo([]byte(cmd), serverAddr)
	return err
}

// sendRaw sends raw command without waiting for response
func (h *HostapdCtrl) sendRaw(cmd string) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	return h.sendRawUnlocked(cmd)
}

// SendCommand sends a command and waits for response
func (h *HostapdCtrl) SendCommand(cmd string) (string, error) {
	// Clear response buffer
	for len(h.responseBuffer) > 0 {
		<-h.responseBuffer
	}

	if err := h.sendRaw(cmd); err != nil {
		return "", err
	}

	// Wait for response with timeout
	select {
	case resp := <-h.responseBuffer:
		return strings.TrimSpace(resp), nil
	case <-time.After(5 * time.Second):
		return "", fmt.Errorf("timeout waiting for response")
	}
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
