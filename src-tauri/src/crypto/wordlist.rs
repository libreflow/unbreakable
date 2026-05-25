use crate::crypto::engine::os_rand_below;
use crate::errors::{Result, UnbreakableError};
use serde::{Deserialize, Serialize};

// 256 mots français courts (4-7 lettres), sans accent — copier-coller universel,
// compatible claviers QWERTY, shell scripts, sites refusant l'UTF-8 étendu.
// Pas de mots avec tiret pour ne pas casser le split sur séparateur "-".
// TODO S3: remplacer par FR Diceware complète (~8192 mots, 13 bits/mot) via include_bytes!.
const STUB_WORDS: &[&str] = &[
    "abri", "acide", "acte", "agir", "aide", "aigle", "aile", "aime", "aire", "ajout", "alarme", "alerte",
    "algue", "allee", "ami", "ange", "annee", "antre", "aout", "appel", "apres", "arbre", "arc", "arene",
    "arme", "art", "asile", "atout", "aube", "autel", "autre", "avant", "avis", "avoir", "axe", "balle",
    "banc", "bande", "banque", "bar", "barbe", "base", "beau", "bec", "beige", "bel", "belle", "berge",
    "bete", "beurre", "bien", "bijou", "bilan", "blanc", "bleu", "ble", "bloc", "bois", "boite", "bon",
    "bord", "bouee", "bout", "bras", "breche", "bref", "brique", "brise", "brun", "bruit", "buee", "bulle",
    "buche", "but", "cable", "cafe", "cage", "calme", "camion", "canal", "canon", "cap", "cape", "carte",
    "casque", "cause", "cave", "cela", "cellule", "cent", "cercle", "cerf", "cesse", "chacun", "chair", "champ",
    "chant", "chat", "chef", "chien", "choc", "chou", "chute", "ciel", "cigare", "cinq", "cite", "clair",
    "classe", "cle", "clic", "climat", "club", "code", "coeur", "coin", "colis", "colle", "comme", "conte",
    "copain", "coq", "corde", "corps", "cote", "couche", "coup", "cour", "course", "court", "creer", "crete",
    "crime", "croix", "cru", "cube", "cuir", "cure", "cycle", "dame", "date", "debut", "dent", "desir",
    "dette", "deux", "dieu", "dire", "dix", "doigt", "don", "donc", "dose", "doux", "droit", "drole",
    "duo", "dur", "eau", "ecole", "ecran", "elan", "elu", "ennui", "enjeu", "epoque", "equipe", "ere",
    "espoir", "etat", "ete", "etoile", "faim", "faire", "fait", "faute", "faux", "fer", "ferme", "fete",
    "fil", "fille", "film", "fin", "fleur", "flou", "foi", "foie", "fois", "fond", "force", "foret",
    "fort", "four", "foyer", "frais", "franc", "frere", "frigo", "froid", "fruit", "fumee", "futur", "gain",
    "gare", "gaz", "gel", "gens", "geste", "gilet", "glace", "gloire", "gomme", "gorge", "gout", "grand",
    "grave", "grec", "gris", "gros", "guide", "habile", "haine", "halle", "halte", "haut", "herbe", "heros",
    "heure", "hier", "homme", "honte", "hotel", "huit", "ici", "idee", "ile", "image", "indice", "infos",
    "ivre", "jadis", "jamais", "jardin", "jaune", "jet", "jeu", "jeune", "joie", "joli", "jour", "juge",
    "juin", "jury", "lac", "laine",
];

const _: () = assert!(STUB_WORDS.len() >= 256, "STUB_WORDS must have at least 256 entries for entropy calculations");

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Capitalization {
    Off,
    First,
    All,
}

