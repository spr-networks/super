package main

// Plugin images: pulled from their registry and unpacked once per image
// digest. Containers mount an overlay on top, so the unpacked image stays
// as pulled.
//
// The registry API and the layer formats need only the standard library:
// layers are gzip or uncompressed tars, as docker build pushes them. A
// zstd layer is refused.

import (
	"archive/tar"
	"bufio"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"

	"superd/nixos/common"
)

var PluginRoot = "/var/lib/spr-plugins"

func imagesDir() string { return filepath.Join(PluginRoot, "images") }

// ImageConfig is the part of an OCI image config superd uses, with the
// config's JSON names (config.json of an unpacked image).
type ImageConfig struct {
	Cmd        []string          `json:"Cmd,omitempty"`
	Entrypoint []string          `json:"Entrypoint,omitempty"`
	Env        []string          `json:"Env,omitempty"`
	Labels     map[string]string `json:"Labels,omitempty"`
	User       string            `json:"User,omitempty"`
	WorkingDir string            `json:"WorkingDir,omitempty"`
}

// Image is an unpacked image: its digest and OCI image config.
type Image struct {
	Ref    string
	Digest string
	Config ImageConfig
}

func (i Image) Rootfs() string {
	return filepath.Join(imagesDir(), strings.TrimPrefix(i.Digest, "sha256:"), "rootfs")
}

var imageMtx sync.Mutex

// image tag -> digest of the image last pulled for it
func loadImageIndex() map[string]string {
	index := map[string]string{}
	data, err := os.ReadFile(filepath.Join(imagesDir(), "index.json"))
	if err == nil {
		json.Unmarshal(data, &index)
	}
	return index
}

func saveImageIndex(index map[string]string) error {
	data, _ := json.MarshalIndent(index, "", "  ")
	return writeFileAtomic(filepath.Join(imagesDir(), "index.json"), data, 0644)
}

// localImage returns the unpacked image for ref, if it has been pulled.
func localImage(ref string) (Image, bool) {
	imageMtx.Lock()
	digest, ok := loadImageIndex()[ref]
	imageMtx.Unlock()
	if !ok {
		return Image{}, false
	}
	return readImage(ref, digest)
}

func readImage(ref, digest string) (Image, bool) {
	img := Image{Ref: ref, Digest: digest}
	data, err := os.ReadFile(filepath.Join(imagesDir(), strings.TrimPrefix(digest, "sha256:"), "config.json"))
	if err != nil || json.Unmarshal(data, &img.Config) != nil {
		return Image{}, false
	}
	return img, true
}

var (
	digestRe = regexp.MustCompile(`^sha256:[0-9a-f]{64}$`)
	repoRe   = regexp.MustCompile(`^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*(?:/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*)*$`)
	tagRe    = regexp.MustCompile(`^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$`)
	hostRe   = regexp.MustCompile(`^[A-Za-z0-9.-]+(?::[0-9]+)?$`)
)

// imageRef is an image reference with Docker's defaults: Docker Hub, its
// library/ namespace and the latest tag.
type imageRef struct {
	host, repo string
	// a tag or a digest; a digest wins over a tag, as in Docker
	reference string
}

func parseImageRef(ref string) (imageRef, error) {
	r := imageRef{}
	rest := ref
	if before, digest, ok := strings.Cut(rest, "@"); ok {
		if !digestRe.MatchString(digest) {
			return r, fmt.Errorf("invalid image %s: bad digest", ref)
		}
		rest, r.reference = before, digest
	}
	if i := strings.LastIndex(rest, ":"); i > strings.LastIndex(rest, "/") {
		tag := rest[i+1:]
		if !tagRe.MatchString(tag) {
			return r, fmt.Errorf("invalid image %s: bad tag", ref)
		}
		rest = rest[:i]
		if r.reference == "" {
			r.reference = tag
		}
	}
	if r.reference == "" {
		r.reference = "latest"
	}
	first, path, found := strings.Cut(rest, "/")
	if found && (strings.ContainsAny(first, ".:") || first == "localhost") {
		r.host, r.repo = first, path
	} else {
		r.host, r.repo = "docker.io", rest
	}
	if r.host == "docker.io" || r.host == "index.docker.io" {
		r.host = "registry-1.docker.io"
		if !strings.Contains(r.repo, "/") {
			r.repo = "library/" + r.repo
		}
	}
	if !hostRe.MatchString(r.host) || !repoRe.MatchString(r.repo) {
		return r, fmt.Errorf("invalid image %s", ref)
	}
	return r, nil
}

