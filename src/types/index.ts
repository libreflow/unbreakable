export interface PasswordOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  digits: boolean;
  symbols: boolean;
  exclude_ambiguous: boolean;
  min_per_group: number;
  exclude_chars: string;
}

export type Capitalization = "off" | "first" | "all";

export interface PassphraseOptions {
  words: number;
  separator: string;
  capitalization: Capitalization;
  append_digits: boolean;
  append_symbol: boolean;
}

export type CopiedPanel = "password" | "passphrase";
export type ClipboardStatus = "copied" | "expired" | "modified" | "idle";

export interface HistoryEntry {
  id: string;
  kind: CopiedPanel;
  value: string;
  label?: string;
  score: number;
  created_at: number;
}

export interface AppSettings {
  default_copy: CopiedPanel;
  ttl_seconds: number;
  theme: "auto" | "light" | "dark";
  auto_copy_on_open: boolean;
  history_max: number;
}

export const DEFAULT_PASSWORD_OPTS: PasswordOptions = {
  length: 24,
  uppercase: true,
  lowercase: true,
  digits: true,
  symbols: true,
  exclude_ambiguous: true,
  min_per_group: 2,
  exclude_chars: "",
};

export const DEFAULT_PASSPHRASE_OPTS: PassphraseOptions = {
  words: 5,
  separator: "-",
  capitalization: "first",
  append_digits: true,
  append_symbol: false,
};

export const DEFAULT_SETTINGS: AppSettings = {
  default_copy: "password",
  ttl_seconds: 60,
  theme: "auto",
  auto_copy_on_open: true,
  history_max: 200,
};
