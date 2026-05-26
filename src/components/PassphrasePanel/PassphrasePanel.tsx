import { useEffect, useMemo, useState } from "react";
import { useGenerator } from "../../stores/generatorStore";
import { useClipboard } from "../../stores/clipboardStore";
import { useSettings } from "../../stores/settingsStore";
import { useHistory } from "../../stores/historyStore";
import { copyToClipboard, generatePassphraseFromOpts } from "../../utils/tauriCommands";
import { analyzeStrength } from "../../utils/strength";
import { StrengthMeter } from "../StrengthMeter/StrengthMeter";
import { setWindowProtected } from "../../utils/windowProtection";

export function PassphrasePanel() {
  const { passphrase, setPassphrase, phraseOpts } = useGenerator();
  const setCopied = useClipboard((s) => s.setCopied);
  const ttl = useSettings((s) => s.ttl_seconds);
  const addHistory = useHistory((s) => s.add);
  const [err, setErr] = useState<string | null>(null);

  // Anti-screenshot: passphrase is always visible, so protect at mount and unprotect at unmount
  useEffect(() => {
    setWindowProtected("main", true).catch(() => {});
    return () => { setWindowProtected("main", false).catch(() => {}); };
  }, []);

  const score = useMemo(() => analyzeStrength(passphrase).score, [passphrase]);

  const regenerate = async () => {
    setErr(null);
    try {
      const lang = useSettings.getState().passphrase_lang;
      const p = await generatePassphraseFromOpts(phraseOpts, lang);
      setPassphrase(p);
    } catch (e) {
      setErr(String(e));
    }
  };

  const copy = async () => {
    if (!passphrase) return;
    await copyToClipboard(passphrase);
    setCopied("passphrase", ttl);
    addHistory("passphrase", passphrase, score);
  };

  const sep = phraseOpts.separator;
  const { words, tail } = useMemo(() => {
    if (!passphrase) return { words: [] as string[], tail: "" };
    // New backend format: word1-word2-...-wordN[-digit][symbol]
    // A trailing symbol (from SYMS) has no separator before it.
    const m = passphrase.match(/^(.*?)([!@#$%&*?+=])?$/);
    const body = m?.[1] ?? passphrase;
    const tail = m?.[2] ?? "";
    return { words: body.split(sep).filter(Boolean), tail };
  }, [passphrase, sep]);

  return (
    <section className="panel" data-score={score} aria-labelledby="phrase-title">
      <header className="panel-header">
        <div className="panel-title-group">
          <span className="panel-number">02.</span>
          <h2 id="phrase-title">Passphrase</h2>
        </div>
        <span className="panel-meta">{words.length} mots{tail ? ` · suff. ${tail}` : ""}</span>
      </header>
      <div className="passphrase-display" aria-label="Passphrase générée">
        {passphrase ? (
          <>
            {words.map((w, i) => (
              <span key={`${i}-${w}`} className="word">
                {w}
                {i < words.length - 1 && <span className="word-sep">{sep}</span>}
              </span>
            ))}
            {tail && <span className="word-tail">{tail}</span>}
          </>
        ) : (
          <span className="placeholder">en attente…</span>
        )}
      </div>
      <StrengthMeter secret={passphrase} />
      {err && <div className="error-inline" role="alert">{err}</div>}
      <div className="panel-actions">
        <button onClick={copy} className="btn-primary" aria-label="Copier la passphrase">Copier</button>
        <button onClick={regenerate} aria-label="Régénérer la passphrase">↻ Régénérer</button>
      </div>
    </section>
  );
}
