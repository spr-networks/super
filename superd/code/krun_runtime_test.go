package main

import (
	"context"
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
)

const attestedKrunRuntimeDigest = "sha256:693ca482b8cc9cd1edf2982d10b7b9512601c8c51b750f0c447b6856533b2a63"

func TestVerifyKnownKrunRuntimeAttestation(t *testing.T) {
	requireNetwork(t)
	if err := verifyGithubAttestation(attestedKrunRuntimeDigest, krunRuntimeAttestationSANRegex); err != nil {
		t.Fatalf("verify runtime package attestation: %v", err)
	}
}

func TestLiveKrunRuntimeDownload(t *testing.T) {
	if os.Getenv("SPR_KRUN_LIVE_DOWNLOAD_TEST") != "1" {
		t.Skip("set SPR_KRUN_LIVE_DOWNLOAD_TEST=1 to download the current release asset")
	}
	requireNetwork(t)
	release, err := latestKrunRuntimeRelease(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), krunRuntimeDebFile)
	if err := downloadKrunRuntimeAsset(context.Background(), release.DebAsset.ID, path, 256<<20); err != nil {
		t.Fatal(err)
	}
	digest, err := krunRuntimeFileDigest(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := verifyGithubAttestation("sha256:"+digest, krunRuntimeAttestationSANRegex); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("release=%s asset=%d name=%s bytes=%d digest=sha256:%s", release.Tag, release.DebAsset.ID, release.DebAsset.Name, info.Size(), digest)
}

func TestSelectKrunRuntimeRelease(t *testing.T) {
	release, err := selectKrunRuntimeRelease(krunGithubRelease{
		TagName: "v0.5.0",
		Assets: []krunReleaseAsset{
			{ID: 1, Name: "spr-debian.img.xz"},
			{ID: 2, Name: "spr-krun-runtime_1.19.4+crun1.28+spr1_arm64.deb"},
			{ID: 3, Name: "spr-krun-runtime_1.19.4+crun1.28+spr1_arm64.deb.sha256"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if release.Version != "1.19.4+crun1.28+spr1" || release.Tag != "v0.5.0" {
		t.Fatalf("release = %#v", release)
	}
}

func TestSelectKrunRuntimeReleaseRejectsUnsafeOrAmbiguousAssets(t *testing.T) {
	tests := []krunGithubRelease{
		{
			TagName: "v1.0.0",
			Assets: []krunReleaseAsset{{
				ID: 1, Name: "spr-debian.img.xz",
			}},
		},
		{
			TagName: "v1.0.0",
			Assets: []krunReleaseAsset{
				{ID: 1, Name: "spr-krun-runtime_../escape_arm64.deb"},
			},
		},
		{
			TagName: "v1.0.0",
			Assets: []krunReleaseAsset{
				{ID: 1, Name: "spr-krun-runtime_1.0_arm64.deb"},
				{ID: 2, Name: "spr-krun-runtime_2.0_arm64.deb"},
			},
		},
		{
			TagName: "v1.0.0\nforged",
			Assets:  []krunReleaseAsset{{ID: 1, Name: "spr-krun-runtime_1.0_arm64.deb"}},
		},
		{
			TagName: "v1.0.0",
			Assets:  []krunReleaseAsset{{Name: "spr-krun-runtime_1.0_arm64.deb"}},
		},
	}
	for _, release := range tests {
		if _, err := selectKrunRuntimeRelease(release); err == nil {
			t.Fatalf("selectKrunRuntimeRelease(%s) succeeded", release.TagName)
		}
	}
}

func TestKrunRuntimeRejectsUntrustedRedirect(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "http://127.0.0.1:1/internal", http.StatusFound)
	}))
	defer server.Close()

	oldReleaseURL := krunRuntimeReleaseURL
	oldClient := krunRuntimeHTTPClient
	t.Cleanup(func() {
		krunRuntimeReleaseURL = oldReleaseURL
		krunRuntimeHTTPClient = oldClient
	})
	krunRuntimeReleaseURL = server.URL
	krunRuntimeHTTPClient = server.Client()

	if _, err := latestKrunRuntimeRelease(context.Background()); err == nil || !strings.Contains(err.Error(), "refusing release download redirect") {
		t.Fatalf("redirect error = %v", err)
	}
}

