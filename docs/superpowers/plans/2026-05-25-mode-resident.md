# Mode Résident — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in resident-mode features to Unbreakable — tray icon, global shortcut, autostart, system notifications, and an instant mini-pop — without changing any existing default behavior.

**Architecture:** Each feature is gated by an independent settings toggle that wires/un-wires the corresponding OS-side machinery via Tauri commands. A second Vite entry (`quick.html` → `quick.tsx`) renders a small React app for the mini-pop window, which Tauri creates programmatically on demand. Cross-window state flows through four named Tauri events; localStorage remains the single persistence source.

**Tech Stack:** Tauri 2, React 19, TypeScript 6, Vite 8, Zustand 5, Vitest 4. Three new Tauri plugins: `tauri-plugin-global-shortcut`, `tauri-plugin-autostart`, `tauri-plugin-notification`.

**Reference:** Spec at `docs/superpowers/specs/2026-05-25-mode-resident-design.md`.

**Test pragmatics:** The project has Vitest installed but zero existing tests. We add Vitest tests for pure logic (settings mutations, event payload shapes). Tauri-runtime features (window creation, tray menu, OS shortcut registration) are validated with a manual smoke checklist (Task 17) — automated end-to-end Tauri testing is heavier than this feature warrants.

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `src-tauri/src/resident_commands.rs` | IPC commands invoked by the JS settings store |
| `src-tauri/src/tray.rs` | Tray icon, menu, event handlers |
| `src-tauri/src/shortcuts.rs` | Register / unregister global shortcut |
| `src-tauri/src/quick_window.rs` | Build / show / destroy the `quick` window, position centered |
| `src-tauri/src/events.rs` | Typed event payloads shared by all modules |
| `src/quick.tsx` | Vite entry point for the mini-pop window |
| `src/components/QuickPop/QuickPop.tsx` | React component for the mini-pop UI |
| `src/components/QuickPop/QuickPop.css` | Mini-pop styles |
| `src/components/Settings/ResidentModeSection.tsx` | Settings UI section |
| `src/utils/residentCommands.ts` | Thin TS wrappers around the new Tauri IPC commands |
| `src/utils/crossWindowEvents.ts` | Typed `emit`/`listen` helpers for the 4 cross-window events |
| `quick.html` | HTML entry for the `quick` window |
| `src-tauri/icons/tray.png` | Tray icon (monochrome) — placeholder, see Task 9 |
| `src-tauri/icons/tray-active.png` | Tray icon variant during TTL active |
| `tests/settingsStore.test.ts` | Vitest — settings store resident-mode fields |
| `tests/crossWindowEvents.test.ts` | Vitest — payload type guards |
| `vitest.config.ts` | Vitest configuration |

**Modified files:**

| Path | Change |
|---|---|
| `src-tauri/Cargo.toml` | Add 3 plugin dependencies |
| `src-tauri/src/lib.rs` (or `main.rs`) | Wire plugins + tray + new commands |
| `src-tauri/tauri.conf.json` | Declare permissions, plugins block (no change required if plugins use defaults) |
| `src-tauri/capabilities/default.json` | Grant minimal permissions to frontend |
| `src/stores/settingsStore.ts` | Add 5 fields + migration step |
| `src/stores/clipboardStore.ts` | Emit `clipboard-cleared`; toggle tray active icon |
| `src/components/Settings/Settings.tsx` | Insert `<ResidentModeSection />` |
| `src/App.tsx` | Boot-time replay + listen `clipboard-cleared` for notification |
| `vite.config.ts` | Multi-entry `rollupOptions.input` |
| `package.json` | Add Tauri plugin npm deps, add `test` script |

---

## Task 1: Add dependencies (Cargo + npm)

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `package.json`

- [ ] **Step 1: Add Rust plugin deps**

Append under `[dependencies]` in `src-tauri/Cargo.toml`:

```toml
tauri-plugin-global-shortcut = "2"
tauri-plugin-autostart = "2"
tauri-plugin-notification = "2"
```

- [ ] **Step 2: Add npm plugin deps + test script**

