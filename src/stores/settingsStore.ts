import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { AppSettings, DEFAULT_SETTINGS, PassphraseLang } from "../types";
import { emitSettingsChanged } from "../utils/crossWindowEvents";

const detectLang = (): PassphraseLang => {
  if (typeof navigator === "undefined") return "en";
  const code = navigator.language.slice(0, 2).toLowerCase();
  return (["fr", "en", "de", "es", "it"] as const).find((l) => l === code) ?? "en";
};

interface SettingsState extends AppSettings {
  set: (patch: Partial<AppSettings>) => void;
  reset: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      passphrase_lang: detectLang(),
      set: (patch) => set(patch),
      reset: () => set({ ...DEFAULT_SETTINGS, passphrase_lang: detectLang() }),
    }),
    {
      name: "unbreakable.settings",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      migrate: (persisted: unknown, _version: number) => {
        const old = (persisted as Record<string, unknown>) ?? {};
        return {
          ...old,
          tray_enabled: old.tray_enabled ?? false,
          autostart_enabled: old.autostart_enabled ?? false,
          shortcut_enabled: old.shortcut_enabled ?? false,
          shortcut_combo: old.shortcut_combo ?? "CommandOrControl+Alt+P",
          notifications_enabled: old.notifications_enabled ?? false,
          passphrase_lang: (old.passphrase_lang as PassphraseLang | undefined) ?? detectLang(),
        } as never;
      },
    },
  ),
);

// A5: cross-window notification moved out of the set() mutator into an
// explicit subscription. set() is now a pure state update; the emitter
// diffs previous/next settings and notifies other windows per changed key.
// The emit rejects outside Tauri (tests) - the catch keeps it inert there.
useSettings.subscribe((state, prev) => {
  for (const key of Object.keys(state) as (keyof AppSettings)[]) {
    if (state[key] !== prev[key]) {
      emitSettingsChanged({ key, value: state[key] }).catch(() => {});
    }
  }
});
