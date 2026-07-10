package main

import (
	"testing"
	"time"
)

func TestComposeCommandsSerialize(t *testing.T) {
	composeCommandMtx.Lock()
	acquired := make(chan struct{})

	go func() {
		composeCommandMtx.Lock()
		defer composeCommandMtx.Unlock()
		close(acquired)
	}()

	select {
	case <-acquired:
		t.Fatal("second compose command acquired the lock early")
	case <-time.After(25 * time.Millisecond):
	}

	composeCommandMtx.Unlock()
	select {
	case <-acquired:
	case <-time.After(time.Second):
		t.Fatal("second compose command did not acquire the released lock")
	}
}
