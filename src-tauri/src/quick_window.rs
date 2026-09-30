use tauri::{AppHandle, Manager, PhysicalPosition, Runtime, WebviewUrl, WebviewWindowBuilder};

const QUICK_LABEL: &str = "quick";
const QUICK_W: f64 = 360.0;
const QUICK_H: f64 = 180.0;

pub fn show_or_create<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(QUICK_LABEL) {
        existing.show().map_err(|e| e.to_string())?;
        existing.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    let window = WebviewWindowBuilder::new(app, QUICK_LABEL, WebviewUrl::App("quick.html".into()))
        .inner_size(QUICK_W, QUICK_H)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .transparent(true)
        .focused(true)
        .build()
        .map_err(|e| e.to_string())?;
    center_on_active_monitor(&window)?;
    Ok(())
}

fn center_on_active_monitor<R: Runtime>(window: &tauri::WebviewWindow<R>) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no monitor".to_string())?;
    let scale = monitor.scale_factor();
    let m_size = monitor.size();
    let m_pos = monitor.position();
    let logical_w = (m_size.width as f64) / scale;
    let logical_h = (m_size.height as f64) / scale;
    let x = m_pos.x + ((logical_w - QUICK_W) / 2.0 * scale) as i32;
    let y = m_pos.y + ((logical_h - QUICK_H) / 2.0 * scale) as i32;
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}
