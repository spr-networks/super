mod common;

use axum::http::StatusCode;
use chrono::{Duration, Utc};
use common::{get_json, request, test_env};
use dbapi::keys;
use serde_json::{json, Value};

/// Seed n items with timekeys at now - (n-i) hours; values {"n": i} (no time).
async fn seed_hours(env: &common::TestEnv, bucket: &str, n: i64) -> Vec<String> {
    let mut stamps = Vec::new();
    for i in 0..n {
        let ts = Utc::now() - Duration::hours(n - i);
        let stamp = keys::format_rfc3339_nano(ts);
        let key = keys::time_key(&stamp).unwrap();
        env.state
            .store
            .put_item(bucket, &key, &format!("{{\"n\":{}}}", i), true)
            .await
            .unwrap();
        stamps.push(stamp);
    }
    stamps
}

fn ns(items: &Value) -> Vec<i64> {
    items
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["n"].as_i64().unwrap())
        .collect()
}

#[tokio::test]
async fn items_default_descending_with_time_injection() {
    let env = test_env("items-desc").await;
    let stamps = seed_hours(&env, "ev", 10).await;

    let items = get_json(&env.app, "/items/ev").await;
    assert_eq!(ns(&items), vec![9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);

    // time injected from the key
    assert_eq!(items[0]["time"].as_str().unwrap(), stamps[9]);

    // a stored "time" field is not overwritten
    let key = keys::time_key(&keys::format_rfc3339_nano(Utc::now() - Duration::minutes(5)))
        .unwrap();
    env.state
        .store
        .put_item("ev", &key, "{\"n\":99,\"time\":\"fixed\"}", true)
        .await
        .unwrap();
    let items = get_json(&env.app, "/items/ev?num=1").await;
    assert_eq!(items[0]["time"], "fixed");
}

#[tokio::test]
async fn items_ascending_and_num_cap() {
    let env = test_env("items-asc").await;
    seed_hours(&env, "ev", 10).await;

    let items = get_json(&env.app, "/items/ev?order=asc").await;
    assert_eq!(ns(&items), (0..10).collect::<Vec<_>>());

    let items = get_json(&env.app, "/items/ev?num=3").await;
    assert_eq!(ns(&items), vec![9, 8, 7]);

    // num is clamped: <1 falls back to default 100, >1000 becomes 1000
    let items = get_json(&env.app, "/items/ev?num=0").await;
    assert_eq!(ns(&items).len(), 10);
}

#[tokio::test]
async fn items_strict_bounds_asymmetry() {
    let env = test_env("items-strict").await;
    let stamps = seed_hours(&env, "ev", 10).await;

    // descending strict: max bound exclusive, min inclusive
    let uri = format!("/items/ev?strict=1&min={}&max={}", stamps[2], stamps[5]);
    let items = get_json(&env.app, &uri).await;
    assert_eq!(ns(&items), vec![4, 3, 2]);

    // ascending strict: both bounds inclusive
    let uri = format!(
        "/items/ev?strict=1&order=asc&min={}&max={}",
        stamps[2], stamps[5]
    );
    let items = get_json(&env.app, &uri).await;
    assert_eq!(ns(&items), vec![2, 3, 4, 5]);

    // strict with a missing/unparseable bound -> null
    let items = get_json(&env.app, &format!("/items/ev?strict=1&min={}", stamps[2])).await;
    assert_eq!(items, Value::Null);
    let items = get_json(&env.app, "/items/ev?strict=1&min=garbage&max=garbage").await;
    assert_eq!(items, Value::Null);
}

#[tokio::test]
async fn items_filter_counts_matches() {
    let env = test_env("items-filter").await;
    seed_hours(&env, "ev", 10).await;

    let filter = urlencode("$[?(@.n==3)]");
    let items = get_json(&env.app, &format!("/items/ev?filter={}", filter)).await;
    assert_eq!(ns(&items), vec![3]);

    // num counts matching items, not scanned rows
    let filter = urlencode("$[?(@.n>=5)]");
    let items = get_json(&env.app, &format!("/items/ev?filter={}&num=2", filter)).await;
    assert_eq!(ns(&items), vec![9, 8]);

    // non-matching filter -> null body (nil slice), not []
    let filter = urlencode("$[?(@.n==12345)]");
    let (status, body) = request(
        &env.app,
        "GET",
        &format!("/items/ev?filter={}", filter),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, "null\n");
}

#[tokio::test]
async fn items_filter_scans_across_batches() {
    // filtered scans fetch in batches of 1000; seed enough rows that matches
    // span multiple batches in both directions
    let env = test_env("items-batches").await;
    let base = Utc::now() - Duration::hours(1);
    for i in 0..2500i64 {
        let stamp = keys::format_rfc3339_nano(base + Duration::milliseconds(i));
        let key = keys::time_key(&stamp).unwrap();
        env.state
            .store
            .put_item("ev", &key, &format!("{{\"n\":{}}}", i), true)
            .await
            .unwrap();
    }

    // matches at n = 0, 700, 1400, 2100 — one per batch region
    let filter = urlencode("$[?(@.n==0 || @.n==700 || @.n==1400 || @.n==2100)]");
    let items = get_json(&env.app, &format!("/items/ev?filter={}", filter)).await;
    assert_eq!(ns(&items), vec![2100, 1400, 700, 0]);

    let items = get_json(&env.app, &format!("/items/ev?order=asc&filter={}", filter)).await;
    assert_eq!(ns(&items), vec![0, 700, 1400, 2100]);

    // num stops the scan after enough matches
    let items = get_json(&env.app, &format!("/items/ev?filter={}&num=2", filter)).await;
    assert_eq!(ns(&items), vec![2100, 1400]);
}

#[tokio::test]
async fn items_ascending_fallback_for_old_data() {
    let env = test_env("items-fallback").await;

    // items 2 years old: outside the default now-1y..now window
    let old = keys::format_rfc3339_nano(Utc::now() - Duration::days(730));
    let key = keys::time_key(&old).unwrap();
    env.state
        .store
        .put_item("old", &key, "{\"n\":1}", true)
        .await
        .unwrap();

    // descending: nothing in window -> null (bolt: Last() < min stops the walk)
    let (_, body) = request(&env.app, "GET", "/items/old", None).await;
    assert_eq!(body, "null\n");

    // ascending non-strict falls back to the oldest data (bolt: c.First())
    let items = get_json(&env.app, "/items/old?order=asc").await;
    assert_eq!(ns(&items), vec![1]);

    // ...but not in strict mode
    let uri = format!(
        "/items/old?order=asc&strict=1&min={}&max={}",
        keys::format_rfc3339_nano(Utc::now() - Duration::days(365)),
        keys::format_rfc3339_nano(Utc::now())
    );
    let (_, body) = request(&env.app, "GET", &uri, None).await;
    assert_eq!(body, "null\n");
}

#[tokio::test]
async fn items_missing_bucket_and_empty_shapes() {
    let env = test_env("items-empty").await;

    let (status, body) = request(&env.app, "GET", "/items/nope", None).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(body, "bucket doesn't exist\n");

    env.state.store.create_bucket("empty").await.unwrap();
    let (_, body) = request(&env.app, "GET", "/items/empty", None).await;
    assert_eq!(body, "null\n"); // nil slice -> null

    let (_, body) = request(&env.app, "GET", "/bucket/empty", None).await;
    assert_eq!(body, "[]\n"); // initialized slice -> []
}

#[tokio::test]
async fn bucket_crud_routes() {
    let env = test_env("bucket-crud").await;

    let (status, _) = request(&env.app, "PUT", "/buckets", Some(r#"{"name":"b1"}"#)).await;
    assert_eq!(status, StatusCode::OK);

    let (status, body) = request(&env.app, "PUT", "/buckets", Some(r#"{"name":"b1"}"#)).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(body, "bucket already exists\n");

    let (status, body) = request(&env.app, "PUT", "/buckets", Some(r#"{"name":"  "}"#)).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(body, "invalid bucket name\n");

    let (status, body) = request(&env.app, "PUT", "/buckets", Some("not json")).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(body, "error reading bucket name\n");

    assert_eq!(get_json(&env.app, "/buckets").await, json!(["b1"]));

    let (status, _) = request(&env.app, "DELETE", "/bucket/b1", None).await;
    assert_eq!(status, StatusCode::OK);
    let (status, body) = request(&env.app, "DELETE", "/bucket/b1", None).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(body, "bucket not found\n");
}

#[tokio::test]
async fn item_routes_and_timekey_prefix() {
    let env = test_env("item-routes").await;

    // explicit {key, value} body
    let (status, body) = request(
        &env.app,
        "PUT",
        "/bucket/b",
        Some(r#"{"key":"k1","value":{"a":1}}"#),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(serde_json::from_str::<Value>(&body).unwrap(), json!({"a":1}));

    assert_eq!(get_json(&env.app, "/bucket/b/k1").await, json!({"a":1}));

    // arbitrary body gets stored under a time-derived key and echoed back
    let (status, body) = request(&env.app, "PUT", "/bucket/b", Some(r#"{"foo":"bar"}"#)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        serde_json::from_str::<Value>(&body).unwrap(),
        json!({"foo":"bar"})
    );

    // update via timekey: prefix, then visible in /items with that timestamp
    let stamp = keys::format_rfc3339_nano(Utc::now() - Duration::minutes(1));
    let (status, _) = request(
        &env.app,
        "PUT",
        &format!("/bucket/tk/timekey:{}", urlencode(&stamp)),
        Some(r#"{"x":1}"#),
    )
    .await;
    // bucket "tk" doesn't exist: update does not create buckets
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);

    env.state.store.create_bucket("tk").await.unwrap();
    let (status, _) = request(
        &env.app,
        "PUT",
        &format!("/bucket/tk/timekey:{}", urlencode(&stamp)),
        Some(r#"{"x":1}"#),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let items = get_json(&env.app, "/items/tk").await;
    assert_eq!(items[0]["x"], 1);
    assert_eq!(items[0]["time"].as_str().unwrap(), stamp);

    // delete; then GET of the missing key errors like decoding nil
    let (status, _) = request(&env.app, "DELETE", "/bucket/b/k1", None).await;
    assert_eq!(status, StatusCode::OK);
    let (status, body) = request(&env.app, "GET", "/bucket/b/k1", None).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(body, "error reading bucket item\n");

    // missing bucket on GET
    let (status, body) = request(&env.app, "GET", "/bucket/nope/k", None).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(body, "bucket doesn't exist\n");
}

#[tokio::test]
async fn buckets_full_shape() {
    let env = test_env("buckets-full").await;
    env.state
        .store
        .put_item("b", b"k", "{\"v\":1}", true)
        .await
        .unwrap();
    env.state.store.create_bucket("empty").await.unwrap();

    let buckets = get_json(&env.app, "/buckets?full=1").await;
    assert_eq!(
        buckets,
        json!([
            {"name": "b", "items": [{"Key": "k", "Value": {"v": 1}}]},
            {"name": "empty", "items": []},
        ])
    );
}

#[tokio::test]
async fn config_stats_topics_routes() {
    let env = test_env("config-stats").await;

    // default config served from disk
    let config = get_json(&env.app, "/config").await;
    assert_eq!(config["MaxSize"], 250 * 1024 * 1024);

    // PUT roundtrip, echoed and persisted
    let new_config = r#"{"SaveEvents":["x:"],"MaxSize":1000,"TopicLimits":null}"#;
    let (status, body) = request(&env.app, "PUT", "/config", Some(new_config)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(serde_json::from_str::<Value>(&body).unwrap()["MaxSize"], 1000);
    assert_eq!(get_json(&env.app, "/config").await["MaxSize"], 1000);

    let (status, _) = request(&env.app, "PUT", "/config", Some("nope")).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // stats: size reflects the db file, topics from seen events
    env.state
        .store
        .put_item("b", b"k", "{}", true)
        .await
        .unwrap();
    env.state.log_event("wifi:auth:success");
    let stats = get_json(&env.app, "/stats").await;
    assert!(stats["Size"].as_i64().unwrap() > 0);
    assert_eq!(stats["Topics"], json!(["wifi:auth:success"]));

    let bucket_stats = get_json(&env.app, "/stats/b").await;
    assert_eq!(bucket_stats["KeyN"], 1);
    assert_eq!(bucket_stats["BucketN"], 1);

    let (status, body) = request(&env.app, "GET", "/stats/nope", None).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(body, "bucket doesn't exist\n");

    assert_eq!(
        get_json(&env.app, "/topics").await,
        json!(["wifi:auth:success"])
    );
}

fn urlencode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{:02X}", b),
        })
        .collect()
}
