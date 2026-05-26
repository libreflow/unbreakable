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
pub fn vault_clear(app: AppHandle, state: State<'_, VaultState>) -> Result<(), String> {
    let path = vault_path(&app)?;
    // Wipe the vault file directly — no unlock required (physical access already
    // implies the user can delete the data dir manually).
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    // Wipe the keyring entry so a fresh KEK is created on next open.
    if let Ok(entry) = keyring::Entry::new("com.unbreakable.app", "vault-kek") {
        let _ = entry.delete_credential();
    }
    // Reset the in-memory store so subsequent vault_status / vault_unlock reflect the wipe.
    *state.store.lock().unwrap() = None;
    Ok(())
}
