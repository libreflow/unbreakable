use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_notification::NotificationExt;

use crate::{quick_window, shortcuts, tray};

#[tauri::command]
pub fn enable_tray<R: Runtime>(app: AppHandle<R>, enable: bool) -> Result<(), String> {
    if enable { tray::install(&app) } else { tray::uninstall(&app) }
}

#[tauri::command]
pub fn enable_autostart<R: Runtime>(app: AppHandle<R>, enable: bool) -> Result<(), String> {
    let mgr = app.autolaunch();
    if enable {
        mgr.enable().map_err(|e| e.to_string())
    } else {
        mgr.disable().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn register_shortcut<R: Runtime>(app: AppHandle<R>, combo: String) -> Result<(), String> {
    shortcuts::register(&app, &combo)
}

#[tauri::command]
pub fn unregister_shortcut<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    shortcuts::unregister(&app)
}

#[tauri::command]
pub fn show_quick_window<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    quick_window::show_or_create(&app)
}

#[tauri::command]
pub fn hide_quick_window<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    quick_window::hide(&app)
}

#[tauri::command]
pub fn show_main_window<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn notify_copied<R: Runtime>(app: AppHandle<R>, kind: String, ttl: u32) -> Result<(), String> {
    let label = if kind == "password" { "Mot de passe" } else { "Passphrase" };
    let body = if ttl > 0 {
        format!("{label} copié · {ttl} s avant effacement")
    } else {
        format!("{label} copié")
    };
    app.notification()
        .builder()
        .title("Unbreakable")
        .body(body)
        .show()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn notify_clipboard_cleared<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    app.notification()
        .builder()
        .title("Unbreakable")
        .body("Presse-papiers effacé")
        .show()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_tray_active<R: Runtime>(app: AppHandle<R>, active: bool) -> Result<(), String> {
    tray::set_active(&app, active)
}
