//! sprbus-json subscriber: newline-delimited JSON over the api container's
//! unix socket. Subscribing means writing {"topic":"subscribe:<prefix>"} and
//! reading {"topic","value"} event lines.

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixStream;

use crate::api::{put_item_json, AppState};

#[derive(Serialize, Deserialize)]
struct Message {
    topic: String,
    #[serde(default)]
    value: String,
}

pub fn event_sock_path() -> String {
    format!(
        "{}/state/api/eventbus.sock",
        std::env::var("TEST_PREFIX").unwrap_or_default()
    )
}

/// Store an event when its topic starts with "alert:" (always kept) or
/// matches a configured SaveEvents prefix. Port of shouldLogEvent.
fn should_log_event(state: &AppState, topic: &str) -> bool {
    if topic.starts_with("alert:") {
        return true;
    }
    if let Some(events) = state.config.get().save_events {
        return events.iter().any(|prefix| topic.starts_with(prefix));
    }
    false
}

pub async fn handle_log_event(state: &AppState, topic: &str, value: &str, debug: bool) {
    // keep a list of unique events for /topics and /stats
    state.log_event(topic);

    if !should_log_event(state, topic) {
        return;
    }

    if debug {
        eprintln!("[event] {} {}", topic, value);
    }

    let json_data = match serde_json::from_str::<serde_json::Value>(value) {
        Ok(serde_json::Value::Object(m)) => m,
        _ => {
            eprintln!("db store, invalid json");
            return;
        }
    };

    if let Err(e) = put_item_json(&state.store, topic, json_data).await {
        eprintln!("error saving data: {}", e);
    }
}

pub async fn subscribe_and_listen(
    state: &AppState,
    socket: &str,
    debug: bool,
) -> std::io::Result<()> {
    let stream = UnixStream::connect(socket).await?;
    let (read_half, mut write_half) = stream.into_split();

    let sub = serde_json::to_string(&Message {
        topic: "subscribe:".to_string(), // empty prefix: all topics
        value: String::new(),
    })
    .unwrap();
    write_half.write_all(format!("{}\n", sub).as_bytes()).await?;

    let mut lines = BufReader::new(read_half).lines();
    while let Some(line) = lines.next_line().await? {
        if line.is_empty() {
            continue;
        }
        match serde_json::from_str::<Message>(&line) {
            Ok(msg) => handle_log_event(state, &msg.topic, &msg.value, debug).await,
            Err(e) => eprintln!("sprbus: invalid message: {}", e),
        }
    }
    Ok(())
}

/// Subscription loop matching the bolt-era main(): retry/reconnect with a 3s
/// pause, give up for good after 30 failures (the container gets restarted).
pub async fn run(state: AppState, debug: bool) {
    let socket = event_sock_path();
    for _ in 0..30 {
        match subscribe_and_listen(&state, &socket, debug).await {
            Ok(()) => eprintln!("sprbus: connection closed"),
            Err(e) => eprintln!("sprbus: {}", e),
        }
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
    }
    eprintln!("failed to establish connection to sprbus");
    if std::env::var("TEST_PREFIX").unwrap_or_default().is_empty() {
        std::process::exit(1);
    }
}
