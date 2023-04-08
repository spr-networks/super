package main

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

import (
	"github.com/boltdb/bolt"
	"github.com/spr-networks/sprbus"
	//"github.com/tidwall/gjson"
)

import (
	"boltapi"
)

var (
	gDBPath     = flag.String("dbpath", "/state/plugins/db/logs.db", "Path to bolt database")
	gDebug      = flag.Bool("debug", false, "verbose output")
	gConfigPath = flag.String("config", "/configs/db/config.json", "Path to boltapi configuration")
	gDump       = flag.Bool("dump", false, "list gBuckets. dont run http server")
	gBucket     = flag.String("b", "", "bucket to dump. dont run http server")
	gSocketPath = "/state/plugins/db/socket"
)

type CustomResponseWriter struct {
	body       []byte
	statusCode int
	header     http.Header
}

func NewCustomResponseWriter() *CustomResponseWriter {
	return &CustomResponseWriter{
		header: http.Header{},
	}
}

func (w *CustomResponseWriter) Header() http.Header {
	return w.header
}

func (w *CustomResponseWriter) Write(b []byte) (int, error) {
	w.body = b
	// implement it as per your requirement
	return 0, nil
}

func (w *CustomResponseWriter) WriteHeader(statusCode int) {
	w.statusCode = statusCode
}

var testF = func(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
}

func cli(db *bolt.DB, bucket string) {
	if err := db.View(func(tx *bolt.Tx) error {
		// list single or all gBucket(s)
		if bucket != "" {
			b := tx.Bucket([]byte(bucket))
			if b == nil {
				return errors.New("missing bucket")
			}

			if err := b.ForEach(func(k, v []byte) error {
				bucketItem := &boltapi.BucketItem{Key: string(k)}
				bucketItem.DecodeValue(v)

				jsonMap := bucketItem.Value.(map[string]interface{})
				fmt.Printf("[JSON] %v\n", jsonMap)

				if _, exists := jsonMap["time"]; !exists {
					// time from key
					t := time.Unix(0, int64(binary.BigEndian.Uint64(k))).UTC()
					jsonMap["time"] = t.Format(time.RFC3339)
				}

				//x, ok := gjson.Parse(string(v)).Value().(map[string]interface{})
				//fmt.Printf("[%s] %s\n", gBucket, gjson.Get(string(v), "@values"))
				fmt.Printf("[%s] %s\n", bucket, jsonMap)

				return nil
			}); err != nil {
				return err
			}

		} else {
			if err := db.View(func(tx *bolt.Tx) error {
				return tx.ForEach(func(name []byte, bucket *bolt.Bucket) error {
					fmt.Printf("%s\n", name)
					return nil
				})
			}); err != nil {
				log.Println(err)
				return nil
			}

		}

		return nil
	}); err != nil {
		log.Println(err)
		return
	}

	return
}

var config *boltapi.LogConfig

func shouldLogEvent(topic string) bool {
	for _, event := range config.SaveEvents {
		if strings.HasPrefix(topic, event) {
			return true
		}
	}

	return false
}

// subscribe to sprbus and store in db
func handleLogEvent(topic string, value string) {
	if *gDebug {
		fmt.Println("topic:", topic)
		fmt.Println("value:", topic)
	}

	if !shouldLogEvent(topic) {
		return
	}

	var jsonData map[string]interface{} // json object
	if err := json.Unmarshal([]byte(value), &jsonData); err != nil {
		fmt.Println("db store, invalid json", err)
		return
	}

	if _, err := boltapi.PutItem(topic, jsonData); err != nil {
		fmt.Println("error saving data:", err)
		return
	}
}

func main() {
	flag.Parse()

	log.Println("database initd")

	options := &bolt.Options{Timeout: 1 * time.Second}
	if *gBucket != "" || *gDump != false {
		options.ReadOnly = true
	}

	db, err := bolt.Open(*gDBPath, 0664, options)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	if *gBucket != "" || *gDump != false {
		cli(db, *gBucket)

		return
	}

	boltapi.SetupConfig(*gConfigPath, &config)

	go sprbus.HandleEvent("", handleLogEvent)

	log.Println("serving", gSocketPath)
	log.Fatal(boltapi.Serve(db, gSocketPath))
}
