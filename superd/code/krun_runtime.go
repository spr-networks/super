package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"

	sprbus "github.com/spr-networks/sprbus-json"
)

const krunRuntimePackage = "spr-krun-runtime"
const krunRuntimeDebFile = "runtime.deb"
const krunRuntimeMinimumVersion = "1.19.4+crun1.28+spr2"

var krunRuntimeReleaseURL = "https://api.github.com/repos/spr-networks/super/releases/latest"
var krunRuntimeAssetURL = "https://api.github.com/repos/spr-networks/super/releases/assets/%d"
var krunRuntimeAttestationSANRegex = `^https://github\.com/spr-networks/super/\.github/workflows/pi-iso\.yml@refs/heads/main$`
var krunRuntimeHTTPClient = &http.Client{Timeout: 2 * time.Minute}
var krunRuntimeVerifyAttestation = verifyGithubAttestation
var krunRuntimeRunHost = runKrunRuntimeHostCommand
var krunRuntimeArchitecture = runtime.GOARCH
var krunRuntimeSuperRoot = SuperRootPath
var krunRuntimeHostSuperDir = currentHostSuperDir
var krunRuntimeReleaseChannel = getReleaseChannel
var krunRuntimeInstallLatest = installLatestKrunRuntime
var krunRuntimeHostStatus = krunRuntimeStatusOnHost
var krunRuntimeUpdateMarker = filepath.Join(SuperRootPath, "state", "superd", "krun-runtime-version")
var krunRuntimeInstallMtx sync.Mutex

var krunRuntimeDebName = regexp.MustCompile(`^spr-krun-runtime_([0-9A-Za-z.+:~-]+)_arm64\.deb$`)
var krunRuntimeReleaseTag = regexp.MustCompile(`^v[0-9]+\.[0-9]+\.[0-9]+$`)

type krunReleaseAsset struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type krunGithubRelease struct {
	TagName string             `json:"tag_name"`
	Assets  []krunReleaseAsset `json:"assets"`
}

type krunRuntimeRelease struct {
	Tag      string
	Version  string
	DebAsset krunReleaseAsset
}

type krunRuntimeStatus struct {
	Architecture string `json:"architecture"`
	Installed    bool   `json:"installed"`
	Version      string `json:"version,omitempty"`
	Release      string `json:"release,omitempty"`
	Package      string `json:"package,omitempty"`
	Digest       string `json:"digest,omitempty"`
	Updated      bool   `json:"updated,omitempty"`
}

type dockerContainerImage struct {
	Image string `json:"Image"`
}

func selectKrunRuntimeRelease(release krunGithubRelease) (krunRuntimeRelease, error) {
	if !krunRuntimeReleaseTag.MatchString(release.TagName) {
		return krunRuntimeRelease{}, fmt.Errorf("release has an invalid tag")
	}
	if len(release.Assets) > 100 {
		return krunRuntimeRelease{}, fmt.Errorf("release has too many assets")
	}
	selection := krunRuntimeRelease{Tag: release.TagName}
	for _, asset := range release.Assets {
		if len(asset.Name) > 255 {
			continue
		}
		match := krunRuntimeDebName.FindStringSubmatch(asset.Name)
		if match == nil {
			continue
		}
		if selection.DebAsset.Name != "" {
			return krunRuntimeRelease{}, fmt.Errorf("release has multiple arm64 runtime packages")
		}
		if asset.ID <= 0 {
			return krunRuntimeRelease{}, fmt.Errorf("release has an invalid runtime asset ID")
		}
		selection.Version = match[1]
		selection.DebAsset = asset
	}
	if selection.DebAsset.Name == "" {
		return krunRuntimeRelease{}, fmt.Errorf("release has no arm64 runtime package")
	}
	return selection, nil
}

func krunRuntimeRedirectAllowed(target *url.URL) bool {
	if target.Scheme != "https" || (target.Port() != "" && target.Port() != "443") {
		return false
	}
	switch strings.ToLower(target.Hostname()) {
	case "api.github.com", "github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com":
		return true
	default:
		return false
	}
}

