import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/700.css";
import "./App.css";
import "./components/QuickPop/QuickPop.css";
import { QuickPop } from "./components/QuickPop/QuickPop";

try {
  const raw = localStorage.getItem("unbreakable.settings");
  let theme: "auto" | "light" | "dark" = "auto";
  if (raw) {
    const parsed = JSON.parse(raw);
    theme = parsed?.state?.theme ?? "auto";
  }
  const resolved =
    theme === "auto"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
      : theme;
  document.documentElement.dataset.theme = resolved;
} catch {
  document.documentElement.dataset.theme = "dark";
}

const applyQuickTheme = () => {
  try {
    const raw = localStorage.getItem("unbreakable.settings");
    let theme: "auto" | "light" | "dark" = "auto";
    if (raw) {
      const parsed = JSON.parse(raw);
      theme = parsed?.state?.theme ?? "auto";
    }
    const resolved =
      theme === "auto"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
        : theme;
    document.documentElement.dataset.theme = resolved;
  } catch {
    document.documentElement.dataset.theme = "dark";
  }
};

applyQuickTheme();

// B7: keep the QuickPop theme in sync when settings change in the main window.
import { listenSettingsChanged } from "./utils/crossWindowEvents";
listenSettingsChanged(applyQuickTheme).catch(() => {});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QuickPop />
  </React.StrictMode>,
);
