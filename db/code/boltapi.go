package boltapi

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"errors"
	"github.com/gorilla/mux"
	"io/ioutil"
	//"github.com/tidwall/gjson"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

import bolt "go.etcd.io/bbolt"

var (
	db                   **bolt.DB
	DBPtr                sync.RWMutex //mtx for db pointer, which can change with compaction
	Configmtx            sync.Mutex
	gConfigPath          string
	gConfigPtr           *LogConfig
	ErrBucketList        = errors.New("error listing buckets")
	ErrBucketGet         = errors.New("error retrieving bucket")
	ErrBucketMissing     = errors.New("bucket doesn't exist")
	ErrBucketCreate      = errors.New("error creating bucket")
	ErrBucketDelete      = errors.New("error deleting bucket")
	ErrBucketDecodeName  = errors.New("error reading bucket name")
	ErrBucketInvalidName = errors.New("invalid bucket name")
	ErrBucketItemDecode  = errors.New("error reading bucket item")
	ErrBucketItemEncode  = errors.New("error encoding bucket item")
	ErrBucketItemCreate  = errors.New("error creating bucket item")
	ErrBucketItemUpdate  = errors.New("error updating bucket item")
	ErrBucketItemDelete  = errors.New("error deleting bucket item")
	seenEvents           = map[string]bool{}
)

type ApiError struct {
	customErr error
	origErr   error
}

type BucketItem struct {
	Key   string      `json:key`
	Value interface{} `json:value`
}

type LogConfig struct {
	SaveEvents []string `json:"SaveEvents"`
	MaxSize    uint64   `json:"MaxSize"`
}

func LogEvent(topic string) {
	seenEvents[topic] = true
}

func saveConfig(config LogConfig) error {
	Configmtx.Lock()
	defer Configmtx.Unlock()

	file, _ := json.MarshalIndent(config, "", " ")
	err := ioutil.WriteFile(gConfigPath, file, 0600)
	return err
}

func SetupConfig(configPath string, conf *LogConfig) {
	gConfigPath = configPath
	gConfigPtr = conf

	*gConfigPtr = *loadConfig()

	// rename and make sure new syntax is used
	config := *gConfigPtr
	updated := false
	for k := range config.SaveEvents {
		topic := config.SaveEvents[k]

		if topic == "dns:serve:event" {
			config.SaveEvents[k] = "dns:serve:"
			updated = true
		}
	}

	if updated {
		saveConfig(config)
	}
}

func loadConfig() *LogConfig {
	Configmtx.Lock()
	defer Configmtx.Unlock()

	seenEvents = map[string]bool{}

	// default config
	config := &LogConfig{
		SaveEvents: []string{"log:api", "dns:block:event", "dns:override:event", "dns:serve:", "wifi:auth:", "auth:failure:"},
		MaxSize:    250 * 1024 * 1024, //bytes
	}
	data, err := ioutil.ReadFile(gConfigPath)
	if err != nil {
		log.Println("[-] Empty db configuration, initializing")
	} else {
		err := json.Unmarshal(data, &config)
		if err != nil {
			log.Println("[-] Failed to decode db configuration, initializing")
		}
	}

	return config
}

// BucketItem helper functions
func (item *BucketItem) EncodeKey() []byte {
	return []byte(item.Key)
}

func (item *BucketItem) EncodeValue() ([]byte, error) {
	buf, err := json.Marshal(item.Value)
	if err != nil {
		return nil, ErrBucketItemEncode
	}

	return buf, nil
}

func (item *BucketItem) DecodeValue(rawValue []byte) error {
	if err := json.Unmarshal(rawValue, &item.Value); err != nil {
		return ErrBucketItemDecode
	}

	return nil
}

func Serve(boltdb **bolt.DB, socketpath string) error {
	db = boltdb
	router := mux.NewRouter().StrictSlash(true)

	router.HandleFunc("/buckets", ListBuckets).Methods("GET")
	router.HandleFunc("/buckets", AddBucket).Methods("PUT")

	router.HandleFunc("/bucket/{name}", GetBucket).Methods("GET")
	router.HandleFunc("/bucket/{name}", AddBucketItem).Methods("PUT")
	router.HandleFunc("/bucket/{name}", DeleteBucket).Methods("DELETE")

	router.HandleFunc("/items/{name}", GetBucketItems).Methods("GET")

	router.HandleFunc("/bucket/{name}/{key}", GetBucketItem).Methods("GET")
	router.HandleFunc("/bucket/{name}/{key}", UpdateBucketItem).Methods("PUT")
	router.HandleFunc("/bucket/{name}/{key}", DeleteBucketItem).Methods("DELETE")

	router.HandleFunc("/config", GetSetConfig).Methods("GET", "PUT")
	router.HandleFunc("/stats", GetStats).Methods("GET")
	router.HandleFunc("/stats/{name}", GetBucketStats).Methods("GET")

	router.HandleFunc("/topics", GetTopics).Methods("GET")

	os.Remove(socketpath)
	unixPluginListener, err := net.Listen("unix", socketpath)
	if err != nil {
		panic(err)
	}

	log.Println("starting http.Server...")

	pluginServer := http.Server{Handler: logRequest(router)}
	return pluginServer.Serve(unixPluginListener)
	//pluginServer := http.Server{Addr: ":8080", Handler: logRequest(router)}
	//return pluginServer.ListenAndServe()

}

func GetSetConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		conf := loadConfig()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(conf)
		return
	}

	newConfig := LogConfig{}

	err := json.NewDecoder(r.Body).Decode(&newConfig)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if err := saveConfig(newConfig); err != nil {
		log.Println("[-] Failed to write config for db")
		http.Error(w, err.Error(), 400)
		return
	}

	*gConfigPtr = newConfig

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(newConfig)
}

type DbStats struct {
	Size   int64    `json:"Size"`
	Topics []string `json:"Topics"`
}

func GetStats(w http.ResponseWriter, r *http.Request) {
	DBPtr.RLock()
	defer DBPtr.RUnlock()
	stats := DbStats{}

	if err := (*db).View(func(tx *bolt.Tx) error {
		stats.Size = tx.Size()

		topics := make([]string, len(seenEvents))
		i := 0
		for topic := range seenEvents {
			topics[i] = topic
			i++
		}

		stats.Topics = topics

		return nil
	}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
	return
}

func GetBucketStats(w http.ResponseWriter, r *http.Request) {
	DBPtr.RLock()
	defer DBPtr.RUnlock()
	var stats bolt.BucketStats

	bucketName := mux.Vars(r)["name"]

	if err := (*db).View(func(tx *bolt.Tx) error {
		bucket := tx.Bucket([]byte(bucketName))
		if bucket == nil {
			return ErrBucketMissing
		}

		stats = bucket.Stats()

		return nil
	}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
	return
}

// list of all topics seen by handleLogEvent
func GetTopics(w http.ResponseWriter, r *http.Request) {
	topics := make([]string, len(seenEvents))
	i := 0
	for topic := range seenEvents {
		topics[i] = topic
		i++
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(topics)
	return
}

func ListBuckets(w http.ResponseWriter, r *http.Request) {
	DBPtr.RLock()
	defer DBPtr.RUnlock()
	fullParam := r.URL.Query().Get("full")
	full := fullParam == "1" || fullParam == "true"

	bucketNames := []string{}
	buckets := []map[string]interface{}{}

	if err := (*db).View(func(tx *bolt.Tx) error {
		return tx.ForEach(func(name []byte, bucket *bolt.Bucket) error {

			if full {
				items := []*BucketItem{}
				if err := bucket.ForEach(func(k, v []byte) error {
					bucketItem := &BucketItem{Key: string(k)}
					bucketItem.DecodeValue(v)
					items = append(items, bucketItem)
					return nil
				}); err != nil {
					return err
				}

				buckets = append(buckets, map[string]interface{}{
					"name":  string(name),
					"items": items,
				})
			} else {
				bucketNames = append(bucketNames, string(name))
			}

			return nil
		})
	}); err != nil {
		log.Println(ApiError{ErrBucketList, err})
		http.Error(w, ErrBucketList.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	if full {
		json.NewEncoder(w).Encode(buckets)
	} else {
		json.NewEncoder(w).Encode(bucketNames)
	}
}

func DeleteBucket(w http.ResponseWriter, r *http.Request) {
	DBPtr.RLock()
	defer DBPtr.RUnlock()
	bucketName := mux.Vars(r)["name"]

	if err := (*db).Update(func(tx *bolt.Tx) error {
		return tx.DeleteBucket([]byte(strings.TrimSpace(bucketName)))
	}); err != nil {
		log.Println(ApiError{ErrBucketDelete, err})
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}
}

func AddBucket(w http.ResponseWriter, r *http.Request) {
	DBPtr.RLock()
	defer DBPtr.RUnlock()

	fail := func(cusromErr, origErr error) {
		log.Println(ApiError{cusromErr, origErr})
		http.Error(w, cusromErr.Error(), http.StatusInternalServerError)
	}

	payload := make(map[string]string)
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		fail(ErrBucketDecodeName, err)

		return
	}

	bucketName, ok := payload["name"]
	if !ok || strings.TrimSpace(bucketName) == "" {
		fail(ErrBucketInvalidName, nil)
		return
	}

	if err := (*db).Update(func(tx *bolt.Tx) error {
		_, err := tx.CreateBucket([]byte(strings.TrimSpace(bucketName)))
		return err
	}); err != nil {
		log.Println(ApiError{ErrBucketCreate, err})
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

func GetBucket(w http.ResponseWriter, r *http.Request) {
	DBPtr.RLock()
	defer DBPtr.RUnlock()

	bucketName := mux.Vars(r)["name"]

	items := []*BucketItem{}
	if err := (*db).View(func(tx *bolt.Tx) error {
		bucket := tx.Bucket([]byte(bucketName))
		if bucket == nil {
			return ErrBucketMissing
		}

		return bucket.ForEach(func(k, v []byte) error {
			bucketItem := &BucketItem{Key: string(k)}
			bucketItem.DecodeValue(v)

			items = append(items, bucketItem)

			return nil
		})
	}); err != nil {
		log.Println(ApiError{ErrBucketGet, err})
		switch err {
		case ErrBucketGet:
			http.Error(w, ErrBucketGet.Error(), http.StatusInternalServerError)
		case ErrBucketMissing:
			http.Error(w, ErrBucketMissing.Error(), http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

// try 8byte unix timestamp or string
func keyToTimeString(key []byte) (string, error) {
	var err error
	ts := time.Now()

	if len(key) == 8 {
		ts = time.Unix(0, int64(binary.BigEndian.Uint64(key)))
	} else if tsp, err := time.Parse(time.RFC3339, string(key)); err == nil {
		ts = tsp
	} else {
		err = errors.New("failed to parse date")
	}

	return ts.UTC().Format(time.RFC3339), err
}

// timestamp to 8 byte key
func TimeKey(s string) ([]byte, error) {
	ts, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return nil, errors.New("failed to parse date")
	}

	t := ts.UTC().UnixNano()
	var key = make([]byte, 8)
	binary.BigEndian.PutUint64(key, uint64(t))
	return key, nil
}

func keyOrDefault(s interface{}, defaultKey string) []byte {
	if strTime, ok := s.(string); ok {
		key, err := TimeKey(strTime)

		if err == nil {
			return key
		}
	}

	key, _ := TimeKey(defaultKey)

	// 8 bytes vs. 30 bytes for key
	//key = ts.Format(time.RFC3339Nano)

	return key
}

// array of .values, including time key
func GetBucketItems(w http.ResponseWriter, r *http.Request) {
	DBPtr.RLock()
	defer DBPtr.RUnlock()

	// TODO add search, range select here
	bucketName := mux.Vars(r)["name"]

	var minKey []byte
	var maxKey []byte

	min_q := r.URL.Query().Get("min")
	max_q := r.URL.Query().Get("max")
	minKey = keyOrDefault(min_q, time.Now().UTC().Add(-time.Hour*24*365).Format(time.RFC3339Nano))
	maxKey = keyOrDefault(max_q, time.Now().UTC().Format(time.RFC3339Nano))

	// default 100, max 1000
	maxNum := 1000
	num, err := strconv.Atoi(r.URL.Query().Get("num"))
	if err != nil || num < 1 {
		num = 100
	}

	if num > maxNum {
		num = maxNum
	}

	numFetched := 0

	var items []interface{}
	if err := (*db).View(func(tx *bolt.Tx) error {
		bucket := tx.Bucket([]byte(bucketName))
		if bucket == nil {
			return ErrBucketMissing
		}

		// seek to last if specified key is not available
		c := bucket.Cursor()
		kStart, _ := c.Seek(maxKey)
		if kStart == nil {
			kStart, _ = c.Last()
		}

		for k, v := c.Seek(kStart); k != nil && bytes.Compare(k, minKey) >= 0; k, v = c.Prev() {
			//for k, v := c.Seek(minKey); k != nil && bytes.Compare(k, maxKey) <= 0; k, v = c.Next() {
			bucketItem := &BucketItem{Key: string(k)}
			bucketItem.DecodeValue(v)

			jsonMap := bucketItem.Value.(map[string]interface{})

			if _, exists := jsonMap["time"]; !exists {
				// derive time from key
				if timeStr, err := keyToTimeString(k); err == nil {
					jsonMap["time"] = timeStr
				}
			}

			items = append(items, jsonMap)

			numFetched += 1
			if numFetched >= num {
				return nil
			}
		}

		return nil
	}); err != nil {
		log.Println(ApiError{ErrBucketGet, err})
		switch err {
		case ErrBucketGet:
			http.Error(w, ErrBucketGet.Error(), http.StatusInternalServerError)
		case ErrBucketMissing:
			http.Error(w, ErrBucketMissing.Error(), http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

func PutItem(bucketName string, jsonData map[string]interface{}) (*BucketItem, error) {
	var payload *BucketItem
	// .key, .value
	if len(jsonData) == 2 && jsonData["key"] != nil && jsonData["value"] != nil {
		payload = &BucketItem{Key: jsonData["key"].(string), Value: jsonData["value"]}
	} else {
		//if .key and .value is not set but have valid json
		//we set body as value and current time as key
		key := keyOrDefault(jsonData["time"], time.Now().UTC().Format(time.RFC3339Nano))

		payload = &BucketItem{Key: string(key), Value: jsonData}
	}

	//BucketItem.Value is json object until its stored, then we serialize
	encodedValue, err := payload.EncodeValue()
	if err != nil {
		return nil, err
	}

	if err := (*db).Update(func(tx *bolt.Tx) error {
		//create bucket if it doesnt exist
		bucket, err := tx.CreateBucketIfNotExists([]byte(strings.TrimSpace(bucketName)))
		if err != nil {
			return ErrBucketMissing
		}

		return bucket.Put(payload.EncodeKey(), encodedValue)
	}); err != nil {
		return nil, err
	}

	return payload, nil
}

func AddBucketItem(w http.ResponseWriter, r *http.Request) {
	DBPtr.RLock()
	defer DBPtr.RUnlock()

	fail := func(cusromErr, origErr error) {
		log.Println(ApiError{cusromErr, origErr})
		http.Error(w, cusromErr.Error(), http.StatusInternalServerError)
	}

	bucketName := mux.Vars(r)["name"]

	var jsonData map[string]interface{} // json object
	if err := json.NewDecoder(r.Body).Decode(&jsonData); err != nil {
		fail(ErrBucketItemDecode, err)
		return
	}

	payload, err := PutItem(bucketName, jsonData)
	if err != nil {
		fail(ErrBucketItemCreate, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(payload.Value)
}

func GetBucketItem(w http.ResponseWriter, r *http.Request) {
	DBPtr.RLock()
	defer DBPtr.RUnlock()

	bucketName := mux.Vars(r)["name"]
	bucketItemKey := mux.Vars(r)["key"]

	bucketItem := new(BucketItem)
	if err := (*db).View(func(tx *bolt.Tx) error {
		bucket := tx.Bucket([]byte(strings.TrimSpace(bucketName)))
		if bucket == nil {
			return ErrBucketMissing
		}
		itemValue := bucket.Get([]byte(bucketItemKey))

		return bucketItem.DecodeValue(itemValue)
	}); err != nil {
		log.Println(ApiError{err, nil})
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(bucketItem.Value)
}

func UpdateBucketItem(w http.ResponseWriter, r *http.Request) {
	DBPtr.RLock()
	defer DBPtr.RUnlock()

	fail := func(cusromErr, origErr error) {
		log.Println(ApiError{cusromErr, origErr})
		http.Error(w, cusromErr.Error(), http.StatusInternalServerError)
	}

	bucketName := mux.Vars(r)["name"]
	bucketItemKey := mux.Vars(r)["key"]

	payload := &BucketItem{Key: bucketItemKey}
	if err := json.NewDecoder(r.Body).Decode(&payload.Value); err != nil {
		fail(ErrBucketItemDecode, err)
		return
	}

	encodedValue, err := payload.EncodeValue()
	if err != nil {
		fail(err, nil)
		return
	}

	if err := (*db).Update(func(tx *bolt.Tx) error {
		bucket := tx.Bucket([]byte(strings.TrimSpace(bucketName)))
		if bucket == nil {
			return ErrBucketMissing
		}
		return bucket.Put(payload.EncodeKey(), encodedValue)
	}); err != nil {
		fail(ErrBucketItemUpdate, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(payload.Value)
}

func DeleteBucketItem(w http.ResponseWriter, r *http.Request) {
	DBPtr.RLock()
	defer DBPtr.RUnlock()

	bucketName := mux.Vars(r)["name"]
	bucketItemKey := mux.Vars(r)["key"]

	if err := (*db).Update(func(tx *bolt.Tx) error {
		bucket := tx.Bucket([]byte(strings.TrimSpace(bucketName)))
		if bucket == nil {
			return ErrBucketMissing
		}

		return bucket.Delete([]byte(bucketItemKey))
	}); err != nil {
		log.Println(ApiError{ErrBucketItemDelete, err})
		http.Error(w, ErrBucketItemDelete.Error(), http.StatusInternalServerError)

		return
	}
}

// TODO
func logRequest(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("%s %s %s\n", r.RemoteAddr, r.Method, r.URL)
		//sprbus.Publish("log:db", map[string]int64{"method": r.Method})
		handler.ServeHTTP(w, r)
	})
}
