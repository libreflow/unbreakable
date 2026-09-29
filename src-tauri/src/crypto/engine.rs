use crate::errors::{Result, UnbreakableError};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use zeroize::Zeroize;

const UPPER: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER: &str = "abcdefghijklmnopqrstuvwxyz";
const DIGIT: &str = "0123456789";
const SYMBOL: &str = "!@#$%^&*-_=+";
const AMBIGUOUS: &str = "0Ol1I|";

const MAX_ATTEMPTS: u32 = 10;
const MIN_ENTROPY_BITS: f64 = 80.0;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PasswordOptions {
    pub length: usize,
    pub uppercase: bool,
    pub lowercase: bool,
    pub digits: bool,
    pub symbols: bool,
    pub exclude_ambiguous: bool,
    pub min_per_group: usize,
    #[serde(default)]
    pub exclude_chars: String,
}

impl Default for PasswordOptions {
    fn default() -> Self {
        Self {
            length: 24,
            uppercase: true,
            lowercase: true,
            digits: true,
            symbols: true,
            exclude_ambiguous: true,
            min_per_group: 2,
            exclude_chars: String::new(),
        }
    }
}

fn filter_chars(src: &str, exclude_ambiguous: bool, manual_exclude: &str) -> Vec<char> {
    src.chars()
        .filter(|c| {
            if exclude_ambiguous && AMBIGUOUS.contains(*c) {
                return false;
            }
            if manual_exclude.contains(*c) {
                return false;
            }
            true
        })
        .collect()
}

fn build_groups(opts: &PasswordOptions) -> Vec<Vec<char>> {
    let mut groups = Vec::new();
    if opts.uppercase {
        groups.push(filter_chars(
            UPPER,
            opts.exclude_ambiguous,
            &opts.exclude_chars,
        ));
    }
    if opts.lowercase {
        groups.push(filter_chars(
            LOWER,
            opts.exclude_ambiguous,
            &opts.exclude_chars,
        ));
    }
    if opts.digits {
        groups.push(filter_chars(
            DIGIT,
            opts.exclude_ambiguous,
            &opts.exclude_chars,
        ));
    }
    if opts.symbols {
        groups.push(filter_chars(
            SYMBOL,
            opts.exclude_ambiguous,
            &opts.exclude_chars,
        ));
    }
    groups.retain(|g| !g.is_empty());
    groups
}

// Kept pub(crate) for wordlist.rs which generates passphrases one token at a time.
pub(crate) fn os_rand_below(bound: usize) -> Result<usize> {
    if bound == 0 {
        return Err(UnbreakableError::InvalidOptions("rand bound = 0".into()));
    }
    let bound = bound as u64;
    let limit = u64::MAX - (u64::MAX % bound);
    let mut buf = [0u8; 8];
    loop {
        getrandom::fill(&mut buf).map_err(|e| UnbreakableError::Rng(e.to_string()))?;
        let v = u64::from_le_bytes(buf);
        if v < limit {
            return Ok((v % bound) as usize);
        }
    }
}

// Collects all entropy for a generation run in a single getrandom call,
// eliminating the per-character syscall overhead of os_rand_below.
struct RandBuffer {
    buf: Vec<u8>,
    pos: usize,
}

impl RandBuffer {
    fn with_capacity(bytes: usize) -> Result<Self> {
        let mut buf = vec![0u8; bytes];
        getrandom::fill(&mut buf).map_err(|e| UnbreakableError::Rng(e.to_string()))?;
        Ok(Self { buf, pos: 0 })
    }

    fn next_u64(&mut self) -> Result<u64> {
        if self.pos + 8 > self.buf.len() {
            // Refill on exhaustion — shouldn't trigger with correct pre-sizing.
            getrandom::fill(&mut self.buf).map_err(|e| UnbreakableError::Rng(e.to_string()))?;
            self.pos = 0;
        }
        let bytes: [u8; 8] = self.buf[self.pos..self.pos + 8].try_into().unwrap();
        self.pos += 8;
        Ok(u64::from_le_bytes(bytes))
    }

    fn rand_below(&mut self, bound: usize) -> Result<usize> {
        if bound == 0 {
            return Err(UnbreakableError::InvalidOptions("rand bound = 0".into()));
        }
        let bound64 = bound as u64;
        let limit = u64::MAX - (u64::MAX % bound64);
        loop {
            let v = self.next_u64()?;
            if v < limit {
                return Ok((v % bound64) as usize);
            }
        }
    }
}

impl Drop for RandBuffer {
    fn drop(&mut self) {
        self.buf.zeroize();
    }
}

fn fisher_yates_shuffle(slice: &mut [char], rng: &mut RandBuffer) -> Result<()> {
    for i in (1..slice.len()).rev() {
        let j = rng.rand_below(i + 1)?;
        slice.swap(i, j);
    }
    Ok(())
}

fn entropy_bits(charset_size: usize, length: usize) -> f64 {
    if charset_size <= 1 || length == 0 {
        return 0.0;
    }
    (charset_size as f64).log2() * (length as f64)
}

