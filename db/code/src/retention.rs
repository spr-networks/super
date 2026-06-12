//! Size-based retention: when the database (plus WAL) outgrows 1.25x
//! MaxSize, delete the oldest 25% of every bucket with more than 256
//! entries, then compact. Startup runs the same size check as every other
//! iteration, so data is only deleted when the database is near capacity.

use std::sync::Arc;

use crate::config::ConfigStore;
use crate::store::Store;

const MIN_ENTRIES_DELETE: i64 = 256;

pub async fn check_size_iteration(store: &Store, max_size: u64, debug: bool) -> Result<bool, String> {
    let size = store.disk_size();

    // no need to sweep
    if (size as f64) < 1.25 * max_size as f64 {
        return Ok(false);
    }

    if debug {
        eprintln!("cleanup: db size > max size: {} > {}", size, max_size);
    }

    let buckets = store.list_buckets().await.map_err(|e| e.0)?;
    for bucket in buckets {
        let count = store.count_items(&bucket).await.map_err(|e| e.0)?;
        if count > MIN_ENTRIES_DELETE {
            store
                .delete_oldest(&bucket, count / 4)
                .await
                .map_err(|e| e.0)?;
        }
    }

    store.compact().await.map_err(|e| e.0)?;
    Ok(true)
}

pub async fn check_size_loop(store: Arc<Store>, config: Arc<ConfigStore>, debug: bool) {
    loop {
        let max_size = config.get().max_size;
        match check_size_iteration(&store, max_size, debug).await {
            Ok(_) => {}
            Err(e) => eprintln!("db cleanup error: {}", e),
        }
        tokio::time::sleep(std::time::Duration::from_secs(300)).await;
    }
}
