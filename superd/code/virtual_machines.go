package main

import (
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
)

var KVM_DEBUGFS_PATH = "/sys/kernel/debug/kvm"

type VirtualMachineInfo struct {
	ID          string
	PID         int
	Name        string
	State       string
	Container   bool
	ContainerID string `json:",omitempty"`
	Runtime     string `json:",omitempty"`
	Image       string `json:",omitempty"`
	StartedAt   string `json:",omitempty"`
	CPUs        int    `json:",omitempty"`
	MemoryMiB   int    `json:",omitempty"`
}

type VirtualMachineInventory struct {
	Discovery                  string
	KVMAvailable               bool
	ContainerMetadataAvailable bool
	VirtualMachines            []VirtualMachineInfo
	Error                      string `json:",omitempty"`
}

type dockerContainerSummary struct {
	ID string
}

type dockerContainerVMInfo struct {
	ID     string
	Name   string
	Config struct {
		Image string
	}
	State struct {
		PID       int
		Status    string
		StartedAt string
	}
	HostConfig struct {
		Runtime     string
		Annotations map[string]string
	}
}

func annotationInt(annotations map[string]string, key string) int {
	value, err := strconv.Atoi(annotations[key])
	if err != nil || value < 1 {
		return 0
	}
	return value
}

func discoverVirtualMachines() VirtualMachineInventory {
	inventory := VirtualMachineInventory{
		Discovery:       "kvm-debugfs",
		VirtualMachines: []VirtualMachineInfo{},
	}

	entries, err := os.ReadDir(KVM_DEBUGFS_PATH)
	if err != nil {
		inventory.Error = err.Error()
		return inventory
	}
	inventory.KVMAvailable = true

	vmIndexesByPID := map[int][]int{}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		pidText, _, found := strings.Cut(entry.Name(), "-")
		if !found {
			continue
		}
		pid, err := strconv.Atoi(pidText)
		if err != nil || pid < 1 {
			continue
		}

		index := len(inventory.VirtualMachines)
		inventory.VirtualMachines = append(inventory.VirtualMachines, VirtualMachineInfo{
			ID:    entry.Name(),
			PID:   pid,
			Name:  "KVM VM " + entry.Name(),
			State: "running",
		})
		vmIndexesByPID[pid] = append(vmIndexesByPID[pid], index)
	}

	containers := []dockerContainerSummary{}
	if err := dockerAPIGetJSON("/containers/json?all=0", &containers); err == nil {
		inventory.ContainerMetadataAvailable = true
		for _, container := range containers {
			info := dockerContainerVMInfo{}
			if err := dockerAPIGetJSON("/containers/"+url.PathEscape(container.ID)+"/json", &info); err != nil {
				inventory.ContainerMetadataAvailable = false
				continue
			}

			indexes := vmIndexesByPID[info.State.PID]
			for _, index := range indexes {
				vm := &inventory.VirtualMachines[index]
				vm.Name = strings.TrimPrefix(info.Name, "/")
				vm.State = info.State.Status
				vm.Container = true
				vm.ContainerID = info.ID
				vm.Runtime = info.HostConfig.Runtime
				vm.Image = info.Config.Image
				vm.StartedAt = info.State.StartedAt
				vm.CPUs = annotationInt(info.HostConfig.Annotations, "krun.cpus")
				vm.MemoryMiB = annotationInt(info.HostConfig.Annotations, "krun.ram_mib")
			}
		}
	}

	sort.Slice(inventory.VirtualMachines, func(i, j int) bool {
		left := strings.ToLower(inventory.VirtualMachines[i].Name)
		right := strings.ToLower(inventory.VirtualMachines[j].Name)
		if left == right {
			return inventory.VirtualMachines[i].ID < inventory.VirtualMachines[j].ID
		}
		return left < right
	})

	return inventory
}

func virtual_machines(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(discoverVirtualMachines())
}