```powershell
npm install @tauri-apps/plugin-global-shortcut @tauri-apps/plugin-autostart @tauri-apps/plugin-notification
```

Edit `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Verify Vite build still passes**

Run: `npm run build`
Expected: succeeds. The 4 pre-existing `addHistory().catch()` errors are unrelated.

- [ ] **Step 4: Verify Cargo resolves**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: clean compile, downloads the 3 new crates.

---

## Task 2: Vitest config

**Files:**
- Create: `vitest.config.ts`

- [ ] **Step 1: Create the config**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
```

- [ ] **Step 2: Install jsdom**

```powershell
npm install --save-dev jsdom
```

- [ ] **Step 3: Smoke-run**

Run: `npm test`
Expected: `No test files found, exiting with code 0`.

---

## Task 3: Extend settings store schema

**Files:**
- Modify: `src/stores/settingsStore.ts`
- Create: `tests/settingsStore.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/settingsStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useSettings } from "../src/stores/settingsStore";

describe("settingsStore — resident mode defaults", () => {
  beforeEach(() => localStorage.clear());

  it("defaults all resident-mode toggles to false", () => {
    const s = useSettings.getState();
    expect(s.tray_enabled).toBe(false);
    expect(s.autostart_enabled).toBe(false);
    expect(s.shortcut_enabled).toBe(false);
    expect(s.notifications_enabled).toBe(false);
  });

  it("defaults shortcut_combo to CommandOrControl+Alt+P", () => {
    expect(useSettings.getState().shortcut_combo).toBe("CommandOrControl+Alt+P");
  });

  it("set() merges resident-mode fields", () => {
    useSettings.getState().set({ tray_enabled: true });
    expect(useSettings.getState().tray_enabled).toBe(true);
    expect(useSettings.getState().autostart_enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm test`
Expected: 3 failures (`tray_enabled` etc. undefined).

- [ ] **Step 3: Add the 5 fields to the store**

Read `src/stores/settingsStore.ts`. Inside the state interface, add:

```ts
tray_enabled: boolean;
autostart_enabled: boolean;
shortcut_enabled: boolean;
shortcut_combo: string;
notifications_enabled: boolean;
```

In the default state literal, add:

```ts
tray_enabled: false,
autostart_enabled: false,
shortcut_enabled: false,
shortcut_combo: "CommandOrControl+Alt+P",
notifications_enabled: false,
```

If `persist` middleware is used, bump `version` by one and add a `migrate`:

```ts
migrate: (persisted: unknown, _version: number) => {
  const old = (persisted as Record<string, unknown>) ?? {};
  return {
    ...old,
    tray_enabled: old.tray_enabled ?? false,
    autostart_enabled: old.autostart_enabled ?? false,
    shortcut_enabled: old.shortcut_enabled ?? false,
    shortcut_combo: old.shortcut_combo ?? "CommandOrControl+Alt+P",
    notifications_enabled: old.notifications_enabled ?? false,
  } as never;
},
```

- [ ] **Step 4: Tests pass**

Run: `npm test`
Expected: 3 passes.

---

## Task 4: Typed cross-window event helpers

**Files:**
- Create: `src/utils/crossWindowEvents.ts`
- Create: `tests/crossWindowEvents.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/crossWindowEvents.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  isSecretCopiedPayload,
  isSettingsChangedPayload,
  isTrayIconStatePayload,
} from "../src/utils/crossWindowEvents";

describe("crossWindowEvents type guards", () => {
  it("validates secret-copied payload", () => {
    expect(isSecretCopiedPayload({ kind: "password", ttl: 60 })).toBe(true);
    expect(isSecretCopiedPayload({ kind: "passphrase", ttl: 0 })).toBe(true);
    expect(isSecretCopiedPayload({ kind: "other", ttl: 60 })).toBe(false);
    expect(isSecretCopiedPayload(null)).toBe(false);
  });

  it("validates settings-changed payload", () => {
    expect(isSettingsChangedPayload({ key: "ttl_seconds", value: 60 })).toBe(true);
    expect(isSettingsChangedPayload({ key: 123, value: 1 })).toBe(false);
  });

  it("validates tray-icon-state payload", () => {
    expect(isTrayIconStatePayload({ state: "idle" })).toBe(true);
    expect(isTrayIconStatePayload({ state: "active" })).toBe(true);
    expect(isTrayIconStatePayload({ state: "blink" })).toBe(false);
  });
});
```

