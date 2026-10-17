package main

import (
	"archive/tar"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"superd/nixos/common"
)

const testSystem = "/nix/store/0123456789abcdfghijklmnpqrsvwxyz-nixos-system-spr-26.05"

func systemArchive(t *testing.T, meta string) []byte {
	t.Helper()
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	add := func(name, data string) {
		tw.WriteHeader(&tar.Header{Name: name, Typeflag: tar.TypeReg, Size: int64(len(data)), Mode: 0644,
			Uid: os.Getuid(), Gid: os.Getgid()})
		tw.Write([]byte(data))
	}
	tw.WriteHeader(&tar.Header{Name: "cache/", Typeflag: tar.TypeDir, Mode: 0755, Uid: os.Getuid(), Gid: os.Getgid()})
	add("cache/nix-cache-info", "StoreDir: /nix/store\n")
	add("system.json", meta)
	tw.Close()
	return buf.Bytes()
}

// a GitHub API and release download with one NixOS release
func releaseServer(t *testing.T, archive []byte) {
	t.Helper()
	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	mux.HandleFunc("/repos/"+ReleaseRepo+"/releases", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode([]map[string]interface{}{
			{"tag_name": "v1.2.4", "assets": []map[string]string{{"name": "spr-debian.img.xz", "browser_download_url": srv.URL + "/debian"}}},
			{"tag_name": "nixos-v1.2.3", "prerelease": true, "assets": []map[string]string{{"name": systemAsset, "browser_download_url": srv.URL + "/system"}}},
			{"tag_name": "nixos-v1.2.2", "prerelease": true, "assets": []map[string]string{{"name": systemAsset, "browser_download_url": srv.URL + "/old"}}},
		})
	})
	mux.HandleFunc("/system", func(w http.ResponseWriter, r *http.Request) { w.Write(archive) })
	saved := githubAPI
	githubAPI = srv.URL
	t.Cleanup(func() { githubAPI = saved })
}

func attestOnly(t *testing.T, archive []byte) *[]string {
	t.Helper()
	sum := sha256.Sum256(archive)
	want := "sha256:" + hex.EncodeToString(sum[:])
	seen := []string{}
	saved := verifySystemAttestation
	verifySystemAttestation = func(digest string) error {
		seen = append(seen, digest)
		if digest != want {
			return errors.New("no attestation for " + digest)
		}
		return nil
	}
	t.Cleanup(func() { verifySystemAttestation = saved })
	return &seen
}

func TestSystemRelease(t *testing.T) {
	saved := common.SuperRootPath
	common.SuperRootPath = t.TempDir()
	t.Cleanup(func() { common.SuperRootPath = saved })
	releaseServer(t, nil)

	release, err := systemRelease()
	if err != nil || release.TagName != "nixos-v1.2.3" || !strings.HasSuffix(release.systemURL(), "/system") {
		t.Fatalf("release %+v: %v", release, err)
	}
}

func TestFetchSystemVerifiesAttestation(t *testing.T) {
	archive := systemArchive(t, `{"System": "`+testSystem+`", "Version": "v1.2.3"}`)
	releaseServer(t, archive)
	seen := attestOnly(t, archive)

	dir := t.TempDir()
	meta, err := fetchSystem(githubAPI+"/system", dir)
	if err != nil || meta.System != testSystem || meta.Version != "v1.2.3" {
		t.Fatalf("meta %+v: %v", meta, err)
	}
	if len(*seen) != 1 {
		t.Fatalf("attestation checks %v", *seen)
	}
	if _, err := os.Stat(filepath.Join(dir, "cache/nix-cache-info")); err != nil {
		t.Fatal(err)
	}
}

func TestFetchSystemRejectsUnattested(t *testing.T) {
	archive := systemArchive(t, `{"System": "`+testSystem+`"}`)
	releaseServer(t, archive)
	// attested is a different archive than the one served
	attestOnly(t, systemArchive(t, `{"System": "`+testSystem+`", "Version": "other"}`))

	if _, err := fetchSystem(githubAPI+"/system", t.TempDir()); err == nil {
		t.Fatal("installed an archive without its attestation")
	}
}

func TestFetchSystemRejectsBadSystemPath(t *testing.T) {
	for _, system := range []string{"/etc", "/nix/store/../../etc", "/nix/store/0123456789abcdfghijklmnpqrsvwxyz-bash-5.3", ""} {
		archive := systemArchive(t, `{"System": "`+system+`"}`)
		releaseServer(t, archive)
		attestOnly(t, archive)
		if _, err := fetchSystem(githubAPI+"/system", t.TempDir()); err == nil {
			t.Fatalf("accepted system %q", system)
		}
	}
}
