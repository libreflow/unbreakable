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

export type PassphraseLang = "fr" | "en" | "de" | "es" | "it";

export interface PassphraseOptions {
  words: number; // 5-12
  separator: string; // single char
  include_digit: boolean;
  include_symbol: boolean;
}

export type CopiedPanel = "password" | "passphrase";
export type ClipboardStatus = "copied" | "expired" | "modified" | "idle";

export interface AppSettings {
  default_copy: CopiedPanel;
  ttl_seconds: number;
  theme: "auto" | "light" | "dark";
  auto_copy_on_open: boolean;
  history_max: number;
  tray_enabled: boolean;
  autostart_enabled: boolean;
  shortcut_enabled: boolean;
  shortcut_combo: string;
  notifications_enabled: boolean;
  passphrase_lang: PassphraseLang;
  screenshot_protection: boolean;
  memorable_default: boolean;
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
  include_digit: true,
  include_symbol: false,
};

export const DEFAULT_SETTINGS: AppSettings = {
  default_copy: "password",
  ttl_seconds: 60,
  theme: "auto",
  auto_copy_on_open: true,
  history_max: 200,
  tray_enabled: false,
  autostart_enabled: false,
  shortcut_enabled: false,
  shortcut_combo: "CommandOrControl+Alt+P",
  notifications_enabled: false,
  passphrase_lang: "en",
  screenshot_protection: true,
  memorable_default: false,
};