- [ ] **Step 2: Confirm failure**

Run: `npm test`
Expected: module not found.

- [ ] **Step 3: Implement the module**

`src/utils/crossWindowEvents.ts`:

```ts
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

export async function emitSecretCopied(p: SecretCopiedPayload) { return emit(EVT.secretCopied, p); }
export async function emitSettingsChanged(p: SettingsChangedPayload) { return emit(EVT.settingsChanged, p); }
export async function emitClipboardCleared() { return emit(EVT.clipboardCleared, {}); }
export async function emitTrayIconState(p: TrayIconStatePayload) { return emit(EVT.trayIconState, p); }

export async function listenSecretCopied(cb: (p: SecretCopiedPayload) => void): Promise<UnlistenFn> {
  return listen<SecretCopiedPayload>(EVT.secretCopied, (e) => {
    if (isSecretCopiedPayload(e.payload)) cb(e.payload);
  });
}
export async function listenSettingsChanged(cb: (p: SettingsChangedPayload) => void): Promise<UnlistenFn> {
  return listen<SettingsChangedPayload>(EVT.settingsChanged, (e) => {
    if (isSettingsChangedPayload(e.payload)) cb(e.payload);
  });
}
export async function listenClipboardCleared(cb: () => void): Promise<UnlistenFn> {
  return listen(EVT.clipboardCleared, () => cb());
}
```

- [ ] **Step 4: Tests pass**

Run: `npm test`
Expected: all 6 tests pass.

---

## Task 5: TS wrappers for Tauri commands

**Files:**
- Create: `src/utils/residentCommands.ts`

- [ ] **Step 1: Create the wrapper**

```ts
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
```

(No unit test — these are pure pass-throughs; covered by the smoke test in Task 17.)

---

## Task 6: Rust event payload types

**Files:**
- Create: `src-tauri/src/events.rs`

- [ ] **Step 1: Create the file**

```rust
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
```

---

## Task 7: Shortcuts module

**Files:**
- Create: `src-tauri/src/shortcuts.rs`

- [ ] **Step 1: Create the module**

```rust
use tauri::{AppHandle, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use crate::quick_window;

pub fn register<R: Runtime>(app: &AppHandle<R>, combo: &str) -> Result<(), String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let handle = app.clone();
    gs.on_shortcut(combo, move |_app, _shortcut, event| {
        if event.state() == ShortcutState::Pressed {
            let h = handle.clone();
            tauri::async_runtime::spawn(async move {
                let _ = quick_window::show_or_create(&h);
            });
        }
    })
    .map_err(|e| format!("register_shortcut failed: {e}"))
}

pub fn unregister<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    app.global_shortcut().unregister_all().map_err(|e| e.to_string())
}
```

---

## Task 8: Quick window module

**Files:**
- Create: `src-tauri/src/quick_window.rs`

- [ ] **Step 1: Create the module**

```rust
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

pub fn hide<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(QUICK_LABEL) {
        w.close().map_err(|e| e.to_string())?;
    }
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
```

---

## Task 9: Tray module + placeholder icons

**Files:**
- Create: `src-tauri/src/tray.rs`
- Create: `src-tauri/icons/tray.png`
- Create: `src-tauri/icons/tray-active.png`

- [ ] **Step 1: Provide placeholder icons**

Copy any existing PNG from `src-tauri/icons/` (e.g. `32x32.png`) to `tray.png` and `tray-active.png`. Polished SVG-rendered icons can land in a follow-up commit. Verify:

Run: `ls src-tauri/icons/tray*.png`
Expected: both files present.

- [ ] **Step 2: Create the tray module**

