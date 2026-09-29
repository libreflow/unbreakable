import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useSettings } from "../../stores/settingsStore";
import { useGenerator } from "../../stores/generatorStore";
import { generatePassword, generatePassphraseFromOpts } from "../../utils/tauriCommands";
import { analyzeStrength } from "../../utils/strength";
import { showMainWindow } from "../../utils/residentCommands";
import { useCopySecret } from "../../hooks/useCopySecret";
import { StrengthMeter } from "../StrengthMeter/StrengthMeter";
import { setWindowProtected } from "../../utils/windowProtection";

export function QuickPop() {
  const defaultKind = useSettings((s) => s.default_copy);
  const { pwdOpts, phraseOpts } = useGenerator();

  useEffect(() => {
    setWindowProtected("quick", true).catch(() => {});
    return () => { setWindowProtected("quick", false).catch(() => {}); };
  }, []);

  const [secret, setSecret] = useState<string>("");
  const copyBtnRef = useRef<HTMLButtonElement>(null);
  const reqIdRef = useRef(0);

  const regenerate = async () => {
    const myReq = ++reqIdRef.current;
    try {
      const s = defaultKind === "password"
        ? await generatePassword(pwdOpts)
        : await generatePassphraseFromOpts(phraseOpts, useSettings.getState().passphrase_lang);
      // Ignore stale responses if a newer regenerate was requested.
      if (myReq !== reqIdRef.current) return;
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

  const copySecret = useCopySecret();
  const copy = async () => {
    if (!secret) return;
    await copySecret(defaultKind, secret, { crossWindow: true });
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
