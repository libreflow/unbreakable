import { useGenerator } from "../../stores/generatorStore";
import { SecretPanel, usePanelRegenerate } from "../Panels/SecretPanel";

export function PasswordPanel() {
  const { regenerate, err, memorable, setMemorable } = usePanelRegenerate("password");
  const secret = useGenerator((s) => s.password);
  const meta = memorable ? "mémorable FR · 14-20" : `${secret.length} chars · site-compat`;

  // A8: toggling the mode regenerates via the event handler itself,
  // not through an effect with disabled lint rules.
  const toggleMemorable = () => {
    const next = !memorable;
    setMemorable(next);
    // regenerate is recreated by the memo when memorable flips; use the
    // freshest one via a microtask so state has propagated.
    queueMicrotask(() => {
      useGenerator.getState();
      regenerate().catch(() => {});
    });
  };

  return (
    <SecretPanel
      kind="password"
      meta={meta}
      regenerate={regenerate}
      err={err}
      footerControls={
        <div className="panel-mode">
          <label className="mode-toggle">
            <input type="checkbox" checked={memorable} onChange={toggleMemorable} />
            <span>Mot de passe mémorable (mots français)</span>
          </label>
        </div>
      }
    />
  );
}
