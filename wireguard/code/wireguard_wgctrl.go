package main

import (
	"encoding/json"
	"fmt"
	"net"
	"strings"
	"sync"

	"golang.zx2c4.com/wireguard/wgctrl"
	"golang.zx2c4.com/wireguard/wgctrl/wgtypes"
)

// WireGuardStatus represents the status of a WireGuard interface
type WireGuardStatus struct {
	PublicKey  string                       `json:"publicKey,omitempty"`
	ListenPort uint16                       `json:"listenPort,omitempty"`
	Peers      map[string]WireGuardPeerInfo `json:"peers"`
}

// WireGuardPeerInfo represents information about a peer
type WireGuardPeerInfo struct {
	PresharedKey        string   `json:"presharedKey,omitempty"`
	Endpoint            string   `json:"endpoint,omitempty"`
	LatestHandshake     uint64   `json:"latestHandshake,omitempty"`
	TransferRx          uint64   `json:"transferRx,omitempty"`
	TransferTx          uint64   `json:"transferTx,omitempty"`
	PersistentKeepalive uint16   `json:"persistentKeepalive,omitempty"`
	AllowedIPs          []string `json:"allowedIps"`
}

// WireGuardCtrl provides direct access to WireGuard using wgctrl
type WireGuardCtrl struct {
	client        *wgctrl.Client
	interfaceName string
}

// NewWireGuardCtrl creates a new WireGuard control client
func NewWireGuardCtrl(interfaceName string) (*WireGuardCtrl, error) {
	client, err := wgctrl.New()
	if err != nil {
		return nil, fmt.Errorf("failed to create wgctrl client: %v", err)
	}

	return &WireGuardCtrl{
		client:        client,
		interfaceName: interfaceName,
	}, nil
}

// Close closes the wgctrl client
func (w *WireGuardCtrl) Close() error {
	return w.client.Close()
}

// GenKeyPair generates a new WireGuard keypair without exec
func (w *WireGuardCtrl) GenKeyPair() (KeyPair, error) {
	// Generate private key
	privateKey, err := wgtypes.GeneratePrivateKey()
	if err != nil {
		return KeyPair{}, fmt.Errorf("failed to generate private key: %v", err)
	}

	// Get public key
	publicKey := privateKey.PublicKey()

	return KeyPair{
		PrivateKey: privateKey.String(),
		PublicKey:  publicKey.String(),
	}, nil
}

// GenPresharedKey generates a preshared key without exec
func (w *WireGuardCtrl) GenPresharedKey() (string, error) {
	key, err := wgtypes.GenerateKey()
	if err != nil {
		return "", fmt.Errorf("failed to generate preshared key: %v", err)
	}
	return key.String(), nil
}

// GetDevice gets the WireGuard device information
func (w *WireGuardCtrl) GetDevice() (*wgtypes.Device, error) {
	device, err := w.client.Device(w.interfaceName)
	if err != nil {
		return nil, fmt.Errorf("failed to get device: %v", err)
	}
	return device, nil
}

// GetStatus returns status in wg-json compatible format
func (w *WireGuardCtrl) GetStatus() (map[string]WireGuardStatus, error) {
	device, err := w.GetDevice()
	if err != nil {
		return nil, err
	}

	status := WireGuardStatus{
		PublicKey:  device.PublicKey.String(),
		ListenPort: uint16(device.ListenPort),
		Peers:      make(map[string]WireGuardPeerInfo),
	}

	for _, peer := range device.Peers {
		peerInfo := WireGuardPeerInfo{
			AllowedIPs: []string{},
		}

		// Set preshared key if present
		if peer.PresharedKey != (wgtypes.Key{}) {
			peerInfo.PresharedKey = peer.PresharedKey.String()
		}

		// Set endpoint if present
		if peer.Endpoint != nil {
			peerInfo.Endpoint = peer.Endpoint.String()
		}

		// Set handshake time if available
		if !peer.LastHandshakeTime.IsZero() {
			peerInfo.LatestHandshake = uint64(peer.LastHandshakeTime.Unix())
		}

		// Set transfer stats
		peerInfo.TransferRx = uint64(peer.ReceiveBytes)
		peerInfo.TransferTx = uint64(peer.TransmitBytes)

		// Set persistent keepalive
		if peer.PersistentKeepaliveInterval > 0 {
			peerInfo.PersistentKeepalive = uint16(peer.PersistentKeepaliveInterval.Seconds())
		}

		// Convert allowed IPs
		for _, ipnet := range peer.AllowedIPs {
			peerInfo.AllowedIPs = append(peerInfo.AllowedIPs, ipnet.String())
		}

		status.Peers[peer.PublicKey.String()] = peerInfo
	}

	result := make(map[string]WireGuardStatus)
	result[w.interfaceName] = status
	return result, nil
}

// GetPeers returns all peers on the interface
func (w *WireGuardCtrl) GetPeers() ([]ClientPeer, error) {
	device, err := w.GetDevice()
	if err != nil {
		return nil, err
	}

	var peers []ClientPeer
	for _, peer := range device.Peers {
		clientPeer := ClientPeer{
			PublicKey: peer.PublicKey.String(),
		}

		// Set preshared key if present
		if peer.PresharedKey != (wgtypes.Key{}) {
			clientPeer.PresharedKey = peer.PresharedKey.String()
		}

		// Set endpoint if present
		if peer.Endpoint != nil {
			clientPeer.Endpoint = peer.Endpoint.String()
		}

		// Set handshake time if available
		if !peer.LastHandshakeTime.IsZero() {
			clientPeer.LatestHandshake = uint64(peer.LastHandshakeTime.Unix())
		}

		// Set transfer stats
		clientPeer.TransferRx = uint64(peer.ReceiveBytes)
		clientPeer.TransferTx = uint64(peer.TransmitBytes)

		// Set persistent keepalive
		if peer.PersistentKeepaliveInterval > 0 {
			clientPeer.PersistentKeepalive = uint64(peer.PersistentKeepaliveInterval.Seconds())
		}

		// Convert allowed IPs
		var allowedIPs []string
		for _, ipnet := range peer.AllowedIPs {
			allowedIPs = append(allowedIPs, ipnet.String())
		}
		clientPeer.AllowedIPs = strings.Join(allowedIPs, ",")

		peers = append(peers, clientPeer)
	}

	return peers, nil
}

