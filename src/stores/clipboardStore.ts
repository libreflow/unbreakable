import { create } from "zustand";
import { ClipboardStatus, CopiedPanel } from "../types";

interface ClipboardState {
  status: ClipboardStatus;
  panel: CopiedPanel | null;
  expiresAt: number | null;
  setCopied: (panel: CopiedPanel, ttlSeconds: number) => void;
  setStatus: (s: ClipboardStatus) => void;
  reset: () => void;
}

export const useClipboard = create<ClipboardState>((set) => ({
  status: "idle",
  panel: null,
  expiresAt: null,
  setCopied: (panel, ttlSeconds) =>
    set({
      status: "copied",
      panel,
      expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
    }),
  setStatus: (s) => set({ status: s }),
  reset: () => set({ status: "idle", panel: null, expiresAt: null }),
}));
