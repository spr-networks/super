mod common;

use dbapi::retention::check_size_iteration;
use dbapi::store::Store;

async fn seed(store: &Store, bucket: &str, n: u64) {
    for i in 0..n {
        store
            .put_item(
                bucket,
                &i.to_be_bytes(),
                "{\"data\":\"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\"}",
                true,
            )
            .await
            .unwrap();
    }
}

#[tokio::test]
async fn sweep_deletes_oldest_quarter_of_big_buckets_only() {
    let dir = common::tempdir("retention");
    let store = Store::open(dir.join("db").to_str().unwrap()).await.unwrap();

    seed(&store, "big1", 400).await;
    seed(&store, "big2", 300).await;
    seed(&store, "small", 10).await;

    // tiny MaxSize forces the haircut even without `force`
    let compacted = check_size_iteration(&store, 1, false, false).await.unwrap();
    assert!(compacted);

    assert_eq!(store.count_items("big1").await.unwrap(), 300);
    assert_eq!(store.count_items("big2").await.unwrap(), 225);
    assert_eq!(store.count_items("small").await.unwrap(), 10);

    // the oldest keys are the ones gone
    let items = store.bucket_items("big1").await.unwrap();
    assert_eq!(items[0].0, 100u64.to_be_bytes().to_vec());

    // store still usable after the compaction reopen, tmp cleaned up
    store.put_item("post", b"k", "{}", true).await.unwrap();
    assert!(!dir.join("db.tmp").exists());
}

#[tokio::test]
async fn no_sweep_below_threshold() {
    let dir = common::tempdir("retention-skip");
    let store = Store::open(dir.join("db").to_str().unwrap()).await.unwrap();
    seed(&store, "big", 400).await;

    // huge MaxSize, not forced: nothing happens
    let compacted = check_size_iteration(&store, u64::MAX / 2, false, false)
        .await
        .unwrap();
    assert!(!compacted);
    assert_eq!(store.count_items("big").await.unwrap(), 400);
}

#[tokio::test]
async fn forced_run_sweeps_regardless_of_size() {
    let dir = common::tempdir("retention-force");
    let store = Store::open(dir.join("db").to_str().unwrap()).await.unwrap();
    seed(&store, "big", 400).await;

    // forced first run ignores the size gate (bolt-era startup behavior)
    let compacted = check_size_iteration(&store, u64::MAX / 2, false, true)
        .await
        .unwrap();
    assert!(compacted);
    assert_eq!(store.count_items("big").await.unwrap(), 300);
}
