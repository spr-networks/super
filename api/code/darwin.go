//go:build darwin
// +build darwin

package main

func bindToDevice(fd int, ifName string) error {
	// No-op on macOS
	return nil
}
