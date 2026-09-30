import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { ClipboardBadge } from "./components/ClipboardBadge/ClipboardBadge";
import { PasswordPanel } from "./components/PasswordPanel/PasswordPanel";
import { PassphrasePanel } from "./components/PassphrasePanel/PassphrasePanel";
import { Settings } from "./components/Settings/Settings";
import { History } from "./components/History/History";
import { BootScreen } from "./components/Boot/BootScreen";
import { useAutoGenerate } from "./hooks/useAutoGenerate";
import { useDialogFocus } from "./hooks/useDialogFocus";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useCopySecret } from "./hooks/useCopySecret";
import { useAppEvents } from "./hooks/useAppEvents";
import { useBoot } from "./hooks/useBoot";
import { useGenerator } from "./stores/generatorStore";
import { useSettings } from "./stores/settingsStore";
import {
  generateMemorable,
  generatePassphraseFromOpts,
  generatePassword,
} from "./utils/tauriCommands";
import { notifyGenerationFailed } from "./utils/residentCommands";
import { setWindowProtected } from "./utils/windowProtection";
import { reportError } from "./utils/reportError";

function applyTheme(theme: "auto" | "light" | "dark") {
  const root = document.documentElement;
  if (theme === "auto") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = prefersDark ? "dark" : "light";
  } else {
    root.dataset.theme = theme;
  }
}

