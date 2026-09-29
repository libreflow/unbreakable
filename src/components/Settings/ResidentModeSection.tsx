import { useEffect, useRef, useState } from "react";
import { useSettings } from "../../stores/settingsStore";
import {
  enableTray,
  enableAutostart,
  registerShortcut,
  unregisterShortcut,
} from "../../utils/residentCommands";

export function ResidentModeSection() {
  const s = useSettings();
  const [comboError, setComboError] = useState<string | null>(null);
  const [comboDraft, setComboDraft] = useState<string>(s.shortcut_combo);
  useEffect(() => setComboDraft(s.shortcut_combo), [s.shortcut_combo]);
  const lastAppliedComboRef = useRef<string>(s.shortcut_combo);

  const onTray = async (enabled: boolean) => {
    s.set({ tray_enabled: enabled });
    try { await enableTray(enabled); } catch (e) { console.error(e); s.set({ tray_enabled: !enabled }); }
  };
  const onAutostart = async (enabled: boolean) => {
    s.set({ autostart_enabled: enabled });
    try { await enableAutostart(enabled); } catch (e) { console.error(e); s.set({ autostart_enabled: !enabled }); }
  };
  const onShortcut = async (enabled: boolean) => {
    s.set({ shortcut_enabled: enabled });
    try {
      if (enabled) {
        await registerShortcut(s.shortcut_combo);
        lastAppliedComboRef.current = s.shortcut_combo;
      } else {
        await unregisterShortcut();
      }
      setComboError(null);
    } catch (e) { console.error(e); s.set({ shortcut_enabled: !enabled }); setComboError(String(e)); }
  };
  // P3: the combo field keeps a local draft so each keystroke only updates
  // the input — no persist write, no cross-window IPC emit. The settings store
  // (and OS shortcut re-registration) is only touched when the user commits.
  const onCombo = (combo: string) => setComboDraft(combo);
  const onComboCommit = async () => {
    const combo = comboDraft.trim() || s.shortcut_combo;
    setComboDraft(combo);
    if (combo === s.shortcut_combo) return;
    s.set({ shortcut_combo: combo });
    if (!s.shortcut_enabled) return;
    if (combo === lastAppliedComboRef.current) return;
    try {
      await registerShortcut(combo);
      lastAppliedComboRef.current = combo;
      setComboError(null);
    } catch (e) {
      s.set({ shortcut_combo: lastAppliedComboRef.current });
      setComboDraft(lastAppliedComboRef.current);
      setComboError(String(e));
    }
  };
  const onNotifs = (enabled: boolean) => s.set({ notifications_enabled: enabled });

  return (
    <section>
      <h3>Mode résident</h3>
      <label className="check">
        <input type="checkbox" checked={s.tray_enabled} onChange={(e) => onTray(e.target.checked)} />
        Garder dans la barre système (tray)
      </label>
      <label className="check">
        <input type="checkbox" checked={s.autostart_enabled} onChange={(e) => onAutostart(e.target.checked)} />
        Lancer au démarrage de la session
      </label>
      <label className="check">
        <input type="checkbox" checked={s.shortcut_enabled} onChange={(e) => onShortcut(e.target.checked)} />
        Raccourci global actif
      </label>
      <label>Combinaison
        <input
          type="text"
          value={comboDraft}
          onChange={(e) => onCombo(e.target.value)}
          onBlur={onComboCommit}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          placeholder="CommandOrControl+Alt+P"
        />
      </label>
      {comboError && <span className="error-inline" role="alert">Raccourci refusé : {comboError}</span>}
      <label className="check">
        <input type="checkbox" checked={s.notifications_enabled} onChange={(e) => onNotifs(e.target.checked)} />
        Notifications système (copie, expiration TTL)
      </label>
    </section>
  );
}
