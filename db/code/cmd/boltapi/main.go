package main

import (
	//"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"time"
	//"strings"
	"boltapi"
	"github.com/boltdb/bolt"
	"github.com/tidwall/gjson"
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

				fmt.Printf("[%s] %s\n", bucket, gjson.Get(string(v), "@values"))

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

func main() {
	flag.Parse()

	log.Println("database initd")

    options := &bolt.Options{Timeout: 1 * time.Second}
	if *bucket != "" || *dump != false {
        options.ReadOnly = true
    }

    db, err := bolt.Open(*dbpath, 0664, options)
	if err != nil {
		log.Fatal(err)
	}

	defer db.Close()

	if *bucket != "" || *dump != false {
		cli(db, *bucket)

		return
	}

	log.Println("serving", socketpath)
	log.Fatal(boltapi.Serve(db, socketpath))
}
