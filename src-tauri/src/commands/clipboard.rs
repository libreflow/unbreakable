use crate::errors::{Result, UnbreakableError};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use zeroize::Zeroizing;

#[derive(Default)]
pub struct ClipboardState {
    pub last_written: Mutex<Option<Zeroizing<String>>>,
}

/// Crash-recovery sentinel: a SHA-256 of the last secret written to the OS
/// clipboard, persisted to app_data. On next launch, if the clipboard still
/// matches the hash, the secret survived a crash and is cleared.
fn sentinel_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|d| d.join("clipboard.sentinel"))
}

fn write_sentinel(app: &AppHandle, text: &str) {
    let Some(path) = sentinel_path(app) else {
        return;
    };
    use sha2::{Digest, Sha256};
    let hash = Sha256::digest(text.as_bytes());
    let _ = std::fs::write(path, hex_encode(&hash));
}

fn clear_sentinel(app: &AppHandle) {
    if let Some(path) = sentinel_path(app) {
        let _ = std::fs::remove_file(path);
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Called once at app startup: if a previous session crashed with a secret
/// still in the clipboard, clear it now.
pub fn recover_stale_clipboard(app: &AppHandle) {
    let Some(path) = sentinel_path(app) else {
        return;
    };
    let Ok(hash) = std::fs::read_to_string(&path) else {
        return;
    };
    let _ = std::fs::remove_file(&path);
    if let Ok(current) = app.clipboard().read_text() {
        use sha2::{Digest, Sha256};
        if hex_encode(&Sha256::digest(current.as_bytes())) == hash {
            let _ = app.clipboard().clear();
        }
    }
}

#[tauri::command]
pub fn cmd_copy_to_clipboard(
    app: AppHandle,
    state: State<'_, ClipboardState>,
    text: String,
) -> Result<()> {
    app.clipboard()
        .write_text(text.clone())
        .map_err(|e| UnbreakableError::Clipboard(e.to_string()))?;
    write_sentinel(&app, &text);
    if let Ok(mut g) = state.last_written.lock() {
        *g = Some(Zeroizing::new(text));
    }
    Ok(())
}

#[tauri::command]
pub fn cmd_clear_clipboard(app: AppHandle, state: State<'_, ClipboardState>) -> Result<()> {
    app.clipboard()
        .clear()
        .map_err(|e| UnbreakableError::Clipboard(e.to_string()))?;
    if let Ok(mut g) = state.last_written.lock() {
        *g = None;
    }
    clear_sentinel(&app);
    Ok(())
}

#[tauri::command]
pub fn cmd_read_clipboard(app: AppHandle) -> Result<String> {
    app.clipboard()
        .read_text()
        .map_err(|e| UnbreakableError::Clipboard(e.to_string()))
}

/// Clear clipboard only if its current contents match what we last wrote.
/// Returns true if a clear happened, false if user has since modified clipboard.
#[tauri::command]
pub fn cmd_clear_if_ours(app: AppHandle, state: State<'_, ClipboardState>) -> Result<bool> {
    let guard = state
        .last_written
        .lock()
        .map_err(|_| UnbreakableError::Clipboard("lock poisoned".into()))?;
    let Some(last) = guard.as_deref() else {
        return Ok(false);
    };

    let current = app
        .clipboard()
        .read_text()
        .map_err(|e| UnbreakableError::Clipboard(e.to_string()))?;

    if current.as_str() == last {
        app.clipboard()
            .clear()
            .map_err(|e| UnbreakableError::Clipboard(e.to_string()))?;
        if let Ok(mut g) = state.last_written.lock() {
            *g = None;
        }
        clear_sentinel(&app);
        Ok(true)
    } else {
        Ok(false)
    }
}
