//! REST API over the plugin unix socket, byte-compatible with the bolt-era
//! boltapi.go responses (routes, JSON shapes, error strings, status codes).

use std::collections::BTreeSet;
use std::sync::{Arc, Mutex};

use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::http::{header, StatusCode};
use axum::response::Response;
use axum::routing::get;
use axum::Router;
use serde_json::{json, Map, Value};

use crate::config::ConfigStore;
use crate::filter::test_filter;
use crate::keys;
use crate::store::{KeyRange, Store, ERR_BUCKET_MISSING};

// Error strings preserved from boltapi.go.
const ERR_BUCKET_DECODE_NAME: &str = "error reading bucket name";
const ERR_BUCKET_INVALID_NAME: &str = "invalid bucket name";
const ERR_BUCKET_ITEM_DECODE: &str = "error reading bucket item";
const ERR_BUCKET_ITEM_CREATE: &str = "error creating bucket item";
const ERR_BUCKET_ITEM_UPDATE: &str = "error updating bucket item";
const ERR_BUCKET_ITEM_DELETE: &str = "error deleting bucket item";

#[derive(Clone)]
pub struct AppState {
    pub store: Arc<Store>,
    pub config: Arc<ConfigStore>,
    pub topics: Arc<Mutex<BTreeSet<String>>>,
}

impl AppState {
    pub fn log_event(&self, topic: &str) {
        self.topics.lock().unwrap().insert(topic.to_string());
    }

    fn topics_vec(&self) -> Vec<String> {
        self.topics.lock().unwrap().iter().cloned().collect()
    }
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/buckets", get(list_buckets).put(add_bucket))
        .route(
            "/bucket/{name}",
            get(get_bucket).put(add_bucket_item).delete(delete_bucket),
        )
        .route("/items/{name}", get(get_bucket_items))
        .route(
            "/bucket/{name}/{key}",
            get(get_bucket_item)
                .put(update_bucket_item)
                .delete(delete_bucket_item),
        )
        .route("/config", get(get_config).put(set_config))
        .route("/stats", get(get_stats))
        .route("/stats/{name}", get(get_bucket_stats))
        .route("/topics", get(get_topics))
        .with_state(state)
}

/// 200 application/json with a trailing newline, like Go's json.Encoder.
fn json_response<T: serde::Serialize>(v: &T) -> Response {
    let mut body = serde_json::to_string(v).unwrap_or_else(|_| "null".into());
    body.push('\n');
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/json")
        .body(body.into())
        .unwrap()
}

/// Mirror of Go's http.Error: text/plain, nosniff, message + newline.
fn http_error(msg: &str, code: StatusCode) -> Response {
    Response::builder()
        .status(code)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .header("X-Content-Type-Options", "nosniff")
        .body(format!("{}\n", msg).into())
        .unwrap()
}

fn internal_error(msg: &str) -> Response {
    http_error(msg, StatusCode::INTERNAL_SERVER_ERROR)
}

fn empty_ok() -> Response {
    Response::builder()
        .status(StatusCode::OK)
        .body(axum::body::Body::empty())
        .unwrap()
}

/// BucketItem serialization: the Go struct had malformed json tags, so
/// encoding/json fell back to the exported field names Key/Value.
fn bucket_item(key: &[u8], raw_value: &str) -> Value {
    json!({
        "Key": String::from_utf8_lossy(key),
        "Value": serde_json::from_str::<Value>(raw_value).unwrap_or(Value::Null),
    })
}

type QueryMap = Query<std::collections::HashMap<String, String>>;

// GET /buckets[?full=1]
async fn list_buckets(State(state): State<AppState>, Query(q): QueryMap) -> Response {
    let full = matches!(q.get("full").map(String::as_str), Some("1") | Some("true"));

    let names = match state.store.list_buckets().await {
        Ok(names) => names,
        Err(_) => return internal_error("error listing buckets"),
    };

    if !full {
        return json_response(&names);
    }

    let mut buckets = Vec::new();
    for name in names {
        let items = match state.store.bucket_items(&name).await {
            Ok(items) => items,
            Err(_) => return internal_error("error listing buckets"),
        };
        let items: Vec<Value> = items
            .iter()
            .map(|(k, v)| bucket_item(k, v))
            .collect();
        buckets.push(json!({"name": name, "items": items}));
    }
    json_response(&buckets)
}

// PUT /buckets {"name": ...}
async fn add_bucket(State(state): State<AppState>, body: Bytes) -> Response {
    let payload: Map<String, Value> = match serde_json::from_slice(&body) {
        Ok(Value::Object(m)) => m,
        _ => return internal_error(ERR_BUCKET_DECODE_NAME),
    };

    let name = payload
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("");
    if name.is_empty() {
        return internal_error(ERR_BUCKET_INVALID_NAME);
    }

    match state.store.create_bucket(name).await {
        Ok(()) => empty_ok(),
        Err(e) => internal_error(&e.0),
    }
}

// DELETE /bucket/{name}
async fn delete_bucket(State(state): State<AppState>, Path(name): Path<String>) -> Response {
    match state.store.delete_bucket(name.trim()).await {
        Ok(()) => empty_ok(),
        Err(e) => internal_error(&e.0),
    }
}