const (
	mediaOCIIndex       = "application/vnd.oci.image.index.v1+json"
	mediaDockerList     = "application/vnd.docker.distribution.manifest.list.v2+json"
	mediaOCIManifest    = "application/vnd.oci.image.manifest.v1+json"
	mediaDockerManifest = "application/vnd.docker.distribution.manifest.v2+json"

	maxManifestSize = 4 << 20
	maxConfigSize   = 16 << 20
	maxLayerSize    = 8 << 30
)

type descriptor struct {
	MediaType string `json:"mediaType"`
	Digest    string `json:"digest"`
	Size      int64  `json:"size"`
	Platform  *struct {
		OS           string `json:"os"`
		Architecture string `json:"architecture"`
	} `json:"platform,omitempty"`
}

type manifest struct {
	MediaType string       `json:"mediaType"`
	Config    descriptor   `json:"config"`
	Layers    []descriptor `json:"layers"`
	Manifests []descriptor `json:"manifests"`
}

func (m manifest) isIndex() bool {
	return m.MediaType == mediaOCIIndex || m.MediaType == mediaDockerList || len(m.Manifests) > 0
}

// getManifest fetches a manifest by tag or digest. Its digest is the
// sha256 of its bytes, which must match reference when that is a digest.
func getManifest(reg *common.RegistryClient, repo, reference string) (manifest, string, error) {
	m := manifest{}
	resp, err := reg.Get("/v2/"+repo+"/manifests/"+reference,
		strings.Join([]string{mediaOCIIndex, mediaDockerList, mediaOCIManifest, mediaDockerManifest}, ", "))
	if err != nil {
		return m, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return m, "", fmt.Errorf("manifest %s: status %d", reference, resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxManifestSize+1))
	if err != nil {
		return m, "", err
	}
	if len(data) > maxManifestSize {
		return m, "", fmt.Errorf("manifest %s: larger than %d bytes", reference, maxManifestSize)
	}
	sum := sha256.Sum256(data)
	digest := "sha256:" + hex.EncodeToString(sum[:])
	if strings.HasPrefix(reference, "sha256:") && digest != reference {
		return m, "", fmt.Errorf("manifest %s: content has digest %s", reference, digest)
	}
	if err := json.Unmarshal(data, &m); err != nil {
		return m, "", fmt.Errorf("manifest %s: %w", reference, err)
	}
	if m.MediaType == "" {
		m.MediaType = strings.TrimSpace(strings.SplitN(resp.Header.Get("Content-Type"), ";", 2)[0])
	}
	return m, digest, nil
}

// imageManifest returns the manifest of ref's image for this platform and
// its digest, choosing from an index as docker pull does.
func imageManifest(reg *common.RegistryClient, ref imageRef) (manifest, string, error) {
	m, digest, err := getManifest(reg, ref.repo, ref.reference)
	if err != nil || !m.isIndex() {
		return m, digest, err
	}
	for _, d := range m.Manifests {
		if d.Platform != nil && d.Platform.OS == "linux" && d.Platform.Architecture == runtime.GOARCH {
			if !digestRe.MatchString(d.Digest) {
				return manifest{}, "", fmt.Errorf("index %s: bad digest %q", digest, d.Digest)
			}
			m, digest, err = getManifest(reg, ref.repo, d.Digest)
			if err == nil && m.isIndex() {
				err = fmt.Errorf("manifest %s is an index", digest)
			}
			return m, digest, err
		}
	}
	return manifest{}, "", fmt.Errorf("no linux/%s image in %s", runtime.GOARCH, digest)
}

