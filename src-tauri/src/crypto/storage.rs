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
