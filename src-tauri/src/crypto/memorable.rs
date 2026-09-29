use crate::crypto::engine::os_rand_below;
use crate::errors::UnbreakableError;
use std::collections::HashMap;
use std::sync::OnceLock;
use zeroize::Zeroizing;

use tauri::Manager;

const FR_BYTES: &str = include_str!("../../wordlists/eff_large_fr.txt");

// Words of 3..=6 chars keep the result human-memorable while the
// 3-word letter-sum constraint (9..=15 letters) guarantees the final
// length stays within [14, 20]:
//   length = letters + 4 digits + 1 symbol
//   min = 9 + 5 = 14, max = 15 + 5 = 20
const MIN_WORD_LEN: usize = 3;
const MAX_WORD_LEN: usize = 6;
const MIN_LETTERS: usize = 9;
const MAX_LETTERS: usize = 15;
const DIGIT_COUNT: usize = 4;

const DIGITS: &[char] = &['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const SYMBOLS: &[char] = &['!', '@', '#', '$', '%', '&', '*', '?'];

/// A word stays blacklisted for this long after being used, then
/// becomes available again.
pub const WORD_TTL_MS: u64 = 6 * 30 * 24 * 3600 * 1000; // ~6 months

/// Blacklist entry: the word and the unix ms timestamp at which it was
/// last used.
pub type UsedWords = HashMap<String, u64>;

static SHORT_FR: OnceLock<Vec<&'static str>> = OnceLock::new();

fn short_words() -> &'static [&'static str] {
    SHORT_FR
        .get_or_init(|| {
            FR_BYTES
                .lines()
                .filter(|w| {
                    let len = w.chars().count();
                    (MIN_WORD_LEN..=MAX_WORD_LEN).contains(&len) && w.is_ascii()
                })
                .collect()
        })
        .as_slice()
}

/// Words whose blacklist entry has expired (older than WORD_TTL_MS).
fn expired_words(used: &UsedWords, now: u64) -> Vec<String> {
    used.iter()
        .filter(|(_, &ts)| now.saturating_sub(ts) >= WORD_TTL_MS)
        .map(|(w, _)| w.clone())
        .collect()
}

/// Pick 3 fresh words (not currently blacklisted) whose total letter
/// count fits the length window. CamelCase shape, no separators.
fn pick_words(used: &UsedWords, now: u64) -> Result<Vec<&'static str>, UnbreakableError> {
    let pool = short_words();
    let fresh: Vec<&&'static str> = pool
        .iter()
        .filter(|w| {
            used.get(**w)
                .is_none_or(|&ts| now.saturating_sub(ts) >= WORD_TTL_MS)
        })
        .collect();
    if fresh.len() < 3 {
        return Err(UnbreakableError::InvalidOptions(
            "word pool exhausted".into(),
        ));
    }
    loop {
        let mut letters = 0;
        let mut words = Vec::with_capacity(3);
        let mut seen = std::collections::HashSet::with_capacity(3);
        while words.len() < 3 {
            let w = *fresh[os_rand_below(fresh.len())?];
            if seen.insert(w) {
                letters += w.chars().count();
                words.push(w);
            }
        }
        if (MIN_LETTERS..=MAX_LETTERS).contains(&letters) {
            return Ok(words);
        }
    }
}

/// Core generator: takes the blacklist (word -> last-used ts), returns
/// the password and the words consumed (so the caller can persist them).
pub fn generate_memorable(
    used: &UsedWords,
    now: u64,
) -> Result<(Zeroizing<String>, Vec<String>), UnbreakableError> {
    let words = pick_words(used, now)?;
    let letters: usize = words.iter().map(|w| w.chars().count()).sum();

    let mut out = String::with_capacity(letters + DIGIT_COUNT + 1);
    for w in &words {
        let mut cs = w.chars();
        if let Some(first) = cs.next() {
            out.extend(first.to_uppercase());
            out.push_str(cs.as_str());
        }
    }
    for _ in 0..DIGIT_COUNT {
        out.push(DIGITS[os_rand_below(DIGITS.len())?]);
    }
    out.push(SYMBOLS[os_rand_below(SYMBOLS.len())?]);

    let consumed: Vec<String> = words.iter().map(|w| (*w).to_string()).collect();
    Ok((Zeroizing::new(out), consumed))
}

/// Path of the persistent used-word blacklist (app_data dir).
pub fn used_words_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, UnbreakableError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| UnbreakableError::Io(std::io::Error::other(e.to_string())))?;
    Ok(dir.join("memorable.used"))
}

