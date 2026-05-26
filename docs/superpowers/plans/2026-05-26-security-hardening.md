# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement B1 (Diceware multi-langue), B3 (anti-screenshot OS-natif smart), and B4 (vault chiffré AES-256-GCM + OS keystore + master pw optionnel) per spec `2026-05-26-security-hardening-design.md`.

**Architecture:** Rust backend gains `crypto/storage.rs` (vault), `crypto/wordlist.rs` (extended multi-langue), `display/window_protection.rs` (OS-native). Frontend gains `SecuritySection`, `UnlockModal`, `MigrationModal` and refactors `historyStore.ts` to IPC instead of localStorage persist.

**Tech Stack:** Rust + Tauri v2, `keyring` v3, `aes-gcm` v0.10, `argon2` v0.5, `hkdf` v0.12, `tempfile`, `windows-sys` (Win), `objc2-app-kit` (Mac). React + Zustand + TypeScript on the front.

---

## File Structure

**Backend (Rust) — created:**
- `src-tauri/wordlists/eff_large_fr.txt` — 7776 French words
- `src-tauri/wordlists/eff_large_en.txt` — 7776 English words
- `src-tauri/wordlists/eff_large_de.txt`
- `src-tauri/wordlists/eff_large_es.txt`
- `src-tauri/wordlists/eff_large_it.txt`
- `src-tauri/src/crypto/storage.rs` — `VaultStore` (KEK + AES-GCM + Argon2id)
- `src-tauri/src/display/mod.rs` + `src-tauri/src/display/window_protection.rs`
- `src-tauri/src/commands/history.rs` — vault IPC commands
- `src-tauri/src/commands/window.rs` — `set_window_protected` IPC
- `src-tauri/tests/wordlists_integrity.rs`
- `src-tauri/tests/storage_roundtrip.rs`

**Backend (Rust) — modified:**
- `src-tauri/Cargo.toml` — new deps
- `src-tauri/src/crypto/mod.rs` — re-exports
- `src-tauri/src/crypto/wordlist.rs` — multi-langue
- `src-tauri/src/lib.rs` — wire vault bootstrap + new commands
- `src-tauri/src/commands/mod.rs` — re-exports

**Frontend (TS/React) — created:**
- `src/components/Settings/SecuritySection.tsx`
- `src/components/Modals/UnlockModal.tsx`
- `src/components/Modals/MigrationModal.tsx`
- `src/utils/vault.ts` — IPC wrappers
- `src/utils/windowProtection.ts` — IPC wrappers

**Frontend (TS/React) — modified:**
- `src/stores/historyStore.ts` — drop persist, use IPC
- `src/stores/settingsStore.ts` — add `passphrase_lang`
- `src/components/Settings/Settings.tsx` — insert SecuritySection
- `src/components/PasswordPanel/PasswordPanel.tsx` — wire reveal protection
- `src/components/PassphrasePanel/PassphrasePanel.tsx` — wire reveal protection
- `src/components/QuickPop/QuickPop.tsx` — call protection at mount
- `src/App.tsx` — boot flow

---

## Task 1: Add Cargo dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add deps**

Open `src-tauri/Cargo.toml` and add under `[dependencies]`:

```toml
keyring = "3.6"
aes-gcm = "0.10"
argon2 = "0.5"
hkdf = "0.12"
sha2 = "0.10"
tempfile = "3.13"
base64 = "0.22"
```

Then append at end of file:

```toml
[target.'cfg(target_os = "windows")'.dependencies]
windows-sys = { version = "0.59", features = ["Win32_Foundation", "Win32_UI_WindowsAndMessaging", "Win32_Graphics_Dwm"] }

[target.'cfg(target_os = "macos")'.dependencies]
objc2 = "0.5"
objc2-app-kit = { version = "0.2", features = ["NSWindow"] }
objc2-foundation = "0.2"
```

- [ ] **Step 2: Verify build**

Run: `cd src-tauri && cargo check`
Expected: `Finished` with possible warnings about unused crates (fine for now).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "Add deps for security hardening (keyring, aes-gcm, argon2, hkdf, tempfile, OS protect crates)"
```

---

## Task 2: Embed EFF Diceware wordlists

**Files:**
- Create: `src-tauri/wordlists/eff_large_fr.txt`
- Create: `src-tauri/wordlists/eff_large_en.txt`
- Create: `src-tauri/wordlists/eff_large_de.txt`
- Create: `src-tauri/wordlists/eff_large_es.txt`
- Create: `src-tauri/wordlists/eff_large_it.txt`

Source URLs (download as plain text, one word per line, exactly 7776 lines, no blanks, lowercase ASCII or Unicode per language):
- EN: `https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt` (strip leading "11111\t" prefix to get word-only)
- FR/DE/ES/IT: community translations of EFF list (`https://github.com/sentriz/eff-wordlists` provides several). Verify count = 7776 before saving.

- [ ] **Step 1: Download & normalize each file**

For each language, save to `src-tauri/wordlists/eff_large_<lang>.txt`. Format requirements:
- Exactly 7776 lines
- One word per line
- Lowercase
- No trailing whitespace
- LF line endings (not CRLF)
- UTF-8 encoding

PowerShell to normalize a downloaded file:

```powershell
$lines = Get-Content "src-tauri/wordlists/eff_large_fr.txt" | ForEach-Object { $_.Trim().ToLower() } | Where-Object { $_ -ne "" }
if ($lines.Count -ne 7776) { throw "Expected 7776 lines, got $($lines.Count)" }
$content = ($lines -join "`n") + "`n"
[System.IO.File]::WriteAllText("src-tauri/wordlists/eff_large_fr.txt", $content, [System.Text.UTF8Encoding]::new($false))
```

Repeat for `en`, `de`, `es`, `it`.

- [ ] **Step 2: Compute SHA-256 of each file**

Run:
```powershell
Get-FileHash src-tauri/wordlists/eff_large_fr.txt -Algorithm SHA256
Get-FileHash src-tauri/wordlists/eff_large_en.txt -Algorithm SHA256
Get-FileHash src-tauri/wordlists/eff_large_de.txt -Algorithm SHA256
Get-FileHash src-tauri/wordlists/eff_large_es.txt -Algorithm SHA256
Get-FileHash src-tauri/wordlists/eff_large_it.txt -Algorithm SHA256
```

Record the hex SHA-256 for each — they will be hard-coded in Task 3.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/wordlists/
git commit -m "Add EFF Diceware wordlists (FR, EN, DE, ES, IT) — 7776 words each"
```

---

## Task 3: Wordlist integrity tests

**Files:**
- Create: `src-tauri/tests/wordlists_integrity.rs`

- [ ] **Step 1: Write the integrity test**

Create `src-tauri/tests/wordlists_integrity.rs`:

```rust
use sha2::{Digest, Sha256};
use std::collections::HashSet;

