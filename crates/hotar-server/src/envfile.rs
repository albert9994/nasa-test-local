//! Local configuration files for the advisor (`LLM_*`, `HOTAR_*`), so a local run needs no exported variables.
//!
//! Read in this order, never overriding a variable that is already set:
//! 1. `HOTAR_ENV_FILE` (if set),
//! 2. `./.env` (repository root when running `cargo run -p hotar-server`),
//! 3. `~/.hotar/ai.env` (shared with the desktop app, which embeds this server).
//!
//! Format: `KEY=value` lines; blank lines and `#` comments are ignored; surrounding quotes are removed. Values are never
//! printed (the API key lives here).

use std::path::{Path, PathBuf};

/// The per-user file shared by the server and the desktop app.
pub fn user_env_file() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(|h| PathBuf::from(h).join(".hotar").join("ai.env"))
}

/// Parses `KEY=value` lines.
pub fn parse(text: &str) -> Vec<(String, String)> {
    text.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .filter_map(|l| {
            let l = l.strip_prefix("export ").unwrap_or(l);
            let (k, v) = l.split_once('=')?;
            let k = k.trim();
            if k.is_empty() || !k.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
                return None;
            }
            let v = v.trim();
            let v = v
                .strip_prefix('"')
                .and_then(|x| x.strip_suffix('"'))
                .or_else(|| v.strip_prefix('\'').and_then(|x| x.strip_suffix('\'')))
                .unwrap_or(v);
            Some((k.to_string(), v.to_string()))
        })
        .collect()
}

/// Sets the variables of one file that are not set yet. Returns true when the file was read.
pub fn load_file(path: &Path) -> bool {
    let Ok(text) = std::fs::read_to_string(path) else {
        return false;
    };
    for (k, v) in parse(&text) {
        if std::env::var_os(&k).is_none() {
            std::env::set_var(k, v);
        }
    }
    true
}

/// Loads every file listed in the module docs. Returns the files that were read (for a startup log line).
pub fn load_local_env() -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = Vec::new();
    if let Some(p) = std::env::var_os("HOTAR_ENV_FILE") {
        files.push(PathBuf::from(p));
    }
    files.push(PathBuf::from(".env"));
    files.extend(user_env_file());
    files.into_iter().filter(|p| load_file(p)).collect()
}

#[cfg(test)]
mod tests {
    use super::parse;

    #[test]
    fn parses_lines() {
        let v = parse("# c\n\nA=1\nexport B = \"two words\"\nC='x|y|z'\nbad line\n=nokey\nD=a=b\n");
        assert_eq!(
            v,
            vec![
                ("A".into(), "1".into()),
                ("B".into(), "two words".into()),
                ("C".into(), "x|y|z".into()),
                ("D".into(), "a=b".into()),
            ]
        );
    }
}
