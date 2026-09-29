use crate::quick_window;
use tauri::{AppHandle, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const MAX_COMBO_LEN: usize = 64;

/// Validate a global-shortcut combo before handing it to the plugin.
/// Accepted modifiers (Tauri 2 grammar) + a final key, e.g. "CommandOrControl+Alt+P".
fn validate_combo(combo: &str) -> Result<(), String> {
    if combo.is_empty() || combo.len() > MAX_COMBO_LEN {
        return Err("invalid shortcut combo".into());
    }
    const MODIFIERS: [&str; 6] = [
        "CommandOrControl",
        "Ctrl",
        "Control",
        "Alt",
        "Shift",
        "Super",
    ];
    let parts: Vec<&str> = combo.split('+').collect();
    if parts.len() < 2 {
        return Err("shortcut combo must contain at least one modifier and one key".into());
    }
    let mut saw_key = false;
    for part in parts {
        if MODIFIERS.contains(&part) {
            if saw_key {
                return Err("invalid shortcut combo".into());
            }
            continue;
        }
        if saw_key {
            return Err("invalid shortcut combo".into());
        }
        if part.is_empty() || part.chars().count() > 2 {
            return Err("invalid shortcut combo".into());
        }
        saw_key = true;
    }
    if !saw_key {
        return Err("shortcut combo must end with a key".into());
    }
    Ok(())
}

pub fn register<R: Runtime>(app: &AppHandle<R>, combo: &str) -> Result<(), String> {
    validate_combo(combo)?;
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let handle = app.clone();
    gs.on_shortcut(combo, move |_app, _shortcut, event| {
        if event.state() == ShortcutState::Pressed {
            let h = handle.clone();
            tauri::async_runtime::spawn(async move {
                let _ = quick_window::show_or_create(&h);
            });
        }
    })
    .map_err(|e| format!("register_shortcut failed: {e}"))
}

pub fn unregister<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::validate_combo;

    #[test]
    fn accepts_valid_combo() {
        assert!(validate_combo("CommandOrControl+Alt+P").is_ok());
        assert!(validate_combo("Ctrl+Shift+K").is_ok());
        assert!(validate_combo("Alt+F1").is_ok());
    }

    #[test]
    fn rejects_combo_without_key() {
        assert!(validate_combo("Ctrl+Alt").is_err());
    }

    #[test]
    fn rejects_combo_without_modifier() {
        assert!(validate_combo("P").is_err());
    }

    #[test]
    fn rejects_empty_and_overlong() {
        assert!(validate_combo("").is_err());
        assert!(validate_combo(&"Ctrl+A".repeat(30)).is_err());
    }

    #[test]
    fn rejects_key_before_modifier() {
        assert!(validate_combo("A+Ctrl").is_err());
    }
}
