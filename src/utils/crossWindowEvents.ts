import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

export type SecretCopiedPayload = { kind: "password" | "passphrase"; ttl: number };
export type SettingsChangedPayload = { key: string; value: unknown };
export type ClipboardClearedPayload = Record<string, never>;
export type TrayIconStatePayload = { state: "idle" | "active" };

export const EVT = {
  secretCopied: "secret-copied",
  settingsChanged: "settings-changed",
  clipboardCleared: "clipboard-cleared",
  trayIconState: "tray-icon-state",
} as const;

export function isSecretCopiedPayload(p: unknown): p is SecretCopiedPayload {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return (o.kind === "password" || o.kind === "passphrase") && typeof o.ttl === "number";
}

export function isSettingsChangedPayload(p: unknown): p is SettingsChangedPayload {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return typeof o.key === "string";
}

export function isTrayIconStatePayload(p: unknown): p is TrayIconStatePayload {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return o.state === "idle" || o.state === "active";
}

export async function emitSecretCopied(p: SecretCopiedPayload) {
  return emit(EVT.secretCopied, p);
}
export async function emitSettingsChanged(p: SettingsChangedPayload) {
  return emit(EVT.settingsChanged, p);
}
export async function emitClipboardCleared() {
  return emit(EVT.clipboardCleared, {});
}
export async function emitTrayIconState(p: TrayIconStatePayload) {
  return emit(EVT.trayIconState, p);
}

export async function listenSecretCopied(
  cb: (p: SecretCopiedPayload) => void,
): Promise<UnlistenFn> {
  return listen<SecretCopiedPayload>(EVT.secretCopied, (e) => {
    if (isSecretCopiedPayload(e.payload)) cb(e.payload);
  });
}
export async function listenSettingsChanged(
  cb: (p: SettingsChangedPayload) => void,
): Promise<UnlistenFn> {
  return listen<SettingsChangedPayload>(EVT.settingsChanged, (e) => {
    if (isSettingsChangedPayload(e.payload)) cb(e.payload);
  });
}
export async function listenClipboardCleared(cb: () => void): Promise<UnlistenFn> {
  return listen(EVT.clipboardCleared, () => cb());
}
