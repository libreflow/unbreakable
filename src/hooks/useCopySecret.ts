import { useCallback } from "react";
import { CopiedPanel } from "../types";
import { useClipboard } from "../stores/clipboardStore";
import { useSettings } from "../stores/settingsStore";
import { useHistory } from "../stores/historyStore";
import { copyToClipboard } from "../utils/tauriCommands";
import { analyzeStrength } from "../utils/strength";
import { emitSecretCopied } from "../utils/crossWindowEvents";
import { notifyCopied } from "../utils/residentCommands";
import { reportError } from "../utils/reportError";

/**
 * A1: single copy pipeline for every copy source (panels, shortcuts,
 * tray, QuickPop). Copies to the OS clipboard, arms the TTL, records
 * history, syncs the tray state, notifies other windows, and fires
 * the desktop notification if enabled.
 */
export function useCopySecret() {
  const setCopied = useClipboard((s) => s.setCopied);
  const addHistory = useHistory((s) => s.add);

  return useCallback(
    async (kind: CopiedPanel, secret: string, opts?: { notify?: boolean; crossWindow?: boolean }) => {
      const { ttl_seconds, notifications_enabled } = useSettings.getState();
      await copyToClipboard(secret);
      setCopied(kind, ttl_seconds);
      addHistory(kind, secret, analyzeStrength(secret).score);
      if (opts?.crossWindow) {
        emitSecretCopied({ kind, ttl: ttl_seconds }).catch(() => {});
      }
      if (opts?.notify !== false && notifications_enabled) {
        notifyCopied(kind, ttl_seconds).catch((e) => reportError("notifyCopied", e));
      }
    },
    [setCopied, addHistory],
  );
}
