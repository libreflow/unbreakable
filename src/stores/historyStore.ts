import { create } from "zustand";
import { vault, HistoryEntry } from "../utils/vault";
import { CopiedPanel } from "../types";
import { useSettings } from "./settingsStore";
const RAM_EXPIRY_MS = 5 * 60 * 1000;

let ramTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleRamExpiry = () => {
  if (ramTimer) clearTimeout(ramTimer);
  ramTimer = setTimeout(() => {
    ramTimer = null;
    const s = useHistory.getState();
    // Purge decrypted secrets from RAM only — never persist the purge:
    // the encrypted vault on disk must survive an idle timeout.
    if (s.entries.length > 0) s.purgeFromRam();
  }, RAM_EXPIRY_MS);
};

interface HistoryState {
  entries: HistoryEntry[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  add: (kind: CopiedPanel, plain: string, score: number, label?: string) => void;
  remove: (id: string) => void;
  rename: (id: string, label: string) => void;
  clear: () => void;
  purgeFromRam: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
// B6: honor the user-configured history_max setting (fallback 200).
const maxEntries = () => useSettings.getState().history_max || 200;

const debouncedSave = (entries: HistoryEntry[]) => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    vault.save(entries).catch((err) => console.error("vault_save failed:", err));
    saveTimer = null;
  }, 500);
};

export const useHistory = create<HistoryState>((set, get) => {
  scheduleRamExpiry();
  return {
    entries: [],
    hydrated: false,

    hydrate: async () => {
      try {
        const loaded = await vault.load();
        set({ entries: loaded.slice(0, maxEntries()), hydrated: true });
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
      const next = [entry, ...get().entries].slice(0, maxEntries());
      set({ entries: next });
      debouncedSave(next);
      scheduleRamExpiry();
    },

    remove: (id) => {
      const next = get().entries.filter((e) => e.id !== id);
      set({ entries: next });
      debouncedSave(next);
    },
    rename: (id, label) => {
      const next = get().entries.map((e) =>
        e.id === id ? { ...e, label: label.trim() || null } : e,
      );
      set({ entries: next });
      debouncedSave(next);
    },

    clear: () => {
      set({ entries: [] });
      debouncedSave([]);
    },
    // RAM-only purge (security idle timeout): drop plaintext from memory
    // without touching the encrypted vault on disk.
    purgeFromRam: () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      set({ entries: [] });
    },
  } as HistoryState;
});
