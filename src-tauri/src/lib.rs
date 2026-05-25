mod commands;
mod crypto;
mod errors;

use commands::clipboard::{
    cmd_clear_clipboard, cmd_clear_if_ours, cmd_copy_to_clipboard, cmd_read_clipboard,
    ClipboardState,
};
use commands::generate::{cmd_generate_pair, cmd_generate_passphrase, cmd_generate_password};
use tauri::{Manager, WindowEvent};
use tauri_plugin_clipboard_manager::ClipboardExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(ClipboardState::default())
        .invoke_handler(tauri::generate_handler![
            cmd_generate_password,
            cmd_generate_passphrase,
            cmd_generate_pair,
            cmd_copy_to_clipboard,
            cmd_clear_clipboard,
            cmd_read_clipboard,
            cmd_clear_if_ours,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                let app = window.app_handle().clone();
                let state = app.state::<ClipboardState>();
                let last = state.last_written.lock().ok().and_then(|g| g.as_deref().map(|s| s.to_string()));
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
