import { useEffect, useMemo, useRef, useState } from "react";
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
  const rename = useHistory((s) => s.rename);
  const clear = useHistory((s) => s.clear);
  const hydrated = useHistory((s) => s.hydrated);
  const setCopied = useClipboard((s) => s.setCopied);
  const ttl = useSettings((s) => s.ttl_seconds);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(open, dialogRef);

  // L4: the revealed map holds plaintext secrets - drop it whenever the
  // entries disappear (including the 5-min RAM purge).
  useEffect(() => {
    if (entries.length === 0) setRevealed({});
  }, [entries.length]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        (e.label ?? "").toLowerCase().includes(q) ||
        e.kind.toLowerCase().includes(q) ||
        e.value.toLowerCase().includes(q),
    );
  }, [entries, query]);

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
    setRevealed((r) => ({ ...r, [e.id]: e.value }));
  };

  const recopy = async (e: HistoryEntry) => {
    await copyToClipboard(e.value);
    setCopied(e.kind, ttl);
  };

  return (
    <div className="flyout-backdrop" onClick={onClose} aria-hidden="true">
    <aside ref={dialogRef} className="flyout flyout-history" role="dialog" aria-label="Historique" aria-modal="true" onClick={(e) => e.stopPropagation()}>
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
          <button onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>
      </header>
      <div className="flyout-body">
        <input
          type="search"
          className="history-search"
          placeholder="Rechercher (label, type, secret)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Rechercher dans l'historique"
        />
        {!hydrated ? (
          <p className="placeholder">Chargement…</p>
        ) : filtered.length === 0 ? (
          <p className="placeholder">
            {entries.length === 0
              ? "Aucun secret généré pour le moment."
              : "Aucun résultat pour cette recherche."}
          </p>
        ) : (
          <ul className="history-list">
            {filtered.map((e) => (
              <li key={e.id} className="history-row">
                <div className="history-meta">
                  <span className={`tag tag-${e.kind}`}>{e.kind === "password" ? "MDP" : "Passphrase"}</span>
                  <span>{formatDate(e.created_at)}</span>
                  <span>score {e.score}/4</span>
                </div>
                {editing === e.id ? (
                  <input
                    className="history-label-input"
                    autoFocus
                    defaultValue={e.label ?? ""}
                    placeholder="Label (ex. AD jean.dupont)"
                    aria-label="Modifier le label"
                    onBlur={(ev) => {
                      rename(e.id, ev.target.value);
                      setEditing(null);
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") (ev.target as HTMLInputElement).blur();
                      if (ev.key === "Escape") setEditing(null);
                    }}
                  />
                ) : (
                  <button
                    className="history-label"
                    onClick={() => setEditing(e.id)}
                    title="Renommer cette entrée"
                    aria-label="Renommer cette entrée"
                  >
                    {e.label ?? "＋ label"}
                  </button>
                )}
                <code className="history-secret">{revealed[e.id] ?? "•".repeat(Math.min(e.value.length, 48))}</code>
                <div className="history-actions">
                  <button onClick={() => recopy(e)} aria-label="Recopier ce secret">Copier</button>
                  <button onClick={() => reveal(e)} aria-label="Afficher / masquer">
                    {revealed[e.id] ? "Masquer" : "Afficher"}
                  </button>
                  <button onClick={() => remove(e.id)} aria-label="Supprimer" title="Supprimer">
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
    </div>
  );
}
