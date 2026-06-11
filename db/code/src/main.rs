//! dbapi: SPR event database plugin (Turso-backed).
//!
//! Server mode subscribes to sprbus events and serves the REST API on the
//! plugin unix socket. -dump / -b are read-only CLI inspection modes,
//! matching the bolt-era binary.

use std::collections::BTreeSet;
use std::sync::{Arc, Mutex};

use dbapi::api::{router, AppState};
use dbapi::config::ConfigStore;
use dbapi::retention;
use dbapi::sprbus;
use dbapi::store::Store;

struct Args {
    dbpath: String,
    config: String,
    debug: bool,
    dump: bool,
    bucket: String,
}

fn parse_args() -> Args {
    let prefix = std::env::var("TEST_PREFIX").unwrap_or_default();
    let mut args = Args {
        dbpath: format!("{}/state/plugins/db/logs.sql.db", prefix),
        config: format!("{}/configs/db/config.json", prefix),
        debug: false,
        dump: false,
        bucket: String::new(),
    };

    let mut it = std::env::args().skip(1);
    while let Some(arg) = it.next() {
        // accept both -flag value and -flag=value, single or double dash
        let (flag, inline) = match arg.trim_start_matches('-').split_once('=') {
            Some((f, v)) => (f.to_string(), Some(v.to_string())),
            None => (arg.trim_start_matches('-').to_string(), None),
        };
        let value = |it: &mut dyn Iterator<Item = String>| {
            inline.clone().or_else(|| it.next()).unwrap_or_default()
        };
        match flag.as_str() {
            "dbpath" => args.dbpath = value(&mut it),
            "config" => args.config = value(&mut it),
            "b" => args.bucket = value(&mut it),
            "debug" => args.debug = true,
            "dump" => args.dump = true,
            other => {
                eprintln!("unknown flag: -{}", other);
                std::process::exit(2);
            }
        }
    }
    args
}

async fn cli(store: &Store, bucket: &str) {
    if !bucket.is_empty() {
        let items = match store.bucket_items(bucket).await {
            Ok(items) => items,
            Err(e) => {
                eprintln!("{}", e);
                return;
            }
        };
        for (key, raw) in items {
            let mut value: serde_json::Value =
                serde_json::from_str(&raw).unwrap_or(serde_json::Value::Null);
            if let serde_json::Value::Object(obj) = &mut value {
                if !obj.contains_key("time") {
                    obj.insert(
                        "time".into(),
                        serde_json::Value::String(dbapi::keys::key_to_time_string(&key)),
                    );
                }
            }
            println!("[{}] {}", bucket, value);
        }
        return;
    }

    match store.list_buckets().await {
        Ok(names) => {
            for name in &names {
                println!("{}", name);
            }
        }
        Err(e) => eprintln!("{}", e),
    }
    println!("TOTAL DB MB: {}", store.disk_size() / 1024 / 1024);
}

#[tokio::main]
async fn main() {
    let args = parse_args();
    let prefix = std::env::var("TEST_PREFIX").unwrap_or_default();

    eprintln!("database initd");

    let store = match Store::open(&args.dbpath).await {
        Ok(store) => Arc::new(store),
        Err(e) => {
            eprintln!("failed to open database {}: {}", args.dbpath, e);
            std::process::exit(1);
        }
    };

    if args.dump || !args.bucket.is_empty() {
        cli(&store, &args.bucket).await;
        return;
    }

    let config = Arc::new(ConfigStore::setup(&args.config));

    // pre-seed the topics list from configured events, like the bolt main()
    let topics: BTreeSet<String> = config
        .get()
        .save_events
        .unwrap_or_default()
        .into_iter()
        .collect();

    let state = AppState {
        store: store.clone(),
        config: config.clone(),
        topics: Arc::new(Mutex::new(topics)),
    };

    // periodic size check / retention sweep
    tokio::spawn(retention::check_size_loop(
        store.clone(),
        config.clone(),
        args.debug,
    ));

    // subscribe to sprbus and store configured events
    tokio::spawn(sprbus::run(state.clone(), args.debug));

    let socket_path = format!("{}/state/plugins/db/socket", prefix);
    if let Some(parent) = std::path::Path::new(&socket_path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::remove_file(&socket_path);

    let listener = match tokio::net::UnixListener::bind(&socket_path) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("failed to bind {}: {}", socket_path, e);
            std::process::exit(1);
        }
    };

    eprintln!("serving {}", socket_path);
    if let Err(e) = axum::serve(listener, router(state)).await {
        eprintln!("server error: {}", e);
        std::process::exit(1);
    }
}
