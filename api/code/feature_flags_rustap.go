package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

var rustapFeatureMarkerPaths = []string{
	TEST_PREFIX + "/configs/wifi/enable_rust",
	TEST_PREFIX + "/configs/wifi_uplink/enable_rust",
}

func setRustapFeatureMarkers(enabled bool) (bool, error) {
	changed := false

	for _, path := range rustapFeatureMarkerPaths {
		if enabled {
			if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
				return changed, fmt.Errorf("create RustAP feature directory: %w", err)
			}
			if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
				changed = true
			} else if err != nil {
				return changed, fmt.Errorf("inspect RustAP feature marker: %w", err)
			}
			if err := os.WriteFile(path, nil, 0644); err != nil {
				return changed, fmt.Errorf("enable RustAP feature: %w", err)
			}
			continue
		}

		if err := os.Remove(path); err == nil {
			changed = true
		} else if !errors.Is(err, os.ErrNotExist) {
			return changed, fmt.Errorf("disable RustAP feature: %w", err)
		}
	}

	return changed, nil
}
