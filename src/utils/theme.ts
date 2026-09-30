/**
 * Shared pre-render theme bootstrap: reads the persisted zustand settings
 * from localStorage and applies dataset.theme before React mounts, so
 * neither window flashes the wrong palette. Falls back to dark on any
 * parse error.
 */
export function applyPersistedTheme(): void {
  try {
    const raw = localStorage.getItem("unbreakable.settings");
    let theme: "auto" | "light" | "dark" = "auto";
    if (raw) {
      const parsed = JSON.parse(raw);
      theme = parsed?.state?.theme ?? "auto";
    }
    const resolved =
      theme === "auto"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;
    document.documentElement.dataset.theme = resolved;
  } catch {
    document.documentElement.dataset.theme = "dark";
  }
}