function App() {
  useAutoGenerate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpCardRef = useRef<HTMLDivElement>(null);
  useDialogFocus(helpOpen, helpCardRef);

  const theme = useSettings((s) => s.theme);
  const password = useGenerator((s) => s.password);
  const passphrase = useGenerator((s) => s.passphrase);

  const [genError, setGenError] = useState<string | null>(null);

  const copySecret = useCopySecret();
  const { boot, onUnlocked, onMigrationDone, onVaultWiped } = useBoot();
  useAppEvents(copySecret);

  const screenshotProtection = useSettings((s) => s.screenshot_protection);
  useEffect(() => {
    setWindowProtected("main", screenshotProtection).catch((e) =>
      reportError("windowProtection", e),
    );
  }, [screenshotProtection]);

  useEffect(() => {
    applyTheme(theme);
    if (theme === "auto") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const cb = () => applyTheme("auto");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    }
  }, [theme]);

  const regenerate = useCallback(async () => {
    try {
      const { pwdOpts, phraseOpts, setPassword, setPassphrase } = useGenerator.getState();
      const lang = useSettings.getState().passphrase_lang;
      const [p, ph] = await Promise.all([
        generatePassword(pwdOpts),
        generatePassphraseFromOpts(phraseOpts, lang),
      ]);
      setPassword(p);
      setPassphrase(ph);
      setGenError(null);
    } catch (e) {
      reportError("regenerate", e);
      setGenError(String(e));
      notifyGenerationFailed(String(e)).catch(() => {});
    }
  }, []);

  // A1: the copy pipeline lives in useCopySecret - shortcuts below are
  // thin wrappers over the same single implementation.
  const copyPwd = useCallback(async () => {
    if (password) await copySecret("password", password);
  }, [password, copySecret]);

  const copyPhrase = useCallback(async () => {
    if (passphrase) await copySecret("passphrase", passphrase);
  }, [passphrase, copySecret]);

  // Ctrl+M toggles the memorable FR mode; persisted via settings so the
  // next session boots in the same mode.
  const toggleMemorable = useCallback(() => {
    const next = !useSettings.getState().memorable_default;
    useSettings.getState().set({ memorable_default: next });
    const g = useGenerator.getState();
    if (next) {
      generateMemorable()
        .then(g.setPassword)
        .catch((e) => reportError("memorable", e));
    } else {
      generatePassword(g.pwdOpts)
        .then(g.setPassword)
        .catch((e) => reportError("password", e));
    }
  }, []);

  useKeyboardShortcuts({
    regenerate,
    copyPassword: copyPwd,
    copyPassphrase: copyPhrase,
    toggleMemorable,
    toggleHistory: () => setHistoryOpen((o) => !o),
    toggleSettings: () => setSettingsOpen((o) => !o),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSettingsOpen(false);
        setHistoryOpen(false);
        setHelpOpen(false);
      } else if (
        e.key === "?" &&
        !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName ?? "")
      ) {
        setHelpOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (boot.phase !== "ready") {
    return (
      <BootScreen
        boot={boot}
        onUnlocked={onUnlocked}
        onMigrationDone={onMigrationDone}
        onVaultWiped={onVaultWiped}
      />
    );
  }

  return (
    <main className="app">
      <header className="app-header">
        <div className="brand" aria-label="Unbreakable">
          <span className="brand-text">Unbreakable</span>
        </div>
        <nav className="app-actions" aria-label="Actions principales">
          <button
            className="chip chip-primary"
            onClick={regenerate}
            aria-label="Régénérer (Espace)"
            title="Régénérer — Espace / Ctrl+R"
          >
            ↳ Régén
          </button>
          <button
            className={historyOpen ? "chip chip-active" : "chip"}
            onClick={() => setHistoryOpen(true)}
            aria-expanded={historyOpen}
            aria-label="Historique (Ctrl+H)"
            title="Historique — Ctrl+H"
          >
            Hist
          </button>
          <button
            className={settingsOpen ? "chip chip-active" : "chip"}
            onClick={() => setSettingsOpen(true)}
            aria-expanded={settingsOpen}
            aria-label="Paramètres (Ctrl+,)"
            title="Paramètres — Ctrl+,"
          >
            Réglages
          </button>
          <button
            className={helpOpen ? "chip chip-active" : "chip"}
            onClick={() => setHelpOpen(true)}
            aria-expanded={helpOpen}
            aria-label="Aide (?)"
            title="Aide — ?"
          >
            ?
          </button>
        </nav>
      </header>

      <div className="hero">
        <ClipboardBadge />
      </div>

      <section className="panels" aria-label="Secrets générés">
        <PasswordPanel />
        <PassphrasePanel />
      </section>
      {genError && (
        <div className="error-inline" role="alert" aria-live="polite">
          Génération impossible : {genError}
        </div>
      )}

      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <History open={historyOpen} onClose={() => setHistoryOpen(false)} />

      {helpOpen && (
        <div className="overlay" onClick={() => setHelpOpen(false)}>
          <div
            ref={helpCardRef}
            className="help-card"
            role="dialog"
            aria-modal="true"
            aria-label="Raccourcis clavier"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Raccourcis</h2>
            <dl className="kbd-list">
              <div>
                <dt>
                  <kbd>Ctrl</kbd>+<kbd>R</kbd> · <kbd>Espace</kbd>
                </dt>
                <dd>Régénérer</dd>
              </div>
              <div>
                <dt>
                  <kbd>Ctrl</kbd>+<kbd>C</kbd>
                </dt>
                <dd>Copier le mot de passe</dd>
              </div>
              <div>
                <dt>
                  <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd>
                </dt>
                <dd>Copier la passphrase</dd>
              </div>
              <div>
                <dt>
                  <kbd>Ctrl</kbd>+<kbd>M</kbd>
                </dt>
                <dd>Mode mémorable FR</dd>
              </div>
              <div>
                <dt>
                  <kbd>Ctrl</kbd>+<kbd>H</kbd>
                </dt>
                <dd>Historique</dd>
              </div>
              <div>
                <dt>
                  <kbd>Ctrl</kbd>+<kbd>,</kbd>
                </dt>
                <dd>Paramètres</dd>
              </div>
              <div>
                <dt>
                  <kbd>?</kbd>
                </dt>
                <dd>Cette aide</dd>
              </div>
              <div>
                <dt>
                  <kbd>Échap</kbd>
                </dt>
                <dd>Fermer</dd>
              </div>
            </dl>
            <button onClick={() => setHelpOpen(false)}>Fermer</button>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
