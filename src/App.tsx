import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { ClipboardBadge } from "./components/ClipboardBadge/ClipboardBadge";
import { PasswordPanel } from "./components/PasswordPanel/PasswordPanel";
import { PassphrasePanel } from "./components/PassphrasePanel/PassphrasePanel";
import { Settings } from "./components/Settings/Settings";
import { History } from "./components/History/History";
import { useAutoGenerate } from "./hooks/useAutoGenerate";
import { useDialogFocus } from "./hooks/useDialogFocus";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useGenerator } from "./stores/generatorStore";
import { useClipboard } from "./stores/clipboardStore";
import { useSettings } from "./stores/settingsStore";
import { useHistory } from "./stores/historyStore";
import {
  copyToClipboard,
  generatePassphrase,
  generatePassword,
} from "./utils/tauriCommands";
import { analyzeStrength } from "./utils/strength";

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
  const ttl = useSettings((s) => s.ttl_seconds);
  const { pwdOpts, phraseOpts, setPassword, setPassphrase, password, passphrase } = useGenerator();
  const setCopied = useClipboard((s) => s.setCopied);
  const addHistory = useHistory((s) => s.add);

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
      const [p, ph] = await Promise.all([
        generatePassword(pwdOpts),
        generatePassphrase(phraseOpts),
      ]);
      setPassword(p);
      setPassphrase(ph);
    } catch (e) {
      console.error(e);
    }
  }, [pwdOpts, phraseOpts, setPassword, setPassphrase]);

  const copyPwd = useCallback(async () => {
    if (!password) return;
    await copyToClipboard(password);
    setCopied("password", ttl);
    addHistory("password", password, analyzeStrength(password).score).catch(() => {});
  }, [password, setCopied, ttl, addHistory]);

  const copyPhrase = useCallback(async () => {
    if (!passphrase) return;
    await copyToClipboard(passphrase);
    setCopied("passphrase", ttl);
    addHistory("passphrase", passphrase, analyzeStrength(passphrase).score).catch(() => {});
  }, [passphrase, setCopied, ttl, addHistory]);

  useKeyboardShortcuts({
    regenerate,
    copyPassword: copyPwd,
    copyPassphrase: copyPhrase,
    toggleHistory: () => setHistoryOpen((o) => !o),
    toggleSettings: () => setSettingsOpen((o) => !o),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSettingsOpen(false);
        setHistoryOpen(false);
        setHelpOpen(false);
      } else if (e.key === "?" && !["INPUT", "TEXTAREA"].includes((document.activeElement?.tagName ?? ""))) {
        setHelpOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    (async () => {
      const {
        enableTray, enableAutostart, registerShortcut,
      } = await import("./utils/residentCommands");
      const s = useSettings.getState();
      try {
        if (s.tray_enabled) await enableTray(true);
        if (s.autostart_enabled) await enableAutostart(true);
        if (s.shortcut_enabled) await registerShortcut(s.shortcut_combo);
      } catch (e) { console.error("resident-mode boot replay failed", e); }
    })();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      const { listenClipboardCleared } = await import("./utils/crossWindowEvents");
      const { notifyClipboardCleared } = await import("./utils/residentCommands");
      unlisten = await listenClipboardCleared(() => {
        if (useSettings.getState().notifications_enabled) {
          notifyClipboardCleared().catch(() => {});
        }
      });
    })();
    return () => { unlisten?.(); };
  }, []);

  return (
    <main className="app">
      <header className="app-header">
        <div className="brand" aria-label="Unbreakable">
          <span className="brand-mark">EST · 2026</span>
          <span className="brand-text">Unbreakable</span>
        </div>
        <div className="app-tagline">Cipher press · pour un secret prêt à coller, sans détour</div>
        <nav className="app-actions" aria-label="Actions principales">
          <button className="chip chip-primary" onClick={regenerate} aria-label="Régénérer (Espace)">↻ Régen</button>
          <button className="chip" onClick={() => setHistoryOpen(true)} aria-label="Historique (Ctrl+H)">Hist</button>
          <button className="chip" onClick={() => setSettingsOpen(true)} aria-label="Paramètres (Ctrl+,)">Réglages</button>
          <button className="chip" onClick={() => setHelpOpen(true)} aria-label="Aide (?)">?</button>
        </nav>
      </header>

      <div className="hero">
        <ClipboardBadge />
      </div>

      <section className="panels" aria-label="Secrets générés">
        <PasswordPanel />
        <PassphrasePanel />
      </section>

      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <History open={historyOpen} onClose={() => setHistoryOpen(false)} />

      {helpOpen && (
        <div className="overlay" onClick={() => setHelpOpen(false)}>
          <div ref={helpCardRef} className="help-card" role="dialog" aria-modal="true" aria-label="Raccourcis clavier" onClick={(e) => e.stopPropagation()}>
            <h2>Raccourcis</h2>
            <dl className="kbd-list">
              <div><dt><kbd>Ctrl</kbd>+<kbd>R</kbd> · <kbd>Espace</kbd></dt><dd>Régénérer</dd></div>
              <div><dt><kbd>Ctrl</kbd>+<kbd>C</kbd></dt><dd>Copier le mot de passe</dd></div>
              <div><dt><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd></dt><dd>Copier la passphrase</dd></div>
              <div><dt><kbd>Ctrl</kbd>+<kbd>H</kbd></dt><dd>Historique</dd></div>
              <div><dt><kbd>Ctrl</kbd>+<kbd>,</kbd></dt><dd>Paramètres</dd></div>
              <div><dt><kbd>?</kbd></dt><dd>Cette aide</dd></div>
              <div><dt><kbd>Échap</kbd></dt><dd>Fermer</dd></div>
            </dl>
            <button onClick={() => setHelpOpen(false)}>Fermer</button>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
