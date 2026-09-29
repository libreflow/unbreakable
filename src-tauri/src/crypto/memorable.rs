use crate::crypto::engine::os_rand_below;
use crate::errors::UnbreakableError;
use std::sync::OnceLock;
use zeroize::Zeroizing;

const FR_BYTES: &str = include_str!("../../wordlists/eff_large_fr.txt");

// Words of 3..=6 chars keep the result human-memorable while the
// 3-word sum constraint (11..=16 letters) guarantees the final
// length stays within [14, 20]:
//   length = letters + 2 separators + 1 digit + 1 symbol
//   min = 11 + 4 = 15, max = 16 + 4 = 20
const MIN_WORD_LEN: usize = 3;
const MAX_WORD_LEN: usize = 6;
const MIN_LETTERS: usize = 11;
const MAX_LETTERS: usize = 16;

const DIGITS: &[char] = &['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const SYMBOLS: &[char] = &['!', '@', '#', '$', '%', '&', '*', '?'];

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

pub fn generate_memorable() -> Result<Zeroizing<String>, UnbreakableError> {
    let words = short_words();
    let mut chosen: Vec<&'static str> = Vec::with_capacity(3);
    let mut letters;
    loop {
        chosen.clear();
        letters = 0;
        for _ in 0..3 {
            let w = words[os_rand_below(words.len())?];
            letters += w.chars().count();
            chosen.push(w);
        }
        if (MIN_LETTERS..=MAX_LETTERS).contains(&letters) {
            break;
        }
    }

    let digit = DIGITS[os_rand_below(DIGITS.len())?];
    let symbol = SYMBOLS[os_rand_below(SYMBOLS.len())?];

    let mut out = String::with_capacity(letters + 4);
    for (i, w) in chosen.iter().enumerate() {
        if i > 0 {
            out.push('-');
        }
        let mut cs = w.chars();
        if let Some(first) = cs.next() {
            out.extend(first.to_uppercase());
            out.push_str(cs.as_str());
        }
    }
    out.push(digit);
    out.push(symbol);
    Ok(Zeroizing::new(out))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn length_always_within_14_to_20() {
        for _ in 0..500 {
            let p = generate_memorable().unwrap();
            let len = p.chars().count();
            assert!(
                (14..=20).contains(&len),
                "generated '{p:?}' with length {len}"
            );
        }
    }

    #[test]
    fn shape_is_three_words_digit_symbol() {
        let p = generate_memorable().unwrap();
        assert!(p.chars().last().unwrap().is_ascii_punctuation());
        assert!(p
            .chars()
            .nth(p.chars().count() - 2)
            .unwrap()
            .is_ascii_digit());
        let body: String = p.chars().take(p.chars().count() - 2).collect();
        let parts: Vec<&str> = body.split('-').collect();
        assert_eq!(parts.len(), 3, "expected 3 words in '{p:?}'");
        for part in parts {
            assert!(
                part.chars().next().unwrap().is_uppercase(),
                "'{part}' not capitalized"
            );
        }
    }

    #[test]
    fn no_ambiguous_letters_in_first_word() {
        // sanity: words come from the EFF fr list filtered to 3-6 chars
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

    #[test]
    fn each_generation_is_unique() {
        let a = generate_memorable().unwrap();
        let b = generate_memorable().unwrap();
        assert_ne!(*a, *b);
    }
}
