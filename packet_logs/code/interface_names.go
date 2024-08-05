package main

import (
	"fmt"
	"net"
	"sync"

	"github.com/vishvananda/netlink"
	"golang.org/x/sys/unix"
)

type InterfaceMap struct {
	mu    sync.RWMutex
	ifMap map[int]string
}

func NewInterfaceMap() *InterfaceMap {
	im := &InterfaceMap{
		ifMap: make(map[int]string),
	}
	go im.listenNewInterfaceUp()
	return im
}

func (im *InterfaceMap) listenNewInterfaceUp() {
	lnkupdate := make(chan netlink.LinkUpdate)
	lnkdone := make(chan struct{})
	err := netlink.LinkSubscribe(lnkupdate, lnkdone)
	if err != nil {
		fmt.Println("failed to netlink subscribe:", err)
		return
	}
	for {
		select {
		case msg := <-lnkupdate:
			if msg.Change == unix.IFF_UP {
				im.mu.Lock()
				im.ifMap[msg.Attrs().Index] = msg.Attrs().Name
				im.mu.Unlock()
				if gDebug {
					fmt.Println("link up", msg.Attrs().Name, msg.Attrs().Index)
				}
			}
		}
	}
}

func (im *InterfaceMap) GetInterfaceName(index int) string {
	im.mu.RLock()
	name, ok := im.ifMap[index]
	im.mu.RUnlock()

	if !ok {
		// If not found in the map, look it up
		iface, err := net.InterfaceByIndex(index)
		if gDebug {
			fmt.Println("looked up", index, err)
		}
		if err == nil {
			name = iface.Name
			// Add to the map for future lookups
			im.mu.Lock()
			im.ifMap[index] = name
			im.mu.Unlock()
		} else {
			return ""
		}
	}

	return name
}
