package main

// Plugin images: pulled from their registry and unpacked once per image
// digest. Containers mount an overlay on top, so the unpacked image stays
// as pulled.

import (
	"archive/tar"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"

	"github.com/google/go-containerregistry/pkg/authn"
	"github.com/google/go-containerregistry/pkg/name"
	v1 "github.com/google/go-containerregistry/pkg/v1"
	"github.com/google/go-containerregistry/pkg/v1/empty"
	"github.com/google/go-containerregistry/pkg/v1/mutate"
	"github.com/google/go-containerregistry/pkg/v1/remote"
	"github.com/google/go-containerregistry/pkg/v1/tarball"
)

var PluginRoot = "/var/lib/spr-plugins"

func imagesDir() string { return filepath.Join(PluginRoot, "images") }

// Image is an unpacked image: its digest and OCI image config.
type Image struct {
	Ref    string
	Digest string
	Config v1.Config
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

// pullImage fetches ref for this platform and unpacks it, unless that
// digest is unpacked already. verify checks the image before anything is
// downloaded; a digest it returns is what gets pulled.
func pullImage(ref string, verify func(ref string) (string, error)) (Image, error) {
	parsed, err := name.ParseReference(ref)
	if err != nil {
		return Image{}, fmt.Errorf("invalid image %s: %w", ref, err)
	}
	if verify != nil {
		digest, err := verify(ref)
		if err != nil {
			return Image{}, err
		}
		if digest != "" {
			parsed = parsed.Context().Digest(digest)
		}
	}
	platform := v1.Platform{OS: "linux", Architecture: runtime.GOARCH}
	desc, err := remote.Get(parsed, remote.WithPlatform(platform),
		remote.WithAuthFromKeychain(authn.DefaultKeychain))
	if err != nil {
		return Image{}, fmt.Errorf("pull %s: %w", ref, err)
	}
	img, err := desc.Image()
	if err != nil {
		return Image{}, fmt.Errorf("pull %s: %w", ref, err)
	}
	digest, err := img.Digest()
	if err != nil {
		return Image{}, err
	}
	config, err := img.ConfigFile()
	if err != nil {
		return Image{}, fmt.Errorf("pull %s: %w", ref, err)
	}

	imageMtx.Lock()
	defer imageMtx.Unlock()
	dir := filepath.Join(imagesDir(), digest.Hex)
	if _, err := os.Stat(filepath.Join(dir, "config.json")); err != nil {
		tmp := dir + ".tmp"
		os.RemoveAll(tmp)
		if err := os.MkdirAll(filepath.Join(tmp, "rootfs"), 0755); err != nil {
			return Image{}, err
		}
		layersDir := filepath.Join(tmp, "layers")
		local, err := verifiedLayers(img, layersDir)
		if err != nil {
			os.RemoveAll(tmp)
			return Image{}, fmt.Errorf("pull %s: %w", ref, err)
		}
		flat, err := mutate.AppendLayers(empty.Image, local...)
		if err != nil {
			os.RemoveAll(tmp)
			return Image{}, fmt.Errorf("unpack %s: %w", ref, err)
		}
		layers := mutate.Extract(flat)
		err = untar(filepath.Join(tmp, "rootfs"), layers)
		layers.Close()
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
	index[ref] = digest.String()
	if err := saveImageIndex(index); err != nil {
		return Image{}, err
	}
	return Image{Ref: ref, Digest: digest.String(), Config: config.Config}, nil
}

// verifiedLayers downloads img's layers into dir and checks each one against
// its manifest digest and its config DiffID, as docker pull does. The
// registry reader only checks a digest at EOF, which the tar extract never
// reaches, and a second download could differ, so only these files are
// unpacked.
func verifiedLayers(img v1.Image, dir string) ([]v1.Layer, error) {
	remoteLayers, err := img.Layers()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	local := []v1.Layer{}
	for i, layer := range remoteLayers {
		digest, err := layer.Digest()
		if err != nil {
			return nil, err
		}
		diffID, err := layer.DiffID()
		if err != nil {
			return nil, err
		}
		path := filepath.Join(dir, fmt.Sprint(i))
		if err := downloadLayer(layer, digest, path); err != nil {
			return nil, err
		}
		l, err := tarball.LayerFromFile(path)
		if err != nil {
			return nil, err
		}
		got, err := l.DiffID()
		if err != nil {
			return nil, err
		}
		if got != diffID {
			return nil, fmt.Errorf("layer %s: diff id %s, config has %s", digest, got, diffID)
		}
		local = append(local, l)
	}
	return local, nil
}

func downloadLayer(layer v1.Layer, digest v1.Hash, path string) error {
	if digest.Algorithm != "sha256" {
		return fmt.Errorf("layer %s: unsupported digest algorithm", digest)
	}
	rc, err := layer.Compressed()
	if err != nil {
		return err
	}
	defer rc.Close()
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	h := sha256.New()
	_, err = io.Copy(io.MultiWriter(f, h), rc)
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		return fmt.Errorf("layer %s: %w", digest, err)
	}
	if got := hex.EncodeToString(h.Sum(nil)); got != digest.Hex {
		return fmt.Errorf("layer %s: content has digest sha256:%s", digest, got)
	}
	return nil
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
