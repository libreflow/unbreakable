use sha2::{Digest, Sha256};
use std::collections::HashSet;

const EXPECTED_HASHES: &[(&str, &str, &str)] = &[
    ("fr", "wordlists/eff_large_fr.txt", "3e8aa7505f9c7a8e26c54c11b46064f87d1090a2e9dc7add38f4f47628d534f6"),
    ("en", "wordlists/eff_large_en.txt", "6d557f0693958fb5e650b68b5bee585eb82cf4da32965505c789e924743bc522"),
    ("de", "wordlists/eff_large_de.txt", "440fa02c65591328d6351435d3824c27b483a049f4eca0b13456d8c5090442e7"),
    ("es", "wordlists/eff_large_es.txt", "cb2f5f8f7b88e5ea934f6004f6925ebd11323b7fdba52101bfe26e1e76ea9a1f"),
    ("it", "wordlists/eff_large_it.txt", "19321ec0b21145126fda2c4ead3194f443ecda2d5f0d47b20fd1816f36174c78"),
];

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect()
}

#[test]
fn each_wordlist_has_expected_sha256() {
    for (lang, path, expected) in EXPECTED_HASHES {
        let bytes = std::fs::read(path).unwrap_or_else(|e| panic!("read {} failed: {}", path, e));
        let actual = sha256_hex(&bytes);
        assert_eq!(&actual, expected, "SHA-256 mismatch for {} ({})", lang, path);
    }
}

#[test]
fn each_wordlist_has_7776_unique_lowercase_words() {
    for (lang, path, _) in EXPECTED_HASHES {
        let content = std::fs::read_to_string(path).unwrap();
        let words: Vec<&str> = content.lines().collect();
        assert_eq!(words.len(), 7776, "{}: expected 7776 lines, got {}", lang, words.len());

        let unique: HashSet<&str> = words.iter().copied().collect();
        assert_eq!(unique.len(), 7776, "{}: found duplicates", lang);

        for w in &words {
            assert!(!w.is_empty(), "{}: empty line", lang);
            assert!(!w.chars().any(|c| c.is_whitespace()), "{}: word with whitespace: {:?}", lang, w);
            let lower = w.to_lowercase();
            assert_eq!(*w, lower.as_str(), "{}: non-lowercase: {:?}", lang, w);
        }
    }
}
