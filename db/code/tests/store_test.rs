mod common;

use dbapi::keys;
use dbapi::store::{Store, ERR_BUCKET_EXISTS, ERR_BUCKET_MISSING, ERR_BUCKET_NOT_FOUND};

#[tokio::test]
async fn bucket_crud_and_empty_buckets() {
    let dir = common::tempdir("store-crud");
    let store = Store::open(dir.join("db").to_str().unwrap()).await.unwrap();

    assert!(store.list_buckets().await.unwrap().is_empty());

    store.create_bucket("empty").await.unwrap();
    store.create_bucket("alpha").await.unwrap();
    assert_eq!(store.list_buckets().await.unwrap(), vec!["alpha", "empty"]);

    // duplicate create errors with bolt's message
    let err = store.create_bucket("alpha").await.unwrap_err();
    assert_eq!(err.0, ERR_BUCKET_EXISTS);

    // empty bucket is listable and has no items
    assert!(store.bucket_items("empty").await.unwrap().is_empty());

    store.delete_bucket("alpha").await.unwrap();
    assert_eq!(store.list_buckets().await.unwrap(), vec!["empty"]);

    let err = store.delete_bucket("alpha").await.unwrap_err();
    assert_eq!(err.0, ERR_BUCKET_NOT_FOUND);

    let err = store.bucket_items("alpha").await.unwrap_err();
    assert_eq!(err.0, ERR_BUCKET_MISSING);
}

#[tokio::test]
async fn item_put_get_delete_and_overwrite() {
    let dir = common::tempdir("store-items");
    let store = Store::open(dir.join("db").to_str().unwrap()).await.unwrap();

    // put with create_bucket=true creates the bucket
    store.put_item("b", b"k1", "{\"v\":1}", true).await.unwrap();
    assert_eq!(store.get_item("b", b"k1").await.unwrap().unwrap(), "{\"v\":1}");

    // overwrite
    store.put_item("b", b"k1", "{\"v\":2}", true).await.unwrap();
    assert_eq!(store.get_item("b", b"k1").await.unwrap().unwrap(), "{\"v\":2}");
    assert_eq!(store.count_items("b").await.unwrap(), 1);

    // put without create on missing bucket fails
    let err = store.put_item("nope", b"k", "{}", false).await.unwrap_err();
    assert_eq!(err.0, ERR_BUCKET_MISSING);

    // missing key is None, not an error
    assert!(store.get_item("b", b"zzz").await.unwrap().is_none());
    // missing bucket is an error
    assert_eq!(
        store.get_item("nope", b"k").await.unwrap_err().0,
        ERR_BUCKET_MISSING
    );

    // delete absent key succeeds (bolt semantics); delete real key removes it
    store.delete_item("b", b"zzz").await.unwrap();
    store.delete_item("b", b"k1").await.unwrap();
    assert_eq!(store.count_items("b").await.unwrap(), 0);
}

#[tokio::test]
async fn mixed_keys_order_bytewise() {
    let dir = common::tempdir("store-order");
    let store = Store::open(dir.join("db").to_str().unwrap()).await.unwrap();

    // interleave timekeys and string keys; memcmp puts 8-byte timekeys
    // (leading 0x17-0x18 for current epochs) before ASCII string keys
    let t1 = keys::time_key("2025-01-01T00:00:00Z").unwrap();
    let t2 = keys::time_key("2026-01-01T00:00:00Z").unwrap();
    store.put_item("b", b"zebra", "{}", true).await.unwrap();
    store.put_item("b", &t2, "{}", true).await.unwrap();
    store.put_item("b", b"apple", "{}", true).await.unwrap();
    store.put_item("b", &t1, "{}", true).await.unwrap();

    let got: Vec<Vec<u8>> = store
        .bucket_items("b")
        .await
        .unwrap()
        .into_iter()
        .map(|(k, _)| k)
        .collect();
    assert_eq!(
        got,
        vec![
            t1.to_vec(),
            t2.to_vec(),
            b"apple".to_vec(),
            b"zebra".to_vec()
        ]
    );
}

#[tokio::test]
async fn survives_reopen() {
    let dir = common::tempdir("store-reopen");
    let path = dir.join("db");
    let path_s = path.to_str().unwrap();

    {
        let store = Store::open(path_s).await.unwrap();
        store.put_item("b", b"k", "{\"v\":1}", true).await.unwrap();
    }
    let store = Store::open(path_s).await.unwrap();
    assert_eq!(store.get_item("b", b"k").await.unwrap().unwrap(), "{\"v\":1}");
}

#[tokio::test]
async fn compact_preserves_data_and_store_stays_usable() {
    let dir = common::tempdir("store-compact");
    let store = Store::open(dir.join("db").to_str().unwrap()).await.unwrap();

    for i in 0..50u64 {
        store
            .put_item("b", &i.to_be_bytes(), "{\"x\":1}", true)
            .await
            .unwrap();
    }
    store.compact().await.unwrap();

    assert_eq!(store.count_items("b").await.unwrap(), 50);
    // still writable after the reopen
    store.put_item("b2", b"k", "{}", true).await.unwrap();
    assert!(store.bucket_exists("b2").await.unwrap());
    // no leftover tmp file
    assert!(!dir.join("db.tmp").exists());
}
