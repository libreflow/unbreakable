import { ReactNode, useMemo, useState } from "react";
import { useGenerator } from "../../stores/generatorStore";
import { useSettings } from "../../stores/settingsStore";
import {
  generateMemorable,
  generatePassphraseFromOpts,
  generatePassword,
} from "../../utils/tauriCommands";
import { analyzeStrength } from "../../utils/strength";
import { StrengthMeter } from "../StrengthMeter/StrengthMeter";
import { useCopySecret } from "../../hooks/useCopySecret";
import { reportError } from "../../utils/reportError";

export type PanelKind = "password" | "passphrase";

/**
 * A12: unified secret panel. The password and passphrase panels share
 * ~85% structure; only the secret rendering and extra controls differ,
 * both provided by the caller.
 */
export function SecretPanel({
  kind,
  meta,
  regenerate,
  err,
  children,
  footerControls,
}: {
  kind: PanelKind;
  meta: string;
  regenerate: () => Promise<void>;
  err: string | null;
  children?: ReactNode;
  footerControls?: ReactNode;
}) {
  const secret = useGenerator((s) => (kind === "password" ? s.password : s.passphrase));
  const copySecret = useCopySecret();
  const [hidden, setHidden] = useState(false);

  const score = useMemo(() => analyzeStrength(secret).score, [secret]);

  const copy = async () => {
    if (!secret) return;
    await copySecret(kind, secret);
  };

  const title = kind === "password" ? "Mot de passe" : "Passphrase";

  return (
    <section className="panel" data-score={score} aria-labelledby={`${kind}-title`}>
      <header className="panel-header">
        <div className="panel-title-group">
          <span className="panel-number">{kind === "password" ? "01." : "02."}</span>
          <h2 id={`${kind}-title`}>{title}</h2>
        </div>
        <span className="panel-meta">{meta}</span>
      </header>
      <div
        className={kind === "password" ? "secret-display" : "passphrase-display"}
        aria-label={`${title} généré${kind === "password" ? "" : "e"}`}
      >
        {secret ? (
          hidden ? (
            "•".repeat(secret.length)
          ) : (
            children ?? secret
          )
        ) : (
          <span className="placeholder">en attente…</span>
        )}
      </div>
      <StrengthMeter secret={secret} />
      {err && <div className="error-inline" role="alert">{err}</div>}
      {footerControls}
      <div className="panel-actions">
        <button onClick={copy} className="btn-primary" aria-label={`Copier le ${title.toLowerCase()}`}>
          Copier
        </button>
        <button
          onClick={() => regenerate().catch((e) => reportError("regenerate", e))}
          aria-label={`Régénérer le ${title.toLowerCase()}`}
        >
          ↻ Régénérer
        </button>
        {kind === "password" && (
          <button
            onClick={() => setHidden((h) => !h)}
            aria-pressed={hidden}
            aria-label={hidden ? "Afficher le mot de passe" : "Masquer le mot de passe"}
          >
            {hidden ? "Afficher" : "Masquer"}
          </button>
        )}
      </div>
    </section>
  );
}

/** Regeneration logic per panel kind, wired to the generator store. */
export function usePanelRegenerate(kind: PanelKind) {
  const set = useGenerator((s) => (kind === "password" ? s.setPassword : s.setPassphrase));
  const [err, setErr] = useState<string | null>(null);
  const [memorable, setMemorable] = useState(false);

  const regenerate = useMemo(
    () => async () => {
      setErr(null);
      try {
        const g = useGenerator.getState();
        const lang = useSettings.getState().passphrase_lang;
        const next =
          kind === "password"
            ? memorable
              ? await generateMemorable()
              : await generatePassword(g.pwdOpts)
            : await generatePassphraseFromOpts(g.phraseOpts, lang);
        set(next);
      } catch (e) {
        reportError("panel regenerate", e);
        setErr(String(e));
      }
    },
    // A8: memorable is a dependency on purpose - toggling it re-runs the
    // memo and the caller re-invokes regenerate from the onChange handler,
    // not from an effect.
    [kind, memorable, set],
  );

  return { regenerate, err, setErr, memorable, setMemorable };
}
