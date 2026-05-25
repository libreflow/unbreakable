import { invoke } from "@tauri-apps/api/core";
import type { PasswordOptions, PassphraseOptions } from "../types";

export const generatePassword = (opts?: Partial<PasswordOptions>) =>
  invoke<string>("cmd_generate_password", { opts });

export const generatePassphrase = (opts?: Partial<PassphraseOptions>) =>
  invoke<string>("cmd_generate_passphrase", { opts });

export const generatePair = (
  pwdOpts?: Partial<PasswordOptions>,
  phraseOpts?: Partial<PassphraseOptions>,
) => invoke<[string, string]>("cmd_generate_pair", { pwdOpts, phraseOpts });

export const copyToClipboard = (text: string) =>
  invoke<void>("cmd_copy_to_clipboard", { text });

export const clearClipboard = () => invoke<void>("cmd_clear_clipboard");
export const readClipboard = () => invoke<string>("cmd_read_clipboard");
export const clearIfOurs = () => invoke<boolean>("cmd_clear_if_ours");
