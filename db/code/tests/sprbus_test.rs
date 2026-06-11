mod common;

use common::test_env;
use dbapi::config::LogConfig;
use dbapi::sprbus::subscribe_and_listen;
use serde_json::json;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixListener;

#[tokio::test]
async fn subscribes_and_stores_matching_events() {
    let env = test_env("sprbus").await;

    // save only dns:serve: prefixed topics (plus the hardcoded alert: rule)
    env.state
        .config
        .set_and_save(LogConfig {
            save_events: Some(vec!["dns:serve:".into()]),
            max_size: 1000000,
            topic_limits: None,
        })
        .unwrap();

    let sock = env.dir.join("eventbus.sock");
    let listener = UnixListener::bind(&sock).unwrap();

    let server = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.unwrap();
        let (read_half, mut write_half) = stream.into_split();

        // client must announce a subscription first
        let mut lines = BufReader::new(read_half).lines();
        let sub = lines.next_line().await.unwrap().unwrap();
        let msg: serde_json::Value = serde_json::from_str(&sub).unwrap();
        assert_eq!(msg["topic"], "subscribe:");

        for (topic, value) in [
            ("dns:serve:wan", json!({"FirstName":"a.com."}).to_string()),
            ("alert:wifi", json!({"Title":"t"}).to_string()),
            ("ignored:topic", json!({"x":1}).to_string()),
            ("dns:serve:wan", "not json".to_string()),
        ] {
            let line = serde_json::to_string(&json!({"topic": topic, "value": value})).unwrap();
            write_half
                .write_all(format!("{}\n", line).as_bytes())
                .await
                .unwrap();
        }
        // half-close: client sees EOF and returns
    });

    subscribe_and_listen(&env.state, sock.to_str().unwrap(), false)
        .await
        .unwrap();
    server.await.unwrap();

    // matching events stored under their topic bucket
    assert_eq!(env.state.store.count_items("dns:serve:wan").await.unwrap(), 1);
    assert_eq!(env.state.store.count_items("alert:wifi").await.unwrap(), 1);
    // non-matching topic not stored
    assert!(!env.state.store.bucket_exists("ignored:topic").await.unwrap());

    // every topic was recorded for /topics, stored or not
    let topics = env.state.topics.lock().unwrap().clone();
    assert!(topics.contains("ignored:topic"));
    assert!(topics.contains("dns:serve:wan"));
}
