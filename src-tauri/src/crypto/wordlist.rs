use crate::crypto::engine::os_rand_below;
use crate::errors::UnbreakableError;
use std::sync::OnceLock;
use zeroize::Zeroizing;

const FR_BYTES: &str = include_str!("../../wordlists/eff_large_fr.txt");
const EN_BYTES: &str = include_str!("../../wordlists/eff_large_en.txt");
const DE_BYTES: &str = include_str!("../../wordlists/eff_large_de.txt");
const ES_BYTES: &str = include_str!("../../wordlists/eff_large_es.txt");
const IT_BYTES: &str = include_str!("../../wordlists/eff_large_it.txt");

const WORDS_PER_LIST: usize = 7776;
const BITS_PER_WORD: f64 = 12.924_812_503_605_78; // log2(7776)
const MIN_ENTROPY_BITS: f64 = 64.0; // 5 words = 5 * log2(7776) ≈ 64.62 bits; floor at 64.0 to pass 5-word passphrases
                                    // 4 words tops out at 4*12.92 + 2*log2(10) ≈ 58.3 bits even with digit+symbol appended —
                                    // always below MIN_ENTROPY_BITS, so 4 would be accepted by the range check yet always
                                    // rejected by the entropy check. Floor at 5 so the range check reflects a value that can
                                    // actually succeed (audit finding: UI slider allowed 4, silently failing every generation).
const MIN_WORD_COUNT: u8 = 5;
const MAX_WORD_COUNT: u8 = 12;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WordlistLang {
    Fr,
    En,
    De,
    Es,
    It,
}

static FR_CACHE: OnceLock<Vec<&'static str>> = OnceLock::new();
static EN_CACHE: OnceLock<Vec<&'static str>> = OnceLock::new();
static DE_CACHE: OnceLock<Vec<&'static str>> = OnceLock::new();
static ES_CACHE: OnceLock<Vec<&'static str>> = OnceLock::new();
static IT_CACHE: OnceLock<Vec<&'static str>> = OnceLock::new();

fn parse_static(s: &'static str) -> Vec<&'static str> {
    let v: Vec<&'static str> = s.lines().collect();
    assert_eq!(
        v.len(),
        WORDS_PER_LIST,
        "wordlist embedded does not contain {WORDS_PER_LIST} words"
    );
    v
}

pub fn words_for(lang: WordlistLang) -> &'static [&'static str] {
    let cache = match lang {
        WordlistLang::Fr => &FR_CACHE,
        WordlistLang::En => &EN_CACHE,
        WordlistLang::De => &DE_CACHE,
        WordlistLang::Es => &ES_CACHE,
        WordlistLang::It => &IT_CACHE,
    };
    let bytes = match lang {
        WordlistLang::Fr => FR_BYTES,
        WordlistLang::En => EN_BYTES,
        WordlistLang::De => DE_BYTES,
        WordlistLang::Es => ES_BYTES,
        WordlistLang::It => IT_BYTES,
    };
    cache.get_or_init(|| parse_static(bytes)).as_slice()
}

fn estimated_entropy_bits(word_count: u8, include_digit: bool, include_symbol: bool) -> f64 {
    let mut e = f64::from(word_count) * BITS_PER_WORD;
    if include_digit {
        e += (10f64).log2();
    }
    if include_symbol {
        e += (10f64).log2();
    }
    e
}

pub fn generate_passphrase(
    lang: WordlistLang,
    word_count: u8,
    separator: char,
    include_digit: bool,
    include_symbol: bool,
) -> Result<Zeroizing<String>, UnbreakableError> {
    if !(MIN_WORD_COUNT..=MAX_WORD_COUNT).contains(&word_count) {
        return Err(UnbreakableError::InvalidOptions(format!(
            "word_count {} out of [{}..{}]",
            word_count, MIN_WORD_COUNT, MAX_WORD_COUNT
        )));
    }

    let entropy = estimated_entropy_bits(word_count, include_digit, include_symbol);
    if entropy < MIN_ENTROPY_BITS {
        return Err(UnbreakableError::EntropyTooLow(entropy));
    }

    let words = words_for(lang);

    let mut out = String::with_capacity((word_count as usize) * 10);
    for i in 0..word_count {
        if i > 0 {
            out.push(separator);
        }
        let idx = os_rand_below(WORDS_PER_LIST)?;
        out.push_str(words[idx]);
    }

    if include_digit {
        out.push(separator);
        let d = os_rand_below(10)?;
        out.push(char::from_digit(d as u32, 10).unwrap());
    }
    if include_symbol {
        const SYMS: &[char] = &['!', '@', '#', '$', '%', '&', '*', '?', '+', '='];
        out.push(separator);
        out.push(SYMS[os_rand_below(SYMS.len())?]);
    }

    Ok(Zeroizing::new(out))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_languages_load_7776_words() {
        for lang in [
            WordlistLang::Fr,
            WordlistLang::En,
            WordlistLang::De,
            WordlistLang::Es,
            WordlistLang::It,
        ] {
            let words = words_for(lang);
            assert_eq!(words.len(), 7776, "language {:?} expected 7776 words", lang);
        }
    }

    #[test]
    fn passphrase_meets_min_entropy() {
        let p = generate_passphrase(WordlistLang::Fr, 5, '-', false, false).unwrap();
        let word_count = p.split('-').count();
        assert_eq!(word_count, 5);
    }

    #[test]
    fn passphrase_word_count_below_min_rejected() {
        let err = generate_passphrase(WordlistLang::En, 3, '-', false, false);
        assert!(
            err.is_err(),
            "3 words at 12.92 bits = 38.76 bits < 65 bits min"
        );
    }

    #[test]
    fn passphrase_with_digit_and_symbol_appends_chars() {
        let p = generate_passphrase(WordlistLang::En, 5, '-', true, true).unwrap();
        let parts: Vec<&str> = p.split('-').collect();
        assert!(parts.len() >= 5);
    }
}
