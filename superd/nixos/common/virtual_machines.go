package common

import (
	"os"
	"sort"
	"strconv"
	"strings"
)

var KVMDebugfsPath = "/sys/kernel/debug/kvm"

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

// VMContainer is a running container whose process may be a KVM VM (krun).
type VMContainer struct {
	ID          string
	Name        string
	PID         int
	State       string
	Runtime     string
	Image       string
	StartedAt   string
	Annotations map[string]string
}

func annotationInt(annotations map[string]string, key string) int {
	value, err := strconv.Atoi(annotations[key])
	if err != nil || value < 1 {
		return 0
	}
	return value
}

// DiscoverVirtualMachines lists the KVM VMs on the host, named after the
// containers that run them. containers reports the running containers, and
// false when their metadata is incomplete.
func DiscoverVirtualMachines(containers func() ([]VMContainer, bool)) VirtualMachineInventory {
	inventory := VirtualMachineInventory{
		Discovery:       "kvm-debugfs",
		VirtualMachines: []VirtualMachineInfo{},
	}

	entries, err := os.ReadDir(KVMDebugfsPath)
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

	list, ok := containers()
	inventory.ContainerMetadataAvailable = ok
	for _, info := range list {
		for _, index := range vmIndexesByPID[info.PID] {
			vm := &inventory.VirtualMachines[index]
			vm.Name = strings.TrimPrefix(info.Name, "/")
			vm.State = info.State
			vm.Container = true
			vm.ContainerID = info.ID
			vm.Runtime = info.Runtime
			vm.Image = info.Image
			vm.StartedAt = info.StartedAt
			vm.CPUs = annotationInt(info.Annotations, "krun.cpus")
			vm.MemoryMiB = annotationInt(info.Annotations, "krun.ram_mib")
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
