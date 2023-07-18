package boltapi

import (
	"log"
	"os"
	"time"
)

import bolt "go.etcd.io/bbolt"

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func CheckSizeIteration(dbpath string, db *bolt.DB, config LogConfig, debug bool) (error, bool) {
	fstat, err := os.Stat(dbpath)

	if err == nil {
		log.Println("[-] Failed to open db for sweep", err)
		return err, false
	}

	//no need to sweep
	if uint64(fstat.Size()) < config.MaxSize {
		return nil, false
	}

	if debug {
		log.Printf("cleanup: db size > max size: %v > %v\n", fstat.Size(), config.MaxSize)
	}

	pMinEntriesDelete := 100

	//1. get size of db + all buckets and num keys
	if err := db.Update(func(tx *bolt.Tx) error {
		return tx.ForEach(func(name []byte, b *bolt.Bucket) error {
			//delete 25% of each bucket with more than X entries

			c := b.Cursor()
			count := 0
			for k, _ := c.First(); k != nil; k, _ = c.Next() {
				count++
			}

			if count > pMinEntriesDelete {

				var nextKey []byte
				deleted := 0
				//delete 25% of entries
				toDelete := count / 4
				for k, _ := c.First(); k != nil && deleted < toDelete; k = nextKey {
					nextKey, _ = c.Next()
					if err := b.Delete(k); err != nil {
						log.Println("Failed to delete key: %s", err)
						return err
					}

					deleted++
				}

			}

			return nil
		})
	}); err != nil {
		log.Println(err)
		return err, false
	}

	fstat, err = os.Stat(dbpath)

	//if less than 25% over dont compact
	if uint64(fstat.Size()) < uint64(1.25*float64(config.MaxSize)) {
		return nil, false
	}

	// over 25% of max, run a compact command

	dst, err := bolt.Open(dbpath+".tmp", fstat.Mode(), nil)
	defer dst.Close()
	if err != nil {
		return err, false
	}

	err = bolt.Compact(dst, db, 0)

	return err, true
}

func CheckSizeLoop(dbpath string, db **bolt.DB, config LogConfig, debug bool) {
	for {
		//lock db pointer during deletion

		DBPtr.Lock()
		err, compacted := CheckSizeIteration(dbpath, *db, config, debug)
		if err != nil {
			log.Println("db cleanup error:", err)
		} else if compacted {
			err = os.Rename(dbpath+".tmp", dbpath)
			if err != nil {
				log.Println("db compaction failed to move file:", err)
			} else {
				(*db).Close()
				//re-open db
				options := &bolt.Options{Timeout: 1 * time.Second}
				*db, err = bolt.Open(dbpath, 0664, options)
				if err != nil {
					log.Println("db compaction failed to reopen db:", err)
				}
			}
		}

		DBPtr.Unlock()

		time.Sleep(5 * time.Minute)
	}
}
