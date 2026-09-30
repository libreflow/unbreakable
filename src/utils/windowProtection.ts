import { invoke } from "@tauri-apps/api/core";

export async function setWindowProtected(
  label: "main" | "quick",
  protected_: boolean,
): Promise<boolean> {
  return invoke<boolean>("cmd_set_window_protected", { label, protected: protected_ });
}

export async function isProtectionSupported(): Promise<boolean> {
  return invoke<boolean>("cmd_protection_supported");
}
