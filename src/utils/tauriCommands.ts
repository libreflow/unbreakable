import { invoke } from "@tauri-apps/api/core";
import type { PasswordOptions, PassphraseOptions, PassphraseLang } from "../types";

export type { PassphraseLang };

export type PassphraseParams = {
  lang: PassphraseLang;
  wordCount: number;
  separator: string;
  includeDigit: boolean;
  includeSymbol: boolean;
};

export const generatePassword = (opts?: Partial<PasswordOptions>) =>
  invoke<string>("cmd_generate_password", { opts });

export const generateMemorable = () =>
  invoke<string>("cmd_generate_memorable");

export const generatePassphrase = (params: PassphraseParams) =>
  invoke<string>("cmd_generate_passphrase", params);

/** Convenience wrapper: merges PassphraseOptions (from generatorStore) with a lang (from settingsStore). */
export const generatePassphraseFromOpts = (opts: PassphraseOptions, lang: PassphraseLang) =>
  generatePassphrase({
    lang,
    wordCount: opts.words,
    separator: opts.separator,
    includeDigit: opts.include_digit,
    includeSymbol: opts.include_symbol,
  });

export const generatePair = (
  pwdOpts: Partial<PasswordOptions> | undefined,
  passphrase: PassphraseParams,
) => invoke<[string, string]>("cmd_generate_pair", { pwdOpts, ...passphrase });

/** Convenience wrapper for generatePair using PassphraseOptions + lang. */
export const generatePairFromOpts = (
  pwdOpts: Partial<PasswordOptions> | undefined,
  phraseOpts: PassphraseOptions,
  lang: PassphraseLang,
) =>
  generatePair(pwdOpts, {
    lang,
    wordCount: phraseOpts.words,
    separator: phraseOpts.separator,
    includeDigit: phraseOpts.include_digit,
    includeSymbol: phraseOpts.include_symbol,
  });

export const copyToClipboard = (text: string) =>
  invoke<void>("cmd_copy_to_clipboard", { text });

export const clearClipboard = () => invoke<void>("cmd_clear_clipboard");
export const readClipboard = () => invoke<string>("cmd_read_clipboard");
export const clearIfOurs = () => invoke<boolean>("cmd_clear_if_ours");
