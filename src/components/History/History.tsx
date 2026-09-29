import { useRef, useState } from "react";
import { useHistory } from "../../stores/historyStore";
import { useClipboard } from "../../stores/clipboardStore";
import { useSettings } from "../../stores/settingsStore";
import { copyToClipboard } from "../../utils/tauriCommands";
import { HistoryEntry } from "../../utils/vault";
import { useDialogFocus } from "../../hooks/useDialogFocus";

function formatDate(ts: string | number): string {
  return new Date(ts).toLocaleString();
}

export function History({ open, onClose }: { open: boolean; onClose: () => void }) {
  const entries = useHistory((s) => s.entries);
  const remove = useHistory((s) => s.remove);
  const clear = useHistory((s) => s.clear);
  const hydrated = useHistory((s) => s.hydrated);
  const setCopied = useClipboard((s) => s.setCopied);
  const ttl = useSettings((s) => s.ttl_seconds);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [confirmClear, setConfirmClear] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(open, dialogRef);

  if (!open) return null;

  const reveal = (e: HistoryEntry) => {
    if (revealed[e.id]) {
      setRevealed((r) => {
        const n = { ...r };
        delete n[e.id];
        return n;
      });
      return;
    }
    const pt = e.value;
    setRevealed((r) => ({ ...r, [e.id]: pt }));
  };

  const recopy = async (e: HistoryEntry) => {
    const pt = e.value;
    await copyToClipboard(pt);
    setCopied(e.kind, ttl);
  };

  return (
    <aside ref={dialogRef} className="flyout flyout-history" role="dialog" aria-label="Historique" aria-modal="true">
      <header className="flyout-header">
        <h2>Historique ({entries.length})</h2>
        <div>
          {entries.length > 0 && !confirmClear && (
            <button onClick={() => setConfirmClear(true)} aria-label="Vider l'historique">
              Vider
            </button>
          )}
          {confirmClear && (
            <span className="confirm-clear" role="group" aria-label="Confirmer la suppression">
              <span>Tout supprimer ?</span>
              <button autoFocus onClick={() => { clear(); setConfirmClear(false); }}>Oui</button>
              <button onClick={() => setConfirmClear(false)}>Non</button>
            </span>
          )}
          <button onClick={onClose} aria-label="Fermer">✕</button>
        </div>
      </header>
      <div className="flyout-body">
        {!hydrated ? (
          <p className="placeholder">Chargement…</p>
        ) : entries.length === 0 ? (
          <p className="placeholder">Aucun secret généré pour le moment.</p>
        ) : (
          <ul className="history-list">
            {entries.map((e) => (
              <li key={e.id} className="history-row">
                <div className="history-meta">
                  <span className={`tag tag-${e.kind}`}>{e.kind === "password" ? "MDP" : "Passphrase"}</span>
                  <span>{formatDate(e.created_at)}</span>
                  <span>score {e.score}/4</span>
                </div>
                <code className="history-secret">{revealed[e.id] ?? "•".repeat(Math.min(e.value.length, 48))}</code>
                <div className="history-actions">
                  <button onClick={() => recopy(e)} aria-label="Recopier ce secret">Copier</button>
                  <button onClick={() => reveal(e)} aria-label="Afficher / masquer">
                    {revealed[e.id] ? "Masquer" : "Afficher"}
                  </button>
                  <button onClick={() => remove(e.id)} aria-label="Supprimer" title="Supprimer">×</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
