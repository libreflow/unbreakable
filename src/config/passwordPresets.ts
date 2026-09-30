import type { PasswordOptions } from "../types";

export interface PasswordPreset {
  label: string;
  opts: PasswordOptions;
}

/** Named password presets surfaced in Settings > Mot de passe. */
export const PASSWORD_PRESETS: PasswordPreset[] = [
  {
    label: "AD (16 chars · complexité GPO)",
    opts: {
      length: 16,
      uppercase: true,
      lowercase: true,
      digits: true,
      symbols: true,
      exclude_ambiguous: true,
      min_per_group: 1,
      exclude_chars: "",
    },
  },
];
