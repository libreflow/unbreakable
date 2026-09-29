import { useEffect } from "react";

type Handlers = {
  regenerate: () => void;
  copyPassword: () => void;
  copyPassphrase: () => void;
  toggleMemorable: () => void;
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

      // A11: guard every shortcut while typing in an input so we never
      // hijack native editing combos (Ctrl+H history over a text field, etc).
      if (mod && e.key.toLowerCase() === "r" && !isInput) {
        e.preventDefault();
        h.regenerate();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "c" && !isInput) {
        e.preventDefault();
        h.copyPassphrase();
      } else if (mod && e.key.toLowerCase() === "c" && !isInput) {
        if (window.getSelection()?.toString().length) return;
        e.preventDefault();
        h.copyPassword();
      } else if (mod && e.key.toLowerCase() === "m" && !isInput) {
        e.preventDefault();
        h.toggleMemorable();
      } else if (mod && e.key.toLowerCase() === "h" && !isInput) {
        e.preventDefault();
        h.toggleHistory();
      } else if (mod && e.key === "," && !isInput) {
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
