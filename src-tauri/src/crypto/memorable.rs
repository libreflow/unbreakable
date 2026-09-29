use crate::crypto::engine::os_rand_below;
use crate::errors::UnbreakableError;
use std::collections::HashSet;
use std::sync::OnceLock;
use zeroize::Zeroizing;

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

// Once fewer than this many fresh words remain in the pool, the
// used-word memory resets so generation never fails.
const MIN_FRESH_POOL: usize = 20;

static SHORT_FR: OnceLock<Vec<&'static str>> = OnceLock::new();

fn short_words() -> &'static [&'static str] {
    SHORT_FR
        .get_or_init(|| {
            FR_BYTES
                .lines()
                .filter(|w| {
                    let len = w.chars().count();
                    (MIN_WORD_LEN..=MAX_WORD_LEN).contains(&len)
                })
                .collect()
        })
        .as_slice()
}

/// Pick 3 fresh words (never previously emitted) whose total letter
/// count fits the length window. CamelCase shape, no separators.
fn pick_words(used: &HashSet<String>) -> Result<Vec<&'static str>, UnbreakableError> {
    let pool = short_words();
    let fresh: Vec<&&'static str> = pool.iter().filter(|w| !used.contains(**w)).collect();
    if fresh.len() < 3 {
        return Err(UnbreakableError::InvalidOptions(
            "word pool exhausted".into(),
        ));
    }
    loop {
        let mut letters = 0;
        let mut words = Vec::with_capacity(3);
        let mut seen = HashSet::with_capacity(3);
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

/// Core generator: takes the exclusion set, returns the password and
/// the words consumed (so the caller can persist them).
pub fn generate_memorable(
    used: &HashSet<String>,
) -> Result<(Zeroizing<String>, Vec<String>), UnbreakableError> {
    let words = pick_words(used)?;
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

/// Path of the persistent used-word memory (app_data dir).
pub fn used_words_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, UnbreakableError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| UnbreakableError::Io(std::io::Error::other(e.to_string())))?;
    Ok(dir.join("memorable.used"))
}

use tauri::Manager;

fn load_used(path: &std::path::Path) -> HashSet<String> {
    std::fs::read_to_string(path)
        .map(|raw| {
            raw.lines()
                .map(str::to_string)
                .filter(|l| !l.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

fn save_used(path: &std::path::Path, used: &HashSet<String>) -> Result<(), UnbreakableError> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut buf = String::new();
    for w in used {
        buf.push_str(w);
        buf.push('\n');
    }
    std::fs::write(path, buf)?;
    Ok(())
}

/// Full pipeline used by the IPC command: loads the persistent
/// used-word memory, generates a fresh password, and persists the
/// newly consumed words. Resets the memory when the pool runs low.
pub fn generate_and_track(app: &tauri::AppHandle) -> Result<Zeroizing<String>, UnbreakableError> {
    let path = used_words_path(app)?;
    let mut used = load_used(&path);
    let pool_size = short_words().len();
    if pool_size - used.len() < MIN_FRESH_POOL {
        used.clear();
    }
    let (pw, consumed) = generate_memorable(&used)?;
    for w in consumed {
        used.insert(w);
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
            let (p, _) = generate_memorable(&HashSet::new()).unwrap();
            let len = p.chars().count();
            assert!(
                (14..=20).contains(&len),
                "generated {p:?} with length {len}"
            );
        }
    }

    #[test]
    fn shape_is_camelcase_digits_symbol() {
        let (p, _) = generate_memorable(&HashSet::new()).unwrap();
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
    fn never_reuses_used_words() {
        let mut used: HashSet<String> = HashSet::new();
        let (_, consumed) = generate_memorable(&used).unwrap();
        for w in &consumed {
            used.insert(w.clone());
        }
        for _ in 0..20 {
            let (_, consumed) = generate_memorable(&used).unwrap();
            for w in &consumed {
                assert!(!used.contains(w), "word {w} was reused");
                used.insert(w.clone());
            }
        }
    }

    #[test]
    fn errors_when_pool_exhausted() {
        let pool = short_words();
        let mut used: HashSet<String> = pool.iter().map(|w| w.to_string()).collect();
        // leave only 2 fresh words
        let fresh: Vec<String> = pool
            .iter()
            .map(|w| w.to_string())
            .filter(|w| !used.contains(w))
            .collect();
        for w in fresh.iter().take(fresh.len().saturating_sub(2)) {
            used.remove(w);
        }
        let err = generate_memorable(&used);
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
            (MIN_WORD_LEN..=MAX_WORD_LEN).contains(&l)
        }));
    }
}
