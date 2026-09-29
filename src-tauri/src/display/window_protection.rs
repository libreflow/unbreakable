use tauri::WebviewWindow;

#[derive(Debug, thiserror::Error)]
pub enum ProtectionError {
    #[error("anti-screenshot not supported on this OS / build")]
    #[allow(dead_code)] // only constructed on the Linux (not windows/macos) cfg branch below;
    // this file is compiled per-target so CI on Windows/macOS never sees
    // the construction site, but the variant is real on Linux builds.
    Unsupported,
    #[error("OS API error: {0}")]
    #[allow(dead_code)] // only constructed on the windows/macos cfg branches below;
    // this file is compiled per-target so CI on Linux never sees
    // the construction sites, but the variant is real on Win/macOS.
    OsError(String),
}

pub fn is_supported() -> bool {
    cfg!(any(target_os = "windows", target_os = "macos"))
}

#[cfg(target_os = "windows")]
pub fn set_protected(window: &WebviewWindow, protected: bool) -> Result<(), ProtectionError> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE,
    };
    // tauri::WebviewWindow::hwnd() returns windows::Win32::Foundation::HWND
    // whose inner field .0 is *mut core::ffi::c_void.
    // windows_sys::Win32::Foundation::HWND is also *mut core::ffi::c_void,
    // so the cast is a no-op pointer cast.
    let hwnd_raw = window
        .hwnd()
        .map_err(|e| ProtectionError::OsError(e.to_string()))?;
    let hwnd: windows_sys::Win32::Foundation::HWND = hwnd_raw.0;
    let affinity = if protected {
        WDA_EXCLUDEFROMCAPTURE
    } else {
        WDA_NONE
    };
    let ok = unsafe { SetWindowDisplayAffinity(hwnd, affinity) };
    if ok == 0 {
        return Err(ProtectionError::OsError(
            "SetWindowDisplayAffinity returned 0".into(),
        ));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn set_protected(window: &WebviewWindow, protected: bool) -> Result<(), ProtectionError> {
    use objc2_app_kit::{NSWindow, NSWindowSharingType};
    let ns_window = window
        .ns_window()
        .map_err(|e| ProtectionError::OsError(e.to_string()))?;
    let ns_window_ptr: *mut NSWindow = ns_window as *mut NSWindow;
    let sharing = if protected {
        NSWindowSharingType::NSWindowSharingNone
    } else {
        NSWindowSharingType::NSWindowSharingReadOnly
    };
    unsafe { (*ns_window_ptr).setSharingType(sharing) };
    Ok(())
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn set_protected(_window: &WebviewWindow, _protected: bool) -> Result<(), ProtectionError> {
    Err(ProtectionError::Unsupported)
}
