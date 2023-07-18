package boltapi

import (
	"errors"
	"log"
	"time"
)

import bolt "go.etcd.io/bbolt"

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

/*
NOTE db will not shrink, see
https://github.com/boltdb/bolt/issues/308
when ceiling is hit run this to remove old items from buckets
*/
func CheckSizeIteration(db *bolt.DB, config LogConfig, debug bool) error {
	var dbSize int64
	bucketKeys := map[string]int{}
	batchMaxDelete := 200 // max items to delete each iteration

	//1. get size of db + all buckets and num keys
	if err := db.View(func(tx *bolt.Tx) error {
		dbSize = tx.Size()

		return tx.ForEach(func(name []byte, b *bolt.Bucket) error {
			stats := b.Stats()
			// NOTE only set if we're close to a full page on bucket
			// can use stats diff also here to see if there'r updates
			// this is to avoid growing any more
			if float64(stats.BranchInuse)/float64(stats.BranchAlloc) > 0.75 {
				bucketKeys[string(name)] = stats.KeyN
			}

			return nil
		})
	}); err != nil {
		log.Println(err)
		return err
	}

	// return if db size is less than max size
	if uint64(dbSize) < config.MaxSize {
		return nil
	}

	if debug {
		log.Printf("cleanup: db size > max size: %v > %v\n", dbSize, config.MaxSize)
	}

	// return if no buckets to view. db dont shrink so can get here if
	// all buckets are empty
	if len(bucketKeys) == 0 {
		if debug {
			log.Println("no buckets to rm, db size is max")
		}
		return nil
	}

	bucketName := ""
	bucketMaxKeys := 0

	// only grab largest bucket
	for name, nKeys := range bucketKeys {
		if nKeys > bucketMaxKeys {
			bucketName = name
			bucketMaxKeys = nKeys
		}
	}

	//only empty buckets - db have grown to max but empty
	if bucketMaxKeys == 0 {
		if debug {
			log.Println("empty buckets but db size is max. safe to rm db")
		}

		return nil
	}

	numToDelete := min(bucketMaxKeys, batchMaxDelete) // max num items to delete each run

	if debug {
		log.Println("prepare delete:", numToDelete, "items from", bucketName)
	}

	//2. get keys to delete
	keys := [][]byte{}
	if err := db.View(func(tx *bolt.Tx) error {
		bucket := tx.Bucket([]byte(bucketName))
		if bucket == nil {
			return errors.New("bucket doesn't exist")
		}

		c := bucket.Cursor()
		num := 0
		for k, _ := c.First(); k != nil && num < numToDelete; k, _ = c.Next() {
			keys = append(keys, k)
			num++
		}

		return nil
	}); err != nil {
		return err
	}

	log.Println("deleteing", len(keys), "items from", bucketName)

	//3. remove keys
	if err := db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucketName))
		for _, key := range keys {
			if err := b.Delete(key); err != nil {
				return err
			}
		}

		return nil
	}); err != nil {
		return err
	}

	return nil
}

func CheckSizeLoop(db *bolt.DB, config LogConfig, debug bool) {
	for {
		err := CheckSizeIteration(db, config, debug)
		if err != nil {
			log.Println("db cleanup error:", err)
		}

		time.Sleep(time.Minute)
	}
}
