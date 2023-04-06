package boltapi

import (
	//"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/boltdb/bolt"
	"github.com/gorilla/mux"
	//"github.com/tidwall/gjson"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	//"time"
)

var (
	db                   *bolt.DB
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
)

type ApiError struct {
	customErr error
	origErr   error
}

type BucketItem struct {
	Key   string      `json:key`
	Value interface{} `json:value`
}

//BucketItem helper functions
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

func Serve(boltdb *bolt.DB, socketpath string) error {
	db = boltdb
	router := mux.NewRouter().StrictSlash(true)

	router.HandleFunc("/buckets", ListBuckets).Methods("GET")
	router.HandleFunc("/buckets", AddBucket).Methods("PUT")
	router.HandleFunc("/buckets", DeleteBucket).Methods("DELETE")

	router.HandleFunc("/bucket/{name}", GetBucket).Methods("GET")
	router.HandleFunc("/bucket/{name}", AddBucketItem).Methods("PUT")
	router.HandleFunc("/bucket/{name}", DeleteBucketItem).Methods("DELETE")

	router.HandleFunc("/items/{name}", GetBucketItems).Methods("GET")

	router.HandleFunc("/bucket/{name}/{key}", GetBucketItem).Methods("GET")
	router.HandleFunc("/bucket/{name}/{key}", UpdateBucketItem).Methods("PUT")
	router.HandleFunc("/bucket/{name}/{key}", DeleteBucketItem).Methods("DELETE")

	os.Remove(socketpath)
	unixPluginListener, err := net.Listen("unix", socketpath)
	if err != nil {
		panic(err)
	}

	fmt.Println("starting http.Server...")

	pluginServer := http.Server{Handler: logRequest(router)}
	return pluginServer.Serve(unixPluginListener)
}

func ListBuckets(w http.ResponseWriter, r *http.Request) {
	fullParam := r.URL.Query().Get("full")
	full := fullParam == "1" || fullParam == "true"

	bucketNames := []string{}
	buckets := []map[string]interface{}{}

	if err := db.View(func(tx *bolt.Tx) error {
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
	bucketName := mux.Vars(r)["name"]

	if err := db.Update(func(tx *bolt.Tx) error {
		return tx.DeleteBucket([]byte(strings.TrimSpace(bucketName)))
	}); err != nil {
		log.Println(ApiError{ErrBucketDelete, err})
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}
}

func AddBucket(w http.ResponseWriter, r *http.Request) {
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

	if err := db.Update(func(tx *bolt.Tx) error {
		_, err := tx.CreateBucket([]byte(strings.TrimSpace(bucketName)))
		return err
	}); err != nil {
		log.Println(ApiError{ErrBucketCreate, err})
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

func GetBucket(w http.ResponseWriter, r *http.Request) {
	bucketName := mux.Vars(r)["name"]

	items := []*BucketItem{}
	if err := db.View(func(tx *bolt.Tx) error {
		bucket := tx.Bucket([]byte(bucketName))
		if bucket == nil {
			return ErrBucketMissing
		}

		return bucket.ForEach(func(k, v []byte) error {
			bucketItem := &BucketItem{Key: string(k)}
			// does this do anything atm.?
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

	json.NewEncoder(w).Encode(items)
}

func GetBucketItems(w http.ResponseWriter, r *http.Request) {
	bucketName := mux.Vars(r)["name"]

	fmt.Println("bucket=", bucketName)
	// TODO json decode .value for each item in bucket
	// add search, range select here

	http.Error(w, "Not implemented", http.StatusInternalServerError)
}

func AddBucketItem(w http.ResponseWriter, r *http.Request) {
	fail := func(cusromErr, origErr error) {
		log.Println(ApiError{cusromErr, origErr})
		http.Error(w, cusromErr.Error(), http.StatusInternalServerError)
	}

	bucketName := mux.Vars(r)["name"]
	payload := new(BucketItem)
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		fail(ErrBucketItemDecode, err)
		return
	}

	//BucketItem.Value is json object until its stored, then we serialize
	encodedValue, err := payload.EncodeValue()
	if err != nil {
		fail(err, nil)
		return
	}

	if err := db.Update(func(tx *bolt.Tx) error {
		//create bucket if it doesnt exist
		bucket, err := tx.CreateBucketIfNotExists([]byte(strings.TrimSpace(bucketName)))
		if err != nil {
			return ErrBucketMissing
		}

		return bucket.Put(payload.EncodeKey(), encodedValue)
	}); err != nil {
		fail(ErrBucketItemCreate, err)

		return
	}

	json.NewEncoder(w).Encode(payload.Value)
}

func GetBucketItem(w http.ResponseWriter, r *http.Request) {
	bucketName := mux.Vars(r)["name"]
	bucketItemKey := mux.Vars(r)["key"]

	bucketItem := new(BucketItem)
	if err := db.View(func(tx *bolt.Tx) error {
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

	json.NewEncoder(w).Encode(bucketItem.Value)
}

func UpdateBucketItem(w http.ResponseWriter, r *http.Request) {
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

	if err := db.Update(func(tx *bolt.Tx) error {
		bucket := tx.Bucket([]byte(strings.TrimSpace(bucketName)))
		if bucket == nil {
			return ErrBucketMissing
		}
		return bucket.Put(payload.EncodeKey(), encodedValue)
	}); err != nil {
		fail(ErrBucketItemUpdate, err)
		return
	}

	json.NewEncoder(w).Encode(payload.Value)
}

func DeleteBucketItem(w http.ResponseWriter, r *http.Request) {
	bucketName := mux.Vars(r)["name"]
	bucketItemKey := mux.Vars(r)["key"]

	if err := db.Update(func(tx *bolt.Tx) error {
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

//TODO
func logRequest(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Printf("%s %s %s\n", r.RemoteAddr, r.Method, r.URL)
		handler.ServeHTTP(w, r)
	})
}