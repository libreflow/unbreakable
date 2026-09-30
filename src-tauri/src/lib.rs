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
            // Stale-clipboard recovery reads the OS clipboard and touches the
            // sentinel file - run it off the main thread so a contended
            // clipboard (clipboard manager, AV) cannot freeze the app at boot.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                commands::clipboard::recover_stale_clipboard(&handle);
            });
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
                // Snapshot the last-written secret under a short lock, then
                // do the clipboard read/clear on a blocking thread: the main
                // thread must never wait on clipboard contention (otherwise
                // the window shows "not responding" on close).
                let last = {
                    let state = app.state::<ClipboardState>();
                    state
                        .last_written
                        .lock()
                        .ok()
                        .and_then(|g| g.as_deref().map(|s| s.to_string()))
                };
                if let Some(last) = last {
                    tauri::async_runtime::spawn_blocking(move || {
                        if let Ok(current) = app.clipboard().read_text() {
                            if current == last {
                                let _ = app.clipboard().clear();
                            }
                        }
                    });
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
