import { useState } from "react";
import { vault } from "../../utils/vault";

type Props = {
  onUnlocked: () => void;
  onForgotten: (pw: string) => void;
};

export function UnlockModal({ onUnlocked, onForgotten }: Props) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [delayUntil, setDelayUntil] = useState<number>(0);

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
            onChange={(e) => { setPw(e.target.value); setError(null); }}
            placeholder="Mot de passe maître"
            disabled={remaining > 0}
          />
          {error && <div className="error">{error}</div>}
          {remaining > 0 && <div className="error">Veuillez patienter {Math.ceil(remaining/1000)}s…</div>}
          <button type="submit" disabled={!pw || remaining > 0}>Déverrouiller</button>
        </form>
        <button className="link" onClick={() => onForgotten(pw)}>J'ai oublié mon mot de passe…</button>
      </div>
    </div>
  );
}
