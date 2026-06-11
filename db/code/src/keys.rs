//! Key encoding helpers ported from boltapi.go.
//!
//! Bucket keys are either 8-byte big-endian unix-nanosecond timestamps
//! ("timekeys") or arbitrary byte strings. BLOB memcmp ordering in SQL matches
//! bolt's byte-wise key ordering, so both kinds coexist in one index.

use chrono::{DateTime, TimeZone, Utc};

/// RFC3339Nano-style formatting: like Go's time.RFC3339Nano, the fractional
/// part is trimmed of trailing zeros and omitted entirely when zero.
pub fn format_rfc3339_nano(ts: DateTime<Utc>) -> String {
    let base = ts.format("%Y-%m-%dT%H:%M:%S").to_string();
    let nanos = ts.timestamp_subsec_nanos();
    if nanos == 0 {
        return format!("{}Z", base);
    }
    let mut frac = format!("{:09}", nanos);
    while frac.ends_with('0') {
        frac.pop();
    }
    format!("{}.{}Z", base, frac)
}

/// Parse an RFC3339(Nano) timestamp into an 8-byte big-endian unix-nano key.
pub fn time_key(s: &str) -> Option<[u8; 8]> {
    let ts = DateTime::parse_from_rfc3339(s).ok()?;
    let nanos = ts.with_timezone(&Utc).timestamp_nanos_opt()?;
    Some((nanos as u64).to_be_bytes())
}

/// Strict mode: unparseable input becomes an empty key, which aborts the query.
pub fn key_strict(s: &str) -> Vec<u8> {
    match time_key(s) {
        Some(k) => k.to_vec(),
        None => Vec::new(),
    }
}

/// Non-strict mode: fall back to the provided default timestamp.
pub fn key_or_default(s: &str, default: &str) -> Vec<u8> {
    if let Some(k) = time_key(s) {
        return k.to_vec();
    }
    time_key(default).map(|k| k.to_vec()).unwrap_or_default()
}

/// Derive a display timestamp from a key. 8-byte keys decode as unix nanos,
/// string keys parse as RFC3339; anything else yields the current time (the
/// bolt implementation behaved the same way for unparseable keys).
pub fn key_to_time_string(key: &[u8]) -> String {
    if key.len() == 8 {
        let nanos = u64::from_be_bytes(key.try_into().unwrap());
        return format_rfc3339_nano(Utc.timestamp_nanos(nanos as i64));
    }
    if let Ok(s) = std::str::from_utf8(key) {
        if let Ok(ts) = DateTime::parse_from_rfc3339(s) {
            return format_rfc3339_nano(ts.with_timezone(&Utc));
        }
    }
    format_rfc3339_nano(Utc::now())
}

pub fn now_rfc3339_nano() -> String {
    format_rfc3339_nano(Utc::now())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timekey_roundtrip() {
        let key = time_key("2026-06-11T01:02:03.5Z").unwrap();
        assert_eq!(key_to_time_string(&key), "2026-06-11T01:02:03.5Z");

        let key = time_key("2026-06-11T01:02:03Z").unwrap();
        assert_eq!(key_to_time_string(&key), "2026-06-11T01:02:03Z");

        // offsets normalize to UTC
        let key = time_key("2026-06-11T03:02:03+02:00").unwrap();
        assert_eq!(key_to_time_string(&key), "2026-06-11T01:02:03Z");
    }

    #[test]
    fn timekeys_order_bytewise() {
        let a = time_key("2026-01-01T00:00:00Z").unwrap();
        let b = time_key("2026-01-01T00:00:00.000000001Z").unwrap();
        let c = time_key("2026-06-11T00:00:00Z").unwrap();
        assert!(a < b && b < c);
    }

    #[test]
    fn strict_and_default() {
        assert!(key_strict("garbage").is_empty());
        assert_eq!(key_strict("1970-01-01T00:00:00Z"), vec![0u8; 8]);
        assert_eq!(
            key_or_default("garbage", "1970-01-01T00:00:00Z"),
            vec![0u8; 8]
        );
    }
}