// GET /bucket/{name}
async fn get_bucket(State(state): State<AppState>, Path(name): Path<String>) -> Response {
    match state.store.bucket_items(&name).await {
        Ok(items) => {
            let items: Vec<Value> = items.iter().map(|(k, v)| bucket_item(k, v)).collect();
            json_response(&items)
        }
        Err(e) => internal_error(&e.0),
    }
}

/// Shared put logic (PUT /bucket/{name} and the sprbus event path), ported
/// from boltapi.PutItem. Returns the stored value for the response body.
pub async fn put_item_json(
    store: &Store,
    bucket: &str,
    json_data: Map<String, Value>,
) -> Result<Value, String> {
    let (key, value): (Vec<u8>, Value) = if json_data.len() == 2
        && json_data.get("key").map(|v| !v.is_null()).unwrap_or(false)
        && json_data.get("value").map(|v| !v.is_null()).unwrap_or(false)
    {
        let key = json_data
            .get("key")
            .and_then(Value::as_str)
            .ok_or(ERR_BUCKET_ITEM_CREATE)?;
        (
            key.as_bytes().to_vec(),
            json_data.get("value").unwrap().clone(),
        )
    } else {
        // no explicit key/value: store the body, keyed by its "time" or now
        let time = json_data.get("time").and_then(Value::as_str).unwrap_or("");
        let key = keys::key_or_default(time, &keys::now_rfc3339_nano());
        (key, Value::Object(json_data))
    };

    let encoded = serde_json::to_string(&value).map_err(|e| e.to_string())?;
    store
        .put_item(bucket, &key, &encoded, true)
        .await
        .map_err(|e| e.0)?;
    Ok(value)
}

// PUT /bucket/{name}
async fn add_bucket_item(
    State(state): State<AppState>,
    Path(name): Path<String>,
    body: Bytes,
) -> Response {
    let json_data: Map<String, Value> = match serde_json::from_slice(&body) {
        Ok(Value::Object(m)) => m,
        _ => return internal_error(ERR_BUCKET_ITEM_DECODE),
    };

    match put_item_json(&state.store, name.trim(), json_data).await {
        Ok(value) => json_response(&value),
        Err(_) => internal_error(ERR_BUCKET_ITEM_CREATE),
    }
}

// GET /bucket/{name}/{key}
async fn get_bucket_item(
    State(state): State<AppState>,
    Path((name, key)): Path<(String, String)>,
) -> Response {
    match state.store.get_item(name.trim(), key.as_bytes()).await {
        Ok(Some(raw)) => match serde_json::from_str::<Value>(&raw) {
            Ok(value) => json_response(&value),
            Err(_) => internal_error(ERR_BUCKET_ITEM_DECODE),
        },
        // bolt returned nil for a missing key and the JSON decode failed
        Ok(None) => internal_error(ERR_BUCKET_ITEM_DECODE),
        Err(e) => internal_error(&e.0),
    }
}

// PUT /bucket/{name}/{key}
async fn update_bucket_item(
    State(state): State<AppState>,
    Path((name, key)): Path<(String, String)>,
    body: Bytes,
) -> Response {
    let key_bytes: Vec<u8> = if let Some(rest) = key.strip_prefix("timekey:") {
        match keys::time_key(rest) {
            Some(k) => k.to_vec(),
            None => return internal_error("failed to parse date"),
        }
    } else {
        key.into_bytes()
    };

    let value: Value = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(_) => return internal_error(ERR_BUCKET_ITEM_DECODE),
    };
    let encoded = match serde_json::to_string(&value) {
        Ok(s) => s,
        Err(_) => return internal_error("error encoding bucket item"),
    };

    // bolt's UpdateBucketItem required an existing bucket (no create)
    match state
        .store
        .put_item(name.trim(), &key_bytes, &encoded, false)
        .await
    {
        Ok(()) => json_response(&value),
        Err(_) => internal_error(ERR_BUCKET_ITEM_UPDATE),
    }
}

// DELETE /bucket/{name}/{key}
async fn delete_bucket_item(
    State(state): State<AppState>,
    Path((name, key)): Path<(String, String)>,
) -> Response {
    match state.store.delete_item(name.trim(), key.as_bytes()).await {
        Ok(()) => empty_ok(),
        Err(_) => internal_error(ERR_BUCKET_ITEM_DELETE),
    }
}

