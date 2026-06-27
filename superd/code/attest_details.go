package main

import (
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io/ioutil"
	"net/http"
	"runtime"
	"strings"
)

type attestInfo struct {
	Signer   string
	Issuer   string
	LogIndex int64
	RekorURL string
}

func certIdentitySAN(certPEM []byte) string {
	block, _ := pem.Decode(certPEM)
	if block == nil {
		return ""
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return ""
	}
	if len(cert.URIs) > 0 {
		return cert.URIs[0].String()
	}
	if len(cert.EmailAddresses) > 0 {
		return cert.EmailAddresses[0]
	}
	return ""
}

func rekorLogIndex(rekorBundle []byte) int64 {
	if len(rekorBundle) == 0 {
		return 0
	}
	v := struct {
		Payload struct {
			LogIndex int64 `json:"logIndex"`
		} `json:"Payload"`
	}{}
	if json.Unmarshal(rekorBundle, &v) != nil {
		return 0
	}
	return v.Payload.LogIndex
}

type manifestInfo struct {
	Config string
	Layers []string
}

func fetchManifestInfo(host, repo, digest string) (*manifestInfo, error) {
	r, err := newRegClient(host, repo)
	if err != nil {
		return nil, err
	}
	return fetchManifestInfoClient(r, repo, digest, 0)
}

func fetchManifestInfoClient(r *regClient, repo, digest string, depth int) (*manifestInfo, error) {
	if depth > 3 {
		return nil, fmt.Errorf("manifest recursion too deep for %s", digest)
	}
	accept := strings.Join([]string{
		"application/vnd.oci.image.index.v1+json",
		"application/vnd.docker.distribution.manifest.list.v2+json",
		"application/vnd.oci.image.manifest.v1+json",
		"application/vnd.docker.distribution.manifest.v2+json",
	}, ", ")
	resp, err := r.get("/v2/"+repo+"/manifests/"+digest, accept)
	if err != nil {
		return nil, err
	}
	body, err := ioutil.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("manifest %s: status %d", digest, resp.StatusCode)
	}

	m := struct {
		Config struct {
			Digest string `json:"digest"`
		} `json:"config"`
		Layers []struct {
			Digest string `json:"digest"`
		} `json:"layers"`
		Manifests []struct {
			Digest   string `json:"digest"`
			Platform struct {
				Architecture string `json:"architecture"`
				OS           string `json:"os"`
			} `json:"platform"`
		} `json:"manifests"`
	}{}
	if err := json.Unmarshal(body, &m); err != nil {
		return nil, err
	}

	if len(m.Manifests) > 0 {
		target := ""
		for _, mm := range m.Manifests {
			if mm.Platform.OS == "linux" && mm.Platform.Architecture == runtime.GOARCH {
				target = mm.Digest
				break
			}
		}
		if target == "" {
			return nil, fmt.Errorf("no linux/%s manifest in index %s", runtime.GOARCH, digest)
		}
		return fetchManifestInfoClient(r, repo, target, depth+1)
	}

	layers := []string{}
	for _, l := range m.Layers {
		layers = append(layers, l.Digest)
	}
	return &manifestInfo{Config: m.Config.Digest, Layers: layers}, nil
}
