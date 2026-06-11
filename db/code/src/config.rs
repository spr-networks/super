//! LogConfig handling, ported from boltapi.go (loadConfig/saveConfig/SetupConfig).
//! The JSON shape on disk and over /config is unchanged, including `null` for
//! absent lists (Go nil slices) and the one-space MarshalIndent formatting.

use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::Path;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TopicLimit {
    #[serde(rename = "Name")]
    pub name: String,
    #[serde(rename = "Size")]
    pub size: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LogConfig {
    #[serde(rename = "SaveEvents")]
    pub save_events: Option<Vec<String>>,
    #[serde(rename = "MaxSize")]
    pub max_size: u64,
    #[serde(rename = "TopicLimits")]
    #[serde(default)]
    pub topic_limits: Option<Vec<TopicLimit>>,
}

impl Default for LogConfig {
    fn default() -> Self {
        LogConfig {
            save_events: Some(
                [
                    "log:api",
                    "dns:block:event",
                    "dns:override:event",
                    "dns:serve:",
                    "wifi:auth:",
                    "auth:failure:",
                ]
                .iter()
                .map(|s| s.to_string())
                .collect(),
            ),
            max_size: 250 * 1024 * 1024,
            topic_limits: None,
        }
    }
}

pub struct ConfigStore {
    pub path: String,
    current: Mutex<LogConfig>,
}

impl ConfigStore {
    /// Load (or initialize) the config, applying the legacy
    /// "dns:serve:event" -> "dns:serve:" rename like SetupConfig did.
    pub fn setup(path: &str) -> ConfigStore {
        let mut config = load_config(path);

        let mut updated = false;
        if let Some(events) = config.save_events.as_mut() {
            for topic in events.iter_mut() {
                if topic == "dns:serve:event" {
                    *topic = "dns:serve:".to_string();
                    updated = true;
                }
            }
        }
        if updated {
            let _ = save_config(path, &config);
        }

        ConfigStore {
            path: path.to_string(),
            current: Mutex::new(config),
        }
    }

    /// GET /config reads from disk every time, like loadConfig().
    pub fn load(&self) -> LogConfig {
        load_config(&self.path)
    }

    pub fn get(&self) -> LogConfig {
        self.current.lock().unwrap().clone()
    }

    pub fn set_and_save(&self, config: LogConfig) -> std::io::Result<()> {
        save_config(&self.path, &config)?;
        *self.current.lock().unwrap() = config;
        Ok(())
    }
}

fn load_config(path: &str) -> LogConfig {
    let default = LogConfig::default();
    match std::fs::read(path) {
        Err(_) => {
            log::warn("[-] Empty db configuration, initializing");
            default
        }
        Ok(data) => match serde_json::from_slice(&data) {
            Ok(config) => config,
            Err(_) => {
                log::warn("[-] Failed to decode db configuration, initializing");
                default
            }
        },
    }
}

fn save_config(path: &str, config: &LogConfig) -> std::io::Result<()> {
    // Go used json.MarshalIndent(config, "", " ") -- one-space indent.
    let mut buf = Vec::new();
    let fmt = serde_json::ser::PrettyFormatter::with_indent(b" ");
    let mut ser = serde_json::Serializer::with_formatter(&mut buf, fmt);
    config
        .serialize(&mut ser)
        .map_err(std::io::Error::other)?;

    if let Some(parent) = Path::new(path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let mut file = std::fs::File::create(path)?;
    set_mode_0600(&file);
    file.write_all(&buf)
}

#[cfg(unix)]
fn set_mode_0600(file: &std::fs::File) {
    use std::os::unix::fs::PermissionsExt;
    let _ = file.set_permissions(std::fs::Permissions::from_mode(0o600));
}

pub mod log {
    pub fn warn(msg: &str) {
        eprintln!("{}", msg);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_and_rename_migration() {
        let dir = tempdir();
        let path = dir.join("config.json");
        let path_s = path.to_str().unwrap();

        std::fs::write(
            &path,
            r#"{"SaveEvents":["dns:serve:event","wifi:auth:"],"MaxSize":1000}"#,
        )
        .unwrap();

        let store = ConfigStore::setup(path_s);
        let config = store.get();
        assert_eq!(
            config.save_events.as_ref().unwrap(),
            &vec!["dns:serve:".to_string(), "wifi:auth:".to_string()]
        );
        assert_eq!(config.max_size, 1000);

        // rename was persisted
        let raw = std::fs::read_to_string(&path).unwrap();
        assert!(raw.contains("dns:serve:"));
        assert!(!raw.contains("dns:serve:event"));
        // nil TopicLimits serializes as null, like Go
        assert!(raw.contains("\"TopicLimits\": null"));
    }

    #[test]
    fn missing_file_yields_default() {
        let dir = tempdir();
        let store = ConfigStore::setup(dir.join("nope.json").to_str().unwrap());
        assert_eq!(store.get(), LogConfig::default());
    }

    fn tempdir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "dbapi-config-test-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }
}