pub fn generate_password(opts: &PasswordOptions) -> Result<String> {
    if opts.length < 8 || opts.length > 128 {
        return Err(UnbreakableError::InvalidOptions(format!(
            "length {} out of range [8,128]",
            opts.length
        )));
    }

    let groups = build_groups(opts);
    if groups.is_empty() {
        return Err(UnbreakableError::InvalidOptions(
            "at least one character group must be active".into(),
        ));
    }

    let min_per = opts.min_per_group;
    if min_per * groups.len() > opts.length {
        return Err(UnbreakableError::InvalidOptions(
            "min_per_group * active groups exceeds length".into(),
        ));
    }

    let full_charset: Vec<char> = groups.iter().flatten().copied().collect();
    let bits = entropy_bits(full_charset.len(), opts.length);
    if bits < MIN_ENTROPY_BITS {
        return Err(UnbreakableError::EntropyTooLow(bits));
    }

    // Build lookup sets once outside the retry loop — O(1) membership test vs O(n).
    let group_sets: Vec<HashSet<char>> =
        groups.iter().map(|g| g.iter().copied().collect()).collect();

    // Pre-fill entropy for all chars + shuffle in one syscall.
    // Factor of 3 provides headroom for rejection-sampling retries (probability ≈ 0 for typical charsets).
    let entropy_bytes = (opts.length * 3 + 64).max(256) * 8;
    let mut rng = RandBuffer::with_capacity(entropy_bytes)?;

    for _ in 0..MAX_ATTEMPTS {
        let mut chars: Vec<char> = Vec::with_capacity(opts.length);

        for group in &groups {
            for _ in 0..min_per {
                let idx = rng.rand_below(group.len())?;
                chars.push(group[idx]);
            }
        }
        while chars.len() < opts.length {
            let idx = rng.rand_below(full_charset.len())?;
            chars.push(full_charset[idx]);
        }

        fisher_yates_shuffle(&mut chars, &mut rng)?;

        if validate_constraints(&chars, &group_sets, min_per) {
            let s: String = chars.iter().collect();
            chars.zeroize();
            return Ok(s);
        }
        chars.zeroize();
    }
    Err(UnbreakableError::GenerationExhausted(MAX_ATTEMPTS))
}

fn validate_constraints(pwd: &[char], group_sets: &[HashSet<char>], min_per: usize) -> bool {
    for set in group_sets {
        let count = pwd.iter().filter(|c| set.contains(c)).count();
        if count < min_per {
            return false;
        }
    }
    true
}

#[cfg(test)]
pub fn password_entropy_bits(opts: &PasswordOptions) -> f64 {
    let groups = build_groups(opts);
    let total: usize = groups.iter().map(|g| g.len()).sum();
    entropy_bits(total, opts.length)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_options_meet_80_bits() {
        let opts = PasswordOptions::default();
        let bits = password_entropy_bits(&opts);
        assert!(bits >= 80.0, "default opts produced {} bits", bits);
    }

    #[test]
    fn generates_password_of_requested_length() {
        let opts = PasswordOptions::default();
        let pwd = generate_password(&opts).expect("should generate");
        assert_eq!(pwd.chars().count(), 24);
    }

    #[test]
    fn rejects_length_below_8() {
        let opts = PasswordOptions {
            length: 4,
            ..Default::default()
        };
        assert!(matches!(
            generate_password(&opts),
            Err(UnbreakableError::InvalidOptions(_))
        ));
    }

    #[test]
    fn rejects_length_above_128() {
        let opts = PasswordOptions {
            length: 200,
            ..Default::default()
        };
        assert!(matches!(
            generate_password(&opts),
            Err(UnbreakableError::InvalidOptions(_))
        ));
    }

    #[test]
    fn rejects_no_active_groups() {
        let opts = PasswordOptions {
            uppercase: false,
            lowercase: false,
            digits: false,
            symbols: false,
            ..Default::default()
        };
        assert!(matches!(
            generate_password(&opts),
            Err(UnbreakableError::InvalidOptions(_))
        ));
    }

    #[test]
    fn rejects_below_min_entropy() {
        let opts = PasswordOptions {
            length: 8,
            uppercase: false,
            lowercase: false,
            digits: true,
            symbols: false,
            exclude_ambiguous: false,
            min_per_group: 0,
            exclude_chars: String::new(),
        };
        assert!(matches!(
            generate_password(&opts),
            Err(UnbreakableError::EntropyTooLow(_))
        ));
    }

    #[test]
    fn excludes_ambiguous_when_requested() {
        let opts = PasswordOptions {
            length: 64,
            exclude_ambiguous: true,
            ..Default::default()
        };
        for _ in 0..50 {
            let pwd = generate_password(&opts).unwrap();
            for c in pwd.chars() {
                assert!(!AMBIGUOUS.contains(c), "found ambiguous '{}' in {}", c, pwd);
            }
        }
    }

    #[test]
    fn honors_min_per_group() {
        let opts = PasswordOptions {
            length: 24,
            min_per_group: 3,
            ..Default::default()
        };
        for _ in 0..30 {
            let pwd = generate_password(&opts).unwrap();
            let chars: Vec<char> = pwd.chars().collect();
            let upper = chars.iter().filter(|c| c.is_ascii_uppercase()).count();
            let lower = chars.iter().filter(|c| c.is_ascii_lowercase()).count();
            let digit = chars.iter().filter(|c| c.is_ascii_digit()).count();
            assert!(upper >= 3, "upper={} in {}", upper, pwd);
            assert!(lower >= 3, "lower={} in {}", lower, pwd);
            assert!(digit >= 3, "digit={} in {}", digit, pwd);
        }
    }

    #[test]
    fn each_generation_is_unique() {
        let opts = PasswordOptions::default();
        let a = generate_password(&opts).unwrap();
        let b = generate_password(&opts).unwrap();
        assert_ne!(a, b);
    }

    #[test]
    fn os_rand_below_distributes() {
        let mut counts = [0u32; 10];
        for _ in 0..10_000 {
            counts[os_rand_below(10).unwrap()] += 1;
        }
        for (i, &c) in counts.iter().enumerate() {
            assert!(c > 500, "bucket {} only hit {}", i, c);
        }
    }
}
