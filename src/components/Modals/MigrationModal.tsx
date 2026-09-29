import { useState } from "react";
import { vault, HistoryEntry } from "../../utils/vault";
import { useSettings } from "../../stores/settingsStore";
import { reportError } from "../../utils/reportError";

const LEGACY_KEY = "unbreakable.history";

type LegacyEntry = {
  id: string;
  kind: string;
  value: string;
  label?: string;
  score: number;
  created_at: string | number;
};

function readLegacy(): LegacyEntry[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const state = parsed?.state ?? parsed;
    return (state?.entries ?? []) as LegacyEntry[];
  } catch { return []; }
}

type Props = { count: number; onDone: () => void };

export function MigrationModal({ count, onDone }: Props) {
  const [working, setWorking] = useState(false);
  const [eraseArmed, setEraseArmed] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function migrate() {
    setWorking(true);
    try {
      const legacy = readLegacy();
      const entries: HistoryEntry[] = legacy.map((e) => ({
        id: e.id,
        kind: (e.kind === "passphrase" ? "passphrase" : "password") as HistoryEntry["kind"],
        value: e.value,
        label: e.label ?? null,
        score: e.score,
        created_at: typeof e.created_at === "number" ? new Date(e.created_at).toISOString() : e.created_at,
      }));
      const existing = await vault.load();
      const max = useSettings.getState().history_max || 200;
      await vault.save([...existing, ...entries].slice(0, max));
      localStorage.removeItem(LEGACY_KEY);
      onDone();
    } catch (err) {
      reportError("migration", err);
      setFailed(String(err));
      setWorking(false);
    }
  }

  function erase() {
    if (!eraseArmed) {
      setEraseArmed(true);
      return;
    }
    localStorage.removeItem(LEGACY_KEY);
    onDone();
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Migration sécurité</h2>
        <p>{count} mot(s) de passe en clair ont été détectés depuis une version précédente. Le nouveau coffre les chiffrera avec votre keystore OS.</p>
        <button onClick={migrate} disabled={working}>Migrer & chiffrer</button>
        {failed && <div className="error-inline" role="alert">Migration échouée : {failed}</div>}
        {eraseArmed ? (
          <div className="confirm-clear" role="group" aria-label="Confirmer l'effacement">
            <span>Effacer sans sauvegarder ?</span>
            <button onClick={erase} className="danger">Oui, effacer</button>
            <button onClick={() => setEraseArmed(false)}>Annuler</button>
          </div>
        ) : (
          <button onClick={erase} disabled={working} className="danger">Effacer définitivement</button>
        )}
      </div>
    </div>
  );
}

export function detectLegacyCount(): number {
  return readLegacy().length;
}
