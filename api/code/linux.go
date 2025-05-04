//go:build linux
// +build linux

package main

import (
	"syscall"
)

func bindToDevice(fd int, ifName string) error {
	return syscall.BindToDevice(fd, ifName)
}