// getBlob writes blob d of repo to w, checking its size and digest.
func getBlob(reg *common.RegistryClient, repo string, d descriptor, max int64, w io.Writer) error {
	if !digestRe.MatchString(d.Digest) {
		return fmt.Errorf("bad blob digest %q", d.Digest)
	}
	if d.Size <= 0 || d.Size > max {
		return fmt.Errorf("blob %s: size %d out of range", d.Digest, d.Size)
	}
	resp, err := reg.Get("/v2/"+repo+"/blobs/"+d.Digest, "")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("blob %s: status %d", d.Digest, resp.StatusCode)
	}
	h := sha256.New()
	n, err := io.Copy(io.MultiWriter(w, h), io.LimitReader(resp.Body, d.Size+1))
	if err != nil {
		return fmt.Errorf("blob %s: %w", d.Digest, err)
	}
	if n != d.Size {
		return fmt.Errorf("blob %s: %d bytes, manifest has %d", d.Digest, n, d.Size)
	}
	if got := "sha256:" + hex.EncodeToString(h.Sum(nil)); got != d.Digest {
		return fmt.Errorf("blob %s: content has digest %s", d.Digest, got)
	}
	return nil
}

type configFile struct {
	Config ImageConfig `json:"config"`
	RootFS struct {
		DiffIDs []string `json:"diff_ids"`
	} `json:"rootfs"`
}

// pullImage fetches ref for this platform and unpacks it, unless that
// digest is unpacked already. verify checks the image before anything is
// downloaded; a digest it returns is what gets pulled.
func pullImage(ref string, verify func(ref string) (string, error)) (Image, error) {
	parsed, err := parseImageRef(ref)
	if err != nil {
		return Image{}, err
	}
	if verify != nil {
		digest, err := verify(ref)
		if err != nil {
			return Image{}, err
		}
		if digest != "" {
			parsed.reference = digest
		}
	}
	reg, err := common.NewRegistryClient(parsed.host, parsed.repo)
	if err != nil {
		return Image{}, fmt.Errorf("pull %s: %w", ref, err)
	}
	m, digest, err := imageManifest(reg, parsed)
	if err != nil {
		return Image{}, fmt.Errorf("pull %s: %w", ref, err)
	}
	var buf bytes.Buffer
	if err := getBlob(reg, parsed.repo, m.Config, maxConfigSize, &buf); err != nil {
		return Image{}, fmt.Errorf("pull %s: config: %w", ref, err)
	}
	config := configFile{}
	if err := json.Unmarshal(buf.Bytes(), &config); err != nil {
		return Image{}, fmt.Errorf("pull %s: config: %w", ref, err)
	}
	if len(config.RootFS.DiffIDs) != len(m.Layers) {
		return Image{}, fmt.Errorf("pull %s: %d layers, config has %d diff ids", ref, len(m.Layers), len(config.RootFS.DiffIDs))
	}

	imageMtx.Lock()
	defer imageMtx.Unlock()
	dir := filepath.Join(imagesDir(), strings.TrimPrefix(digest, "sha256:"))
	if _, err := os.Stat(filepath.Join(dir, "config.json")); err != nil {
		tmp := dir + ".tmp"
		os.RemoveAll(tmp)
		if err := os.MkdirAll(filepath.Join(tmp, "rootfs"), 0755); err != nil {
			return Image{}, err
		}
		layersDir := filepath.Join(tmp, "layers")
		layers, err := downloadLayers(reg, parsed.repo, m.Layers, layersDir)
		if err != nil {
			os.RemoveAll(tmp)
			return Image{}, fmt.Errorf("pull %s: %w", ref, err)
		}
		err = unpackLayers(filepath.Join(tmp, "rootfs"), layers, config.RootFS.DiffIDs)
		os.RemoveAll(layersDir)
		if err != nil {
			os.RemoveAll(tmp)
			return Image{}, fmt.Errorf("unpack %s: %w", ref, err)
		}
		data, _ := json.Marshal(config.Config)
		if err := os.WriteFile(filepath.Join(tmp, "config.json"), data, 0644); err != nil {
			os.RemoveAll(tmp)
			return Image{}, err
		}
		os.RemoveAll(dir)
		if err := os.Rename(tmp, dir); err != nil {
			return Image{}, err
		}
	}

	index := loadImageIndex()
	index[ref] = digest
	if err := saveImageIndex(index); err != nil {
		return Image{}, err
	}
	return Image{Ref: ref, Digest: digest, Config: config.Config}, nil
}

