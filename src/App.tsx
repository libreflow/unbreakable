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
  generatePassphraseFromOpts,
  generatePassword,
} from "./utils/tauriCommands";
import { analyzeStrength } from "./utils/strength";
import { vault } from "./utils/vault";
import { UnlockModal } from "./components/Modals/UnlockModal";
import { MigrationModal, detectLegacyCount } from "./components/Modals/MigrationModal";

function applyTheme(theme: "auto" | "light" | "dark") {
  const root = document.documentElement;
  if (theme === "auto") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = prefersDark ? "dark" : "light";
  } else {
    root.dataset.theme = theme;
  }
}

type BootState =
  | { phase: "loading" }
  | { phase: "unlock" }
  | { phase: "migrate"; count: number }
  | { phase: "ready" };

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

  const [boot, setBoot] = useState<BootState>({ phase: "loading" });
  const [genError, setGenError] = useState<string | null>(null);

  useEffect(() => {
    applyTheme(theme);
    if (theme === "auto") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const cb = () => applyTheme("auto");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    }
  }, [theme]);

  useEffect(() => {
    (async () => {
      try {
        const status = await vault.status();
        if (status.master_pw_enabled) {
          setBoot({ phase: "unlock" });
        } else {
          await vault.unlock(null);
          await useHistory.getState().hydrate();
          const legacy = detectLegacyCount();
          setBoot(legacy > 0 ? { phase: "migrate", count: legacy } : { phase: "ready" });
        }
      } catch (err) {
        console.error("boot failed:", err);
        setBoot({ phase: "ready" }); // fail-open to avoid bricking
      }
    })();
  }, []);

  const regenerate = useCallback(async () => {
    try {
      const lang = useSettings.getState().passphrase_lang;
      const [p, ph] = await Promise.all([
        generatePassword(pwdOpts),
        generatePassphraseFromOpts(phraseOpts, lang),
      ]);
      setPassword(p);
      setPassphrase(ph);
      setGenError(null);
    } catch (e) {
      // B10: surface generation failures instead of failing silently.
      console.error(e);
      setGenError(String(e));
    }
  }, [pwdOpts, phraseOpts, setPassword, setPassphrase]);

  const copyPwd = useCallback(async () => {
    if (!password) return;
    await copyToClipboard(password);
    setCopied("password", ttl);
    addHistory("password", password, analyzeStrength(password).score);
  }, [password, setCopied, ttl, addHistory]);

  const copyPhrase = useCallback(async () => {
    if (!passphrase) return;
    await copyToClipboard(passphrase);
    setCopied("passphrase", ttl);
    addHistory("passphrase", passphrase, analyzeStrength(passphrase).score);
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

  // Boot replay — re-applies resident-mode toggles after restart.
  // Safe to read getState() synchronously because Zustand persist uses
  // sync localStorage; if storage ever switches to async (IndexedDB, Tauri
  // store), this needs to await hydration first.
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

  // B1: arm TTL timer when QuickPop (or any other window) copies a secret.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      const { listenSecretCopied } = await import("./utils/crossWindowEvents");
      unlisten = await listenSecretCopied(({ kind, ttl: t }) => {
        useClipboard.getState().setCopied(kind, t);
      });
    })();
    return () => { unlisten?.(); };
  }, []);

  // B2: tray "Générer & copier" menu items emit this event with the kind.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<string>("tray-generate-and-copy", async (e) => {
        const kind = e.payload === "passphrase" ? "passphrase" : "password";
        try {
          const opts = useGenerator.getState();
          const secret = kind === "password"
            ? await generatePassword(opts.pwdOpts)
            : await generatePassphraseFromOpts(opts.phraseOpts, useSettings.getState().passphrase_lang);
          if (kind === "password") setPassword(secret);
          else setPassphrase(secret);
          await copyToClipboard(secret);
          const settings = useSettings.getState();
          setCopied(kind, settings.ttl_seconds);
          addHistory(kind, secret, analyzeStrength(secret).score);
          if (settings.notifications_enabled) {
            const { notifyCopied } = await import("./utils/residentCommands");
            notifyCopied(kind, settings.ttl_seconds).catch(() => {});
          }
        } catch (err) { console.error("tray-generate-and-copy failed", err); }
      });
    })();
    return () => { unlisten?.(); };
  }, [setCopied, addHistory, setPassword, setPassphrase]);

  if (boot.phase === "loading") {
    return <div className="boot-loading">Chargement…</div>;
  }

  if (boot.phase === "unlock") {
    return (
      <UnlockModal
        onUnlocked={async () => {
          await useHistory.getState().hydrate();
          const legacy = detectLegacyCount();
          setBoot(legacy > 0 ? { phase: "migrate", count: legacy } : { phase: "ready" });
        }}
        onForgotten={async (pw) => {
          if (!confirm("Effacer le coffre et perdre tout l'historique ?")) return;
          try { await vault.clear(pw || null); } catch (e) { console.error("vault.clear failed:", e); }
          setBoot({ phase: "ready" });
        }}
      />
    );
  }

  if (boot.phase === "migrate") {
    return (
      <MigrationModal
        count={boot.count}
        onDone={async () => {
          await useHistory.getState().hydrate();
          setBoot({ phase: "ready" });
        }}
      />
    );
  }

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
      {genError && (
        <div className="error-inline" role="alert" aria-live="polite">
          Génération impossible : {genError}
        </div>
      )}

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
