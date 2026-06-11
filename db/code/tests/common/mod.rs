// helpers are shared across test binaries; not all binaries use all of them
#![allow(dead_code)]

use std::collections::BTreeSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use tower::ServiceExt;

use dbapi::api::{router, AppState};
use dbapi::config::ConfigStore;
use dbapi::store::Store;

pub struct TestEnv {
    pub dir: PathBuf,
    pub state: AppState,
    pub app: Router,
}

pub fn tempdir(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "dbapi-test-{}-{}-{:?}",
        tag,
        std::process::id(),
        std::thread::current().id()
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

pub async fn test_env(tag: &str) -> TestEnv {
    let dir = tempdir(tag);
    let store = Arc::new(
        Store::open(dir.join("logs.sql.db").to_str().unwrap())
            .await
            .unwrap(),
    );
    let config = Arc::new(ConfigStore::setup(
        dir.join("config.json").to_str().unwrap(),
    ));
    let state = AppState {
        store,
        config,
        topics: Arc::new(Mutex::new(BTreeSet::new())),
    };
    let app = router(state.clone());
    TestEnv { dir, state, app }
}

pub async fn request(
    app: &Router,
    method: &str,
    uri: &str,
    body: Option<&str>,
) -> (StatusCode, String) {
    let req = Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", "application/json")
        .body(match body {
            Some(b) => Body::from(b.to_string()),
            None => Body::empty(),
        })
        .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (status, String::from_utf8_lossy(&bytes).into_owned())
}

pub async fn get_json(app: &Router, uri: &str) -> serde_json::Value {
    let (status, body) = request(app, "GET", uri, None).await;
    assert_eq!(status, StatusCode::OK, "GET {} -> {} {}", uri, status, body);
    serde_json::from_str(&body).unwrap()
}
