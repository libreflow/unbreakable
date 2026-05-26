import { useEffect, useMemo, useState } from "react";
import { useGenerator } from "../../stores/generatorStore";
import { useClipboard } from "../../stores/clipboardStore";
import { useSettings } from "../../stores/settingsStore";
import { useHistory } from "../../stores/historyStore";
import { copyToClipboard, generatePassword } from "../../utils/tauriCommands";
import { analyzeStrength } from "../../utils/strength";
import { StrengthMeter } from "../StrengthMeter/StrengthMeter";
import { setWindowProtected } from "../../utils/windowProtection";

export function PasswordPanel() {
  const { password, setPassword, pwdOpts } = useGenerator();
  const setCopied = useClipboard((s) => s.setCopied);
  const ttl = useSettings((s) => s.ttl_seconds);
  const addHistory = useHistory((s) => s.add);
  const [hidden, setHidden] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Anti-screenshot: keep the main window protected while this panel is
  // mounted. PassphrasePanel renders the passphrase in plaintext beside
  // us, so unprotecting on `hidden` would leak that secret to screenshots.
  useEffect(() => {
    setWindowProtected("main", true).catch(() => {});
    return () => { setWindowProtected("main", false).catch(() => {}); };
  }, []);

  const score = useMemo(() => analyzeStrength(password).score, [password]);

  const regenerate = async () => {
    setErr(null);
    try {
      const p = await generatePassword(pwdOpts);
      setPassword(p);
    } catch (e) {
      setErr(String(e));
    }
  };

  const copy = async () => {
    if (!password) return;
    await copyToClipboard(password);
    setCopied("password", ttl);
    addHistory("password", password, score);
  };

  return (
    <section className="panel" data-score={score} aria-labelledby="pwd-title">
      <header className="panel-header">
        <div className="panel-title-group">
          <span className="panel-number">01.</span>
          <h2 id="pwd-title">Mot de passe</h2>
        </div>
        <span className="panel-meta">{password.length} chars · site-compat</span>
      </header>
      <div
        className="secret-display"
        aria-label="Mot de passe généré"
        data-hidden={hidden ? "true" : "false"}
      >
        {password ? (hidden ? "•".repeat(password.length) : password) : <span className="placeholder">en attente…</span>}
      </div>
      <StrengthMeter secret={password} />
      {err && <div className="error-inline" role="alert">{err}</div>}
      <div className="panel-actions">
        <button onClick={copy} className="btn-primary" aria-label="Copier le mot de passe">
          Copier
        </button>
        <button onClick={regenerate} aria-label="Régénérer le mot de passe">↻ Régénérer</button>
        <button
          onClick={() => setHidden((h) => !h)}
          aria-pressed={hidden}
          aria-label={hidden ? "Afficher le mot de passe" : "Masquer le mot de passe"}
        >
          {hidden ? "Afficher" : "Masquer"}
        </button>
      </div>
    </section>
  );
}
