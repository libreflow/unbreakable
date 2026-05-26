import { invoke } from "@tauri-apps/api/core";

export type HistoryEntry = {
  id: string;
  kind: "password" | "passphrase";
  value: string;
  label?: string | null;
  score: number;
  created_at: string;
};

export type VaultStatus = {
  master_pw_enabled: boolean;
  keyring_ok: boolean;
  entry_count: number;
  vault_exists: boolean;
};

export const vault = {
  status: () => invoke<VaultStatus>("vault_status"),
  unlock: (master_pw: string | null) => invoke<void>("vault_unlock", { masterPw: master_pw }),
  load: () => invoke<HistoryEntry[]>("vault_load"),
  save: (entries: HistoryEntry[]) => invoke<void>("vault_save", { entries }),
  setMasterPassword: (newPw: string | null) => invoke<void>("vault_set_master_password", { newPw }),
  clear: () => invoke<void>("vault_clear"),
};
