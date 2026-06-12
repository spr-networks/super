package main

// Differential tests for the Docker Engine API label lookups, with the docker
// CLI (against the same daemon) as the reference behavior. They need
// /var/run/docker.sock and the docker CLI (see test.sh) and skip otherwise.

import (
	"os/exec"
	"strings"
	"testing"
)

const (
	testContainer = "sprtest-label-container"
	testImage     = "sprtest-label-image"
	testLabel     = "org.sprtest.label"
	testValue     = "hello-differential"
)

func requireDocker(t *testing.T) {
	t.Helper()
	if err := exec.Command("docker", "version").Run(); err != nil {
		t.Skipf("docker daemon not reachable: %v", err)
	}
}

// cliInspectLabel is the old implementation, kept as the reference oracle.
func cliInspectLabel(t *testing.T, name, label string) (string, error) {
	t.Helper()
	out, err := exec.Command("docker", "inspect",
		"--format={{index .Config.Labels \""+label+"\"}}", name).Output()
	if err != nil {
		return "", err
	}
	return strings.Trim(string(out), "\n"), nil
}

// setupLabeledImage builds a tiny image carrying a known label.
func setupLabeledImage(t *testing.T) {
	t.Helper()
	dockerfile := "FROM busybox\nLABEL " + testLabel + "=" + testValue + "\n"
	cmd := exec.Command("docker", "build", "-q", "-t", testImage, "-")
	cmd.Stdin = strings.NewReader(dockerfile)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Skipf("cannot build test image (network/registry?): %v\n%s", err, out)
	}
	t.Cleanup(func() { _ = exec.Command("docker", "rmi", "-f", testImage).Run() })
}

// setupLabeledContainer creates (without running) a container carrying a label.
func setupLabeledContainer(t *testing.T) {
	t.Helper()
	setupLabeledImage(t)
	_ = exec.Command("docker", "rm", "-f", testContainer).Run()
	if out, err := exec.Command("docker", "create", "--name", testContainer,
		"--label", testLabel+"="+testValue, testImage).CombinedOutput(); err != nil {
		t.Fatalf("docker create: %v\n%s", err, out)
	}
	t.Cleanup(func() { _ = exec.Command("docker", "rm", "-f", testContainer).Run() })
}

func TestDockerObjectLabelContainer(t *testing.T) {
	requireDocker(t)
	setupLabeledContainer(t)

	got, err := dockerObjectLabel(testContainer, testLabel)
	if err != nil {
		t.Fatalf("dockerObjectLabel() error = %v", err)
	}
	want, err := cliInspectLabel(t, testContainer, testLabel)
	if err != nil {
		t.Fatalf("docker inspect CLI: %v", err)
	}

	if got != want {
		t.Errorf("container label: api=%q cli=%q", got, want)
	}
	if got != testValue {
		t.Errorf("container label = %q, want %q", got, testValue)
	}
}

func TestDockerObjectLabelImage(t *testing.T) {
	requireDocker(t)
	setupLabeledImage(t)

	// no container by this name exists, so the lookup falls through to the
	// image endpoint - the same order `docker inspect` resolves names
	got, err := dockerObjectLabel(testImage, testLabel)
	if err != nil {
		t.Fatalf("dockerObjectLabel() error = %v", err)
	}
	want, err := cliInspectLabel(t, testImage, testLabel)
	if err != nil {
		t.Fatalf("docker inspect CLI: %v", err)
	}

	if got != want {
		t.Errorf("image label: api=%q cli=%q", got, want)
	}
	if got != testValue {
		t.Errorf("image label = %q, want %q", got, testValue)
	}
}

func TestDockerObjectLabelMissingLabel(t *testing.T) {
	requireDocker(t)
	setupLabeledContainer(t)

	// missing label on an existing object: CLI prints empty (exit 0),
	// the API path returns "" without error
	got, err := dockerObjectLabel(testContainer, "org.sprtest.does-not-exist")
	if err != nil {
		t.Fatalf("dockerObjectLabel() error = %v, want nil for missing label", err)
	}
	want, err := cliInspectLabel(t, testContainer, "org.sprtest.does-not-exist")
	if err != nil {
		t.Fatalf("docker inspect CLI: %v", err)
	}

	if got != want {
		t.Errorf("missing label: api=%q cli=%q", got, want)
	}
	if got != "" {
		t.Errorf("missing label = %q, want empty", got)
	}
}

func TestDockerObjectLabelMissingObject(t *testing.T) {
	requireDocker(t)

	// missing container AND image must error, like `docker inspect`
	_, err := dockerObjectLabel("sprtest-definitely-does-not-exist", testLabel)
	if err == nil {
		t.Error("dockerObjectLabel() = nil error for missing object, want error")
	}
	if _, err := cliInspectLabel(t, "sprtest-definitely-does-not-exist", testLabel); err == nil {
		t.Error("docker inspect CLI unexpectedly succeeded for missing object")
	}
}

func TestDockerImageLabelViaContainer(t *testing.T) {
	requireDocker(t)
	setupLabeledContainer(t)

	got, err := dockerImageLabel(testContainer, testLabel)
	if err != nil {
		t.Fatalf("dockerImageLabel() error = %v", err)
	}
	if got != testValue {
		t.Errorf("dockerImageLabel() = %q, want %q", got, testValue)
	}
}

func TestGetHostSuperDirDefault(t *testing.T) {
	requireDocker(t)

	if err := exec.Command("docker", "inspect", "superd").Run(); err == nil {
		t.Skip("a real superd container exists on this daemon")
	}

	if dir := getHostSuperDir(); dir != "/home/spr/super/" {
		t.Errorf("getHostSuperDir() = %q, want default /home/spr/super/", dir)
	}
}
