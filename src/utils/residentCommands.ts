import { invoke } from "@tauri-apps/api/core";

export async function enableTray(enable: boolean): Promise<void> {
  return invoke("enable_tray", { enable });
}
export async function enableAutostart(enable: boolean): Promise<void> {
  return invoke("enable_autostart", { enable });
}
export async function registerShortcut(combo: string): Promise<void> {
  return invoke("register_shortcut", { combo });
}
export async function unregisterShortcut(): Promise<void> {
  return invoke("unregister_shortcut");
}
export async function showQuickWindow(): Promise<void> {
  return invoke("show_quick_window");
}
export async function notifyCopied(kind: "password" | "passphrase", ttl: number): Promise<void> {
  return invoke("notify_copied", { kind, ttl });
}
export async function notifyClipboardCleared(): Promise<void> {
  return invoke("notify_clipboard_cleared");
}
export async function setTrayActive(active: boolean): Promise<void> {
  return invoke("set_tray_active", { active });
}
export async function showMainWindow(): Promise<void> {
  return invoke("show_main_window");
}
