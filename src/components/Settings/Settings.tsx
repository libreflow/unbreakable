import { useRef } from "react";
import { useSettings } from "../../stores/settingsStore";
import { useGenerator } from "../../stores/generatorStore";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { ResidentModeSection } from "./ResidentModeSection";
import { SecuritySection } from "./SecuritySection";


export function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSettings();
  const pwdOpts = useGenerator((g) => g.pwdOpts);
  const setPwdOpts = useGenerator((g) => g.setPwdOpts);
  const phraseOpts = useGenerator((g) => g.phraseOpts);
  const setPhraseOpts = useGenerator((g) => g.setPhraseOpts);
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(open, dialogRef);

  if (!open) return null;

  return (
    <aside ref={dialogRef} className="flyout" role="dialog" aria-label="Paramètres" aria-modal="true">
      <header className="flyout-header">
        <h2>Paramètres</h2>
        <button onClick={onClose} aria-label="Fermer">✕</button>
      </header>
      <div className="flyout-body">
        <section>
          <h3>Général</h3>
          <label>Type copié par défaut
            <select value={s.default_copy} onChange={(e) => s.set({ default_copy: e.target.value as "password" | "passphrase" })}>
              <option value="password">Mot de passe</option>
              <option value="passphrase">Passphrase</option>
            </select>
          </label>
          <label>TTL clipboard
            <select value={s.ttl_seconds} onChange={(e) => s.set({ ttl_seconds: Number(e.target.value) })}>
              <option value={30}>30s</option>
              <option value={60}>60s</option>
              <option value={120}>120s</option>
              <option value={0}>jamais</option>
            </select>
          </label>
          <label>Thème
            <select value={s.theme} onChange={(e) => s.set({ theme: e.target.value as "auto" | "light" | "dark" })}>
              <option value="auto">Auto (OS)</option>
              <option value="light">Clair</option>
              <option value="dark">Sombre</option>
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={s.auto_copy_on_open} onChange={(e) => s.set({ auto_copy_on_open: e.target.checked })} />
            Copier automatiquement à l'ouverture
          </label>
        </section>

        <section>
          <h3>Mot de passe</h3>
          <label>Longueur : {pwdOpts.length}
            <input
              type="range" min={8} max={128} value={pwdOpts.length}
              aria-label="Longueur du mot de passe"
              aria-valuetext={`${pwdOpts.length} caractères`}
              onChange={(e) => setPwdOpts({ length: Number(e.target.value) })}
            />
          </label>
          <label className="check"><input type="checkbox" checked={pwdOpts.uppercase} onChange={(e) => setPwdOpts({ uppercase: e.target.checked })} /> Majuscules</label>
          <label className="check"><input type="checkbox" checked={pwdOpts.lowercase} onChange={(e) => setPwdOpts({ lowercase: e.target.checked })} /> Minuscules</label>
          <label className="check"><input type="checkbox" checked={pwdOpts.digits} onChange={(e) => setPwdOpts({ digits: e.target.checked })} /> Chiffres</label>
          <label className="check"><input type="checkbox" checked={pwdOpts.symbols} onChange={(e) => setPwdOpts({ symbols: e.target.checked })} /> Symboles</label>
          <label className="check"><input type="checkbox" checked={pwdOpts.exclude_ambiguous} onChange={(e) => setPwdOpts({ exclude_ambiguous: e.target.checked })} /> Exclure ambigus (0,O,l,1,I,|)</label>
        </section>

        <section>
          <h3>Passphrase</h3>
          <label>Nombre de mots : {phraseOpts.words}
            <input
              type="range" min={5} max={12} value={phraseOpts.words}
              aria-label="Nombre de mots de la passphrase"
              aria-valuetext={`${phraseOpts.words} mots`}
              onChange={(e) => setPhraseOpts({ words: Number(e.target.value) })}
            />
          </label>
          <label>Séparateur
            <input type="text" maxLength={1} value={phraseOpts.separator} onChange={(e) => setPhraseOpts({ separator: e.target.value })} aria-describedby="sep-hint" />
          </label>
          <label className="check"><input type="checkbox" checked={phraseOpts.include_digit} onChange={(e) => setPhraseOpts({ include_digit: e.target.checked })} /> Ajouter 1 chiffre</label>
          <label className="check"><input type="checkbox" checked={phraseOpts.include_symbol} onChange={(e) => setPhraseOpts({ include_symbol: e.target.checked })} /> Ajouter 1 symbole</label>
        </section>

        <SecuritySection />
        <ResidentModeSection />
      </div>
    </aside>
  );
}