/// Load the blacklist: one `word|timestamp_ms` per line. Legacy
/// entries without a timestamp (pre-TTL format) get timestamp 0, so
/// they expire naturally rather than blocking words forever.
fn load_used(path: &std::path::Path) -> UsedWords {
    std::fs::read_to_string(path)
        .map(|raw| {
            raw.lines()
                .filter_map(|l| {
                    let l = l.trim();
                    if l.is_empty() {
                        return None;
                    }
                    match l.split_once('|') {
                        Some((w, ts)) => ts.trim().parse::<u64>().ok().map(|t| (w.to_string(), t)),
                        None => Some((l.to_string(), 0)),
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

fn save_used(path: &std::path::Path, used: &UsedWords) -> Result<(), UnbreakableError> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut buf = String::new();
    for (w, ts) in used {
        buf.push_str(w);
        buf.push('|');
        buf.push_str(&ts.to_string());
        buf.push('\n');
    }
    std::fs::write(path, buf)?;
    Ok(())
}

/// Full pipeline used by the IPC command: loads the persistent
/// blacklist, generates a fresh password, and persists the newly
/// consumed words with the current timestamp. Expired entries
/// (older than WORD_TTL_MS) are pruned on every write.
pub fn generate_and_track(app: &tauri::AppHandle) -> Result<Zeroizing<String>, UnbreakableError> {
    let path = used_words_path(app)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let mut used = load_used(&path);
    for w in expired_words(&used, now) {
        used.remove(&w);
    }

    let (pw, consumed) = generate_memorable(&used, now)?;
    for w in consumed {
        used.insert(w, now);
    }
    save_used(&path, &used)?;
    Ok(pw)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn length_always_within_14_to_20() {
        for _ in 0..500 {
            let (p, _) = generate_memorable(&UsedWords::new(), 0).unwrap();
            let len = p.chars().count();
            assert!(
                (14..=20).contains(&len),
                "generated {p:?} with length {len}"
            );
        }
    }

    #[test]
    fn shape_is_camelcase_digits_symbol() {
        let (p, _) = generate_memorable(&UsedWords::new(), 0).unwrap();
        let chars: Vec<char> = p.chars().collect();
        assert!(chars.last().unwrap().is_ascii_punctuation());
        let digits = chars.iter().filter(|c| c.is_ascii_digit()).count();
        assert_eq!(digits, DIGIT_COUNT);
        // last letters before digits: word ends lowercase
        let first_digit = chars.iter().position(|c| c.is_ascii_digit()).unwrap();
        assert!(chars[first_digit - 1].is_lowercase());
        assert!(chars[0].is_uppercase());
        assert!(!p.contains('-'), "no separator expected in {p:?}");
    }

    #[test]
    fn never_reuses_blacklisted_words() {
        let now = 1_000_000_000_000u64;
        let mut used: UsedWords = UsedWords::new();
        let (_, consumed) = generate_memorable(&used, now).unwrap();
        for w in &consumed {
            used.insert(w.clone(), now);
        }
        for _ in 0..20 {
            let (_, consumed) = generate_memorable(&used, now).unwrap();
            for w in &consumed {
                assert!(!used.contains_key(w), "word {w} was reused");
                used.insert(w.clone(), now);
            }
        }
    }

    #[test]
    fn word_available_again_after_ttl() {
        let now = 10_000_000_000_000u64;
        let pool = short_words();
        // blacklist every word except 3, all blacklisted 7 months ago
        let mut used: UsedWords = UsedWords::new();
        let old_ts = now - WORD_TTL_MS - 1_000_000;
        for w in pool {
            used.insert(w.to_string(), old_ts);
        }
        // succeeds: the expired entries no longer block generation
        let (p, consumed) = generate_memorable(&used, now).unwrap();
        assert_eq!(consumed.len(), 3);
        assert!(!p.is_empty());
        // and the expired words the generator just picked are among the old entries
        for w in &consumed {
            assert_eq!(used.get(w), Some(&old_ts));
        }
    }

    #[test]
    fn word_still_blocked_within_ttl() {
        let now = 10_000_000_000_000u64;
        let pool = short_words();
        let mut used: UsedWords = UsedWords::new();
        // all blacklisted 1 month ago (still active)
        let recent_ts = now - WORD_TTL_MS / 6;
        for w in pool {
            used.insert(w.to_string(), recent_ts);
        }
        let err = generate_memorable(&used, now);
        assert!(err.is_err(), "every word is blacklisted and not expired");
    }

    #[test]
    fn expired_words_detected() {
        let now = 10_000_000_000_000u64;
        let mut used: UsedWords = UsedWords::new();
        used.insert("vieille".to_string(), now - WORD_TTL_MS - 1);
        used.insert("recent".to_string(), now - 1000);
        let exp = expired_words(&used, now);
        assert_eq!(exp, vec!["vieille".to_string()]);
    }

    #[test]
    fn legacy_entries_expire_immediately() {
        // old format had no timestamp: they map to ts=0 and must not block
        let now = 10_000_000_000_000u64;
        let mut used: UsedWords = UsedWords::new();
        used.insert("legacy".to_string(), 0);
        let exp = expired_words(&used, now);
        assert_eq!(exp, vec!["legacy".to_string()]);
    }

    #[test]
    fn errors_when_pool_exhausted() {
        let now = 1_000_000_000_000u64;
        let pool = short_words();
        let mut used: UsedWords = UsedWords::new();
        for w in pool {
            used.insert(w.to_string(), now);
        }
        let err = generate_memorable(&used, now);
        assert!(err.is_err());
    }

    #[test]
    fn pool_size_is_large() {
        let words = short_words();
        assert!(
            words.len() > 1000,
            "expected a large pool, got {}",
            words.len()
        );
        assert!(words.iter().all(|w| {
            let l = w.chars().count();
            (MIN_WORD_LEN..=MAX_WORD_LEN).contains(&l) && w.is_ascii()
        }));
    }
}
