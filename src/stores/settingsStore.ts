import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { AppSettings, DEFAULT_SETTINGS } from "../types";

interface SettingsState extends AppSettings {
  set: (patch: Partial<AppSettings>) => void;
  reset: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) => set(patch),
      reset: () => set(DEFAULT_SETTINGS),
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
        } as never;
      },
    },
  ),
);
