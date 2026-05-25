import { create } from "zustand";
import { emit } from "@tauri-apps/api/event";
import { ClipboardStatus, CopiedPanel } from "../types";
import { setTrayActive } from "../utils/residentCommands";

interface ClipboardState {
  status: ClipboardStatus;
  panel: CopiedPanel | null;
  expiresAt: number | null;
  setCopied: (panel: CopiedPanel, ttlSeconds: number) => void;
  setStatus: (s: ClipboardStatus) => void;
  reset: () => void;
}

function _syncTrayActive(active: boolean): void {
  setTrayActive(active).catch(() => {
    // tray may be disabled or Tauri unavailable in tests — silent
  });
}

export const useClipboard = create<ClipboardState>((set) => ({
  status: "idle",
  panel: null,
  expiresAt: null,
  setCopied: (panel, ttlSeconds) => {
    set({
      status: "copied",
      panel,
      expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
    });
    _syncTrayActive(true);
  },
  setStatus: (s) => {
    set({ status: s });
    if (s === "expired") {
      _syncTrayActive(false);
      emit("clipboard-cleared", {}).catch(() => {});
    } else if (s === "modified") {
      _syncTrayActive(false);
    }
  },
  reset: () => {
    set({ status: "idle", panel: null, expiresAt: null });
    _syncTrayActive(false);
  },
}));
