import { create } from "zustand";
import {
  DEFAULT_PASSPHRASE_OPTS,
  DEFAULT_PASSWORD_OPTS,
  PassphraseOptions,
  PasswordOptions,
} from "../types";

interface GeneratorState {
  password: string;
  passphrase: string;
  pwdOpts: PasswordOptions;
  phraseOpts: PassphraseOptions;
  setPassword: (p: string) => void;
  setPassphrase: (p: string) => void;
  setPwdOpts: (opts: Partial<PasswordOptions>) => void;
  setPhraseOpts: (opts: Partial<PassphraseOptions>) => void;
}

export const useGenerator = create<GeneratorState>((set) => ({
  password: "",
  passphrase: "",
  pwdOpts: DEFAULT_PASSWORD_OPTS,
  phraseOpts: DEFAULT_PASSPHRASE_OPTS,
  setPassword: (p) => set({ password: p }),
  setPassphrase: (p) => set({ passphrase: p }),
  setPwdOpts: (opts) => set((s) => ({ pwdOpts: { ...s.pwdOpts, ...opts } })),
  setPhraseOpts: (opts) => set((s) => ({ phraseOpts: { ...s.phraseOpts, ...opts } })),
}));
