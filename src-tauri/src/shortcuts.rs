use tauri::{AppHandle, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use crate::quick_window;

pub fn register<R: Runtime>(app: &AppHandle<R>, combo: &str) -> Result<(), String> {
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
    app.global_shortcut().unregister_all().map_err(|e| e.to_string())
}
