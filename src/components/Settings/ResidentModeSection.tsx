import { useRef, useState } from "react";
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
  const onCombo = (combo: string) => s.set({ shortcut_combo: combo });
  // Re-register OS-side when the user commits a new combo while the shortcut is enabled.
  const onComboCommit = async () => {
    if (!s.shortcut_enabled) return;
    if (s.shortcut_combo === lastAppliedComboRef.current) return;
    try {
      await registerShortcut(s.shortcut_combo);
      lastAppliedComboRef.current = s.shortcut_combo;
      setComboError(null);
    } catch (e) {
      s.set({ shortcut_combo: lastAppliedComboRef.current });
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
          value={s.shortcut_combo}
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
