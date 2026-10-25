package main

// SPR updates on the rpi-image-gen image: the CI's rpios-image.yml publishes
// each release's A/B update bundle (spr-rpios.update.tar.zst: the boot and
// system slot images as Android sparse files) with a build provenance
// attestation. An update downloads it, verifies the attestation before
// using anything in it, writes both images to the inactive slot and reboots
// with tryboot: the Pi boots the other slot once (autoboot.txt's [tryboot]),
// spr-slot-commit makes it the default once SPR is up, and a failed boot
// leaves the running slot the default.
//
// The attestation is the trust root, as for the docker images.

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
	"strings"
	"sync"
	"time"

	sprbus "github.com/spr-networks/sprbus-json"
	"superd/rpios/common"
)

var ReleaseRepo = "spr-networks/super"

// releases of the main branch's rpios-image.yml only
var SystemAttestationSANRegex = `^https://github\.com/spr-networks/super/\.github/workflows/rpios-image\.yml@refs/heads/main$`

const systemAsset = "spr-rpios.update.tar.zst"
const systemTagPrefix = "rpios-"

// the bundle is kept until it is verified, so it is capped
const maxSystemArchive = 8 << 30

var UpdateDir = "/var/lib/spr-update"
var githubAPI = "https://api.github.com"

// the inactive slot, as rpi-image-gen's slot mapper names it
var otherSlot = map[string]string{
	"boot":   "/dev/disk/by-slot/other/boot",
	"system": "/dev/disk/by-slot/other/system",
}

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

// systemMeta describes a staged release: its version and bundle digest
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
// /release, else the newest rpios release.
func systemRelease() (githubRelease, error) {
	if common.GetReleaseChannel() != "" {
		return githubRelease{}, fmt.Errorf("rpios releases are published on the main channel only, not %q", common.GetReleaseChannel())
	}
	if version := common.GetReleaseVersion(); version != "" && version != "latest" {
		release := githubRelease{}
		err := githubGet("/repos/"+ReleaseRepo+"/releases/tags/"+systemTagPrefix+version, &release)
		if err != nil {
			return release, fmt.Errorf("rpios release %s: %w", version, err)
		}
		if release.systemURL() == "" {
			return release, fmt.Errorf("rpios release %s has no %s", version, systemAsset)
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
	return githubRelease{}, errors.New("no rpios release found")
}

// fetchSystem downloads a release's update bundle, verifies its attestation
// and unpacks it into dir. Nothing in dir may be used before it returns.
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

	// keep the bundle while hashing it: it is unpacked only once its
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
	f.Close()
	if err := runLogged("tar", "-I", "zstd", "-xf", archive, "-C", dir, "--no-same-owner", "--", "boot", "system"); err != nil {
		return meta, fmt.Errorf("unpack %s: %w", systemAsset, err)
	}
	for part := range otherSlot {
		if st, err := os.Lstat(filepath.Join(dir, part)); err != nil || !st.Mode().IsRegular() {
			return meta, fmt.Errorf("%s: no %s image", systemAsset, part)
		}
	}
	meta.System = digest
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

// installSystem writes the verified slot images in dir to the inactive slot.
// autoboot.txt already names it for [tryboot] (spr-slot-commit keeps it so).
func installSystem(dir string, meta systemMeta) error {
	for _, part := range []string{"system", "boot"} {
		dev, err := filepath.EvalSymlinks(otherSlot[part])
		if err != nil {
			return fmt.Errorf("inactive %s slot: %w", part, err)
		}
		active, _ := filepath.EvalSymlinks("/dev/disk/by-slot/active/" + part)
		if dev == active {
			return fmt.Errorf("inactive %s slot %s is the active one", part, dev)
		}
		if err := runLogged("simg2img", filepath.Join(dir, part), dev); err != nil {
			return err
		}
	}
	// flush both slots, so a power cut before the reboot can't leave a
	// half written slot to tryboot
	return runLogged("sync")
}

func publishSystemUpdate(status, version, message string) {
	fmt.Println("system update:", status, version, message)
	sprbus.Publish("rpios:update", map[string]string{"Status": status, "Version": version, "Message": message})
}

// updateSystem stages the release's slot images for the next boot. It
// returns errUpToDate when that release is already running.
func updateSystem() (systemMeta, error) {
	release, err := systemRelease()
	if err != nil {
		return systemMeta{}, err
	}
	version := strings.TrimPrefix(release.TagName, systemTagPrefix)
	if version == sprVersion() {
		return systemMeta{Version: version}, errUpToDate
	}
	publishSystemUpdate("downloading", version, "")

	os.RemoveAll(UpdateDir)
	if err := os.MkdirAll(UpdateDir, 0700); err != nil {
		return systemMeta{}, err
	}
	defer os.RemoveAll(UpdateDir)

	meta, err := fetchSystem(release.systemURL(), UpdateDir)
	meta.Version = version
	if err != nil {
		return meta, err
	}
	publishSystemUpdate("installing", version, meta.System)
	if err := installSystem(UpdateDir, meta); err != nil {
		return meta, err
	}
	return meta, nil
}

// systemUpdate handles /update for SPR itself: stage the release in the
// inactive slot, then tryboot into it.
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
		runLogged("systemctl", "reboot", "--reboot-argument=0 tryboot")
	}()
}