// GetPublicKey returns the public key of the interface
func (w *WireGuardCtrl) GetPublicKey() (string, error) {
	device, err := w.GetDevice()
	if err != nil {
		return "", err
	}
	return device.PublicKey.String(), nil
}

// SetPeer adds or updates a peer
func (w *WireGuardCtrl) SetPeer(publicKey string, presharedKey string, allowedIPs string) error {
	// Parse public key
	pubKey, err := wgtypes.ParseKey(publicKey)
	if err != nil {
		return fmt.Errorf("invalid public key: %v", err)
	}

	peerConfig := wgtypes.PeerConfig{
		PublicKey: pubKey,
	}

	// Parse preshared key if provided
	if presharedKey != "" && presharedKey != "(none)" {
		psk, err := wgtypes.ParseKey(presharedKey)
		if err != nil {
			return fmt.Errorf("invalid preshared key: %v", err)
		}
		peerConfig.PresharedKey = &psk
	}

	// Parse allowed IPs
	if allowedIPs != "" {
		for _, ipStr := range strings.Split(allowedIPs, ",") {
			ipStr = strings.TrimSpace(ipStr)
			_, ipnet, err := net.ParseCIDR(ipStr)
			if err != nil {
				// Try adding /32 for IPv4 or /128 for IPv6
				ip := net.ParseIP(ipStr)
				if ip == nil {
					return fmt.Errorf("invalid IP: %s", ipStr)
				}

				if ip.To4() != nil {
					ipStr += "/32"
				} else {
					ipStr += "/128"
				}

				_, ipnet, err = net.ParseCIDR(ipStr)
				if err != nil {
					return fmt.Errorf("invalid CIDR: %s", ipStr)
				}
			}
			peerConfig.AllowedIPs = append(peerConfig.AllowedIPs, *ipnet)
		}
	}

	// Configure the device
	config := wgtypes.Config{
		Peers: []wgtypes.PeerConfig{peerConfig},
	}

	return w.client.ConfigureDevice(w.interfaceName, config)
}

// RemovePeer removes a peer
func (w *WireGuardCtrl) RemovePeer(publicKey string) error {
	// Parse public key
	pubKey, err := wgtypes.ParseKey(publicKey)
	if err != nil {
		return fmt.Errorf("invalid public key: %v", err)
	}

	// Configure to remove the peer
	config := wgtypes.Config{
		Peers: []wgtypes.PeerConfig{
			{
				PublicKey: pubKey,
				Remove:    true,
			},
		},
	}

	return w.client.ConfigureDevice(w.interfaceName, config)
}

// Global WireGuard control client
var (
	wgCtrl     *WireGuardCtrl
	wgCtrlErr  error
	wgCtrlOnce sync.Once
)

// getWgCtrl returns the global WireGuard control client (lazy initialization)
func getWgCtrl() (*WireGuardCtrl, error) {
	wgCtrlOnce.Do(func() {
		wgCtrl, wgCtrlErr = NewWireGuardCtrl(WireguardInterface)
	})
	return wgCtrl, wgCtrlErr
}

// Replacement functions using wgctrl

// genKeyPairDirect generates a keypair without exec
func genKeyPairDirect() (KeyPair, error) {
	ctrl, err := getWgCtrl()
	if err != nil {
		return KeyPair{}, err
	}
	return ctrl.GenKeyPair()
}

// genPresharedKeyDirect generates a preshared key without exec
func genPresharedKeyDirect() (string, error) {
	ctrl, err := getWgCtrl()
	if err != nil {
		return "", err
	}
	return ctrl.GenPresharedKey()
}

// getPeersDirect gets peers without exec
func getPeersDirect() ([]ClientPeer, error) {
	ctrl, err := getWgCtrl()
	if err != nil {
		return nil, err
	}
	return ctrl.GetPeers()
}

// getPublicKeyDirect gets public key without exec
func getPublicKeyDirect() (string, error) {
	ctrl, err := getWgCtrl()
	if err != nil {
		return "", err
	}
	return ctrl.GetPublicKey()
}

// getWireGuardStatusDirect returns status in wg-json format without exec
func getWireGuardStatusDirect() (string, error) {
	ctrl, err := getWgCtrl()
	if err != nil {
		return "", err
	}

	status, err := ctrl.GetStatus()
	if err != nil {
		return "", err
	}

	jsonData, err := json.MarshalIndent(status, "", "\t")
	if err != nil {
		return "", err
	}

	return string(jsonData), nil
}

// setPeerDirect sets a peer without exec
func setPeerDirect(publicKey string, presharedKey string, allowedIPs string) error {
	ctrl, err := getWgCtrl()
	if err != nil {
		return err
	}
	return ctrl.SetPeer(publicKey, presharedKey, allowedIPs)
}

// removePeerDirect removes a peer without exec
func removePeerDirect(publicKey string) error {
	ctrl, err := getWgCtrl()
	if err != nil {
		return err
	}
	return ctrl.RemovePeer(publicKey)
}
