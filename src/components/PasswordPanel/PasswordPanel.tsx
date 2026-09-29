import { useGenerator } from "../../stores/generatorStore";
import { useSettings } from "../../stores/settingsStore";
import { SecretPanel, usePanelRegenerate } from "../Panels/SecretPanel";
import { reportError } from "../../utils/reportError";
import { useEffect } from "react";

export function PasswordPanel() {
  const memorable = useSettings((s) => s.memorable_default);
  const setSettings = useSettings((s) => s.set);
  const secret = useGenerator((s) => s.password);
  const { regenerate, err } = usePanelRegenerate("password");
  const meta = memorable ? "mémorable FR · 14-20" : `${secret.length} chars · site-compat`;

  // Boot + mode persistence: regenerate through the shared pipeline
  // whenever the mode (re)starts, so the panel never shows a secret of
  // the wrong mode after a restart (memorable_default is persisted).
  useEffect(() => {
    regenerate().catch((e) => reportError("panel boot regenerate", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memorable]);

  const toggleMemorable = () => {
    const next = !memorable;
    // Persist the choice; the effect above triggers the regeneration.
    setSettings({ memorable_default: next });
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
            <span>Mot de passe mémorable (mots français) · Ctrl+M</span>
          </label>
        </div>
      }
    />
  );
}
