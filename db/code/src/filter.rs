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
    let mut out = String::with_capacity(expr.len());
    let mut rest = expr;

    while let Some(pos) = rest.find("=~") {
        let before = &rest[..pos];
        let after = &rest[pos + 2..];

        if let Some((prefix, lhs)) = split_lhs(before) {
            if let Some((rhs, remainder)) = take_quoted(after.trim_start()) {
                out.push_str(prefix);
                out.push_str("search(");
                out.push_str(lhs);
                out.push_str(", ");
                out.push_str(rhs);
                out.push(')');
                rest = remainder;
                continue;
            }
        }

        // not a rewritable occurrence: emit verbatim and move on
        out.push_str(before);
        out.push_str("=~");
        rest = after;
    }
    out.push_str(rest);
    out
}

/// Split off the trailing run of path characters (@.Foo.Bar, @['x'], ...)
/// before the operator. Returns (prefix, lhs); None when there is no lhs.
fn split_lhs(before: &str) -> Option<(&str, &str)> {
    let trimmed = before.trim_end();
    let lhs_start = trimmed
        .char_indices()
        .rev()
        .take_while(|(_, c)| {
            c.is_alphanumeric()
                || matches!(c, '@' | '.' | '_' | '[' | ']' | '\'' | '"' | '-' | '$')
        })
        .last()
        .map(|(i, _)| i)?;
    Some((&trimmed[..lhs_start], &trimmed[lhs_start..]))
}

/// Take a leading quoted string (honoring backslash escapes), returning it
/// and the remainder after the closing quote.
fn take_quoted(s: &str) -> Option<(&str, &str)> {
    let quote = match s.chars().next() {
        Some(q @ ('"' | '\'')) => q,
        _ => return None,
    };
    let mut escaped = false;
    for (i, c) in s.char_indices().skip(1) {
        if escaped {
            escaped = false;
        } else if c == '\\' {
            escaped = true;
        } else if c == quote {
            let end = i + quote.len_utf8();
            return Some((&s[..end], &s[end..]));
        }
    }
    None
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

    #[test]
    fn non_ascii_expressions_pass_through_intact() {
        // no =~ at all: must be byte-identical
        assert_eq!(
            rewrite_regex_ops(r#"$[?(@.City=="Zürich")]"#),
            r#"$[?(@.City=="Zürich")]"#
        );
        // =~ with non-ASCII in the pattern and elsewhere
        assert_eq!(
            rewrite_regex_ops(r#"$[?(@.Café=="ok" && @.City=~"Zü.*")]"#),
            r#"$[?(@.Café=="ok" && search(@.City, "Zü.*"))]"#
        );

        let ev = json!([{ "City": "Zürich" }]);
        assert!(test_filter(r#"$[?(@.City=="Zürich")]"#, &ev).unwrap());
        assert!(test_filter(r#"$[?(@.City=~"Zü")]"#, &ev).unwrap());
        assert!(!test_filter(r#"$[?(@.City=~"München")]"#, &ev).unwrap());
    }

    #[test]
    fn escaped_quotes_in_pattern() {
        assert_eq!(
            rewrite_regex_ops(r#"$[?(@.f=~"a\"b")]"#),
            r#"$[?(search(@.f, "a\"b"))]"#
        );
        // unterminated quote: left untouched rather than mangled
        assert_eq!(rewrite_regex_ops(r#"$[?(@.f=~"abc)]"#), r#"$[?(@.f=~"abc)]"#);
    }
}
