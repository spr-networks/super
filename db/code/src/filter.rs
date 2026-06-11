//! JSONPath filter evaluation for the /items `filter` query param,
//! porting testFilter/isEmpty from boltapi.go (gval+jsonpath) onto
//! RFC 9535 (serde_json_path).
//!
//! The frontend's filter builder emits gval's regex operator
//! (`@.Field=~"re"`), which RFC 9535 spells `search(@.Field, "re")`;
//! expressions are rewritten before parsing.

use serde_json::Value;
use serde_json_path::JsonPath;

/// Evaluate a JSONPath expression against an event. As in the bolt-era code,
/// the result only signals whether anything non-empty matched; callers pass
/// the item wrapped in a one-element array.
pub fn test_filter(expr: &str, event: &Value) -> Result<bool, String> {
    let rewritten = rewrite_regex_ops(expr);
    let path = JsonPath::parse(&rewritten).map_err(|e| e.to_string())?;
    let nodes = path.query(event);
    match nodes.len() {
        0 => Ok(false),
        1 => Ok(!is_empty(nodes.first().unwrap())),
        _ => Ok(true),
    }
}

/// Port of isEmpty: null, and zero-length strings/arrays/objects are empty.
fn is_empty(v: &Value) -> bool {
    match v {
        Value::Null => true,
        Value::String(s) => s.is_empty(),
        Value::Array(a) => a.is_empty(),
        Value::Object(o) => o.is_empty(),
        _ => false,
    }
}

/// Rewrite gval `<lhs>=~"<re>"` comparisons into RFC 9535 `search(<lhs>, "<re>")`.
fn rewrite_regex_ops(expr: &str) -> String {
    let bytes = expr.as_bytes();
    let mut out = String::with_capacity(expr.len());
    let mut i = 0;

    while i < bytes.len() {
        if bytes[i] == b'=' && i + 1 < bytes.len() && bytes[i + 1] == b'~' {
            // backtrack over the left-hand side: trailing spaces, then a
            // run of path characters (@.Foo.Bar, @['x'], etc.)
            let trimmed = out.trim_end();

            let lhs_start = trimmed
                .rfind(|c: char| {
                    !(c.is_alphanumeric()
                        || matches!(c, '@' | '.' | '_' | '[' | ']' | '\'' | '"' | '-' | '$'))
                })
                .map(|p| p + 1)
                .unwrap_or(0);
            let lhs = trimmed[lhs_start..].to_string();

            // right-hand side: optional spaces then a quoted string
            let mut j = i + 2;
            while j < bytes.len() && bytes[j] == b' ' {
                j += 1;
            }
            if !lhs.is_empty() && j < bytes.len() && (bytes[j] == b'"' || bytes[j] == b'\'') {
                let quote = bytes[j];
                let mut k = j + 1;
                while k < bytes.len() && bytes[k] != quote {
                    if bytes[k] == b'\\' {
                        k += 1;
                    }
                    k += 1;
                }
                if k < bytes.len() {
                    let rhs = &expr[j..=k];
                    out.truncate(lhs_start);
                    out.push_str(&format!("search({}, {})", lhs, rhs));
                    i = k + 1;
                    continue;
                }
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn event() -> Value {
        json!([{
            "Remote": "wan",
            "Type": "NOERROR",
            "MAC": "a0:11:22:33:44:55",
            "DNS": {"FirstName": "example.com."},
        }])
    }

    #[test]
    fn frontend_equality_filters() {
        assert!(test_filter(r#"$[?(@.Remote=="wan")]"#, &event()).unwrap());
        assert!(!test_filter(r#"$[?(@.Remote=="lan")]"#, &event()).unwrap());
        assert!(
            test_filter(r#"$[?(@.Type=="NOERROR" && @.Remote=="wan")]"#, &event()).unwrap()
        );
        assert!(test_filter(r#"$[?(@.DNS.FirstName=="example.com.")]"#, &event()).unwrap());
    }

    #[test]
    fn regex_op_rewrite() {
        assert_eq!(
            rewrite_regex_ops(r#"$[?(@.MAC=~"a0")]"#),
            r#"$[?(search(@.MAC, "a0"))]"#
        );
        assert_eq!(
            rewrite_regex_ops(r#"$[?(@.MAC =~ "a0" && @.Remote=="wan")]"#),
            r#"$[?(search(@.MAC, "a0") && @.Remote=="wan")]"#
        );
        assert!(test_filter(r#"$[?(@.MAC=~"a0")]"#, &event()).unwrap());
        assert!(!test_filter(r#"$[?(@.MAC=~"ff")]"#, &event()).unwrap());
    }

    #[test]
    fn invalid_expression_errors() {
        assert!(test_filter("$[?(", &event()).is_err());
    }
}
