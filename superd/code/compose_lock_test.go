package main

import (
	"testing"
	"time"
)

func TestLockComposeCommandSerializesSameComposeFile(t *testing.T) {
	unlock := lockComposeCommand("plugins/user/spr-dnscrypt/docker-compose.yml")
	acquired := make(chan struct{})

	go func() {
		defer lockComposeCommand("plugins/user/spr-dnscrypt/docker-compose.yml")()
		close(acquired)
	}()

	select {
	case <-acquired:
		t.Fatal("second command acquired the same compose-file lock early")
	case <-time.After(25 * time.Millisecond):
	}

	unlock()
	select {
	case <-acquired:
	case <-time.After(time.Second):
		t.Fatal("second command did not acquire the released compose-file lock")
	}
}

func TestLockComposeCommandAllowsDifferentComposeFiles(t *testing.T) {
	unlock := lockComposeCommand("plugins/user/spr-dnscrypt/docker-compose.yml")
	defer unlock()

	otherUnlock := lockComposeCommand("plugins/user/spr-tor/docker-compose.yml")
	otherUnlock()
}