func TestInstallLatestKrunRuntime(t *testing.T) {
	packageName := "spr-krun-runtime_1.19.4+crun1.28+spr2_arm64.deb"
	packageData := []byte("attested runtime package")
	hash := sha256.Sum256(packageData)
	digest := hex.EncodeToString(hash[:])

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/release":
			json.NewEncoder(w).Encode(map[string]any{
				"tag_name": "v0.5.0",
				"assets": []map[string]any{{
					"id": 101, "name": packageName, "browser_download_url": "http://127.0.0.1/pwn",
				}},
			})
		case "/assets/101":
			w.Write(packageData)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	oldReleaseURL := krunRuntimeReleaseURL
	oldAssetURL := krunRuntimeAssetURL
	oldClient := krunRuntimeHTTPClient
	oldVerifier := krunRuntimeVerifyAttestation
	oldRunner := krunRuntimeRunHost
	oldArchitecture := krunRuntimeArchitecture
	oldSuperRoot := krunRuntimeSuperRoot
	oldHostSuperDir := krunRuntimeHostSuperDir
	t.Cleanup(func() {
		krunRuntimeReleaseURL = oldReleaseURL
		krunRuntimeAssetURL = oldAssetURL
		krunRuntimeHTTPClient = oldClient
		krunRuntimeVerifyAttestation = oldVerifier
		krunRuntimeRunHost = oldRunner
		krunRuntimeArchitecture = oldArchitecture
		krunRuntimeSuperRoot = oldSuperRoot
		krunRuntimeHostSuperDir = oldHostSuperDir
	})

	superRoot := t.TempDir()
	krunRuntimeReleaseURL = server.URL + "/release"
	krunRuntimeAssetURL = server.URL + "/assets/%d"
	krunRuntimeHTTPClient = server.Client()
	krunRuntimeArchitecture = "arm64"
	krunRuntimeSuperRoot = superRoot
	krunRuntimeHostSuperDir = func() (string, error) { return superRoot, nil }
	verified := false
	krunRuntimeVerifyAttestation = func(gotDigest, sanRegex string) error {
		if gotDigest != "sha256:"+digest {
			t.Fatalf("attestation digest = %q", gotDigest)
		}
		if sanRegex != krunRuntimeAttestationSANRegex {
			t.Fatalf("attestation SAN policy = %q", sanRegex)
		}
		verified = true
		return nil
	}
	installed := false
	installCalls := 0
	krunRuntimeRunHost = func(_ context.Context, command string, args ...string) ([]byte, error) {
		switch command {
		case "dpkg-query":
			if args[len(args)-1] == "dpkg" {
				return []byte("installed\n1.22.6\n"), nil
			}
			if installed {
				return []byte("installed\n1.19.4+crun1.28+spr2\n"), nil
			}
			return []byte("package is not installed\n"), errors.New("exit status 1")
		case "dpkg-deb":
			if !verified {
				t.Fatal("host package inspection ran before provenance verification")
			}
			if len(args) != 3 || args[0] != "--field" || filepath.Base(args[1]) != krunRuntimeDebFile {
				t.Fatalf("dpkg-deb args = %q", args)
			}
			switch args[2] {
			case "Package":
				return []byte(krunRuntimePackage + "\n"), nil
			case "Version":
				return []byte("1.19.4+crun1.28+spr2\n"), nil
			case "Architecture":
				return []byte("arm64\n"), nil
			default:
				t.Fatalf("unexpected package field %q", args[2])
				return nil, nil
			}
		case "dpkg":
			if len(args) != 4 || args[0] != "--compare-versions" || args[1] != "1.19.4+crun1.28+spr2" || args[2] != "ge" || args[3] != krunRuntimeMinimumVersion {
				t.Fatalf("dpkg args = %q", args)
			}
			return nil, nil
		case "env":
			installCalls++
			if !verified {
				t.Fatal("host install ran before provenance verification")
			}
			packagePath := args[len(args)-1]
			wantArgs := []string{"DEBIAN_FRONTEND=noninteractive", "apt-get", "install", "-y", "--no-install-recommends", "--no-allow-downgrades", "--"}
			if len(args) != len(wantArgs)+1 {
				t.Fatalf("apt-get args = %q", args)
			}
			for i := range wantArgs {
				if args[i] != wantArgs[i] {
					t.Fatalf("apt-get args = %q", args)
				}
			}
			if filepath.Base(packagePath) != krunRuntimeDebFile {
				t.Fatalf("host package basename = %q", filepath.Base(packagePath))
			}
			if !strings.HasPrefix(packagePath, filepath.Join(superRoot, "state", "superd")+string(filepath.Separator)) {
				t.Fatalf("host package path = %q", packagePath)
			}
			if data, err := os.ReadFile(packagePath); err != nil || string(data) != string(packageData) {
				t.Fatalf("host package is unavailable: data=%q err=%v", data, err)
			}
			installed = true
			return []byte("installed"), nil
		default:
			t.Fatalf("unexpected host command %q", command)
			return nil, nil
		}
	}

	status, err := installLatestKrunRuntime(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !status.Installed || !status.Updated || status.Version != "1.19.4+crun1.28+spr2" {
		t.Fatalf("status = %#v", status)
	}
	if installCalls != 1 {
		t.Fatalf("install calls = %d, want 1", installCalls)
	}
	entries, err := os.ReadDir(filepath.Join(superRoot, "state", "superd"))
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("temporary update files remain: %v", entries)
	}
}

