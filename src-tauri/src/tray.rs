use tauri::{
    image::Image,
    include_image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};

use crate::quick_window;

const TRAY_ID: &str = "main-tray";

pub fn install<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if app.tray_by_id(TRAY_ID).is_some() {
        return Ok(());
    }
    let open_item = MenuItem::with_id(app, "tray-open", "Ouvrir Unbreakable", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let gen_pwd = MenuItem::with_id(app, "tray-gen-pwd", "Générer & copier mot de passe", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let gen_phrase = MenuItem::with_id(app, "tray-gen-phrase", "Générer & copier passphrase", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let quit = MenuItem::with_id(app, "tray-quit", "Quitter", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let sep1 = PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?;
    let sep2 = PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?;
    let menu = Menu::with_items(app, &[&gen_pwd, &gen_phrase, &sep1, &open_item, &sep2, &quit])
        .map_err(|e| e.to_string())?;

    let icon = load_icon(false);
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "tray-open" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "tray-gen-pwd" | "tray-gen-phrase" => {
                if let Some(w) = app.get_webview_window("main") {
                    let kind = if event.id.as_ref() == "tray-gen-pwd" { "password" } else { "passphrase" };
                    let _ = w.emit("tray-generate-and-copy", kind);
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "tray-quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let app = tray.app_handle().clone();
                let _ = quick_window::show_or_create(&app);
            }
        })
        .build(app)
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn uninstall<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    app.remove_tray_by_id(TRAY_ID);
    Ok(())
}

pub fn set_active<R: Runtime>(app: &AppHandle<R>, active: bool) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let icon = load_icon(active);
        tray.set_icon(Some(icon)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn load_icon(active: bool) -> Image<'static> {
    if active {
        include_image!("icons/tray-active.png")
    } else {
        include_image!("icons/tray.png")
    }
}
