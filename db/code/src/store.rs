//! Turso-backed storage replacing bbolt.
//!
//! One table per concern: `buckets` keeps bucket existence (bolt buckets exist
//! independently of items), `items` holds (bucket, key BLOB, value JSON-text)
//! with a unique (bucket, key) index. BLOB keys preserve bolt's byte-wise
//! ordering, so timekeys and string keys sort exactly as before.
//!
//! A single turso Connection rejects concurrent use, so all access is
//! serialized through one tokio Mutex. Compaction (VACUUM INTO + rename)
//! drops and reopens the handles under that same lock.

use tokio::sync::Mutex;
use turso::{Builder, Connection, Database, Value};

// Error strings preserved from the bolt-era API responses.
pub const ERR_BUCKET_MISSING: &str = "bucket doesn't exist";
pub const ERR_BUCKET_EXISTS: &str = "bucket already exists";
pub const ERR_BUCKET_NOT_FOUND: &str = "bucket not found";

#[derive(Debug)]
pub struct Error(pub String);

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for Error {}

impl From<turso::Error> for Error {
    fn from(e: turso::Error) -> Self {
        Error(e.to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;

struct Handles {
    // Database must outlive its connections; kept for drop ordering.
    _db: Database,
    conn: Connection,
}

struct Inner {
    handles: Option<Handles>,
}

pub struct Store {
    path: String,
    inner: Mutex<Inner>,
}

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS buckets (name TEXT PRIMARY KEY NOT NULL);
CREATE TABLE IF NOT EXISTS items (
    bucket TEXT NOT NULL,
    key    BLOB NOT NULL,
    value  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_bucket_key ON items (bucket, key);
";

async fn open_handles(path: &str) -> Result<Handles> {
    let db = Builder::new_local(path).build().await?;
    let conn = db.connect()?;
    conn.execute_batch(SCHEMA).await?;
    Ok(Handles { _db: db, conn })
}

impl Store {
    pub async fn open(path: &str) -> Result<Store> {
        let handles = open_handles(path).await?;
        Ok(Store {
            path: path.to_string(),
            inner: Mutex::new(Inner {
                handles: Some(handles),
            }),
        })
    }

    pub fn path(&self) -> &str {
        &self.path
    }

    /// File size of the database plus its WAL, for /stats and retention.
    pub fn disk_size(&self) -> i64 {
        let mut size = std::fs::metadata(&self.path)
            .map(|m| m.len() as i64)
            .unwrap_or(0);
        if let Ok(m) = std::fs::metadata(format!("{}-wal", self.path)) {
            size += m.len() as i64;
        }
        size
    }

    pub async fn list_buckets(&self) -> Result<Vec<String>> {
        let inner = self.inner.lock().await;
        let conn = conn(&inner)?;
        let mut rows = conn
            .query("SELECT name FROM buckets ORDER BY name", ())
            .await?;
        let mut names = Vec::new();
        while let Some(row) = rows.next().await? {
            names.push(text(row.get_value(0)?));
        }
        Ok(names)
    }

    pub async fn bucket_exists(&self, name: &str) -> Result<bool> {
        let inner = self.inner.lock().await;
        bucket_exists(conn(&inner)?, name).await
    }

    pub async fn create_bucket(&self, name: &str) -> Result<()> {
        let inner = self.inner.lock().await;
        let conn = conn(&inner)?;
        if bucket_exists(conn, name).await? {
            return Err(Error(ERR_BUCKET_EXISTS.into()));
        }
        conn.execute("INSERT OR IGNORE INTO buckets(name) VALUES (?)", (name,))
            .await?;
        Ok(())
    }

    pub async fn delete_bucket(&self, name: &str) -> Result<()> {
        let inner = self.inner.lock().await;
        let conn = conn(&inner)?;
        if !bucket_exists(conn, name).await? {
            return Err(Error(ERR_BUCKET_NOT_FOUND.into()));
        }
        conn.execute("BEGIN", ()).await?;
        let res: Result<()> = async {
            conn.execute("DELETE FROM items WHERE bucket = ?", (name,))
                .await?;
            conn.execute("DELETE FROM buckets WHERE name = ?", (name,))
                .await?;
            Ok(())
        }
        .await;
        finish_tx(conn, res).await
    }

    /// All items of a bucket in ascending key order.
    /// Errors with ERR_BUCKET_MISSING when the bucket doesn't exist.
    pub async fn bucket_items(&self, name: &str) -> Result<Vec<(Vec<u8>, String)>> {
        let inner = self.inner.lock().await;
        let conn = conn(&inner)?;
        if !bucket_exists(conn, name).await? {
            return Err(Error(ERR_BUCKET_MISSING.into()));
        }
        let mut rows = conn
            .query(
                "SELECT key, value FROM items WHERE bucket = ? ORDER BY key ASC",
                (name,),
            )
            .await?;
        let mut items = Vec::new();
        while let Some(row) = rows.next().await? {
            items.push((blob(row.get_value(0)?), text(row.get_value(1)?)));
        }
        Ok(items)
    }

    /// Store an item, creating the bucket when allowed (bolt's
    /// CreateBucketIfNotExists vs. plain Bucket lookup).
    pub async fn put_item(
        &self,
        bucket: &str,
        key: &[u8],
        value: &str,
        create_bucket: bool,
    ) -> Result<()> {
        let inner = self.inner.lock().await;
        let conn = conn(&inner)?;
        if !create_bucket && !bucket_exists(conn, bucket).await? {
            return Err(Error(ERR_BUCKET_MISSING.into()));
        }
        conn.execute("BEGIN", ()).await?;
        let res: Result<()> = async {
            conn.execute("INSERT OR IGNORE INTO buckets(name) VALUES (?)", (bucket,))
                .await?;
            conn.execute(
                "INSERT OR REPLACE INTO items(bucket, key, value) VALUES (?, ?, ?)",
                (bucket, key.to_vec(), value),
            )
            .await?;
            Ok(())
        }
        .await;
        finish_tx(conn, res).await
    }

    /// Get one item. Errors with ERR_BUCKET_MISSING when the bucket doesn't
    /// exist; a missing key yields Ok(None) (bolt returned a nil value).
    pub async fn get_item(&self, bucket: &str, key: &[u8]) -> Result<Option<String>> {
        let inner = self.inner.lock().await;
        let conn = conn(&inner)?;
        if !bucket_exists(conn, bucket).await? {
            return Err(Error(ERR_BUCKET_MISSING.into()));
        }
        let mut rows = conn
            .query(
                "SELECT value FROM items WHERE bucket = ? AND key = ?",
                (bucket, key.to_vec()),
            )
            .await?;
        match rows.next().await? {
            Some(row) => Ok(Some(text(row.get_value(0)?))),
            None => Ok(None),
        }
    }

    /// Delete one item. Deleting an absent key succeeds, like bolt.
    pub async fn delete_item(&self, bucket: &str, key: &[u8]) -> Result<()> {
        let inner = self.inner.lock().await;
        let conn = conn(&inner)?;
        if !bucket_exists(conn, bucket).await? {
            return Err(Error(ERR_BUCKET_MISSING.into()));
        }
        conn.execute(
            "DELETE FROM items WHERE bucket = ? AND key = ?",
            (bucket, key.to_vec()),
        )
        .await?;
        Ok(())
    }

    pub async fn count_items(&self, bucket: &str) -> Result<i64> {
        let inner = self.inner.lock().await;
        let conn = conn(&inner)?;
        let mut rows = conn
            .query("SELECT COUNT(*) FROM items WHERE bucket = ?", (bucket,))
            .await?;
        let row = rows.next().await?.ok_or_else(|| Error("no count".into()))?;
        Ok(int(row.get_value(0)?))
    }

    /// Indexed range scan. `max_exclusive` reproduces the bolt cursor's
    /// descending-strict semantics where the max bound is excluded.
    /// `limit` of None streams the full range (used by filtered queries,
    /// which count matches rather than rows).
    pub async fn range_items(
        &self,
        bucket: &str,
        min: &[u8],
        max: &[u8],
        descending: bool,
        max_exclusive: bool,
        limit: Option<i64>,
    ) -> Result<Vec<(Vec<u8>, String)>> {
        let inner = self.inner.lock().await;
        let conn = conn(&inner)?;
        let max_op = if max_exclusive { "<" } else { "<=" };
        let order = if descending { "DESC" } else { "ASC" };
        let sql = format!(
            "SELECT key, value FROM items WHERE bucket = ? AND key >= ? AND key {} ? ORDER BY key {}{}",
            max_op,
            order,
            limit.map(|n| format!(" LIMIT {}", n)).unwrap_or_default()
        );
        let mut rows = conn
            .query(&sql, (bucket, min.to_vec(), max.to_vec()))
            .await?;
        let mut items = Vec::new();
        while let Some(row) = rows.next().await? {
            items.push((blob(row.get_value(0)?), text(row.get_value(1)?)));
        }
        Ok(items)
    }

    /// True when the bucket has any key >= min. Drives the bolt cursor
    /// fallback: ascending non-strict queries fell back to c.First() only
    /// when Seek(min) found nothing.
    pub async fn has_key_ge(&self, bucket: &str, min: &[u8]) -> Result<bool> {
        let inner = self.inner.lock().await;
        let conn = conn(&inner)?;
        let mut rows = conn
            .query(
                "SELECT 1 FROM items WHERE bucket = ? AND key >= ? LIMIT 1",
                (bucket, min.to_vec()),
            )
            .await?;
        Ok(rows.next().await?.is_some())
    }

    /// Ascending scan without a lower bound, for the bolt c.First() fallback.
    pub async fn items_until(
        &self,
        bucket: &str,
        max: &[u8],
        limit: Option<i64>,
    ) -> Result<Vec<(Vec<u8>, String)>> {
        let inner = self.inner.lock().await;
        let conn = conn(&inner)?;
        let sql = format!(
            "SELECT key, value FROM items WHERE bucket = ? AND key <= ? ORDER BY key ASC{}",
            limit.map(|n| format!(" LIMIT {}", n)).unwrap_or_default()
        );
        let mut rows = conn.query(&sql, (bucket, max.to_vec())).await?;
        let mut items = Vec::new();
        while let Some(row) = rows.next().await? {
            items.push((blob(row.get_value(0)?), text(row.get_value(1)?)));
        }
        Ok(items)
    }

    /// Delete the oldest n items of a bucket (retention haircut).
    /// Turso has no DELETE..LIMIT; keys are unique per bucket so deleting
    /// below the n-th key removes exactly n rows.
    pub async fn delete_oldest(&self, bucket: &str, n: i64) -> Result<()> {
        if n <= 0 {
            return Ok(());
        }
        let inner = self.inner.lock().await;
        let conn = conn(&inner)?;
        conn.execute(
            "DELETE FROM items WHERE bucket = ?1 AND key < \
             (SELECT key FROM items WHERE bucket = ?1 ORDER BY key ASC LIMIT 1 OFFSET ?2)",
            (bucket, n),
        )
        .await?;
        Ok(())
    }

    /// Compact via VACUUM INTO + rename + reopen, replacing bolt.Compact.
    /// All statements are closed before the VACUUM (turso refuses otherwise)
    /// and the old WAL/SHM files are removed before the rename so a stale WAL
    /// is never replayed onto the compacted file.
    pub async fn compact(&self) -> Result<()> {
        let mut inner = self.inner.lock().await;

        let tmp = format!("{}.tmp", self.path);
        let _ = std::fs::remove_file(&tmp);

        conn(&inner)?
            .execute(&format!("VACUUM INTO '{}'", tmp.replace('\'', "''")), ())
            .await?;

        inner.handles = None; // close db + connection

        let _ = std::fs::remove_file(format!("{}-wal", self.path));
        let _ = std::fs::remove_file(format!("{}-shm", self.path));
        std::fs::rename(&tmp, &self.path).map_err(|e| Error(e.to_string()))?;

        inner.handles = Some(open_handles(&self.path).await?);
        Ok(())
    }
}

fn conn(inner: &Inner) -> Result<&Connection> {
    inner
        .handles
        .as_ref()
        .map(|h| &h.conn)
        .ok_or_else(|| Error("database is closed".into()))
}

async fn bucket_exists(conn: &Connection, name: &str) -> Result<bool> {
    let mut rows = conn
        .query("SELECT 1 FROM buckets WHERE name = ? LIMIT 1", (name,))
        .await?;
    Ok(rows.next().await?.is_some())
}

async fn finish_tx(conn: &Connection, res: Result<()>) -> Result<()> {
    match res {
        Ok(()) => {
            conn.execute("COMMIT", ()).await?;
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", ()).await;
            Err(e)
        }
    }
}

fn text(v: Value) -> String {
    match v {
        Value::Text(s) => s,
        Value::Blob(b) => String::from_utf8_lossy(&b).into_owned(),
        other => format!("{:?}", other),
    }
}

fn blob(v: Value) -> Vec<u8> {
    match v {
        Value::Blob(b) => b,
        Value::Text(s) => s.into_bytes(),
        other => format!("{:?}", other).into_bytes(),
    }
}

fn int(v: Value) -> i64 {
    match v {
        Value::Integer(i) => i,
        _ => 0,
    }
}
