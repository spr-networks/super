package main

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"strings"
	"time"
)

import (
	"github.com/spr-networks/sprbus"
	//"github.com/tidwall/gjson"
)

import bolt "go.etcd.io/bbolt"

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

var config = boltapi.LogConfig{}

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
	// keep a list of unique events
	boltapi.LogEvent(topic)

	if !shouldLogEvent(topic) {
		return
	}

	if *gDebug {
		log.Println("[event]", topic, value)
	}

	var jsonData map[string]interface{} // json object
	if err := json.Unmarshal([]byte(value), &jsonData); err != nil {
		log.Println("db store, invalid json", err)
		return
	}

	if _, err := boltapi.PutItem(topic, jsonData); err != nil {
		log.Println("error saving data:", err)
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

	// keep a list of unique events for api
	for k := range config.SaveEvents {
		topic := config.SaveEvents[k]
		boltapi.LogEvent(topic)
	}

	// loops to rm old items if db size is too big
	go boltapi.CheckSizeLoop(*gDBPath, db, config, *gDebug)

	go func() {
		for i := 30; i > 0; i-- {
			err = sprbus.HandleEvent("", handleLogEvent)
			if err != nil {
				log.Println(err)
			}
			time.Sleep(3 * time.Second)
		}
		log.Fatal("failed to establish connection to sprbus")
	}()

	log.Println("serving", gSocketPath)
	log.Fatal(boltapi.Serve(db, gSocketPath))
}