```rust
use tauri::{
    image::Image,
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

    let icon = load_icon(false)?;
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
        let icon = load_icon(active)?;
        tray.set_icon(Some(icon)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn load_icon(active: bool) -> Result<Image<'static>, String> {
    let bytes: &[u8] = if active {
        include_bytes!("../icons/tray-active.png")
    } else {
        include_bytes!("../icons/tray.png")
    };
    Image::from_bytes(bytes).map_err(|e| e.to_string())
}
```

---

## Task 10: Resident commands

**Files:**
- Create: `src-tauri/src/resident_commands.rs`

- [ ] **Step 1: Create the file**

```rust
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_notification::NotificationExt;

use crate::{shortcuts, tray, quick_window, events::TrayIconStatePayload};

#[tauri::command]
pub fn enable_tray<R: Runtime>(app: AppHandle<R>, enable: bool) -> Result<(), String> {
    if enable { tray::install(&app) } else { tray::uninstall(&app) }
}

#[tauri::command]
pub fn enable_autostart<R: Runtime>(app: AppHandle<R>, enable: bool) -> Result<(), String> {
    let mgr = app.autolaunch();
    if enable {
        mgr.enable().map_err(|e| e.to_string())
    } else {
        mgr.disable().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn register_shortcut<R: Runtime>(app: AppHandle<R>, combo: String) -> Result<(), String> {
    shortcuts::register(&app, &combo)
}

#[tauri::command]
pub fn unregister_shortcut<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    shortcuts::unregister(&app)
}

#[tauri::command]
pub fn show_quick_window<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    quick_window::show_or_create(&app)
}

#[tauri::command]
pub fn hide_quick_window<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    quick_window::hide(&app)
}

#[tauri::command]
pub fn show_main_window<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn notify_copied<R: Runtime>(app: AppHandle<R>, kind: String, ttl: u32) -> Result<(), String> {
    let label = if kind == "password" { "Mot de passe" } else { "Passphrase" };
    let body = if ttl > 0 {
        format!("{label} copié · {ttl} s avant effacement")
    } else {
        format!("{label} copié")
    };
    app.notification()
        .builder()
        .title("Unbreakable")
        .body(body)
        .show()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn notify_clipboard_cleared<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    app.notification()
        .builder()
        .title("Unbreakable")
        .body("Presse-papiers effacé")
        .show()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_tray_active<R: Runtime>(app: AppHandle<R>, active: bool) -> Result<(), String> {
    tray::set_active(&app, active)?;
    let _ = app.emit(crate::events::EVT_TRAY_ICON_STATE, TrayIconStatePayload {
        state: if active { "active".into() } else { "idle".into() },
    });
    Ok(())
}
```

---

## Task 11: Wire plugins, modules, and commands in the entry point

**Files:**
- Modify: `src-tauri/src/lib.rs` (Tauri 2 standard)

- [ ] **Step 1: Locate the entry**

Run: `cat src-tauri/src/lib.rs`. Identify the `pub fn run()` (or function with `#[cfg_attr(mobile, tauri::mobile_entry_point)]`) and the existing `tauri::Builder::default()` chain.

- [ ] **Step 2: Add module declarations**

At the top of the file (after existing `mod` statements), add:

```rust
mod events;
mod quick_window;
mod resident_commands;
mod shortcuts;
mod tray;
```

- [ ] **Step 3: Add plugins and commands to the Builder chain**

Inside the existing `tauri::Builder::default()` chain, before `.run(...)`, insert:

```rust
.plugin(tauri_plugin_global_shortcut::Builder::new().build())
.plugin(tauri_plugin_autostart::init(
    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
    Some(vec![]),
))
.plugin(tauri_plugin_notification::init())
```

Then update the existing `.invoke_handler(tauri::generate_handler![...])` call: do NOT add a second handler — merge the new identifiers into the existing macro list, preserving every existing command:

