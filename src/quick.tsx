import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/700.css";
import "./App.css";
import "./components/QuickPop/QuickPop.css";
import { QuickPop } from "./components/QuickPop/QuickPop";
import { applyPersistedTheme } from "./utils/theme";
// B7: keep the QuickPop theme in sync when settings change in the main window.
import { listenSettingsChanged } from "./utils/crossWindowEvents";

applyPersistedTheme();
listenSettingsChanged(applyPersistedTheme).catch(() => {});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QuickPop />
  </React.StrictMode>,
);
