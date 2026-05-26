import { useEffect, useState } from "react";
import { vault, VaultStatus } from "../../utils/vault";
import { isProtectionSupported } from "../../utils/windowProtection";
import { useSettings } from "../../stores/settingsStore";
import { useHistory } from "../../stores/historyStore";
import type { PassphraseLang } from "../../types";

export function SecuritySection() {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [protectionOk, setProtectionOk] = useState(true);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const lang = useSettings((s) => s.passphrase_lang);
  const setSettings = useSettings((s) => s.set);

  async function refresh() {
    try {
      setStatus(await vault.status());
      setProtectionOk(await isProtectionSupported());
    } catch (e) {
      console.error("SecuritySection refresh failed:", e);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function enableMasterPw() {
    if (newPw !== confirmPw) { alert("Les mots de passe ne correspondent pas"); return; }
    if (newPw.length < 8) { alert("Minimum 8 caractères"); return; }
    if (!confirm("Activer le mot de passe maître ?\n\nATTENTION : si vous l'oubliez, l'historique sera définitivement perdu.")) return;
    await vault.setMasterPassword(newPw);
    setShowSetup(false); setNewPw(""); setConfirmPw("");
    await refresh();
  }

  async function disableMasterPw() {
    if (!confirm("Désactiver le mot de passe maître ? L'historique restera chiffré via le keystore OS uniquement.")) return;
    await vault.setMasterPassword(null);
    await refresh();
  }

  async function wipeVault() {
    if (!confirm("EFFACER tout l'historique ? Cette action est irréversible.")) return;
    if (prompt("Tapez EFFACER pour confirmer") !== "EFFACER") return;
    await vault.clear();
    useHistory.getState().clear();  // clear in-memory entries so debounced save can't re-populate
    await refresh();
  }

  if (!status) return <div>Chargement…</div>;

  return (
    <section className="settings-section">
      <h3>Sécurité</h3>

      <div className="row">
        <label>Mot de passe maître</label>
        {status.master_pw_enabled ? (
          <button onClick={disableMasterPw}>Désactiver</button>
        ) : showSetup ? (
          <div className="stack">
            <input type="password" placeholder="Nouveau mot de passe" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
            <input type="password" placeholder="Confirmer" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
            <button onClick={enableMasterPw}>Activer</button>
            <button onClick={() => setShowSetup(false)}>Annuler</button>
          </div>
        ) : (
          <button onClick={() => setShowSetup(true)}>Activer</button>
        )}
      </div>

      <div className="row">
        <label>Langue passphrase</label>
        <select value={lang} onChange={(e) => setSettings({ passphrase_lang: e.target.value as PassphraseLang })}>
          <option value="fr">Français</option>
          <option value="en">English</option>
          <option value="de">Deutsch</option>
          <option value="es">Español</option>
          <option value="it">Italiano</option>
        </select>
      </div>

      <div className="row">
        <label>Anti-capture d'écran</label>
        <span>{protectionOk ? "✓ Supporté" : "✗ Non supporté sur ce système"}</span>
      </div>

      <div className="row">
        <label>Keystore OS</label>
        <span>{status.keyring_ok ? "✓ Disponible" : "✗ Indisponible"}</span>
      </div>

      <div className="row">
        <label>Entrées dans le coffre</label>
        <span>{status.entry_count}</span>
      </div>

      <div className="row">
        <button className="danger" onClick={wipeVault}>Effacer le coffre</button>
      </div>
    </section>
  );
}