func doKrunRuntimeRequest(req *http.Request) (*http.Response, error) {
	client := *krunRuntimeHTTPClient
	client.CheckRedirect = func(next *http.Request, via []*http.Request) error {
		if len(via) >= 5 || !krunRuntimeRedirectAllowed(next.URL) {
			return fmt.Errorf("refusing release download redirect")
		}
		return nil
	}
	return client.Do(req)
}

func latestKrunRuntimeRelease(ctx context.Context) (krunRuntimeRelease, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, krunRuntimeReleaseURL, nil)
	if err != nil {
		return krunRuntimeRelease{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := doKrunRuntimeRequest(req)
	if err != nil {
		return krunRuntimeRelease{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return krunRuntimeRelease{}, fmt.Errorf("release API returned status %d", resp.StatusCode)
	}
	release := krunGithubRelease{}
	limited := &io.LimitedReader{R: resp.Body, N: (2 << 20) + 1}
	decoder := json.NewDecoder(limited)
	if err := decoder.Decode(&release); err != nil {
		return krunRuntimeRelease{}, err
	}
	if limited.N <= 0 {
		return krunRuntimeRelease{}, fmt.Errorf("release API response is too large")
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return krunRuntimeRelease{}, fmt.Errorf("release API returned trailing data")
	}
	return selectKrunRuntimeRelease(release)
}

func downloadKrunRuntimeAsset(ctx context.Context, assetID int64, path string, maxBytes int64) error {
	if assetID <= 0 {
		return fmt.Errorf("invalid runtime asset ID")
	}
	downloadURL := fmt.Sprintf(krunRuntimeAssetURL, assetID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/octet-stream")
	resp, err := doKrunRuntimeRequest(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("runtime asset download returned status %d", resp.StatusCode)
	}
	if resp.ContentLength > maxBytes {
		return fmt.Errorf("runtime asset is larger than %d bytes", maxBytes)
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	written, copyErr := io.Copy(f, io.LimitReader(resp.Body, maxBytes+1))
	closeErr := f.Close()
	if copyErr != nil {
		os.Remove(path)
		return copyErr
	}
	if closeErr != nil {
		os.Remove(path)
		return closeErr
	}
	if written > maxBytes {
		os.Remove(path)
		return fmt.Errorf("runtime asset is larger than %d bytes", maxBytes)
	}
	return nil
}

func krunRuntimeFileDigest(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func currentSuperdImage() (string, error) {
	info := dockerContainerImage{}
	if err := dockerAPIGetJSON("/containers/superd/json", &info); err != nil {
		return "", err
	}
	if !strings.HasPrefix(info.Image, "sha256:") {
		return "", fmt.Errorf("superd has no immutable image ID")
	}
	return info.Image, nil
}

func currentHostSuperDir() (string, error) {
	dir, err := dockerObjectLabel("superd", "com.docker.compose.project.working_dir")
	if err != nil {
		return "", err
	}
	dir = filepath.Clean(dir)
	if !filepath.IsAbs(dir) || dir == string(filepath.Separator) {
		return "", fmt.Errorf("superd has no safe host project directory")
	}
	return dir, nil
}

func runKrunRuntimeHostCommand(ctx context.Context, command string, args ...string) ([]byte, error) {
	image, err := currentSuperdImage()
	if err != nil {
		return nil, err
	}
	dockerArgs := []string{
		"run", "--rm", "--privileged", "--pid=host", "--entrypoint", "nsenter",
		image, "-t", "1", "-m", "-u", "-n", "-i", "-p", "--", command,
	}
	dockerArgs = append(dockerArgs, args...)
	return exec.CommandContext(ctx, "docker", dockerArgs...).CombinedOutput()
}

func installKrunRuntimeOnHost(ctx context.Context, path string) ([]byte, error) {
	composeCommandMtx.Lock()
	defer composeCommandMtx.Unlock()
	return krunRuntimeRunHost(ctx, "env", "DEBIAN_FRONTEND=noninteractive",
		"apt-get", "install", "-y", "--no-install-recommends", "--no-allow-downgrades", "--", path)
}

func krunRuntimePackageField(ctx context.Context, path, field string) (string, error) {
	out, err := krunRuntimeRunHost(ctx, "dpkg-deb", "--field", path, field)
	if err != nil {
		return "", fmt.Errorf("inspect runtime package: %v: %s", err, strings.TrimSpace(string(out)))
	}
	value := strings.TrimSpace(string(out))
	if value == "" || strings.ContainsAny(value, "\x00\r\n") {
		return "", fmt.Errorf("runtime package has an invalid %s field", field)
	}
	return value, nil
}

func verifyKrunRuntimePackage(ctx context.Context, path, version string) error {
	packageName, err := krunRuntimePackageField(ctx, path, "Package")
	if err != nil {
		return err
	}
	packageVersion, err := krunRuntimePackageField(ctx, path, "Version")
	if err != nil {
		return err
	}
	architecture, err := krunRuntimePackageField(ctx, path, "Architecture")
	if err != nil {
		return err
	}
	if packageName != krunRuntimePackage || packageVersion != version || architecture != "arm64" {
		return fmt.Errorf("runtime package metadata does not match the selected release asset")
	}
	return nil
}

func requireKrunRuntimeVersion(ctx context.Context, version, operator, reference string) error {
	out, err := krunRuntimeRunHost(ctx, "dpkg", "--compare-versions", version, operator, reference)
	if err != nil {
		return fmt.Errorf("runtime version %q does not satisfy update policy: %v: %s", version, err, strings.TrimSpace(string(out)))
	}
	return nil
}

func installedKrunRuntime(ctx context.Context) (bool, string, error) {
	format := "${db:Status-Status}\n${Version}\n"
	out, err := krunRuntimeRunHost(ctx, "dpkg-query", "--show", "--showformat="+format, krunRuntimePackage)
	if err != nil {
		probeOut, probeErr := krunRuntimeRunHost(ctx, "dpkg-query", "--show", "--showformat="+format, "dpkg")
		if probeErr != nil {
			return false, "", fmt.Errorf("query host runtime: %v: %s", probeErr, strings.TrimSpace(string(probeOut)))
		}
		return false, "", nil
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) != 2 || lines[0] != "installed" {
		return false, "", nil
	}
	return true, lines[1], nil
}

func krunRuntimeStatusOnHost(ctx context.Context) (krunRuntimeStatus, error) {
	status := krunRuntimeStatus{Architecture: krunRuntimeArchitecture}
	installed, version, err := installedKrunRuntime(ctx)
	if err != nil {
		return status, err
	}
	status.Installed = installed
	status.Version = version
	return status, nil
}

func installLatestKrunRuntime(ctx context.Context) (krunRuntimeStatus, error) {
	krunRuntimeInstallMtx.Lock()
	defer krunRuntimeInstallMtx.Unlock()

	status := krunRuntimeStatus{Architecture: krunRuntimeArchitecture}
	if krunRuntimeArchitecture != "arm64" {
		return status, fmt.Errorf("SPR krun runtime packages support arm64 hosts only")
	}
	status, err := krunRuntimeStatusOnHost(ctx)
	if err != nil {
		return status, err
	}

	release, err := latestKrunRuntimeRelease(ctx)
	if err != nil {
		return status, err
	}
	status.Release = release.Tag
	status.Package = release.DebAsset.Name
	if status.Installed && status.Version == release.Version {
		if err := requireKrunRuntimeVersion(ctx, status.Version, "ge", krunRuntimeMinimumVersion); err != nil {
			return status, err
		}
		return status, nil
	}

	stateRoot := filepath.Join(krunRuntimeSuperRoot, "state", "superd")
	if err := os.MkdirAll(stateRoot, 0700); err != nil {
		return status, err
	}
	workDir, err := os.MkdirTemp(stateRoot, "krun-runtime-update.")
	if err != nil {
		return status, err
	}
	defer os.RemoveAll(workDir)

	debPath := filepath.Join(workDir, krunRuntimeDebFile)
	if err := downloadKrunRuntimeAsset(ctx, release.DebAsset.ID, debPath, 256<<20); err != nil {
		return status, err
	}
	digest, err := krunRuntimeFileDigest(debPath)
	if err != nil {
		return status, err
	}
	status.Digest = "sha256:" + digest
	if err := krunRuntimeVerifyAttestation(status.Digest, krunRuntimeAttestationSANRegex); err != nil {
		return status, fmt.Errorf("runtime package provenance verification failed: %v", err)
	}

	relativeDir, err := filepath.Rel(krunRuntimeSuperRoot, workDir)
	if err != nil || relativeDir == ".." || strings.HasPrefix(relativeDir, ".."+string(filepath.Separator)) {
		return status, fmt.Errorf("runtime package is outside the shared super directory")
	}
	hostSuperDir, err := krunRuntimeHostSuperDir()
	if err != nil {
		return status, err
	}
	hostDebPath := filepath.Join(hostSuperDir, relativeDir, krunRuntimeDebFile)
	if err := verifyKrunRuntimePackage(ctx, hostDebPath, release.Version); err != nil {
		return status, err
	}
	if err := requireKrunRuntimeVersion(ctx, release.Version, "ge", krunRuntimeMinimumVersion); err != nil {
		return status, err
	}
	if status.Installed {
		if err := requireKrunRuntimeVersion(ctx, release.Version, "gt", status.Version); err != nil {
			return status, err
		}
	}
	out, err := installKrunRuntimeOnHost(ctx, hostDebPath)
	if err != nil {
		return status, fmt.Errorf("install host runtime: %v: %s", err, strings.TrimSpace(string(out)))
	}

	installed, version, err := installedKrunRuntime(ctx)
	if err != nil {
		return status, err
	}
	if !installed || version != release.Version {
		return status, fmt.Errorf("host runtime version is %q after installing %q", version, release.Version)
	}
	status.Installed = true
	status.Version = version
	status.Updated = true
	return status, nil
}

func updateKrunRuntime(parent context.Context) error {
	if krunRuntimeArchitecture != "arm64" || krunRuntimeReleaseChannel() != "" {
		return nil
	}
	ctx, cancel := context.WithTimeout(parent, 10*time.Minute)
	defer cancel()
	status, err := krunRuntimeInstallLatest(ctx)
	if err != nil {
		sprbus.Publish("superd:krun-runtime:failure", map[string]string{"Reason": err.Error()})
		return err
	}
	if status.Updated {
		sprbus.Publish("superd:krun-runtime:ok", map[string]string{
			"Version": status.Version,
			"Release": status.Release,
			"Digest":  status.Digest,
		})
	}
	if status.Version != "" {
		if err := os.MkdirAll(filepath.Dir(krunRuntimeUpdateMarker), 0700); err == nil {
			if err := os.WriteFile(krunRuntimeUpdateMarker, []byte(status.Version+"\n"), 0600); err != nil {
				fmt.Println("failed to record krun runtime version: " + err.Error())
			}
		} else {
			fmt.Println("failed to prepare krun runtime version marker: " + err.Error())
		}
	}
	return nil
}

func bootstrapKrunRuntime() {
	if krunRuntimeArchitecture != "arm64" || krunRuntimeReleaseChannel() != "" {
		return
	}
	status, statusErr := krunRuntimeHostStatus(context.Background())
	marker, markerErr := os.ReadFile(krunRuntimeUpdateMarker)
	if statusErr == nil && markerErr == nil && status.Installed && strings.TrimSpace(string(marker)) == status.Version {
		return
	}
	if err := updateKrunRuntime(context.Background()); err != nil {
		fmt.Println("failed to update krun runtime: " + err.Error())
	}
}