func TestInstallLatestKrunRuntimeRefusesUnattestedPackage(t *testing.T) {
	oldArchitecture := krunRuntimeArchitecture
	oldRunner := krunRuntimeRunHost
	oldReleaseURL := krunRuntimeReleaseURL
	oldAssetURL := krunRuntimeAssetURL
	oldClient := krunRuntimeHTTPClient
	oldVerifier := krunRuntimeVerifyAttestation
	oldSuperRoot := krunRuntimeSuperRoot
	t.Cleanup(func() {
		krunRuntimeArchitecture = oldArchitecture
		krunRuntimeRunHost = oldRunner
		krunRuntimeReleaseURL = oldReleaseURL
		krunRuntimeAssetURL = oldAssetURL
		krunRuntimeHTTPClient = oldClient
		krunRuntimeVerifyAttestation = oldVerifier
		krunRuntimeSuperRoot = oldSuperRoot
	})

	packageName := "spr-krun-runtime_1.0_arm64.deb"
	packageData := []byte("unattested")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/release":
			json.NewEncoder(w).Encode(krunGithubRelease{TagName: "v1.0.0", Assets: []krunReleaseAsset{
				{ID: 101, Name: packageName},
			}})
		case "/assets/101":
			w.Write(packageData)
		}
	}))
	defer server.Close()

	krunRuntimeArchitecture = "arm64"
	krunRuntimeReleaseURL = server.URL + "/release"
	krunRuntimeAssetURL = server.URL + "/assets/%d"
	krunRuntimeHTTPClient = server.Client()
	krunRuntimeSuperRoot = t.TempDir()
	krunRuntimeVerifyAttestation = func(string, string) error { return errors.New("no trusted provenance") }
	krunRuntimeRunHost = func(_ context.Context, command string, _ ...string) ([]byte, error) {
		if command == "env" {
			t.Fatal("unattested package reached host apt-get")
		}
		return []byte("__SPR_KRUN_NOT_INSTALLED__\n"), nil
	}

	if _, err := installLatestKrunRuntime(context.Background()); err == nil || !strings.Contains(err.Error(), "provenance") {
		t.Fatalf("install error = %v", err)
	}
}

func TestVerifyKrunRuntimePackageRejectsMismatchedMetadata(t *testing.T) {
	oldRunner := krunRuntimeRunHost
	t.Cleanup(func() { krunRuntimeRunHost = oldRunner })
	krunRuntimeRunHost = func(_ context.Context, command string, args ...string) ([]byte, error) {
		if command != "dpkg-deb" || len(args) != 3 || args[0] != "--field" || filepath.Base(args[1]) != krunRuntimeDebFile {
			t.Fatalf("host command = %q %q", command, args)
		}
		switch args[2] {
		case "Package":
			return []byte(krunRuntimePackage + "\n"), nil
		case "Version":
			return []byte("0.9\n"), nil
		case "Architecture":
			return []byte("arm64\n"), nil
		default:
			t.Fatalf("unexpected package field %q", args[2])
			return nil, nil
		}
	}
	if err := verifyKrunRuntimePackage(context.Background(), "/fixed/runtime.deb", "1.0"); err == nil {
		t.Fatal("mismatched package metadata was accepted")
	}
}

func TestRequireKrunRuntimeVersionUsesArgumentVector(t *testing.T) {
	oldRunner := krunRuntimeRunHost
	t.Cleanup(func() { krunRuntimeRunHost = oldRunner })
	krunRuntimeRunHost = func(_ context.Context, command string, args ...string) ([]byte, error) {
		if command != "dpkg" || len(args) != 4 || args[0] != "--compare-versions" || args[1] != "1.0;touch /tmp/pwn" || args[2] != "ge" || args[3] != krunRuntimeMinimumVersion {
			t.Fatalf("host command = %q %q", command, args)
		}
		return []byte("rejected"), errors.New("exit status 1")
	}
	if err := requireKrunRuntimeVersion(context.Background(), "1.0;touch /tmp/pwn", "ge", krunRuntimeMinimumVersion); err == nil {
		t.Fatal("rejected version comparison succeeded")
	}
}

