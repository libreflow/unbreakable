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