// downloadLayers stores the layers in dir, each checked against its
// manifest digest, so only verified bytes are unpacked.
func downloadLayers(reg *common.RegistryClient, repo string, layers []descriptor, dir string) ([]string, error) {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	paths := []string{}
	for i, d := range layers {
		path := filepath.Join(dir, fmt.Sprint(i))
		f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err != nil {
			return nil, err
		}
		err = getBlob(reg, repo, d, maxLayerSize, f)
		if cerr := f.Close(); err == nil {
			err = cerr
		}
		if err != nil {
			return nil, fmt.Errorf("layer %d: %w", i, err)
		}
		paths = append(paths, path)
	}
	return paths, nil
}

// unpackLayers unpacks the image's filesystem into dir: the layers
// flattened into one tar stream, as go-containerregistry's mutate.Extract
// does, and untarred.
func unpackLayers(dir string, layers, diffIDs []string) error {
	pr, pw := io.Pipe()
	done := make(chan error, 1)
	go func() {
		err := flattenLayers(pw, layers, diffIDs)
		pw.CloseWithError(err)
		done <- err
	}()
	err := untar(dir, pr)
	if err != nil {
		// stop the writer
		pr.CloseWithError(err)
	}
	if ferr := <-done; err == nil {
		err = ferr
	}
	return err
}

const whiteoutPrefix = ".wh."

// flattenLayers writes the layers as one filesystem: from the top layer
// down, each path from the topmost layer that has it, without whiteouts and
// what they hide. Each layer's content must match its diff id.
func flattenLayers(w io.Writer, layers, diffIDs []string) error {
	tw := tar.NewWriter(w)
	// path -> whether it hides what lower layers have under it (a whiteout
	// or a non-directory)
	seen := map[string]bool{}
	for i := len(layers) - 1; i >= 0; i-- {
		if err := flattenLayer(tw, seen, layers[i], diffIDs[i]); err != nil {
			return fmt.Errorf("layer %d: %w", i, err)
		}
	}
	return tw.Close()
}

func flattenLayer(tw *tar.Writer, seen map[string]bool, path, diffID string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	r, err := decompress(f)
	if err != nil {
		return err
	}
	h := sha256.New()
	content := io.TeeReader(r, h)
	tr := tar.NewReader(content)
	for {
		hdr, err := tr.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return fmt.Errorf("reading tar: %w", err)
		}
		hdr.Name = filepath.Clean(hdr.Name)
		// as mutate.Extract: drop relative links whose target leaves the rootfs
		if (hdr.Typeflag == tar.TypeSymlink || hdr.Typeflag == tar.TypeLink) && !filepath.IsAbs(hdr.Linkname) {
			if strings.HasPrefix(filepath.Clean(filepath.Join(filepath.Dir(hdr.Name), hdr.Linkname)), "..") {
				continue
			}
		}
		hdr.Format = tar.FormatPAX

		base, dirname := filepath.Base(hdr.Name), filepath.Dir(hdr.Name)
		whiteout := strings.HasPrefix(base, whiteoutPrefix)
		if whiteout {
			base = base[len(whiteoutPrefix):]
		}
		name := hdr.Name
		if hdr.Typeflag != tar.TypeDir {
			name = filepath.Join(dirname, base)
		}
		if _, ok := seen[name]; ok || hiddenByUpper(seen, name) {
			continue
		}
		seen[name] = whiteout || hdr.Typeflag != tar.TypeDir
		if whiteout {
			continue
		}
		if err := tw.WriteHeader(hdr); err != nil {
			return err
		}
		if hdr.Size > 0 {
			if _, err := io.Copy(tw, tr); err != nil {
				return err
			}
		}
	}
	// the diff id covers the whole uncompressed layer, past the tar's end
	if _, err := io.Copy(io.Discard, content); err != nil {
		return err
	}
	if got := "sha256:" + hex.EncodeToString(h.Sum(nil)); got != diffID {
		return fmt.Errorf("content has diff id %s, config has %s", got, diffID)
	}
	return nil
}