func TestUpdateKrunRuntimeRunsOnlyForMainArm64Updates(t *testing.T) {
	oldArchitecture := krunRuntimeArchitecture
	oldReleaseChannel := krunRuntimeReleaseChannel
	oldInstallLatest := krunRuntimeInstallLatest
	oldHostStatus := krunRuntimeHostStatus
	oldUpdateMarker := krunRuntimeUpdateMarker
	t.Cleanup(func() {
		krunRuntimeArchitecture = oldArchitecture
		krunRuntimeReleaseChannel = oldReleaseChannel
		krunRuntimeInstallLatest = oldInstallLatest
		krunRuntimeHostStatus = oldHostStatus
		krunRuntimeUpdateMarker = oldUpdateMarker
	})

	installCalls := 0
	krunRuntimeInstallLatest = func(context.Context) (krunRuntimeStatus, error) {
		installCalls++
		return krunRuntimeStatus{Installed: true, Version: "1.0"}, nil
	}
	krunRuntimeUpdateMarker = filepath.Join(t.TempDir(), "krun-runtime-version")

	krunRuntimeArchitecture = "amd64"
	krunRuntimeReleaseChannel = func() string { return "" }
	if err := updateKrunRuntime(context.Background()); err != nil {
		t.Fatal(err)
	}

	krunRuntimeArchitecture = "arm64"
	krunRuntimeReleaseChannel = func() string { return "dev" }
	if err := updateKrunRuntime(context.Background()); err != nil {
		t.Fatal(err)
	}

	krunRuntimeReleaseChannel = func() string { return "" }
	if err := updateKrunRuntime(context.Background()); err != nil {
		t.Fatal(err)
	}
	if installCalls != 1 {
		t.Fatalf("install calls = %d, want 1", installCalls)
	}
	krunRuntimeHostStatus = func(context.Context) (krunRuntimeStatus, error) {
		return krunRuntimeStatus{Installed: true, Version: "1.0"}, nil
	}
	bootstrapKrunRuntime()
	if installCalls != 1 {
		t.Fatalf("install calls after bootstrap = %d, want 1", installCalls)
	}
}

func TestUpdateKrunRuntimeReturnsInstallFailure(t *testing.T) {
	oldArchitecture := krunRuntimeArchitecture
	oldReleaseChannel := krunRuntimeReleaseChannel
	oldInstallLatest := krunRuntimeInstallLatest
	t.Cleanup(func() {
		krunRuntimeArchitecture = oldArchitecture
		krunRuntimeReleaseChannel = oldReleaseChannel
		krunRuntimeInstallLatest = oldInstallLatest
	})

	krunRuntimeArchitecture = "arm64"
	krunRuntimeReleaseChannel = func() string { return "" }
	krunRuntimeInstallLatest = func(context.Context) (krunRuntimeStatus, error) {
		return krunRuntimeStatus{}, errors.New("install failed")
	}
	if err := updateKrunRuntime(context.Background()); err == nil || err.Error() != "install failed" {
		t.Fatalf("update error = %v", err)
	}
}

func TestSPRUpdateContinuesWhenKrunRuntimeUpdateFails(t *testing.T) {
	oldPull := pullVerifiedUpdateForRequest
	oldUpdate := updateKrunRuntimeForRequest
	t.Cleanup(func() {
		pullVerifiedUpdateForRequest = oldPull
		updateKrunRuntimeForRequest = oldUpdate
	})
	pulled := false
	krunAttempted := false
	pullVerifiedUpdateForRequest = func(compose, target string) (int, error) {
		if compose != "" || target != "" {
			t.Fatalf("pull arguments = %q %q", compose, target)
		}
		pulled = true
		return http.StatusOK, nil
	}
	updateKrunRuntimeForRequest = func(context.Context) error {
		krunAttempted = true
		return errors.New("krun install failed")
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPut, "http://localhost/update", nil)
	update(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("SPR update status = %d, body = %q", recorder.Code, recorder.Body.String())
	}
	if !pulled || !krunAttempted {
		t.Fatalf("pulled = %t, krun attempted = %t", pulled, krunAttempted)
	}
}
