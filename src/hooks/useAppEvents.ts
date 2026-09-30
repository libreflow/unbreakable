import { useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { reportError } from "../utils/reportError";
import { useGenerator } from "../stores/generatorStore";
import { useSettings } from "../stores/settingsStore";
import { useClipboard } from "../stores/clipboardStore";
import {
  generateMemorable,
  generatePassphraseFromOpts,
  generatePassword,
} from "../utils/tauriCommands";
import { listenClipboardCleared, listenSecretCopied } from "../utils/crossWindowEvents";
import {
  notifyClipboardCleared,
  enableTray,
  enableAutostart,
  registerShortcut,
} from "../utils/residentCommands";

/** A6: race-free async listener subscription. The unlisten promise is
 * tracked so a fast unmount cancels the listener as soon as it lands. */
function useAsyncListener(setup: () => Promise<UnlistenFn>, deps: unknown[] = []) {
  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;
    setup()
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch((e) => reportError("listener setup", e));
    return () => {
      cancelled = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Boot replay — re-applies resident-mode toggles after restart. */
function useResidentModeBootReplay() {
  useEffect(() => {
    (async () => {
      const s = useSettings.getState();
      try {
        if (s.tray_enabled) await enableTray(true);
        if (s.autostart_enabled) await enableAutostart(true);
        if (s.shortcut_enabled) await registerShortcut(s.shortcut_combo);
      } catch (e) {
        reportError("resident-mode boot replay", e);
      }
    })();
  }, []);
}

/**
 * All app-wide Tauri event subscriptions that used to live inline in App():
 * clipboard-cleared notification, cross-window secret-copied TTL arming
 * (B1) and the tray "Générer & copier" pipeline (B2).
 */
export function useAppEvents(
  copySecret: (kind: "password" | "passphrase", secret: string) => Promise<void>,
) {
  useResidentModeBootReplay();

  useAsyncListener(
    () =>
      listenClipboardCleared(() => {
        if (useSettings.getState().notifications_enabled) {
          notifyClipboardCleared().catch((e) => reportError("notifyClipboardCleared", e));
        }
      }),
    [],
  );

  // B1: arm TTL timer when QuickPop (or any other window) copies a secret.
  useAsyncListener(
    () =>
      listenSecretCopied(({ kind, ttl: t }) => {
        useClipboard.getState().setCopied(kind, t);
      }),
    [],
  );

  // B2: tray "Générer & copier" menu items emit this event with the kind.
  useAsyncListener(
    () =>
      listen<string>("tray-generate-and-copy", async (e) => {
        const kind =
          e.payload === "passphrase"
            ? "passphrase"
            : e.payload === "memorable"
              ? "memorable"
              : "password";
        try {
          const opts = useGenerator.getState();
          const lang = useSettings.getState().passphrase_lang;
          const secret =
            kind === "password"
              ? await generatePassword(opts.pwdOpts)
              : kind === "memorable"
                ? await generateMemorable()
                : await generatePassphraseFromOpts(opts.phraseOpts, lang);
          if (kind === "passphrase") useGenerator.getState().setPassphrase(secret);
          else useGenerator.getState().setPassword(secret);
          await copySecret(kind === "memorable" ? "password" : kind, secret);
        } catch (err) {
          reportError("tray-generate-and-copy", err);
        }
      }),
    [copySecret],
  );
}