// hiddenByUpper reports whether a parent directory of name was whited out
// or replaced by a non-directory in an upper layer.
func hiddenByUpper(seen map[string]bool, name string) bool {
	for name != "" {
		dirname := filepath.Dir(name)
		if dirname == name {
			break
		}
		if seen[dirname] {
			return true
		}
		name = dirname
	}
	return false
}

// decompress returns a layer's tar stream: gzip or uncompressed.
func decompress(r io.Reader) (io.Reader, error) {
	br := bufio.NewReader(r)
	magic, err := br.Peek(4)
	if err != nil && !errors.Is(err, io.EOF) {
		return nil, err
	}
	switch {
	case bytes.HasPrefix(magic, []byte{0x1f, 0x8b}):
		return gzip.NewReader(br)
	case bytes.HasPrefix(magic, []byte{0x28, 0xb5, 0x2f, 0xfd}):
		return nil, errors.New("zstd layers are not supported")
	}
	return br, nil
}

// pruneImages removes unpacked images no tag or container refers to.
func pruneImages(inUse map[string]bool) {
	imageMtx.Lock()
	defer imageMtx.Unlock()
	keep := map[string]bool{}
	for _, digest := range loadImageIndex() {
		keep[strings.TrimPrefix(digest, "sha256:")] = true
	}
	for digest := range inUse {
		keep[strings.TrimPrefix(digest, "sha256:")] = true
	}
	entries, _ := os.ReadDir(imagesDir())
	for _, entry := range entries {
		if entry.IsDir() && !keep[strings.TrimSuffix(entry.Name(), ".tmp")] {
			os.RemoveAll(filepath.Join(imagesDir(), entry.Name()))
		}
	}
}

// untar unpacks a flattened image filesystem into dir. os.Root keeps every
// path, symlink and hard link target inside dir.
func untar(dir string, r io.Reader) error {
	root, err := os.OpenRoot(dir)
	if err != nil {
		return err
	}
	defer root.Close()

	tr := tar.NewReader(r)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		path := filepath.Clean(strings.TrimPrefix(hdr.Name, "/"))
		if path == "." {
			continue
		}
		if parent := filepath.Dir(path); parent != "." {
			if err := root.MkdirAll(parent, 0755); err != nil {
				return err
			}
		}
		mode := hdr.FileInfo().Mode()

		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := root.MkdirAll(path, 0755); err != nil {
				return err
			}
		case tar.TypeReg:
			root.Remove(path)
			f, err := root.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
			if err != nil {
				return err
			}
			_, err = io.Copy(f, tr)
			f.Close()
			if err != nil {
				return err
			}
		case tar.TypeSymlink:
			root.Remove(path)
			if err := root.Symlink(hdr.Linkname, path); err != nil {
				return err
			}
		case tar.TypeLink:
			root.Remove(path)
			target := filepath.Clean(strings.TrimPrefix(hdr.Linkname, "/"))
			if err := root.Link(target, path); err != nil {
				return err
			}
			continue
		default:
			// device nodes and fifos: the runtime provides /dev
			continue
		}

		// chown before chmod, which would otherwise clear setuid bits
		if err := root.Lchown(path, hdr.Uid, hdr.Gid); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
		if hdr.Typeflag != tar.TypeSymlink {
			if err := root.Chmod(path, mode&(os.ModePerm|os.ModeSetuid|os.ModeSetgid|os.ModeSticky)); err != nil {
				return err
			}
		}
	}
}

func writeFileAtomic(path string, data []byte, perm os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, perm); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