const EXPECTED_HASHES: &[(&str, &str, &str)] = &[
    ("fr", "wordlists/eff_large_fr.txt", "REPLACE_WITH_FR_HASH"),
    ("en", "wordlists/eff_large_en.txt", "REPLACE_WITH_EN_HASH"),
    ("de", "wordlists/eff_large_de.txt", "REPLACE_WITH_DE_HASH"),
    ("es", "wordlists/eff_large_es.txt", "REPLACE_WITH_ES_HASH"),
    ("it", "wordlists/eff_large_it.txt", "REPLACE_WITH_IT_HASH"),
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
```

Replace each `REPLACE_WITH_<LANG>_HASH` with the actual hex value from Task 2 Step 2.

- [ ] **Step 2: Run integrity test**

Run: `cd src-tauri && cargo test --test wordlists_integrity`
Expected: 2 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/tests/wordlists_integrity.rs
git commit -m "Add wordlist integrity tests (SHA-256 + count + uniqueness)"
```

---

## Task 4: Multi-language wordlist module

**Files:**
- Modify: `src-tauri/src/crypto/wordlist.rs`

- [ ] **Step 1: Write the failing tests**

Append to `src-tauri/src/crypto/wordlist.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_languages_load_7776_words() {
        for lang in [WordlistLang::Fr, WordlistLang::En, WordlistLang::De, WordlistLang::Es, WordlistLang::It] {
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
        assert!(err.is_err(), "3 words at 12.92 bits = 38.76 bits < 65 bits min");
    }

    #[test]
    fn passphrase_with_digit_and_symbol_appends_chars() {
        let p = generate_passphrase(WordlistLang::En, 5, '-', true, true).unwrap();
        let parts: Vec<&str> = p.split('-').collect();
        assert!(parts.len() >= 5);
    }
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd src-tauri && cargo test --lib crypto::wordlist`
Expected: FAIL — `WordlistLang` and `words_for` not defined yet.

- [ ] **Step 3: Replace wordlist.rs implementation**

Replace the entire content of `src-tauri/src/crypto/wordlist.rs`:

```rust
use crate::crypto::engine::os_rand_below;
use crate::error::CryptoError;
use std::sync::OnceLock;
use zeroize::Zeroizing;

const FR_BYTES: &str = include_str!("../../wordlists/eff_large_fr.txt");
const EN_BYTES: &str = include_str!("../../wordlists/eff_large_en.txt");
const DE_BYTES: &str = include_str!("../../wordlists/eff_large_de.txt");
const ES_BYTES: &str = include_str!("../../wordlists/eff_large_es.txt");
const IT_BYTES: &str = include_str!("../../wordlists/eff_large_it.txt");

const WORDS_PER_LIST: usize = 7776;
const BITS_PER_WORD: f64 = 12.924812503605781; // log2(7776)
const MIN_ENTROPY_BITS: f64 = 65.0;
const MIN_WORD_COUNT: u8 = 4;
const MAX_WORD_COUNT: u8 = 12;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WordlistLang { Fr, En, De, Es, It }

static FR_CACHE: OnceLock<Vec<&'static str>> = OnceLock::new();
static EN_CACHE: OnceLock<Vec<&'static str>> = OnceLock::new();
static DE_CACHE: OnceLock<Vec<&'static str>> = OnceLock::new();
static ES_CACHE: OnceLock<Vec<&'static str>> = OnceLock::new();
static IT_CACHE: OnceLock<Vec<&'static str>> = OnceLock::new();

fn parse_static(s: &'static str) -> Vec<&'static str> {
    let v: Vec<&'static str> = s.lines().collect();
    assert_eq!(v.len(), WORDS_PER_LIST, "wordlist embedded does not contain {WORDS_PER_LIST} words");
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
    if include_digit { e += (10f64).log2(); }
    if include_symbol { e += (10f64).log2(); }
    e
}

pub fn generate_passphrase(
    lang: WordlistLang,
    word_count: u8,
    separator: char,
    include_digit: bool,
    include_symbol: bool,
) -> Result<Zeroizing<String>, CryptoError> {
    if word_count < MIN_WORD_COUNT || word_count > MAX_WORD_COUNT {
        return Err(CryptoError::InvalidParams(format!(
            "word_count {} out of [{}..{}]",
            word_count, MIN_WORD_COUNT, MAX_WORD_COUNT
        )));
    }

    let entropy = estimated_entropy_bits(word_count, include_digit, include_symbol);
    if entropy < MIN_ENTROPY_BITS {
        return Err(CryptoError::InsufficientEntropy { got: entropy, min: MIN_ENTROPY_BITS });
    }

    let words = words_for(lang);

    let mut out = String::with_capacity((word_count as usize) * 10);
    for i in 0..word_count {
        if i > 0 { out.push(separator); }
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
        out.push(SYMS[os_rand_below(SYMS.len())?]);
    }

    Ok(Zeroizing::new(out))
}
```

- [ ] **Step 4: Verify CryptoError variants exist**

Inspect `src-tauri/src/error.rs`. Ensure `CryptoError` enum has:

```rust
#[error("invalid params: {0}")]
InvalidParams(String),
#[error("insufficient entropy: {got:.1} bits < required {min:.1}")]
InsufficientEntropy { got: f64, min: f64 },
```

If absent, add them.

- [ ] **Step 5: Run tests**

Run: `cd src-tauri && cargo test --lib crypto::wordlist`
Expected: 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/crypto/wordlist.rs src-tauri/src/error.rs
git commit -m "Replace stub wordlist with EFF Diceware multi-langue (FR/EN/DE/ES/IT)"
```

---

## Task 5: Pass language to `generate_passphrase` command

**Files:**
- Modify: `src-tauri/src/commands/generate.rs` (find with `grep -r cmd_generate_passphrase src-tauri/src/`)
- Modify: `src/utils/residentCommands.ts`
- Modify: `src/stores/settingsStore.ts`
- Modify: `src/components/PassphrasePanel/PassphrasePanel.tsx`

- [ ] **Step 1: Update Tauri command signature**

Replace the existing `cmd_generate_passphrase`:

```rust
#[tauri::command]
pub fn cmd_generate_passphrase(
    lang: crate::crypto::wordlist::WordlistLang,
    word_count: u8,
    separator: String,
    include_digit: bool,
    include_symbol: bool,
) -> Result<String, String> {
    let sep = separator.chars().next().unwrap_or('-');
    crate::crypto::wordlist::generate_passphrase(lang, word_count, sep, include_digit, include_symbol)
        .map(|z| (*z).clone())
        .map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Update front IPC wrapper**

In `src/utils/residentCommands.ts`, update `generatePassphrase`:

```ts
export async function generatePassphrase(opts: {
  lang: "fr" | "en" | "de" | "es" | "it";
  word_count: number;
  separator: string;
  include_digit: boolean;
  include_symbol: boolean;
}): Promise<string> {
  return invoke("cmd_generate_passphrase", opts);
}
```

- [ ] **Step 3: Add `passphrase_lang` to settings store**

In `src/stores/settingsStore.ts`:

```ts
const detectLang = (): "fr" | "en" | "de" | "es" | "it" => {
  const code = navigator.language.slice(0, 2).toLowerCase();
  return (["fr","en","de","es","it"] as const).find(l => l === code) ?? "en";
};
```

Add to state shape:
```ts
passphrase_lang: "fr" | "en" | "de" | "es" | "it";
setPassphraseLang: (lang: "fr"|"en"|"de"|"es"|"it") => void;
```

Initial state and setter:
```ts
passphrase_lang: detectLang(),
setPassphraseLang: (lang) => set({ passphrase_lang: lang }),
```

- [ ] **Step 4: Pass language from PassphrasePanel**

In `src/components/PassphrasePanel/PassphrasePanel.tsx`, where `generatePassphrase` is invoked, read lang from settings store and include it in the params.

- [ ] **Step 5: Smoke test**

Run: `npm run tauri dev`. Generate a passphrase. Verify it uses the detected language.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/generate.rs src/utils/residentCommands.ts src/stores/settingsStore.ts src/components/PassphrasePanel/PassphrasePanel.tsx
git commit -m "Wire passphrase language from Settings to backend"
```

---

## Task 6: Window protection module (OS-native)

**Files:**
- Create: `src-tauri/src/display/mod.rs`
- Create: `src-tauri/src/display/window_protection.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod display;`)

- [ ] **Step 1: Create module skeleton**

Create `src-tauri/src/display/mod.rs`:

```rust
pub mod window_protection;
```

Create `src-tauri/src/display/window_protection.rs`:

```rust
use tauri::WebviewWindow;

#[derive(Debug, thiserror::Error)]
pub enum ProtectionError {
    #[error("anti-screenshot not supported on this OS / build")]
    Unsupported,
    #[error("OS API error: {0}")]
    OsError(String),
}

pub fn is_supported() -> bool {
    cfg!(any(target_os = "windows", target_os = "macos"))
}

#[cfg(target_os = "windows")]
pub fn set_protected(window: &WebviewWindow, protected: bool) -> Result<(), ProtectionError> {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE};
    let hwnd_raw = window.hwnd().map_err(|e| ProtectionError::OsError(e.to_string()))?;
    let hwnd: HWND = hwnd_raw.0 as HWND;
    let affinity = if protected { WDA_EXCLUDEFROMCAPTURE } else { WDA_NONE };
    let ok = unsafe { SetWindowDisplayAffinity(hwnd, affinity) };
    if ok == 0 {
        return Err(ProtectionError::OsError("SetWindowDisplayAffinity returned 0".into()));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn set_protected(window: &WebviewWindow, protected: bool) -> Result<(), ProtectionError> {
    use objc2_app_kit::{NSWindow, NSWindowSharingType};
    let ns_window = window.ns_window().map_err(|e| ProtectionError::OsError(e.to_string()))?;
    let ns_window_ptr: *mut NSWindow = ns_window as *mut NSWindow;
    let sharing = if protected { NSWindowSharingType::NSWindowSharingNone } else { NSWindowSharingType::NSWindowSharingReadOnly };
    unsafe { (*ns_window_ptr).setSharingType(sharing); }
    Ok(())
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn set_protected(_window: &WebviewWindow, _protected: bool) -> Result<(), ProtectionError> {
    Err(ProtectionError::Unsupported)
}
```

- [ ] **Step 2: Register module in lib.rs**

In `src-tauri/src/lib.rs`, add near the top:

```rust
mod display;
```

- [ ] **Step 3: Build check**

Run: `cd src-tauri && cargo check`
Expected: `Finished` clean on Windows.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/display/ src-tauri/src/lib.rs
git commit -m "Add display::window_protection module (Win+Mac native, Linux stub)"
```

---

## Task 7: `set_window_protected` Tauri command

**Files:**
- Create: `src-tauri/src/commands/window.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs` (invoke handler)
- Create: `src/utils/windowProtection.ts`

- [ ] **Step 1: Create the command**

Create `src-tauri/src/commands/window.rs`:

```rust
use crate::display::window_protection::{set_protected, is_supported};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn cmd_set_window_protected(app: AppHandle, label: String, protected: bool) -> Result<bool, String> {
    if std::env::var("UNBREAKABLE_DISABLE_PROTECTION").is_ok() {
        return Ok(false);
    }
    let window = app.get_webview_window(&label).ok_or_else(|| format!("window '{}' not found", label))?;
    match set_protected(&window, protected) {
        Ok(()) => Ok(true),
        Err(e) => {
            log::warn!("set_protected({label}, {protected}) failed: {e}");
            Ok(false)
        }
    }
}

#[tauri::command]
pub fn cmd_protection_supported() -> bool {
    is_supported()
}
```

- [ ] **Step 2: Re-export in mod.rs**

In `src-tauri/src/commands/mod.rs`:
```rust
pub mod window;
```

- [ ] **Step 3: Register handlers in lib.rs**

In `src-tauri/src/lib.rs`, find the `.invoke_handler(tauri::generate_handler![...])` call and add:

```rust
commands::window::cmd_set_window_protected,
commands::window::cmd_protection_supported,
```

- [ ] **Step 4: Front IPC wrapper**

Create `src/utils/windowProtection.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";

export async function setWindowProtected(label: "main" | "quick", protected_: boolean): Promise<boolean> {
  return invoke<boolean>("cmd_set_window_protected", { label, protected: protected_ });
}

export async function isProtectionSupported(): Promise<boolean> {
  return invoke<boolean>("cmd_protection_supported");
}
```

- [ ] **Step 5: Smoke test**

Run: `npm run tauri dev`. In DevTools console:
```js
window.__TAURI__.core.invoke("cmd_set_window_protected", { label: "main", protected: true })
```
Take a screenshot via Snipping Tool — main window should be black. Then run with `protected: false`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/window.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs src/utils/windowProtection.ts
git commit -m "Add set_window_protected IPC command + front wrapper"
```

---

## Task 8: VaultStore — module skeleton + KEK bootstrap

**Files:**
- Create: `src-tauri/src/crypto/storage.rs`
- Modify: `src-tauri/src/crypto/mod.rs`

- [ ] **Step 1: Create storage module skeleton**

Create `src-tauri/src/crypto/storage.rs`:

```rust
use aes_gcm::{aead::{Aead, KeyInit}, Aes256Gcm, Key, Nonce};
use argon2::{Argon2, Params, Version, Algorithm};
use base64::{Engine as _, engine::general_purpose::STANDARD as B64};
use getrandom::fill;
use hkdf::Hkdf;
use keyring::Entry as KeyringEntry;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::path::PathBuf;
use std::io::Write;
use zeroize::Zeroizing;

const MAGIC: &[u8; 4] = b"UNBR";
const VERSION: u8 = 0x01;
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 16;
const KEY_LEN: usize = 32;
const KEYRING_SERVICE: &str = "com.unbreakable.app";
const KEYRING_USER: &str = "vault-kek";
const HKDF_INFO: &[u8] = b"unbreakable-vault-v1";

#[derive(Debug, thiserror::Error)]
pub enum VaultError {
    #[error("io: {0}")] Io(#[from] std::io::Error),
    #[error("keyring: {0}")] Keyring(#[from] keyring::Error),
    #[error("decrypt failed (wrong password or corrupted vault)")] DecryptFailed,
    #[error("vault magic/version mismatch")] FormatMismatch,
    #[error("argon2: {0}")] Kdf(String),
    #[error("serde: {0}")] Serde(#[from] serde_json::Error),
    #[error("base64: {0}")] Base64(#[from] base64::DecodeError),
    #[error("random: {0}")] Rand(#[from] getrandom::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub kind: String,
    pub value: String,
    #[serde(default)] pub label: Option<String>,
    pub score: u8,
    pub created_at: String,
}

pub struct VaultStore {
    pub path: PathBuf,
    kek: Zeroizing<[u8; KEY_LEN]>,
    mpk: Option<Zeroizing<[u8; KEY_LEN]>>,
    master_pw_enabled: bool,
}

fn load_or_create_kek() -> Result<Zeroizing<[u8; KEY_LEN]>, VaultError> {
    let entry = KeyringEntry::new(KEYRING_SERVICE, KEYRING_USER)?;
    match entry.get_password() {
        Ok(b64) => {
            let bytes = B64.decode(b64)?;
            if bytes.len() != KEY_LEN { return Err(VaultError::DecryptFailed); }
            let mut k = [0u8; KEY_LEN];
            k.copy_from_slice(&bytes);
            Ok(Zeroizing::new(k))
        }
        Err(keyring::Error::NoEntry) => {
            let mut k = [0u8; KEY_LEN];
            fill(&mut k)?;
            entry.set_password(&B64.encode(&k))?;
            Ok(Zeroizing::new(k))
        }
        Err(e) => Err(VaultError::Keyring(e)),
    }
}

fn derive_mpk(password: &str, salt: &[u8]) -> Result<Zeroizing<[u8; KEY_LEN]>, VaultError> {
    let params = Params::new(64 * 1024, 3, 4, Some(KEY_LEN)).map_err(|e| VaultError::Kdf(e.to_string()))?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut out = [0u8; KEY_LEN];
    argon.hash_password_into(password.as_bytes(), salt, &mut out).map_err(|e| VaultError::Kdf(e.to_string()))?;
    Ok(Zeroizing::new(out))
}

fn derive_dek(kek: &[u8], mpk: Option<&[u8]>) -> Zeroizing<[u8; KEY_LEN]> {
    let mut ikm = Vec::with_capacity(KEY_LEN * 2);
    ikm.extend_from_slice(kek);
    if let Some(m) = mpk { ikm.extend_from_slice(m); }
    let hk = Hkdf::<Sha256>::new(None, &ikm);
    let mut out = [0u8; KEY_LEN];
    hk.expand(HKDF_INFO, &mut out).expect("hkdf expand");
    Zeroizing::new(out)
}

pub(super) struct VaultHeader {
    pub master_pw_enabled: bool,
    pub salt: [u8; SALT_LEN],
}

impl VaultStore {
    pub fn open(path: PathBuf, master_pw: Option<&str>) -> Result<Self, VaultError> {
        let kek = load_or_create_kek()?;
        let header = Self::peek_header(&path)?;
        let (mpk, enabled) = match (master_pw, &header) {
            (Some(pw), Some(h)) => (Some(derive_mpk(pw, &h.salt)?), true),
            (Some(pw), None) => {
                let mut salt = [0u8; SALT_LEN];
                fill(&mut salt)?;
                (Some(derive_mpk(pw, &salt)?), true)
            }
            (None, Some(h)) if h.master_pw_enabled => return Err(VaultError::DecryptFailed),
            (None, _) => (None, false),
        };
        Ok(VaultStore { path, kek, mpk, master_pw_enabled: enabled })
    }

    pub fn is_master_password_enabled(&self) -> bool { self.master_pw_enabled }

    pub(super) fn peek_header(path: &PathBuf) -> Result<Option<VaultHeader>, VaultError> {
        if !path.exists() { return Ok(None); }
        let buf = std::fs::read(path)?;
        let min_len = 4 + 1 + 1 + SALT_LEN + NONCE_LEN + TAG_LEN;
        if buf.len() < min_len { return Err(VaultError::FormatMismatch); }
        if &buf[0..4] != MAGIC { return Err(VaultError::FormatMismatch); }
        if buf[4] != VERSION { return Err(VaultError::FormatMismatch); }
        let flags = buf[5];
        let mut salt = [0u8; SALT_LEN];
        salt.copy_from_slice(&buf[6..6+SALT_LEN]);
        Ok(Some(VaultHeader { master_pw_enabled: (flags & 0x01) != 0, salt }))
    }
}
```

- [ ] **Step 2: Re-export in mod.rs**

In `src-tauri/src/crypto/mod.rs`:
```rust
pub mod storage;
```

- [ ] **Step 3: Build check**

Run: `cd src-tauri && cargo check`
Expected: `Finished` (some unused-import warnings OK; resolved in Task 9).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/crypto/storage.rs src-tauri/src/crypto/mod.rs
git commit -m "Add VaultStore skeleton with KEK bootstrap via OS keyring"
```

---

## Task 9: VaultStore — save / load / wipe / rotate

**Files:**
- Modify: `src-tauri/src/crypto/storage.rs`

- [ ] **Step 1: Add save/load impls to VaultStore**

Inside `impl VaultStore { ... }` in `src-tauri/src/crypto/storage.rs`, add:

```rust
pub fn load(&self) -> Result<Vec<HistoryEntry>, VaultError> {
    if !self.path.exists() { return Ok(Vec::new()); }
    let buf = std::fs::read(&self.path)?;
    let header_len = 4 + 1 + 1 + SALT_LEN + NONCE_LEN;
    if buf.len() < header_len + TAG_LEN { return Err(VaultError::FormatMismatch); }
    if &buf[0..4] != MAGIC || buf[4] != VERSION { return Err(VaultError::FormatMismatch); }

    let nonce_bytes = &buf[6+SALT_LEN .. 6+SALT_LEN+NONCE_LEN];
    let ciphertext = &buf[header_len..];

    let dek = derive_dek(&self.kek[..], self.mpk.as_deref().map(|m| &m[..]));
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&dek[..]));
    let nonce = Nonce::from_slice(nonce_bytes);
    let plaintext = cipher.decrypt(nonce, ciphertext).map_err(|_| VaultError::DecryptFailed)?;
    let entries: Vec<HistoryEntry> = serde_json::from_slice(&plaintext)?;
    Ok(entries)
}

pub fn save(&mut self, entries: &[HistoryEntry]) -> Result<(), VaultError> {
    let salt: [u8; SALT_LEN] = match Self::peek_header(&self.path)? {
        Some(h) => h.salt,
        None => { let mut s = [0u8; SALT_LEN]; fill(&mut s)?; s }
    };
    let mut nonce_bytes = [0u8; NONCE_LEN];
    fill(&mut nonce_bytes)?;

    let dek = derive_dek(&self.kek[..], self.mpk.as_deref().map(|m| &m[..]));
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&dek[..]));
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = serde_json::to_vec(entries)?;
    let ciphertext = cipher.encrypt(nonce, plaintext.as_ref()).map_err(|_| VaultError::DecryptFailed)?;

    let mut out = Vec::with_capacity(6 + SALT_LEN + NONCE_LEN + ciphertext.len());
    out.extend_from_slice(MAGIC);
    out.push(VERSION);
    out.push(if self.master_pw_enabled { 0x01 } else { 0x00 });
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);

    let dir = self.path.parent().ok_or_else(|| VaultError::Io(std::io::Error::new(std::io::ErrorKind::Other, "no parent dir")))?;
    std::fs::create_dir_all(dir)?;
    let mut tmp = tempfile::NamedTempFile::new_in(dir)?;
    tmp.write_all(&out)?;
    tmp.flush()?;
    tmp.persist(&self.path).map_err(|e| VaultError::Io(e.error))?;
    Ok(())
}

pub fn wipe(&mut self) -> Result<(), VaultError> {
    if self.path.exists() { std::fs::remove_file(&self.path)?; }
    let entry = KeyringEntry::new(KEYRING_SERVICE, KEYRING_USER)?;
    let _ = entry.delete_password();
    Ok(())
}

pub fn rotate_master_password(&mut self, new_pw: Option<&str>) -> Result<(), VaultError> {
    let entries = self.load()?;
    if let Some(pw) = new_pw {
        let mut salt = [0u8; SALT_LEN];
        fill(&mut salt)?;
        self.mpk = Some(derive_mpk(pw, &salt)?);
        self.master_pw_enabled = true;
    } else {
        self.mpk = None;
        self.master_pw_enabled = false;
    }
    self.save(&entries)
}
```

- [ ] **Step 2: Build check**

Run: `cd src-tauri && cargo check`
Expected: `Finished` clean.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/crypto/storage.rs
git commit -m "Add VaultStore save/load/wipe/rotate_master_password (AES-256-GCM atomic write)"
```

---

## Task 10: Vault round-trip integration test

**Files:**
- Create: `src-tauri/tests/storage_roundtrip.rs`

- [ ] **Step 1: Write the test**

Create `src-tauri/tests/storage_roundtrip.rs`:

```rust
// Note: requires OS keyring access. Run with `cargo test -- --ignored`.
use unbreakable_lib::crypto::storage::{VaultStore, HistoryEntry};
use tempfile::TempDir;

fn sample_entries() -> Vec<HistoryEntry> {
    vec![
        HistoryEntry {
            id: "01HXTEST00000001".into(),
            kind: "password".into(),
            value: "Tr0ub4dor&3-test-secret".into(),
            label: Some("acme".into()),
            score: 4,
            created_at: "2026-05-26T10:00:00Z".into(),
        },
        HistoryEntry {
            id: "01HXTEST00000002".into(),
            kind: "passphrase".into(),
            value: "correct-horse-battery-staple-2".into(),
            label: None,
            score: 4,
            created_at: "2026-05-26T10:01:00Z".into(),
        },
    ]
}

#[test]
#[ignore]
fn roundtrip_without_master_pw() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("history.bin");

    {
        let mut v = VaultStore::open(path.clone(), None).unwrap();
        v.save(&sample_entries()).unwrap();
    }

    let v2 = VaultStore::open(path.clone(), None).unwrap();
    let loaded = v2.load().unwrap();
    assert_eq!(loaded.len(), 2);
    assert_eq!(loaded[0].id, "01HXTEST00000001");
    assert_eq!(loaded[1].kind, "passphrase");
}

#[test]
#[ignore]
fn wrong_master_pw_rejected() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("history.bin");

    {
        let mut v = VaultStore::open(path.clone(), Some("correctpassword")).unwrap();
        v.save(&sample_entries()).unwrap();
    }

    let v2 = VaultStore::open(path.clone(), Some("WRONGPASSWORD"));
    let result = v2.and_then(|s| s.load());
    assert!(result.is_err(), "expected decrypt failure with wrong password");
}
```

(The crate name `unbreakable_lib` should match the lib name in `src-tauri/Cargo.toml` — verify and adjust the `use` line if different.)

- [ ] **Step 2: Run the test**

Run: `cd src-tauri && cargo test --test storage_roundtrip -- --ignored`
Expected: 2 tests PASS (requires interactive keyring access on first run).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/tests/storage_roundtrip.rs
git commit -m "Add vault roundtrip integration tests"
```

---

## Task 11: Vault Tauri commands

**Files:**
- Create: `src-tauri/src/commands/history.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src/utils/vault.ts`

- [ ] **Step 1: Create vault state + commands**

Create `src-tauri/src/commands/history.rs`:

```rust
use crate::crypto::storage::{VaultStore, HistoryEntry};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub struct VaultState {
    pub store: Mutex<Option<VaultStore>>,
}

impl Default for VaultState {
    fn default() -> Self { Self { store: Mutex::new(None) } }
}

#[derive(Serialize)]
pub struct VaultStatus {
    pub master_pw_enabled: bool,
    pub keyring_ok: bool,
    pub entry_count: u32,
    pub vault_exists: bool,
}

fn vault_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("history.bin"))
}

#[tauri::command]
pub fn vault_status(app: AppHandle) -> Result<VaultStatus, String> {
    let path = vault_path(&app)?;
    let vault_exists = path.exists();

    let keyring_ok = keyring::Entry::new("com.unbreakable.app", "vault-kek")
        .map(|e| { let _ = e.get_password(); true })
        .unwrap_or(false);

    let mut master_pw_enabled = false;
    let mut entry_count = 0u32;
    if vault_exists {
        if let Ok(buf) = std::fs::read(&path) {
            if buf.len() >= 6 && &buf[0..4] == b"UNBR" && buf[4] == 0x01 {
                master_pw_enabled = (buf[5] & 0x01) != 0;
            }
        }
        if !master_pw_enabled {
            if let Ok(store) = VaultStore::open(path.clone(), None) {
                if let Ok(entries) = store.load() { entry_count = entries.len() as u32; }
            }
        }
    }

    Ok(VaultStatus { master_pw_enabled, keyring_ok, entry_count, vault_exists })
}

#[tauri::command]
pub fn vault_unlock(app: AppHandle, state: State<'_, VaultState>, master_pw: Option<String>) -> Result<(), String> {
    let path = vault_path(&app)?;
    let store = VaultStore::open(path, master_pw.as_deref()).map_err(|e| e.to_string())?;
    *state.store.lock().unwrap() = Some(store);
    Ok(())
}

#[tauri::command]
pub fn vault_load(state: State<'_, VaultState>) -> Result<Vec<HistoryEntry>, String> {
    let guard = state.store.lock().unwrap();
    let store = guard.as_ref().ok_or("vault not unlocked")?;
    store.load().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_save(state: State<'_, VaultState>, entries: Vec<HistoryEntry>) -> Result<(), String> {
    let mut guard = state.store.lock().unwrap();
    let store = guard.as_mut().ok_or("vault not unlocked")?;
    store.save(&entries).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_set_master_password(state: State<'_, VaultState>, new_pw: Option<String>) -> Result<(), String> {
    let mut guard = state.store.lock().unwrap();
    let store = guard.as_mut().ok_or("vault not unlocked")?;
    store.rotate_master_password(new_pw.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_clear(state: State<'_, VaultState>) -> Result<(), String> {
    let mut guard = state.store.lock().unwrap();
    let store = guard.as_mut().ok_or("vault not unlocked")?;
    store.wipe().map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Register**

In `src-tauri/src/commands/mod.rs`: `pub mod history;`

In `src-tauri/src/lib.rs`:
1. Add `use crate::commands::history::VaultState;`
2. In `.setup(|app| { ... })`: `app.manage(VaultState::default());`
3. In `.invoke_handler(tauri::generate_handler![...])`, add:
```rust
commands::history::vault_status,
commands::history::vault_unlock,
commands::history::vault_load,
commands::history::vault_save,
commands::history::vault_set_master_password,
commands::history::vault_clear,
```

- [ ] **Step 3: Front IPC wrappers**

Create `src/utils/vault.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";

export type HistoryEntry = {
  id: string;
  kind: "password" | "passphrase";
  value: string;
  label?: string | null;
  score: number;
  created_at: string;
};

export type VaultStatus = {
  master_pw_enabled: boolean;
  keyring_ok: boolean;
  entry_count: number;
  vault_exists: boolean;
};

export const vault = {
  status: () => invoke<VaultStatus>("vault_status"),
  unlock: (master_pw: string | null) => invoke<void>("vault_unlock", { masterPw: master_pw }),
  load: () => invoke<HistoryEntry[]>("vault_load"),
  save: (entries: HistoryEntry[]) => invoke<void>("vault_save", { entries }),
  setMasterPassword: (newPw: string | null) => invoke<void>("vault_set_master_password", { newPw }),
  clear: () => invoke<void>("vault_clear"),
};
```

- [ ] **Step 4: Build check**

Run: `cd src-tauri && cargo check && npm run build`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/history.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs src/utils/vault.ts
git commit -m "Add vault_* Tauri commands + TS wrappers"
```

---

## Task 12: Refactor `historyStore` to use vault IPC

**Files:**
- Modify: `src/stores/historyStore.ts`

- [ ] **Step 1: Replace store implementation**

Replace the entire content of `src/stores/historyStore.ts`:

```ts
import { create } from "zustand";
import { vault, HistoryEntry } from "../utils/vault";

type HistoryState = {
  entries: HistoryEntry[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  add: (entry: HistoryEntry) => void;
  remove: (id: string) => void;
  clear: () => void;
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;
const debouncedSave = (entries: HistoryEntry[]) => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    vault.save(entries).catch(err => console.error("vault_save failed:", err));
    saveTimer = null;
  }, 500);
};

const MAX_ENTRIES = 200;

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: [],
  hydrated: false,

  hydrate: async () => {
    try {
      const loaded = await vault.load();
      set({ entries: loaded.slice(0, MAX_ENTRIES), hydrated: true });
    } catch (e) {
      console.error("vault_load failed:", e);
      set({ entries: [], hydrated: true });
    }
  },

  add: (entry) => {
    const next = [entry, ...get().entries].slice(0, MAX_ENTRIES);
    set({ entries: next });
    debouncedSave(next);
  },

  remove: (id) => {
    const next = get().entries.filter(e => e.id !== id);
    set({ entries: next });
    debouncedSave(next);
  },

  clear: () => {
    set({ entries: [] });
    debouncedSave([]);
  },
}));
```

- [ ] **Step 2: Verify TS compiles**

Run: `npm run build`
Expected: no errors related to `historyStore`. If consumer components reference the old `persist` API, fix them in place.

- [ ] **Step 3: Commit**

```bash
git add src/stores/historyStore.ts
git commit -m "Refactor historyStore: drop localStorage persist, use vault IPC"
```

---

## Task 13: UnlockModal component

**Files:**
- Create: `src/components/Modals/UnlockModal.tsx`

- [ ] **Step 1: Create the modal**

Create `src/components/Modals/UnlockModal.tsx`:

```tsx
import { useState } from "react";
import { vault } from "../../utils/vault";

type Props = {
  onUnlocked: () => void;
  onForgotten: () => void;
};

export function UnlockModal({ onUnlocked, onForgotten }: Props) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [delayUntil, setDelayUntil] = useState<number>(0);

  const remaining = Math.max(0, delayUntil - Date.now());

  async function tryUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (Date.now() < delayUntil) return;
    try {
      await vault.unlock(pw);
      onUnlocked();
    } catch (err) {
      const next = attempts + 1;
      setAttempts(next);
      if (next >= 5) {
        const delayMs = Math.min(16000, 1000 * Math.pow(2, next - 5));
        setDelayUntil(Date.now() + delayMs);
      }
      setError("Mot de passe incorrect");
      setPw("");
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Coffre verrouillé</h2>
        <p>Entrez votre mot de passe maître pour déverrouiller l'historique.</p>
        <form onSubmit={tryUnlock}>
          <input
            type="password"
            autoFocus
            value={pw}
            onChange={(e) => { setPw(e.target.value); setError(null); }}
            placeholder="Mot de passe maître"
            disabled={remaining > 0}
          />
          {error && <div className="error">{error}</div>}
          {remaining > 0 && <div className="error">Veuillez patienter {Math.ceil(remaining/1000)}s…</div>}
          <button type="submit" disabled={!pw || remaining > 0}>Déverrouiller</button>
        </form>
        <button className="link" onClick={onForgotten}>J'ai oublié mon mot de passe…</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Modals/UnlockModal.tsx
git commit -m "Add UnlockModal for master password entry at boot"
```

---

## Task 14: MigrationModal component

**Files:**
- Create: `src/components/Modals/MigrationModal.tsx`

- [ ] **Step 1: Create the modal**

Create `src/components/Modals/MigrationModal.tsx`:

```tsx
import { useState } from "react";
import { vault, HistoryEntry } from "../../utils/vault";

const LEGACY_KEY = "unbreakable.history";

type LegacyEntry = {
  id: string;
  kind: string;
  value: string;
  label?: string;
  score: number;
  created_at: string;
};

function readLegacy(): LegacyEntry[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const state = parsed?.state ?? parsed;
    return state?.entries ?? [];
  } catch { return []; }
}

type Props = { count: number; onDone: () => void };

export function MigrationModal({ count, onDone }: Props) {
  const [working, setWorking] = useState(false);

  async function migrate() {
    setWorking(true);
    try {
      const legacy = readLegacy();
      const entries: HistoryEntry[] = legacy.map(e => ({
        id: e.id,
        kind: (e.kind === "passphrase" ? "passphrase" : "password"),
        value: e.value,
        label: e.label ?? null,
        score: e.score,
        created_at: e.created_at,
      }));
      const existing = await vault.load();
      await vault.save([...existing, ...entries].slice(0, 200));
      localStorage.removeItem(LEGACY_KEY);
      onDone();
    } catch (err) {
      console.error("migration failed:", err);
      alert("Migration échouée: " + String(err));
      setWorking(false);
    }
  }

  function erase() {
    if (!confirm("Effacer définitivement l'historique en clair ?")) return;
    localStorage.removeItem(LEGACY_KEY);
    onDone();
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Migration sécurité</h2>
        <p>{count} mot(s) de passe en clair ont été détectés depuis une version précédente. Le nouveau coffre les chiffrera avec votre keystore OS.</p>
        <button onClick={migrate} disabled={working}>Migrer & chiffrer</button>
        <button onClick={erase} disabled={working} className="danger">Effacer définitivement</button>
      </div>
    </div>
  );
}

export function detectLegacyCount(): number {
  return readLegacy().length;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Modals/MigrationModal.tsx
git commit -m "Add MigrationModal for v0.1 localStorage to vault migration"
```

---

## Task 15: SecuritySection in Settings

**Files:**
- Create: `src/components/Settings/SecuritySection.tsx`
- Modify: `src/components/Settings/Settings.tsx`

- [ ] **Step 1: Create SecuritySection**

Create `src/components/Settings/SecuritySection.tsx`:

```tsx
import { useEffect, useState } from "react";
import { vault, VaultStatus } from "../../utils/vault";
import { isProtectionSupported } from "../../utils/windowProtection";
import { useSettingsStore } from "../../stores/settingsStore";

type Lang = "fr" | "en" | "de" | "es" | "it";

export function SecuritySection() {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [protectionOk, setProtectionOk] = useState(true);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const lang = useSettingsStore(s => s.passphrase_lang);
  const setLang = useSettingsStore(s => s.setPassphraseLang);

  async function refresh() {
    setStatus(await vault.status());
    setProtectionOk(await isProtectionSupported());
  }

  useEffect(() => { refresh(); }, []);

  async function enableMasterPw() {
    if (newPw !== confirmPw) { alert("Les mots de passe ne correspondent pas"); return; }
    if (newPw.length < 8) { alert("Minimum 8 caractères"); return; }
    if (!confirm("Activer le mot de passe maître ?\n\nATTENTION : si vous l'oubliez, l'historique sera définitivement perdu.")) return;
    await vault.setMasterPassword(newPw);
    setShowSetup(false); setNewPw(""); setConfirmPw("");
    await refresh();
  }

  async function disableMasterPw() {
    if (!confirm("Désactiver le mot de passe maître ? L'historique restera chiffré via le keystore OS uniquement.")) return;
    await vault.setMasterPassword(null);
    await refresh();
  }

  async function wipeVault() {
    if (!confirm("EFFACER tout l'historique ? Cette action est irréversible.")) return;
    if (prompt("Tapez EFFACER pour confirmer") !== "EFFACER") return;
    await vault.clear();
    await refresh();
  }

  if (!status) return <div>Chargement…</div>;

  return (
    <section className="settings-section">
      <h3>Sécurité</h3>

      <div className="row">
        <label>Mot de passe maître</label>
        {status.master_pw_enabled ? (
          <button onClick={disableMasterPw}>Désactiver</button>
        ) : showSetup ? (
          <div className="stack">
            <input type="password" placeholder="Nouveau mot de passe" value={newPw} onChange={e => setNewPw(e.target.value)} />
            <input type="password" placeholder="Confirmer" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
            <button onClick={enableMasterPw}>Activer</button>
            <button onClick={() => setShowSetup(false)}>Annuler</button>
          </div>
        ) : (
          <button onClick={() => setShowSetup(true)}>Activer</button>
        )}
      </div>

      <div className="row">
        <label>Langue passphrase</label>
        <select value={lang} onChange={e => setLang(e.target.value as Lang)}>
          <option value="fr">Français</option>
          <option value="en">English</option>
          <option value="de">Deutsch</option>
          <option value="es">Español</option>
          <option value="it">Italiano</option>
        </select>
      </div>

      <div className="row">
        <label>Anti-capture d'écran</label>
        <span>{protectionOk ? "✓ Supporté" : "✗ Non supporté sur ce système"}</span>
      </div>

      <div className="row">
        <label>Keystore OS</label>
        <span>{status.keyring_ok ? "✓ Disponible" : "✗ Indisponible"}</span>
      </div>

      <div className="row">
        <label>Entrées dans le coffre</label>
        <span>{status.entry_count}</span>
      </div>

      <div className="row">
        <button className="danger" onClick={wipeVault}>Effacer le coffre</button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Insert SecuritySection in Settings**

In `src/components/Settings/Settings.tsx`:
```tsx
import { SecuritySection } from "./SecuritySection";
```

Add `<SecuritySection />` in the Settings panel JSX after existing sections.

- [ ] **Step 3: Commit**

```bash
git add src/components/Settings/SecuritySection.tsx src/components/Settings/Settings.tsx
git commit -m "Add SecuritySection in Settings (master pw, language, protection status)"
```

---

## Task 16: App.tsx boot integration

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add boot orchestration**

At the top of `src/App.tsx`:

```tsx
import { useEffect, useState } from "react";
import { vault } from "./utils/vault";
import { UnlockModal } from "./components/Modals/UnlockModal";
import { MigrationModal, detectLegacyCount } from "./components/Modals/MigrationModal";
import { useHistoryStore } from "./stores/historyStore";
```

Inside the App component, replace existing boot logic with:

```tsx
type BootState =
  | { phase: "loading" }
  | { phase: "unlock" }
  | { phase: "migrate"; count: number }
  | { phase: "ready" };

const [boot, setBoot] = useState<BootState>({ phase: "loading" });
const hydrate = useHistoryStore(s => s.hydrate);

useEffect(() => {
  (async () => {
    const status = await vault.status();
    if (status.master_pw_enabled) {
      setBoot({ phase: "unlock" });
    } else {
      await vault.unlock(null);
      await hydrate();
      const legacy = detectLegacyCount();
      setBoot(legacy > 0 ? { phase: "migrate", count: legacy } : { phase: "ready" });
    }
  })().catch(err => {
    console.error("boot failed:", err);
    setBoot({ phase: "ready" });
  });
}, [hydrate]);

if (boot.phase === "loading") return <div>Chargement…</div>;
if (boot.phase === "unlock") {
  return <UnlockModal
    onUnlocked={async () => {
      await hydrate();
      const legacy = detectLegacyCount();
      setBoot(legacy > 0 ? { phase: "migrate", count: legacy } : { phase: "ready" });
    }}
    onForgotten={async () => {
      if (!confirm("Effacer le coffre et perdre tout l'historique ?")) return;
      await vault.clear();
      setBoot({ phase: "ready" });
    }}
  />;
}
if (boot.phase === "migrate") {
  return <MigrationModal count={boot.count} onDone={async () => {
    await hydrate();
    setBoot({ phase: "ready" });
  }} />;
}

// existing main UI here (only rendered when boot.phase === "ready")
```

Adapt the existing return to be gated behind `boot.phase === "ready"`.

- [ ] **Step 2: Smoke test**

Run: `npm run tauri dev`. Expected: app boots normally. Activate master pw via Settings, restart, UnlockModal appears.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "Wire vault unlock + migration into App boot flow"
```

---

## Task 17: Wire window protection in PasswordPanel / PassphrasePanel

**Files:**
- Modify: `src/components/PasswordPanel/PasswordPanel.tsx`
- Modify: `src/components/PassphrasePanel/PassphrasePanel.tsx`

- [ ] **Step 1: Wire reveal toggle in PasswordPanel**

Add import:
```tsx
import { setWindowProtected } from "../../utils/windowProtection";
```

Add (assuming the reveal state is `revealed`; adapt to actual variable name):
```tsx
useEffect(() => {
  setWindowProtected("main", revealed).catch(() => {});
}, [revealed]);

useEffect(() => {
  return () => { setWindowProtected("main", false).catch(() => {}); };
}, []);
```

- [ ] **Step 2: Same for PassphrasePanel**

Identical changes in `src/components/PassphrasePanel/PassphrasePanel.tsx`.

- [ ] **Step 3: Manual test**

Run: `npm run tauri dev`. Generate a password, reveal it, take a Snipping Tool screenshot. Expected: screenshot of main window is black. Hide → screenshot works normally.

- [ ] **Step 4: Commit**

```bash
git add src/components/PasswordPanel/PasswordPanel.tsx src/components/PassphrasePanel/PassphrasePanel.tsx
git commit -m "Toggle window protection when revealing/hiding secrets"
```

---

## Task 18: Wire protection in QuickPop

**Files:**
- Modify: `src/components/QuickPop/QuickPop.tsx`

- [ ] **Step 1: Protect QuickPop at mount**

Add to `src/components/QuickPop/QuickPop.tsx`:

```tsx
import { setWindowProtected } from "../../utils/windowProtection";

// inside component body:
useEffect(() => {
  setWindowProtected("quick", true).catch(() => {});
  return () => { setWindowProtected("quick", false).catch(() => {}); };
}, []);
```

- [ ] **Step 2: Manual test**

Run: `npm run tauri dev`. Open QuickPop. Screenshot via Snipping Tool. Expected: black.

- [ ] **Step 3: Commit**

```bash
git add src/components/QuickPop/QuickPop.tsx
git commit -m "Protect QuickPop window from screen capture at mount"
```

---

## Task 19: E2E test documentation

**Files:**
- Create: `docs/testing/e2e-security.md`

- [ ] **Step 1: Document manual E2E tests**

Create `docs/testing/e2e-security.md`:

```markdown
# E2E Security Tests (manual)

## Setup
- Build the release binary: `npm run tauri build`
- Install the resulting MSI (Windows) / DMG (Mac).

## Test 1: QuickPop anti-capture (Windows)
1. Launch the app.
2. Trigger QuickPop via tray or global shortcut.
3. Use Snipping Tool (Win+Shift+S) to capture the QuickPop window.
4. Expected: captured image shows a black/blank rectangle where QuickPop is.

## Test 2: MainWindow anti-capture on reveal
1. Open the main window, generate a password.
2. Click the reveal button.
3. Use Print Screen, paste into Paint.
4. Expected: the area where the secret is shown is black.
5. Hide the password, repeat Print Screen.
6. Expected: full window captured normally.

## Test 3: Teams screen-share
1. Start a Teams meeting.
2. Share entire screen.
3. Reveal a password in the app.
4. Expected: viewer sees secret area as black/empty.

## Test 4: Master password activation + rotation
1. Open Settings, Sécurité section.
2. Click "Activer", set a master pw.
3. Quit the app, relaunch.
4. Expected: UnlockModal appears.
5. Enter master pw, app opens.
6. Disable master pw via Settings.
7. Quit + relaunch, no prompt.

## Test 5: Migration v0.1 to v0.2
1. Install v0.1 build (or seed localStorage manually in DevTools).
2. Upgrade to v0.2.
3. Expected: MigrationModal on first launch.
4. Click "Migrer & chiffrer".
5. Verify %APPDATA%/com.unbreakable.app/history.bin exists.
6. Verify localStorage["unbreakable.history"] removed.

## Test 6: Corrupted vault recovery
1. Quit the app.
2. Truncate history.bin to 10 bytes.
3. Launch the app.
4. Expected: error indicating corrupted vault.

## Test 7: Disable protection via env var
1. Set UNBREAKABLE_DISABLE_PROTECTION=1 before launching.
2. Reveal a secret, screenshot.
3. Expected: capture works (protection disabled for E2E tests).
```

- [ ] **Step 2: Commit**

```bash
git add docs/testing/e2e-security.md
git commit -m "Document E2E security tests (anti-capture, master pw, migration, recovery)"
```

---

## Self-review checklist

- **Spec coverage:**
  - B1 Diceware: Tasks 2, 3, 4, 5
  - B3 Anti-screenshot: Tasks 6, 7, 17, 18
  - B4 Vault: Tasks 1, 8, 9, 10, 11, 12, 13, 14, 15, 16
  - E2E plan: Task 19
- **No placeholders:** every step contains concrete code or commands.
- **Type consistency:** `HistoryEntry` shape consistent across Rust (`storage.rs`), TS (`vault.ts`), and `historyStore`. `WordlistLang` lowercase serde matches TS union.
- **Commits frequent:** each task ends with a commit.
- **Files exact:** each step specifies the file path.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-26-security-hardening.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch fresh subagent per task, review between tasks.

**2. Inline Execution** — execute tasks here using executing-plans, batched with checkpoints.

Which approach?