impl Default for Capitalization {
    fn default() -> Self {
        Capitalization::First
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PassphraseOptions {
    pub words: usize,
    pub separator: String,
    #[serde(default)]
    pub capitalization: Capitalization,
    pub append_digits: bool,
    #[serde(default)]
    pub append_symbol: bool,
}

impl Default for PassphraseOptions {
    fn default() -> Self {
        Self {
            words: 5,
            separator: "-".to_string(),
            capitalization: Capitalization::First,
            append_digits: true,
            append_symbol: false,
        }
    }
}

const SYMBOLS: &[char] = &['!', '@', '#', '$', '%', '^', '&', '*'];
const MIN_PASSPHRASE_ENTROPY_BITS: f64 = 40.0;

fn capitalize_first(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        None => String::new(),
        Some(c) => c.to_ascii_uppercase().to_string() + chars.as_str(),
    }
}

fn apply_capitalization(word: &str, cap: Capitalization) -> String {
    match cap {
        Capitalization::Off => word.to_string(),
        Capitalization::First => capitalize_first(word),
        Capitalization::All => word.to_ascii_uppercase(),
    }
}

fn passphrase_entropy_bits_inner(opts: &PassphraseOptions) -> f64 {
    let per_word = (STUB_WORDS.len() as f64).log2();
    let mut bits = per_word * opts.words as f64;
    if opts.append_digits {
        bits += (100f64).log2();
    }
    if opts.append_symbol {
        bits += (SYMBOLS.len() as f64).log2();
    }
    bits
}

pub fn generate_passphrase(opts: &PassphraseOptions) -> Result<String> {
    if !(3..=12).contains(&opts.words) {
        return Err(UnbreakableError::InvalidOptions(format!(
            "words {} out of range [3,12]",
            opts.words
        )));
    }
    if opts.separator.chars().count() > 8 {
        return Err(UnbreakableError::InvalidOptions(
            "separator too long (max 8 chars)".into(),
        ));
    }

    let bits = passphrase_entropy_bits_inner(opts);
    if bits < MIN_PASSPHRASE_ENTROPY_BITS {
        return Err(UnbreakableError::EntropyTooLow(bits));
    }

    let mut parts: Vec<String> = Vec::with_capacity(opts.words);
    for _ in 0..opts.words {
        let idx = os_rand_below(STUB_WORDS.len())?;
        parts.push(apply_capitalization(STUB_WORDS[idx], opts.capitalization));
    }

    let mut phrase = parts.join(&opts.separator);

    if opts.append_digits {
        let d1 = os_rand_below(10)?;
        let d2 = os_rand_below(10)?;
        phrase.push_str(&format!("{}{}", d1, d2));
    }
    if opts.append_symbol {
        let s = SYMBOLS[os_rand_below(SYMBOLS.len())?];
        phrase.push(s);
    }
    Ok(phrase)
}

#[cfg(test)]
pub fn passphrase_entropy_bits(opts: &PassphraseOptions) -> f64 {
    passphrase_entropy_bits_inner(opts)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_5_word_passphrase_generated() {
        let opts = PassphraseOptions::default();
        let p = generate_passphrase(&opts).expect("should generate");
        let segments: Vec<&str> = p.split('-').collect();
        assert_eq!(segments.len(), 5);
        let last = segments.last().unwrap();
        let digits_tail: String = last.chars().rev().take(2).collect();
        assert!(digits_tail.chars().all(|c| c.is_ascii_digit()));
    }

    #[test]
    fn rejects_below_3_words() {
        let opts = PassphraseOptions {
            words: 2,
            ..Default::default()
        };
        assert!(matches!(
            generate_passphrase(&opts),
            Err(UnbreakableError::InvalidOptions(_))
        ));
    }

    #[test]
    fn rejects_above_12_words() {
        let opts = PassphraseOptions {
            words: 13,
            ..Default::default()
        };
        assert!(matches!(
            generate_passphrase(&opts),
            Err(UnbreakableError::InvalidOptions(_))
        ));
    }

    #[test]
    fn custom_separator_used() {
        let opts = PassphraseOptions {
            separator: "_".into(),
            append_digits: false,
            ..Default::default()
        };
        let p = generate_passphrase(&opts).unwrap();
        assert!(p.contains('_'));
        assert!(!p.contains('-'));
    }

    #[test]
    fn all_caps_capitalization() {
        let opts = PassphraseOptions {
            capitalization: Capitalization::All,
            append_digits: false,
            ..Default::default()
        };
        let p = generate_passphrase(&opts).unwrap();
        for c in p.chars() {
            if c.is_alphabetic() {
                assert!(c.is_ascii_uppercase(), "expected upper in {}", p);
            }
        }
    }

    #[test]
    fn wordlist_has_at_least_256_entries() {
        assert!(STUB_WORDS.len() >= 256, "wordlist too small: {}", STUB_WORDS.len());
    }

    #[test]
    fn entropy_default_is_positive() {
        let opts = PassphraseOptions::default();
        assert!(passphrase_entropy_bits(&opts) > 0.0);
    }
}
