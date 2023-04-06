package main

import (
	"boltapi"
	"encoding/binary"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"github.com/boltdb/bolt"
	"github.com/spr-networks/sprbus"
	"log"
	logStd "log"
	"net/http"
	"strings"
	"time"
	//"github.com/tidwall/gjson"
)

var (
	dbpath     = flag.String("dbpath", "/state/plugins/db/logs.db", "Path to bolt database")
	dump       = flag.Bool("dump", false, "list buckets. dont run http server")
	bucket     = flag.String("b", "", "bucket to dump. dont run http server")
	socketpath = "/state/plugins/db/socket"
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
		// list single or all bucket(s)
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
				//fmt.Printf("[%s] %s\n", bucket, gjson.Get(string(v), "@values"))
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

//TODO config
func shouldLogEvent(topic string) bool {
	// log:api, log:www:access
	if strings.HasPrefix(topic, "log:") {
		return true
	}

	return false
}

func saveLogEntry(topic string, value string) error {
	var jsonData map[string]interface{} // json object
	if err := json.Unmarshal([]byte(value), &jsonData); err != nil {
		fmt.Println("db store, invalid json", err)
		return err
	}

	_, err := boltapi.StoreItem(topic, jsonData)
	return err
}

//subscribe to sprbus and store in db
func handleLogEvent(topic string, value string) {
	if !shouldLogEvent(topic) {
		return
	}

	// for docker container logs
	logStd.Printf("[%v] %v\n", topic, value)
	err := saveLogEntry(topic, value)

	if err != nil {
		logStd.Println("error saving logs:", err)
	}
}

func main() {
	flag.Parse()

	log.Println("database initd")

	options := &bolt.Options{Timeout: 1 * time.Second}
	if *bucket != "" || *dump != false {
		options.ReadOnly = true
	}

	db, err := bolt.Open(*dbpath, 0664, options)
	//db, err := bolt.Open(*dbpath, 0664, &bolt.Options{Timeout: 1 * time.Second})
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	if *bucket != "" || *dump != false {
		cli(db, *bucket)

		return
	}

	go sprbus.HandleEvent("", handleLogEvent)

	log.Println("serving", socketpath)
	log.Fatal(boltapi.Serve(db, socketpath))
}
