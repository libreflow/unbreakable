use crate::display::window_protection::{is_supported, set_protected};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn cmd_set_window_protected(
    app: AppHandle,
    label: String,
    protected: bool,
) -> Result<bool, String> {
    if std::env::var("UNBREAKABLE_DISABLE_PROTECTION").is_ok() {
        return Ok(false);
    }
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("window '{}' not found", label))?;
    match set_protected(&window, protected) {
        Ok(()) => Ok(true),
        Err(e) => {
            eprintln!("set_protected({label}, {protected}) failed: {e}");
            Ok(false)
        }
    }
}

#[tauri::command]
pub fn cmd_protection_supported() -> bool {
    is_supported()
}
