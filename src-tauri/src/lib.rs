mod commands;
pub mod crypto;
mod display;
mod errors;
mod events;
mod quick_window;
mod resident_commands;
mod shortcuts;
mod tray;

use commands::clipboard::{cmd_clear_if_ours, cmd_copy_to_clipboard, ClipboardState};
use commands::generate::{
    cmd_generate_memorable, cmd_generate_pair, cmd_generate_passphrase, cmd_generate_password,
};
use commands::history::VaultState;
use tauri::{Manager, WindowEvent};
use tauri_plugin_clipboard_manager::ClipboardExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_notification::init())
        .manage(ClipboardState::default())
        .manage(VaultState::default())
        .setup(|app| {
            commands::clipboard::recover_stale_clipboard(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cmd_generate_password,
            cmd_generate_memorable,
            cmd_generate_passphrase,
            cmd_generate_pair,
            cmd_copy_to_clipboard,
            cmd_clear_if_ours,
            resident_commands::enable_tray,
            resident_commands::enable_autostart,
            resident_commands::register_shortcut,
            resident_commands::unregister_shortcut,
            resident_commands::show_quick_window,
            resident_commands::show_main_window,
            resident_commands::notify_copied,
            resident_commands::notify_clipboard_cleared,
            resident_commands::set_tray_active,
            resident_commands::notify_generation_failed,
            commands::window::cmd_set_window_protected,
            commands::window::cmd_protection_supported,
            commands::history::vault_status,
            commands::history::vault_unlock,
            commands::history::vault_load,
            commands::history::vault_save,
            commands::history::vault_set_master_password,
            commands::history::vault_clear,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                let app = window.app_handle().clone();
                let state = app.state::<ClipboardState>();
                let last = state
                    .last_written
                    .lock()
                    .ok()
                    .and_then(|g| g.as_deref().map(|s| s.to_string()));
                if let Some(last) = last {
                    if let Ok(current) = app.clipboard().read_text() {
                        if current == last {
                            let _ = app.clipboard().clear();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