```rust
.invoke_handler(tauri::generate_handler![
    /* ...preserve every existing command identifier here... */
    resident_commands::enable_tray,
    resident_commands::enable_autostart,
    resident_commands::register_shortcut,
    resident_commands::unregister_shortcut,
    resident_commands::show_quick_window,
    resident_commands::hide_quick_window,
    resident_commands::show_main_window,
    resident_commands::notify_copied,
    resident_commands::notify_clipboard_cleared,
    resident_commands::set_tray_active,
])
```

- [ ] **Step 4: Verify it compiles**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: clean compile, no unused-module warnings.

---

## Task 12: Tauri capabilities

**Files:**
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Read current capabilities**

Run: `cat src-tauri/capabilities/default.json`. Locate the `permissions` array.

- [ ] **Step 2: Add the new permissions**

Add these strings to the `permissions` array (do not remove existing entries):

```json
"global-shortcut:allow-register",
"global-shortcut:allow-unregister",
"global-shortcut:allow-unregister-all",
"global-shortcut:allow-is-registered",
"autostart:allow-enable",
"autostart:allow-disable",
"autostart:allow-is-enabled",
"notification:allow-notify",
"notification:default",
"core:webview:allow-create-webview-window",
"core:window:allow-close",
"core:window:allow-hide",
"core:window:allow-show",
"core:window:allow-set-focus"
```

- [ ] **Step 3: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('src-tauri/capabilities/default.json'))"`
Expected: no output (silent success).

---

## Task 13: ResidentModeSection component

**Files:**
- Create: `src/components/Settings/ResidentModeSection.tsx`
- Modify: `src/components/Settings/Settings.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useSettings } from "../../stores/settingsStore";
import {
  enableTray,
  enableAutostart,
  registerShortcut,
  unregisterShortcut,
} from "../../utils/residentCommands";

export function ResidentModeSection() {
  const s = useSettings();

  const onTray = async (enabled: boolean) => {
    s.set({ tray_enabled: enabled });
    try { await enableTray(enabled); } catch (e) { console.error(e); s.set({ tray_enabled: !enabled }); }
  };
  const onAutostart = async (enabled: boolean) => {
    s.set({ autostart_enabled: enabled });
    try { await enableAutostart(enabled); } catch (e) { console.error(e); s.set({ autostart_enabled: !enabled }); }
  };
  const onShortcut = async (enabled: boolean) => {
    s.set({ shortcut_enabled: enabled });
    try {
      if (enabled) await registerShortcut(s.shortcut_combo);
      else await unregisterShortcut();
    } catch (e) { console.error(e); s.set({ shortcut_enabled: !enabled }); }
  };
  const onCombo = (combo: string) => s.set({ shortcut_combo: combo });
  const onNotifs = (enabled: boolean) => s.set({ notifications_enabled: enabled });

  return (
    <section>
      <h3>Mode résident</h3>
      <label className="check">
        <input type="checkbox" checked={s.tray_enabled} onChange={(e) => onTray(e.target.checked)} />
        Garder dans la barre système (tray)
      </label>
      <label className="check">
        <input type="checkbox" checked={s.autostart_enabled} onChange={(e) => onAutostart(e.target.checked)} />
        Lancer au démarrage de la session
      </label>
      <label className="check">
        <input type="checkbox" checked={s.shortcut_enabled} onChange={(e) => onShortcut(e.target.checked)} />
        Raccourci global actif
      </label>
      <label>Combinaison
        <input
          type="text"
          value={s.shortcut_combo}
          onChange={(e) => onCombo(e.target.value)}
          disabled={s.shortcut_enabled}
          placeholder="CommandOrControl+Alt+P"
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={s.notifications_enabled} onChange={(e) => onNotifs(e.target.checked)} />
        Notifications système (copie, expiration TTL)
      </label>
    </section>
  );
}
```

- [ ] **Step 2: Insert in `Settings.tsx`**

Open `src/components/Settings/Settings.tsx`. Add the import:

```tsx
import { ResidentModeSection } from "./ResidentModeSection";
```

Inside `<div className="flyout-body">`, append `<ResidentModeSection />` after the last existing section.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

---

## Task 14: Vite multi-entry + quick window UI

