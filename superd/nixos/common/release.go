package common

// The release channel and version pinned from the UI.

import (
	"encoding/json"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
)

var ReleaseChannelFile = "configs/base/release_channel"
var ReleaseVersionFile = "configs/base/release_version"

var ReleaseInfoMtx sync.Mutex

func GetReleaseVersion() string {
	ReleaseInfoMtx.Lock()
	defer ReleaseInfoMtx.Unlock()

	data, err := os.ReadFile(ReleaseVersionFile)
	if err == nil {
		return strings.TrimSpace(string(data))
	} else {
		return ""
	}
}

func ResetCustomVersion() {
	os.Remove(ReleaseVersionFile)
	os.Remove(ReleaseChannelFile)
}

func SetReleaseVersion(Version string) error {
	ReleaseInfoMtx.Lock()
	defer ReleaseInfoMtx.Unlock()

	regex, _ := regexp.Compile("[^a-zA-Z0-9-_.]+")
	versionFiltered := regex.ReplaceAllString(Version, "")
	return os.WriteFile(ReleaseVersionFile, []byte(versionFiltered), 0644)
}

func GetReleaseChannel() string {
	ReleaseInfoMtx.Lock()
	defer ReleaseInfoMtx.Unlock()

	data, err := os.ReadFile(ReleaseChannelFile)
	if err == nil {
		return strings.TrimSpace(string(data))
	} else {
		return ""
	}
}

func SetReleaseChannel(Channel string) error {
	ReleaseInfoMtx.Lock()
	defer ReleaseInfoMtx.Unlock()

	regex, _ := regexp.Compile("[^a-zA-Z0-9-_]+")
	channelFiltered := regex.ReplaceAllString(Channel, "")

	if channelFiltered == "main" {
		channelFiltered = ""
	}

	return os.WriteFile(ReleaseChannelFile, []byte(channelFiltered), 0644)
}

type ReleaseInfo struct {
	CustomChannel string
	CustomVersion string
	Current       string
}

// ReleaseInfoHandler serves /release; current reports the running version.
func ReleaseInfoHandler(current func() string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		info := ReleaseInfo{}
		if r.Method == http.MethodGet {
			info.Current = current()

			info.CustomChannel = GetReleaseChannel()
			info.CustomVersion = GetReleaseVersion()
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(info)
			return
		}

		if r.Method == http.MethodDelete {
			ResetCustomVersion()
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(info)
			return
		}

		//PUT. Set these
		err := json.NewDecoder(r.Body).Decode(&info)
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		if info.CustomChannel != "" {
			//right now we only allow "-dev" and "main"
			if info.CustomChannel != "-dev" && info.CustomChannel != "main" {
				http.Error(w, "Unsupported channel "+info.CustomChannel, 400)
				return
			}

			// in case more channels are allowed in the future
			regex, _ := regexp.Compile("[^a-zA-Z0-9-_]+")
			channelFiltered := regex.ReplaceAllString(info.CustomChannel, "")
			if channelFiltered != info.CustomChannel {
				http.Error(w, "Channel includes unexpected characters", 400)
				return
			}

			SetReleaseChannel(info.CustomChannel)
		}

		if info.CustomVersion != "" {
			regex, _ := regexp.Compile("[^a-zA-Z0-9-_.]+")
			versionFiltered := regex.ReplaceAllString(info.CustomVersion, "")

			if versionFiltered != info.CustomVersion {
				http.Error(w, "Version includes unexpected characters", 400)
				return
			}

			SetReleaseVersion(info.CustomVersion)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(info)
	}
}
