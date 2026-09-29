import { useMemo } from "react";
import { useGenerator } from "../../stores/generatorStore";
import { SecretPanel, usePanelRegenerate } from "../Panels/SecretPanel";
import { useEffect } from "react";
import { setWindowProtected } from "../../utils/windowProtection";

const TAIL_RE = /^([\s\S]*?)([!@#$%&*?+=])?$/;

export function PassphrasePanel() {
  const phraseOpts = useGenerator((s) => s.phraseOpts);
  const passphrase = useGenerator((s) => s.passphrase);
  const { regenerate, err } = usePanelRegenerate("passphrase");

  useEffect(() => {
    setWindowProtected("main", true).catch(() => {});
    return () => {
      setWindowProtected("main", false).catch(() => {});
    };
  }, []);

  const sep = phraseOpts.separator;
  const { words, tail } = useMemo(() => {
    if (!passphrase) return { words: [] as string[], tail: "" };
    const m = passphrase.match(TAIL_RE);
    const body = m?.[1] ?? passphrase;
    const tail = m?.[2] ?? "";
    return { words: body.split(sep).filter(Boolean), tail };
  }, [passphrase, sep]);

  return (
    <SecretPanel
      kind="passphrase"
      meta={`${words.length} mots${tail ? ` · suff. ${tail}` : ""}`}
      regenerate={regenerate}
      err={err}
    >
      <>
        {words.map((w, i) => (
          <span key={`${i}-${w}`} className="word">
            {w}
            {i < words.length - 1 && <span className="word-sep">{sep}</span>}
          </span>
        ))}
        {tail && <span className="word-tail">{tail}</span>}
      </>
    </SecretPanel>
  );
}