**Files:**
- Modify: `vite.config.ts`
- Create: `quick.html`
- Create: `src/quick.tsx`
- Create: `src/components/QuickPop/QuickPop.tsx`
- Create: `src/components/QuickPop/QuickPop.css`

- [ ] **Step 1: Configure multi-entry**

Replace `vite.config.ts` content (preserve any existing `tauri`/`envPrefix` keys not shown here):

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        quick: resolve(__dirname, "quick.html"),
      },
    },
  },
});
```

- [ ] **Step 2: Create `quick.html`**

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <title>Unbreakable · Quick</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/quick.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Create `src/quick.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/700.css";
import "./App.css";
import "./components/QuickPop/QuickPop.css";
import { QuickPop } from "./components/QuickPop/QuickPop";

try {
  const raw = localStorage.getItem("unbreakable.settings");
  let theme: "auto" | "light" | "dark" = "auto";
  if (raw) {
    const parsed = JSON.parse(raw);
    theme = parsed?.state?.theme ?? "auto";
  }
  const resolved =
    theme === "auto"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
      : theme;
  document.documentElement.dataset.theme = resolved;
} catch {
  document.documentElement.dataset.theme = "dark";
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QuickPop />
  </React.StrictMode>,
);
```

- [ ] **Step 4: Create `QuickPop.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useSettings } from "../../stores/settingsStore";
import { useGenerator } from "../../stores/generatorStore";
import { copyToClipboard, generatePassword, generatePassphrase } from "../../utils/tauriCommands";
import { analyzeStrength } from "../../utils/strength";
import { emitSecretCopied } from "../../utils/crossWindowEvents";
import { notifyCopied, showMainWindow } from "../../utils/residentCommands";
import { StrengthMeter } from "../StrengthMeter/StrengthMeter";

