use crate::crypto::storage::{HistoryEntry, VaultStore, KEYRING_SERVICE, KEYRING_USER};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub struct VaultState {
    pub store: Mutex<Option<VaultStore>>,
    // P4: entry count tracked in memory so vault_status never re-decrypts the
    // whole vault just to display a number.
    pub entry_count: AtomicU32,
}

impl Default for VaultState {
    fn default() -> Self {
        Self {
            store: Mutex::new(None),
            entry_count: AtomicU32::new(0),
        }
    }
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
pub fn vault_status(app: AppHandle, state: State<'_, VaultState>) -> Result<VaultStatus, String> {
    let path = vault_path(&app)?;
    let vault_exists = path.exists();

    let keyring_ok = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map(|e| {
            let _ = e.get_password();
            true
        })
        .unwrap_or(false);

    let mut master_pw_enabled = false;
    if vault_exists {
        if let Ok(header) = VaultStore::peek_header(&path) {
            master_pw_enabled = header.is_some_and(|h| h.master_pw_enabled);
        }
    }

    let entry_count = state.entry_count.load(Ordering::Relaxed);
    Ok(VaultStatus {
        master_pw_enabled,
        keyring_ok,
        entry_count,
        vault_exists,
    })
}

const MAX_MASTER_PW_LEN: usize = 1024;

fn validate_master_pw(master_pw: &Option<String>) -> Result<(), String> {
    if let Some(pw) = master_pw {
        if pw.len() > MAX_MASTER_PW_LEN {
            return Err(format!(
                "master password too long (max {MAX_MASTER_PW_LEN} bytes)"
            ));
        }
    }
    Ok(())
}

#[tauri::command]
pub fn vault_unlock(
    app: AppHandle,
    state: State<'_, VaultState>,
    master_pw: Option<String>,
) -> Result<(), String> {
    validate_master_pw(&master_pw)?;
    let path = vault_path(&app)?;
    let store = VaultStore::open(path, master_pw.as_deref()).map_err(|e| e.to_string())?;
    // Verify the key material actually decrypts the vault before accepting it.
    // Without this, a wrong master password is silently accepted, the history
    // appears empty, and the first save re-encrypts with a wrong key —
    // permanently destroying the vault.
    let entries = store
        .load()
        .map_err(|_| "mot de passe incorrect".to_string())?;
    state
        .entry_count
        .store(entries.len() as u32, Ordering::Relaxed);
    *state.store.lock().unwrap_or_else(|p| p.into_inner()) = Some(store);
    Ok(())
}

#[tauri::command]
pub fn vault_load(state: State<'_, VaultState>) -> Result<Vec<HistoryEntry>, String> {
    let guard = state.store.lock().unwrap_or_else(|p| p.into_inner());
    let store = guard.as_ref().ok_or("vault not unlocked")?;
    store.load().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_save(state: State<'_, VaultState>, entries: Vec<HistoryEntry>) -> Result<(), String> {
    let mut guard = state.store.lock().unwrap_or_else(|p| p.into_inner());
    let store = guard.as_mut().ok_or("vault not unlocked")?;
    store.save(&entries).map_err(|e| e.to_string())?;
    drop(guard);
    state
        .entry_count
        .store(entries.len() as u32, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub fn vault_set_master_password(
    state: State<'_, VaultState>,
    new_pw: Option<String>,
) -> Result<(), String> {
    validate_master_pw(&new_pw)?;
    let mut guard = state.store.lock().unwrap_or_else(|p| p.into_inner());
    let store = guard.as_mut().ok_or("vault not unlocked")?;
    store
        .rotate_master_password(new_pw.as_deref())
        .map_err(|e| e.to_string())
}

/// Wipe the vault file and keyring KEK. Requires the master password when one
/// is enabled — wiping is a destructive operation gated by the same secret that
/// protects the data (CWE-306: missing authentication on destructive command).
#[tauri::command]
pub fn vault_clear(
    app: AppHandle,
    state: State<'_, VaultState>,
    master_pw: Option<String>,
) -> Result<(), String> {
    validate_master_pw(&master_pw)?;
    let path = vault_path(&app)?;

    // Authenticate before destroying anything when a master password is enabled.
    if path.exists() {
        let header = VaultStore::peek_header(&path).map_err(|e| e.to_string())?;
        if header.as_ref().is_some_and(|h| h.master_pw_enabled) {
            let store = VaultStore::open(path.clone(), master_pw.as_deref())
                .and_then(|s| s.load().map(|_| s))
                .map_err(|_| "master password requis ou incorrect".to_string())?;
            drop(store);
        }
    }

    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    // Wipe the keyring entry so a fresh KEK is created on next open.
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER) {
        let _ = entry.delete_credential();
    }
    // Reset the in-memory store so subsequent vault_status / vault_unlock reflect the wipe.
    *state.store.lock().unwrap_or_else(|p| p.into_inner()) = None;
    state.entry_count.store(0, Ordering::Relaxed);
    Ok(())
}