// GET /items/{name}?min=&max=&strict=&order=&num=&filter=
async fn get_bucket_items(
    State(state): State<AppState>,
    Path(name): Path<String>,
    Query(q): QueryMap,
) -> Response {
    let get = |k: &str| q.get(k).map(String::as_str).unwrap_or("");

    let is_strict = !get("strict").is_empty();
    let descending = get("order") != "asc";

    let (min_key, max_key) = if is_strict {
        (keys::key_strict(get("min")), keys::key_strict(get("max")))
    } else {
        let year = chrono::Duration::days(365);
        let min_default = keys::format_rfc3339_nano(chrono::Utc::now() - year);
        (
            keys::key_or_default(get("min"), &min_default),
            keys::key_or_default(get("max"), &keys::now_rfc3339_nano()),
        )
    };

    let mut num: i64 = get("num").parse().unwrap_or(0);
    if num < 1 {
        num = 100;
    }
    if num > 1000 {
        num = 1000;
    }

    let filter = get("filter").to_string();

    // strict mode with unparseable bounds aborts with null, as the bolt
    // cursor loop did when start/stop keys were empty
    if min_key.is_empty() || max_key.is_empty() {
        return json_response(&Value::Null);
    }

    if !state.store.bucket_exists(&name).await.unwrap_or(false) {
        return internal_error(ERR_BUCKET_MISSING);
    }

    // bolt cursor semantics: descending-strict excludes the max bound
    // (the cursor walked Prev() until start < max), all other bounds are
    // inclusive. Unfiltered queries fetch exactly `num` rows; filtered ones
    // stream the range in bounded batches and count matches, like the old
    // cursor iteration, so a large range never loads into memory at once.
    let batch_limit = if filter.is_empty() { num } else { 1000 };

    let mut window = KeyRange {
        min: min_key.clone(),
        max: max_key.clone(),
        min_exclusive: false,
        max_exclusive: descending && is_strict,
    };
    let mut first_batch = true;

    let mut items: Option<Vec<Value>> = None;
    let mut fetched = 0i64;

    'scan: loop {
        let rows = match state
            .store
            .range_items(&name, &window, descending, batch_limit)
            .await
        {
            Ok(rows) => rows,
            Err(e) => return internal_error(&e.0),
        };

        // ascending non-strict fallback: when nothing is >= min, bolt fell
        // back to c.First() and returned the oldest data below the window
        if first_batch && rows.is_empty() && !descending && !is_strict {
            let has_newer = state.store.has_key_ge(&name, &min_key).await.unwrap_or(true);
            if !has_newer {
                window.min = Vec::new(); // the empty key sorts before all keys
                first_batch = false;
                continue;
            }
        }
        first_batch = false;

        if rows.is_empty() {
            break;
        }
        let exhausted = (rows.len() as i64) < batch_limit;
        let last_key = rows.last().map(|(k, _)| k.clone()).unwrap_or_default();

        for (key, raw) in rows {
            let mut obj = match serde_json::from_str::<Value>(&raw) {
                Ok(Value::Object(m)) => m,
                // bolt aborted the scan on the first undecodable value,
                // returning what it had so far
                _ => break 'scan,
            };

            if !obj.contains_key("time") {
                obj.insert(
                    "time".to_string(),
                    Value::String(keys::key_to_time_string(&key)),
                );
            }
            let obj = Value::Object(obj);

            let keep = if filter.is_empty() {
                true
            } else {
                test_filter(&filter, &json!([obj])).unwrap_or(false)
            };

            if keep {
                items.get_or_insert_with(Vec::new).push(obj);
                fetched += 1;
                if fetched >= num {
                    break 'scan;
                }
            }
        }

        if exhausted {
            break;
        }
        // advance the keyset window past the last seen key
        if descending {
            window.max = last_key;
            window.max_exclusive = true;
        } else {
            window.min = last_key;
            window.min_exclusive = true;
        }
    }

    // nil slice encodes as null, like the Go handler's []interface{}
    json_response(&items)
}

// GET/PUT /config
async fn get_config(State(state): State<AppState>) -> Response {
    json_response(&state.config.load())
}

async fn set_config(State(state): State<AppState>, body: Bytes) -> Response {
    let new_config: crate::config::LogConfig = match serde_json::from_slice(&body) {
        Ok(c) => c,
        Err(e) => return http_error(&e.to_string(), StatusCode::BAD_REQUEST),
    };

    if let Err(e) = state.config.set_and_save(new_config.clone()) {
        return http_error(&e.to_string(), StatusCode::BAD_REQUEST);
    }
    json_response(&new_config)
}

// GET /stats
async fn get_stats(State(state): State<AppState>) -> Response {
    json_response(&json!({
        "Size": state.store.disk_size(),
        "Topics": state.topics_vec(),
    }))
}

// GET /stats/{name} -- bbolt BucketStats shape; only KeyN is meaningful now
async fn get_bucket_stats(State(state): State<AppState>, Path(name): Path<String>) -> Response {
    if !state.store.bucket_exists(&name).await.unwrap_or(false) {
        return internal_error(ERR_BUCKET_MISSING);
    }
    let key_n = state.store.count_items(&name).await.unwrap_or(0);
    json_response(&json!({
        "BranchPageN": 0,
        "BranchOverflowN": 0,
        "LeafPageN": 0,
        "LeafOverflowN": 0,
        "KeyN": key_n,
        "Depth": 0,
        "BranchAlloc": 0,
        "BranchInuse": 0,
        "LeafAlloc": 0,
        "LeafInuse": 0,
        "BucketN": 1,
        "InlineBucketN": 0,
        "InlineBucketInuse": 0,
    }))
}

// GET /topics
async fn get_topics(State(state): State<AppState>) -> Response {
    json_response(&state.topics_vec())
}
