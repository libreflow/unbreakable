import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { CopiedPanel, HistoryEntry } from "../types";
import { useSettings } from "./settingsStore";

interface HistoryState {
  entries: HistoryEntry[];
  add: (kind: CopiedPanel, plain: string, score: number, label?: string) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useHistory = create<HistoryState>()(
  persist(
    (set, get) => ({
      entries: [],
      add: (kind, plain, score, label) => {
        const max = useSettings.getState().history_max ?? 200;
        const entry: HistoryEntry = {
          id: crypto.randomUUID(),
          kind,
          value: plain,
          label,
          score,
          created_at: Date.now(),
        };
        set({ entries: [entry, ...get().entries].slice(0, max) });
      },
      remove: (id) => set({ entries: get().entries.filter((e) => e.id !== id) }),
      clear: () => set({ entries: [] }),
    }),
    {
      name: "unbreakable.history",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      migrate: (_state: unknown, _version: number): Pick<HistoryState, "entries"> => ({ entries: [] }),
    },
  ),
);