export function QuickPop() {
  const defaultKind = useSettings((s) => s.default_copy);
  const ttl = useSettings((s) => s.ttl_seconds);
  const notifEnabled = useSettings((s) => s.notifications_enabled);
  const { pwdOpts, phraseOpts } = useGenerator();

  const [secret, setSecret] = useState<string>("");
  const copyBtnRef = useRef<HTMLButtonElement>(null);

  const regenerate = async () => {
    try {
      const s = defaultKind === "password"
        ? await generatePassword(pwdOpts)
        : await generatePassphrase(phraseOpts);
      setSecret(s);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    regenerate();
    setTimeout(() => copyBtnRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") getCurrentWebviewWindow().close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const score = useMemo(() => analyzeStrength(secret).score, [secret]);

  const copy = async () => {
    if (!secret) return;
    await copyToClipboard(secret);
    await emitSecretCopied({ kind: defaultKind, ttl });
    if (notifEnabled) {
      try { await notifyCopied(defaultKind, ttl); } catch (e) { console.error(e); }
    }
    getCurrentWebviewWindow().close();
  };

  const openMain = async () => {
    try { await showMainWindow(); } catch (e) { console.error(e); }
    getCurrentWebviewWindow().close();
  };

  return (
    <main className="quickpop" data-score={score}>
      <header className="quickpop-header">
        <span className="quickpop-brand">UNBREAKABLE</span>
        <button className="quickpop-more" onClick={openMain} aria-label="Ouvrir l'app complète">···</button>
      </header>
      <div className="quickpop-secret">{secret || "…"}</div>
      <StrengthMeter secret={secret} />
      <div className="quickpop-actions">
        <button ref={copyBtnRef} className="btn-primary" onClick={copy} aria-label="Copier">COPIER</button>
        <button onClick={regenerate} aria-label="Régénérer">↻</button>
        <button onClick={() => getCurrentWebviewWindow().close()} aria-label="Fermer">⏏</button>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Create `QuickPop.css`**

```css
html, body, #root { height: 100%; margin: 0; background: transparent; }
.quickpop {
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px 12px;
  background: var(--paper);
  border: 1px solid var(--rule-strong);
  color: var(--ink);
  font-family: var(--font-body);
}
.quickpop-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.22em;
  color: var(--ink-faint);
  text-transform: uppercase;
}
.quickpop-more {
  background: transparent;
  border: 1px solid var(--rule-strong);
  padding: 2px 6px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-dim);
  cursor: pointer;
}
.quickpop-secret {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 500;
  letter-spacing: 0.04em;
  word-break: break-all;
  flex: 1;
  display: flex;
  align-items: center;
  padding: 4px 0 4px 10px;
  border-left: 3px solid var(--acid);
}
.quickpop-actions { display: flex; gap: 1px; background: var(--rule-strong); border: 1px solid var(--rule-strong); }
.quickpop-actions button {
  flex: 1;
  border: none;
  background: var(--paper);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  padding: 10px 4px;
  cursor: pointer;
  color: var(--ink);
}
.quickpop-actions button:first-child { flex: 3; background: var(--acid); color: var(--paper); }
.quickpop-actions button:hover { background: var(--ink); color: var(--paper); }
.quickpop-actions button:first-child:hover { background: var(--ink); color: var(--acid); }
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: emits `dist/index.html` and `dist/quick.html`.

---

## Task 15: Clipboard store events + tray icon sync

**Files:**
- Modify: `src/stores/clipboardStore.ts`

- [ ] **Step 1: Read the current store**

Run: `cat src/stores/clipboardStore.ts`. Identify:
- the action that sets `status = "copied"` (typically `setCopied(panel, ttl)`)
- the timer or action that sets `status = "expired"`
- the action that sets `status = "modified"`

- [ ] **Step 2: Add imports + helper**

At the top of the file:

```ts
import { emit } from "@tauri-apps/api/event";
import { setTrayActive } from "../utils/residentCommands";

async function _syncTrayActive(active: boolean): Promise<void> {
  try { await setTrayActive(active); } catch { /* tray may be disabled */ }
}
```

- [ ] **Step 3: Hook each transition**

Inside `setCopied(...)`, after the existing state mutation, append:

```ts
_syncTrayActive(true);
```

Inside the action that sets `status = "expired"`, append:

```ts
_syncTrayActive(false);
emit("clipboard-cleared", {}).catch(() => {});
```

Inside the action that sets `status = "modified"`, append:

```ts
_syncTrayActive(false);
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds.

---

## Task 16: Boot-time replay + clipboard-cleared notification

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add boot-time replay effect**

In `src/App.tsx`, near the existing `useEffect` hooks, add:

```tsx
useEffect(() => {
  (async () => {
    const {
      enableTray, enableAutostart, registerShortcut,
    } = await import("./utils/residentCommands");
    const s = useSettings.getState();
    try {
      if (s.tray_enabled) await enableTray(true);
      if (s.autostart_enabled) await enableAutostart(true);
      if (s.shortcut_enabled) await registerShortcut(s.shortcut_combo);
    } catch (e) { console.error("resident-mode boot replay failed", e); }
  })();
}, []);
```

- [ ] **Step 2: Listen for `clipboard-cleared` to fire notification**

Add a second effect:

```tsx
useEffect(() => {
  let unlisten: (() => void) | null = null;
  (async () => {
    const { listenClipboardCleared } = await import("./utils/crossWindowEvents");
    const { notifyClipboardCleared } = await import("./utils/residentCommands");
    unlisten = await listenClipboardCleared(() => {
      if (useSettings.getState().notifications_enabled) {
        notifyClipboardCleared().catch(() => {});
      }
    });
  })();
  return () => { unlisten?.(); };
}, []);
```

(`useSettings` is already imported in `App.tsx` — no new import needed.)

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

---

## Task 17: Manual smoke test checklist

This task is **manual verification** — Tauri runtime features (windows, tray, OS shortcut registration, notifications) require human visual confirmation that this project's tooling is not set up to automate.

**Files:** none (verification only)

- [ ] **Step 1: Launch dev mode**

Run: `npm run tauri dev`
Expected: main window opens; behavior identical to baseline.

- [ ] **Step 2: Open Réglages → "Mode résident"**

Expected: 4 toggles + combo input visible, all off, combo shows `CommandOrControl+Alt+P` and is editable.

- [ ] **Step 3: Toggle tray on**

Expected: tray icon appears. Right-click shows the 3-item menu. Left-click opens a 360×180 mini-pop with a generated secret. Toggle off → tray icon disappears.

- [ ] **Step 4: Toggle shortcut on**

Expected: pressing `Ctrl+Alt+P` anywhere on the OS opens the mini-pop within ~200 ms. The COPIER button is focused.

- [ ] **Step 5: Click COPIER**

Expected: secret on clipboard (paste anywhere); mini-pop closes; if notifs enabled, system toast "Unbreakable — Mot de passe copié · 60 s avant effacement" appears; the main window's clipboard badge reflects the copy state.

- [ ] **Step 6: Wait for TTL**

Expected: clipboard cleared at TTL expiry; main window stamps "EXPIRÉ"; if notifs enabled, "Presse-papiers effacé" notification fires.

- [ ] **Step 7: Toggle autostart**

Expected (Windows): app appears under Task Manager → Startup. Quit + restart session → app launches. Toggle off → entry removed.

- [ ] **Step 8: Combo conflict**

Set the combo to `CommandOrControl+Shift+Esc` (Windows-reserved). Toggle shortcut on. Expected: IPC error logged in console, toggle auto-reverts to off, no silent failure.

- [ ] **Step 9: Disable everything**

All 4 toggles off. Expected: tray gone, shortcut gone, autostart entry gone. App identical to baseline.

- [ ] **Step 10: Production build**

Run: `npm run tauri build`
Expected: packaged binary builds; the same Steps 1–9 pass on the packaged build (at least on Windows).

---

## Self-Review

**Spec coverage:**
- §1 contexte → Task 13 + 17
- §2 surface (4 toggles) → Task 13
- §3 architecture (3 plugins, 2 windows) → Tasks 1, 8, 11
- §4 mini-pop → Tasks 8 (Rust), 14 (UI)
- §5 tray (icon, menu, click handlers, active variant) → Tasks 9, 10 (`set_tray_active`), 15 (transitions)
- §6 cross-window events (4 events) → Tasks 4 (TS), 6 (Rust), 15 (emit on transitions)
- §7 notifications → Tasks 10 (`notify_copied`, `notify_clipboard_cleared`), 14 (call on copy), 16 (call on clear)
- §8 store schema → Task 3
- §9 components → Tasks 5, 7, 8, 9, 10, 13, 14
- §10 invariants → Task 10 (no secret text in notifications), Task 15 (clipboard timer untouched — only listens, never drives), Task 12 (minimal permissions)
- §11 risks → Task 17 step 8 covers shortcut conflict; "tray-but-no-window first-time toast" is **explicitly deferred** to follow-up polish (call out in PR)
- §12 hors scope → respected throughout
- §13 success criteria → Task 17

**Placeholder scan:** no TBD / TODO / "similar to" / vague handling. All code blocks complete.

**Type consistency:**
- TS `SecretCopiedPayload.kind: "password" | "passphrase"` ↔ Rust `SecretCopiedPayload.kind: String` (Rust receives, JS only emits the two literals — consistent in practice).
- Event names: `secret-copied`, `settings-changed`, `clipboard-cleared`, `tray-icon-state` — defined once each in `crossWindowEvents.ts::EVT` and `events.rs::EVT_*` — match.
- TS `setTrayActive(active: boolean)` ↔ Rust `set_tray_active(active: bool)` — match.
- TS `enableTray(enable: boolean)` ↔ Rust `enable_tray(app, enable: bool)` — match.
- TS `registerShortcut(combo: string)` ↔ Rust `register_shortcut(app, combo: String)` — match.
- TS `notifyCopied(kind, ttl)` ↔ Rust `notify_copied(app, kind: String, ttl: u32)` — match.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-25-mode-resident.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — tasks executed in this session via `superpowers:executing-plans`, batch checkpoints.

Which approach?
