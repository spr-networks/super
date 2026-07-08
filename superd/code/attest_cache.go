package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

var TEST_PREFIX = os.Getenv("TEST_PREFIX")
var AttestCachePath = TEST_PREFIX + "/state/superd/attest_cache.json"

var attestCacheMtx sync.Mutex
var gAttestCache map[string]AttestResult
var attestCacheLoaded bool

func loadAttestCacheLocked() {
	if attestCacheLoaded {
		return
	}
	attestCacheLoaded = true
	gAttestCache = map[string]AttestResult{}

	data, err := os.ReadFile(AttestCachePath)
	if err != nil {
		return
	}
	cache := map[string]AttestResult{}
	if json.Unmarshal(data, &cache) == nil {
		gAttestCache = cache
	}
}

func cachedAttest(digest string) (AttestResult, bool) {
	if digest == "" {
		return AttestResult{}, false
	}
	attestCacheMtx.Lock()
	defer attestCacheMtx.Unlock()
	loadAttestCacheLocked()
	r, ok := gAttestCache[digest]
	return r, ok
}

func cacheAttestResult(digest string, result AttestResult) {
	if digest == "" || !result.Verified {
		return
	}
	attestCacheMtx.Lock()
	defer attestCacheMtx.Unlock()
	loadAttestCacheLocked()

	if _, ok := gAttestCache[digest]; ok {
		return
	}
	gAttestCache[digest] = result

	if err := os.MkdirAll(filepath.Dir(AttestCachePath), 0700); err != nil {
		return
	}
	data, err := json.MarshalIndent(gAttestCache, "", " ")
	if err != nil {
		return
	}
	os.WriteFile(AttestCachePath, data, 0600)
}
