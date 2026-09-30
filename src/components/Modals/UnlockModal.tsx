import { useEffect, useState } from "react";
import { vault } from "../../utils/vault";

type Props = {
  onUnlocked: () => void;
  onForgotten: (pw: string) => void;
};

export function UnlockModal({ onUnlocked, onForgotten }: Props) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [forgotArmed, setForgotArmed] = useState(false);
  const [delayUntil, setDelayUntil] = useState<number>(0);

  // L1: re-render every 250ms while a backoff is active so the countdown
  // ticks and the inputs re-enable the moment the delay expires.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!delayUntil) return;
    const id = window.setInterval(() => forceTick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [delayUntil]);
  const remaining = Math.max(0, delayUntil - Date.now());

  async function tryUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (Date.now() < delayUntil) return;
    try {
      await vault.unlock(pw);
      onUnlocked();
    } catch (err) {
      const next = attempts + 1;
      setAttempts(next);
      if (next >= 5) {
        const delayMs = Math.min(16000, 1000 * Math.pow(2, next - 5));
        setDelayUntil(Date.now() + delayMs);
      }
      setError("Mot de passe incorrect");
      setPw("");
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Coffre verrouillé</h2>
        <p>Entrez votre mot de passe maître pour déverrouiller l'historique.</p>
        <form onSubmit={tryUnlock}>
          <input
            type="password"
            autoFocus
            value={pw}
            onChange={(e) => {
              setPw(e.target.value);
              setError(null);
            }}
            placeholder="Mot de passe maître"
            disabled={remaining > 0}
          />
          {error && <div className="error">{error}</div>}
          {remaining > 0 && (
            <div className="error">Veuillez patienter {Math.ceil(remaining / 1000)}s…</div>
          )}
          <button type="submit" disabled={!pw || remaining > 0}>
            Déverrouiller
          </button>
        </form>
        {forgotArmed ? (
          <div className="stack" role="alertdialog" aria-label="Confirmation de destruction">
            <span className="warning">
              ⚠ Effacer le coffre et perdre tout l'historique ? Action irréversible.
            </span>
            <div className="confirm-clear" role="group">
              <button className="danger" onClick={() => onForgotten(pw)}>
                Oui, tout effacer
              </button>
              <button onClick={() => setForgotArmed(false)}>Annuler</button>
            </div>
          </div>
        ) : (
          <button className="link" onClick={() => setForgotArmed(true)}>
            J'ai oublié mon mot de passe…
          </button>
        )}
      </div>
    </div>
  );
}
