use crate::errors::{Result, UnbreakableError};
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use zeroize::Zeroizing;

#[derive(Default)]
pub struct ClipboardState {
    pub last_written: Mutex<Option<Zeroizing<String>>>,
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
    if let Ok(mut g) = state.last_written.lock() {
        *g = Some(Zeroizing::new(text));
    }
    Ok(())
}

#[tauri::command]
pub fn cmd_clear_clipboard(
    app: AppHandle,
    state: State<'_, ClipboardState>,
) -> Result<()> {
    app.clipboard()
        .clear()
        .map_err(|e| UnbreakableError::Clipboard(e.to_string()))?;
    if let Ok(mut g) = state.last_written.lock() {
        *g = None;
    }
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
pub fn cmd_clear_if_ours(
    app: AppHandle,
    state: State<'_, ClipboardState>,
) -> Result<bool> {
    let last = state
        .last_written
        .lock()
        .ok()
        .and_then(|g| g.as_deref().map(|s| s.to_string()));
    let Some(last) = last else { return Ok(false) };

    let current = app
        .clipboard()
        .read_text()
        .map_err(|e| UnbreakableError::Clipboard(e.to_string()))?;

    if current == last {
        app.clipboard()
            .clear()
            .map_err(|e| UnbreakableError::Clipboard(e.to_string()))?;
        if let Ok(mut g) = state.last_written.lock() {
            *g = None;
        }
        Ok(true)
    } else {
        Ok(false)
    }
}
