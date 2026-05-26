import { useEffect, useRef } from "react";
import { useGenerator } from "../stores/generatorStore";
import { useClipboard } from "../stores/clipboardStore";
import { useSettings } from "../stores/settingsStore";
import { useHistory } from "../stores/historyStore";
import { clearIfOurs, copyToClipboard, generatePairFromOpts } from "../utils/tauriCommands";
import { analyzeStrength } from "../utils/strength";

export function useAutoGenerate() {
  const { pwdOpts, phraseOpts, setPassword, setPassphrase } = useGenerator();
  const { setCopied, status } = useClipboard();
  const { default_copy, ttl_seconds, auto_copy_on_open } = useSettings();
  const addHistory = useHistory((s) => s.add);
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
          await copyToClipboard(secret);
          setCopied(default_copy, ttl_seconds);
          const score = analyzeStrength(secret).score;
          addHistory(default_copy, secret, score);
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
    timerRef.current = window.setInterval(async () => {
      if (Date.now() >= expiresAt) {
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
