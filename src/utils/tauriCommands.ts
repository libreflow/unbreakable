import { invoke } from "@tauri-apps/api/core";
import type { PasswordOptions, PassphraseOptions, PassphraseLang } from "../types";

export type { PassphraseLang };

export type PassphraseParams = {
  lang: PassphraseLang;
  word_count: number;
  separator: string;
  include_digit: boolean;
  include_symbol: boolean;
};

export const generatePassword = (opts?: Partial<PasswordOptions>) =>
  invoke<string>("cmd_generate_password", { opts });

export const generatePassphrase = (params: PassphraseParams) =>
  invoke<string>("cmd_generate_passphrase", params);

/** Convenience wrapper: merges PassphraseOptions (from generatorStore) with a lang (from settingsStore). */
export const generatePassphraseFromOpts = (opts: PassphraseOptions, lang: PassphraseLang) =>
  generatePassphrase({
    lang,
    word_count: opts.words,
    separator: opts.separator,
    include_digit: opts.include_digit,
    include_symbol: opts.include_symbol,
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
    word_count: phraseOpts.words,
    separator: phraseOpts.separator,
    include_digit: phraseOpts.include_digit,
    include_symbol: phraseOpts.include_symbol,
  });

export const copyToClipboard = (text: string) =>
  invoke<void>("cmd_copy_to_clipboard", { text });

export const clearClipboard = () => invoke<void>("cmd_clear_clipboard");
export const readClipboard = () => invoke<string>("cmd_read_clipboard");
export const clearIfOurs = () => invoke<boolean>("cmd_clear_if_ours");
