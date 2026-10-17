package main

// SPR updates on NixOS: the CI's nixos-iso.yml publishes each release's
// system closure as spr-nixos-system.tar (system.json plus a nix binary
// cache of the closure) with a build provenance attestation. An update
// downloads it, verifies the attestation before using anything in it, copies
// the closure into the store and makes it the next boot: the Pi tries it
// once (tryboot) and keeps the running system if it doesn't come up.
//
// The attestation is the trust root, as for the docker images. nix copy
// takes the paths without signatures but checks each NAR against the hash
// in its narinfo, which came with the attested archive.

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	sprbus "github.com/spr-networks/sprbus-json"
	"superd/nixos/common"
)

var ReleaseRepo = "spr-networks/super"

// releases of the main branch's nixos-iso.yml only
var SystemAttestationSANRegex = `^https://github\.com/spr-networks/super/\.github/workflows/nixos-iso\.yml@refs/heads/main$`

const systemAsset = "spr-nixos-system.tar"
const systemTagPrefix = "nixos-"

// the archive is kept until it is verified, so it is capped
const maxSystemArchive = 8 << 30

var UpdateDir = "/var/lib/spr-update"
var githubAPI = "https://api.github.com"

var systemPathRegex = regexp.MustCompile(`^/nix/store/[0-9a-df-np-sv-z]{32}-nixos-system-[A-Za-z0-9._+-]+$`)

var errUpToDate = errors.New("the system is up to date")

var systemUpdateMtx sync.Mutex

type githubRelease struct {
	TagName    string `json:"tag_name"`
	Prerelease bool   `json:"prerelease"`
	Draft      bool   `json:"draft"`
	Assets     []struct {
		Name string `json:"name"`
		URL  string `json:"browser_download_url"`
	} `json:"assets"`
}

func (r githubRelease) systemURL() string {
	for _, a := range r.Assets {
		if a.Name == systemAsset {
			return a.URL
		}
	}
	return ""
}

// systemMeta is the archive's system.json
type systemMeta struct {
	System  string
	Version string
}

func githubGet(path string, v interface{}) error {
	c := http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest(http.MethodGet, githubAPI+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := c.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s: status %d", path, resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(v)
}

// systemRelease picks the release to update to: the version set with
// /release, else the newest NixOS release.
func systemRelease() (githubRelease, error) {
	if common.GetReleaseChannel() != "" {
		return githubRelease{}, fmt.Errorf("NixOS releases are published on the main channel only, not %q", common.GetReleaseChannel())
	}
	if version := common.GetReleaseVersion(); version != "" && version != "latest" {
		release := githubRelease{}
		err := githubGet("/repos/"+ReleaseRepo+"/releases/tags/"+systemTagPrefix+version, &release)
		if err != nil {
			return release, fmt.Errorf("NixOS release %s: %w", version, err)
		}
		if release.systemURL() == "" {
			return release, fmt.Errorf("NixOS release %s has no %s", version, systemAsset)
		}
		return release, nil
	}
	releases := []githubRelease{}
	if err := githubGet("/repos/"+ReleaseRepo+"/releases?per_page=50", &releases); err != nil {
		return githubRelease{}, err
	}
	// the API lists the newest first
	for _, r := range releases {
		if !r.Draft && strings.HasPrefix(r.TagName, systemTagPrefix) && r.systemURL() != "" {
			return r, nil
		}
	}
	return githubRelease{}, errors.New("no NixOS release found")
}

// fetchSystem downloads a release's system archive, verifies its
// attestation and unpacks it into dir. Nothing in dir may be used before it
// returns.
func fetchSystem(url, dir string) (systemMeta, error) {
	meta := systemMeta{}
	c := http.Client{Timeout: 2 * time.Hour}
	resp, err := c.Get(url)
	if err != nil {
		return meta, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return meta, fmt.Errorf("download %s: status %d", url, resp.StatusCode)
	}

	// keep the archive while hashing it: it is unpacked only once its
	// attestation verifies, from the bytes that were verified
	archive := filepath.Join(dir, "."+systemAsset+".download")
	f, err := os.OpenFile(archive, os.O_CREATE|os.O_EXCL|os.O_RDWR, 0600)
	if err != nil {
		return meta, err
	}
	defer os.Remove(archive)
	defer f.Close()
	hash := sha256.New()
	n, err := io.Copy(io.MultiWriter(f, hash), io.LimitReader(resp.Body, maxSystemArchive+1))
	if err != nil {
		return meta, fmt.Errorf("download %s: %w", systemAsset, err)
	}
	if n > maxSystemArchive {
		return meta, fmt.Errorf("download %s: larger than %d bytes", systemAsset, int64(maxSystemArchive))
	}
	digest := "sha256:" + hex.EncodeToString(hash.Sum(nil))
	if err := verifySystemAttestation(digest); err != nil {
		return meta, err
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return meta, err
	}
	if err := untar(dir, f); err != nil {
		return meta, fmt.Errorf("unpack %s: %w", systemAsset, err)
	}
	f.Close()
	os.Remove(archive)

	data, err := os.ReadFile(filepath.Join(dir, "system.json"))
	if err != nil {
		return meta, err
	}
	if err := json.Unmarshal(data, &meta); err != nil {
		return meta, fmt.Errorf("system.json: %w", err)
	}
	if !systemPathRegex.MatchString(meta.System) {
		return meta, fmt.Errorf("system.json: invalid system %q", meta.System)
	}
	return meta, nil
}

var verifySystemAttestation = func(digest string) error {
	return common.VerifyGithubAttestation(ReleaseRepo, digest, SystemAttestationSANRegex)
}

func runLogged(name string, args ...string) error {
	out, err := exec.Command(name, args...).CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s: %v: %s", name, err, strings.TrimSpace(string(out)))
	}
	return nil
}

