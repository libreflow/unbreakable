use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecretCopiedPayload {
    pub kind: String,
    pub ttl: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsChangedPayload {
    pub key: String,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrayIconStatePayload {
    pub state: String,
}

pub const EVT_SECRET_COPIED: &str = "secret-copied";
pub const EVT_SETTINGS_CHANGED: &str = "settings-changed";
pub const EVT_CLIPBOARD_CLEARED: &str = "clipboard-cleared";
pub const EVT_TRAY_ICON_STATE: &str = "tray-icon-state";
