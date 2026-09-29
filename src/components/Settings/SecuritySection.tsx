import { useEffect, useState } from "react";
import { vault, VaultStatus } from "../../utils/vault";
import { isProtectionSupported } from "../../utils/windowProtection";
import { useSettings } from "../../stores/settingsStore";
import { useHistory } from "../../stores/historyStore";
import { reportError } from "../../utils/reportError";
import type { PassphraseLang } from "../../types";

export function SecuritySection() {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [protectionOk, setProtectionOk] = useState(true);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  // A7: wipe flow uses inline confirmation UI instead of alert/confirm/prompt.
  const [wipeStage, setWipeStage] = useState<"idle" | "confirm" | "auth">("idle");
  const [wipePw, setWipePw] = useState("");
  const [wipeError, setWipeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [disablePwArmed, setDisablePwArmed] = useState(false);
  const lang = useSettings((s) => s.passphrase_lang);
  const setSettings = useSettings((s) => s.set);

  async function refresh() {
    try {
      setStatus(await vault.status());
      setProtectionOk(await isProtectionSupported());
    } catch (e) {
      reportError("SecuritySection refresh", e);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  async function enableMasterPw() {
    if (newPw !== confirmPw) {
      setFormError("Les mots de passe ne correspondent pas");
      return;
    }
    if (newPw.length < 8) {
      setFormError("Minimum 8 caractères");
      return;
    }
    // Inline confirmation instead of window.confirm
    await vault.setMasterPassword(newPw);
    setShowSetup(false);
    setNewPw("");
    setConfirmPw("");
    setFormError(null);
    await refresh();
  }


  async function doWipe() {
    try {
      await vault.clear(wipePw || null);
    } catch {
      setWipeError("Mot de passe maître incorrect.");
      return;
    }
    useHistory.getState().clear();
    setWipeStage("idle");
    setWipePw("");
    setWipeError(null);
    await refresh();
  }

  if (!status) return <div>Chargement…</div>;

  return (
    <section className="settings-section">
      <h3>Sécurité</h3>
      <div className="row">
        <label>Mot de passe maître</label>
        {status.master_pw_enabled ? (
          <button
            onClick={async () => {
              if (disablePwArmed) {
                setDisablePwArmed(false);
                await vault.setMasterPassword(null);
                await refresh();
              } else {
                setDisablePwArmed(true);
              }
            }}
          >
            {disablePwArmed ? "Confirmer la désactivation" : "Désactiver"}
          </button>
        ) : showSetup ? (
          <div className="stack">
            <input type="password" placeholder="Nouveau mot de passe" value={newPw} onChange={(e) => { setNewPw(e.target.value); setFormError(null); }} />
            <input type="password" placeholder="Confirmer" value={confirmPw} onChange={(e) => { setConfirmPw(e.target.value); setFormError(null); }} />
            {formError && <span className="error-inline" role="alert">{formError}</span>}
            <span className="warning">⚠ Si vous oubliez ce mot de passe, l'historique sera définitivement perdu.</span>
            <button onClick={enableMasterPw}>Activer</button>
            <button onClick={() => { setShowSetup(false); setFormError(null); }}>Annuler</button>
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
      {!status.master_pw_enabled && (
        <div className="row">
          <span className="warning">
            ⚠ Sans mot de passe maître, la protection du coffre repose uniquement sur le
            keystore du système. Tout processus exécuté avec votre compte peut le déchiffrer.
          </span>
        </div>
      )}
      <div className="row">
        <label>Entrées dans le coffre</label>
        <span>{status.entry_count}</span>
      </div>
      <div className="row">
        {wipeStage === "idle" && (
          <button className="danger" onClick={() => setWipeStage("confirm")}>Effacer le coffre</button>
        )}
        {wipeStage === "confirm" && (
          <div className="stack">
            <span className="warning">⚠ EFFACER tout l'historique ? Cette action est irréversible.</span>
            <div className="confirm-clear" role="group" aria-label="Confirmer l'effacement">
              <span>Tout effacer ?</span>
              <button
                className="danger"
                onClick={() =>
                  status.master_pw_enabled ? setWipeStage("auth") : doWipe()
                }
              >
                Oui
              </button>
              <button onClick={() => { setWipeStage("idle"); setWipeError(null); }}>Non</button>
            </div>
          </div>
        )}
        {wipeStage === "auth" && (
          <div className="stack">
            <label>
              Mot de passe maître
              <input
                type="password"
                value={wipePw}
                autoFocus
                onChange={(e) => { setWipePw(e.target.value); setWipeError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") doWipe(); }}
              />
            </label>
            {wipeError && <span className="error-inline" role="alert">{wipeError}</span>}
            <div className="confirm-clear" role="group">
              <button className="danger" onClick={doWipe}>Effacer définitivement</button>
              <button onClick={() => { setWipeStage("idle"); setWipePw(""); setWipeError(null); }}>Annuler</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
