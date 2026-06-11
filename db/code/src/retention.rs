//! Size-based retention, replacing sweep.go: when the database (plus WAL)
//! outgrows 1.25x MaxSize, delete the oldest 25% of every bucket with more
//! than 256 entries, then compact. Like the bolt version, the first run after
//! startup is forced.

use std::sync::Arc;

use crate::config::ConfigStore;
use crate::store::Store;

const MIN_ENTRIES_DELETE: i64 = 256;

pub async fn check_size_iteration(
    store: &Store,
    max_size: u64,
    debug: bool,
    force: bool,
) -> Result<bool, String> {
    let size = store.disk_size();

    // no need to sweep
    if !force && (size as f64) < 1.25 * max_size as f64 {
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
    let mut force_first_run = true;
    loop {
        let max_size = config.get().max_size;
        match check_size_iteration(&store, max_size, debug, force_first_run).await {
            Ok(_) => {}
            Err(e) => eprintln!("db cleanup error: {}", e),
        }
        force_first_run = false;
        tokio::time::sleep(std::time::Duration::from_secs(300)).await;
    }
}
