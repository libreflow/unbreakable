import { describe, it, expect, vi, beforeEach } from "vitest";
import { vault, HistoryEntry } from "../src/utils/vault";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const entry = (id: string): HistoryEntry => ({
  id,
  kind: "password",
  value: "x",
  label: null,
  score: 4,
  created_at: "2026-01-01T00:00:00Z",
});

describe("vault IPC wrapper", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("status() invokes vault_status", async () => {
    vi.mocked(invoke).mockResolvedValue({
      master_pw_enabled: false,
      keyring_ok: true,
      entry_count: 0,
      vault_exists: false,
    });
    const s = await vault.status();
    expect(invoke).toHaveBeenCalledWith("vault_status");
    expect(s.keyring_ok).toBe(true);
  });

  it("save() passes entries under the entries key", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await vault.save([entry("a")]);
    expect(invoke).toHaveBeenCalledWith("vault_save", { entries: [entry("a")] });
  });

  it("setMasterPassword() invokes vault_set_master_password with newPw", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await vault.setMasterPassword("pw");
    expect(invoke).toHaveBeenCalledWith("vault_set_master_password", { newPw: "pw" });
  });

  it("clear() invokes vault_clear with masterPw", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await vault.clear("secret-pw");
    expect(invoke).toHaveBeenCalledWith("vault_clear", { masterPw: "secret-pw" });
    await vault.clear(null);
    expect(invoke).toHaveBeenCalledWith("vault_clear", { masterPw: null });
  });
});
