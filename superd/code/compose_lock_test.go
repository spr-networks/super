package main

import (
	"reflect"
	"testing"
	"time"
)

func TestAppendComposeCommandArgsDisablesPullForUp(t *testing.T) {
	got := appendComposeCommandArgs([]string{"-f", "docker-compose.yml", "up"}, "up", "-d", "api dns")
	want := []string{"-f", "docker-compose.yml", "up", "-d", "--pull", "never", "api", "dns"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("appendComposeCommandArgs() = %v, want %v", got, want)
	}
}

func TestAppendComposeCommandArgsLeavesPullUnchanged(t *testing.T) {
	got := appendComposeCommandArgs([]string{"-f", "docker-compose.yml", "pull"}, "pull", "", "api")
	want := []string{"-f", "docker-compose.yml", "pull", "api"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("appendComposeCommandArgs() = %v, want %v", got, want)
	}
}

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
