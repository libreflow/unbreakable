import { create } from "zustand";
import { vault, HistoryEntry } from "../utils/vault";
import { CopiedPanel } from "../types";

const MAX_ENTRIES = 200;
const RAM_EXPIRY_MS = 5 * 60 * 1000;

let ramTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleRamExpiry = () => {
  if (ramTimer) clearTimeout(ramTimer);
  ramTimer = setTimeout(() => {
    ramTimer = null;
    const s = useHistory.getState();
    if (s.entries.length > 0) s.clear();
  }, RAM_EXPIRY_MS);
};

interface HistoryState {
  entries: HistoryEntry[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  add: (kind: CopiedPanel, plain: string, score: number, label?: string) => void;
  remove: (id: string) => void;
  clear: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
const debouncedSave = (entries: HistoryEntry[]) => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    vault.save(entries).catch((err) => console.error("vault_save failed:", err));
    saveTimer = null;
  }, 500);
};

export const useHistory = create<HistoryState>((set, get) => {
  scheduleRamExpiry();
  return ({
  entries: [],
  hydrated: false,

  hydrate: async () => {
    try {
      const loaded = await vault.load();
      set({ entries: loaded.slice(0, MAX_ENTRIES), hydrated: true });
    } catch (e) {
      console.error("vault_load failed:", e);
      set({ entries: [], hydrated: true });
    }
  },

  add: (kind, plain, score, label) => {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      kind,
      value: plain,
      label: label ?? null,
      score,
      created_at: new Date().toISOString(),
    };
    const next = [entry, ...get().entries].slice(0, MAX_ENTRIES);
    set({ entries: next });
    debouncedSave(next);
    scheduleRamExpiry();
  },

  remove: (id) => {
    const next = get().entries.filter((e) => e.id !== id);
    set({ entries: next });
    debouncedSave(next);
  },

  clear: () => {
    set({ entries: [] });
    debouncedSave([]);
  },
  }) as HistoryState;
});