// installSystem copies the verified closure into the store and makes it the
// next boot. The cache in dir comes from fetchSystem.
func installSystem(dir string, meta systemMeta) error {
	if err := runLogged("nix", "--extra-experimental-features", "nix-command", "copy",
		"--no-check-sigs", "--from", "file://"+filepath.Join(dir, "cache"), meta.System); err != nil {
		return err
	}
	if err := runLogged("nix-env", "-p", "/nix/var/nix/profiles/system", "--set", meta.System); err != nil {
		return err
	}
	if err := runLogged(filepath.Join(meta.System, "bin/switch-to-configuration"), "boot"); err != nil {
		return err
	}
	// the staged tryboot.img is on the FAT boot partition: flush it, so a
	// power cut before the reboot doesn't leave it half written
	if err := runLogged("sync"); err != nil {
		return err
	}
	// keep the running system and the new one, as update.sh does
	runLogged("nix-env", "-p", "/nix/var/nix/profiles/system", "--delete-generations", "+2")
	runLogged("nix-store", "--gc")
	return nil
}

func publishSystemUpdate(status, version, message string) {
	fmt.Println("system update:", status, version, message)
	sprbus.Publish("nixos:update", map[string]string{"Status": status, "Version": version, "Message": message})
}

// updateSystem stages the release's system for the next boot. It returns
// errUpToDate when that system is already running.
func updateSystem() (systemMeta, error) {
	release, err := systemRelease()
	if err != nil {
		return systemMeta{}, err
	}
	version := strings.TrimPrefix(release.TagName, systemTagPrefix)
	publishSystemUpdate("downloading", version, "")

	os.RemoveAll(UpdateDir)
	if err := os.MkdirAll(UpdateDir, 0700); err != nil {
		return systemMeta{}, err
	}
	defer os.RemoveAll(UpdateDir)

	meta, err := fetchSystem(release.systemURL(), UpdateDir)
	if err != nil {
		return meta, err
	}
	if current, err := filepath.EvalSymlinks("/run/current-system"); err == nil && current == meta.System {
		return meta, errUpToDate
	}
	publishSystemUpdate("installing", version, meta.System)
	if err := installSystem(UpdateDir, meta); err != nil {
		return meta, err
	}
	return meta, nil
}

// systemUpdate handles /update for SPR itself: stage the release's system,
// then reboot into it.
func systemUpdate(w http.ResponseWriter, r *http.Request) {
	if !systemUpdateMtx.TryLock() {
		http.Error(w, "an update is already running", http.StatusConflict)
		return
	}
	defer systemUpdateMtx.Unlock()

	meta, err := updateSystem()
	if errors.Is(err, errUpToDate) {
		publishSystemUpdate("current", meta.Version, meta.System)
		return
	}
	if err != nil {
		publishSystemUpdate("failed", meta.Version, err.Error())
		http.Error(w, "system update failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	publishSystemUpdate("rebooting", meta.Version, meta.System)
	// after the API has its answer
	go func() {
		time.Sleep(10 * time.Second)
		runLogged("systemctl", "reboot")
	}()
}
