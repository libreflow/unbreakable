import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function useDialogFocus(open: boolean, ref: React.RefObject<HTMLElement | null>) {
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      const el = ref.current;
      if (!el) return;
      const focusable = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      focusable[0]?.focus();

      const trap = (e: KeyboardEvent) => {
        if (e.key !== "Tab" || !focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      };

      el.addEventListener("keydown", trap);
      return () => el.removeEventListener("keydown", trap);
    } else {
      (triggerRef.current as HTMLElement | null)?.focus();
    }
  }, [open, ref]);
}
