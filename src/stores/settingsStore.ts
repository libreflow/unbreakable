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
    },
  ),
);
