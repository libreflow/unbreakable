import { useEffect } from "react";

type Handlers = {
  regenerate: () => void;
  copyPassword: () => void;
  copyPassphrase: () => void;
  toggleHistory: () => void;
  toggleSettings: () => void;
};

export function useKeyboardShortcuts(h: Handlers) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const isInput =
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA";

      if (mod && e.key.toLowerCase() === "r") {
        e.preventDefault();
        h.regenerate();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        h.copyPassphrase();
      } else if (mod && e.key.toLowerCase() === "c" && !isInput) {
        if (window.getSelection()?.toString().length) return;
        e.preventDefault();
        h.copyPassword();
      } else if (mod && e.key.toLowerCase() === "h") {
        e.preventDefault();
        h.toggleHistory();
      } else if (mod && e.key === ",") {
        e.preventDefault();
        h.toggleSettings();
      } else if (e.key === " " && !isInput) {
        e.preventDefault();
        h.regenerate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [h]);
}
