import { useEffect, useRef } from "react";
import { useGenerator } from "../stores/generatorStore";
import { useClipboard } from "../stores/clipboardStore";
import { useSettings } from "../stores/settingsStore";
import { clearIfOurs, generatePairFromOpts } from "../utils/tauriCommands";
import { useCopySecret } from "./useCopySecret";

export function useAutoGenerate() {
  const copySecret = useCopySecret();
  const pwdOpts = useGenerator((s) => s.pwdOpts);
  const phraseOpts = useGenerator((s) => s.phraseOpts);
  const setPassword = useGenerator((s) => s.setPassword);
  const setPassphrase = useGenerator((s) => s.setPassphrase);
  const status = useClipboard((s) => s.status);
  const default_copy = useSettings((s) => s.default_copy);
  const auto_copy_on_open = useSettings((s) => s.auto_copy_on_open);
  const ranRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    (async () => {
      try {
        const lang = useSettings.getState().passphrase_lang;
        const [pwd, phrase] = await generatePairFromOpts(pwdOpts, phraseOpts, lang);
        setPassword(pwd);
        setPassphrase(phrase);
        if (auto_copy_on_open) {
          const secret = default_copy === "password" ? pwd : phrase;
          await copySecret(default_copy, secret);
        }
      } catch (e) {
        console.error("auto-generate failed", e);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (status !== "copied") return;
    const { expiresAt } = useClipboard.getState();
    if (!expiresAt) return;
    // Always read the *current* expiresAt inside the tick: the clipboard state
    // can be refreshed by a cross-window event (QuickPop copy) after this effect
    // ran, and the interval would otherwise compare against a stale deadline —
    // and never fire (B5). The 500ms cadence also keeps expiry roughly on time
    // when the WebView throttles background timers (B4).
    timerRef.current = window.setInterval(async () => {
      const current = useClipboard.getState();
      if (current.status !== "copied") {
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return;
      }
      if (current.expiresAt && Date.now() >= current.expiresAt) {
        try {
          const cleared = await clearIfOurs();
          useClipboard.getState().setStatus(cleared ? "expired" : "modified");
        } finally {
          if (timerRef.current) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }
      }
    }, 500);
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [status]);
}
