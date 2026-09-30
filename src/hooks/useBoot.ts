import { useEffect, useState } from "react";
import { vault } from "../utils/vault";
import { useHistory } from "../stores/historyStore";
import { reportError } from "../utils/reportError";
import { detectLegacyCount } from "../components/Modals/MigrationModal";

export type BootState =
  | { phase: "loading" }
  | { phase: "unlock" }
  | { phase: "migrate"; count: number }
  | { phase: "ready" }
  | { phase: "error"; message: string };

/**
 * Boot state machine extracted from App(): vault status check, unlock-less
 * hydration, legacy-migration detection. Callers render the phase UI.
 */
export function useBoot() {
  const [boot, setBoot] = useState<BootState>({ phase: "loading" });

  useEffect(() => {
    (async () => {
      try {
        const status = await vault.status();
        if (status.master_pw_enabled) {
          setBoot({ phase: "unlock" });
        } else {
          await vault.unlock(null);
          await useHistory.getState().hydrate();
          const legacy = detectLegacyCount();
          setBoot(legacy > 0 ? { phase: "migrate", count: legacy } : { phase: "ready" });
        }
      } catch (err) {
        reportError("boot", err);
        // L3: surface the failure instead of fail-open - a silent "ready"
        // app would silently drop every history save for the session.
        setBoot({ phase: "error", message: String(err) });
      }
    })();
  }, []);

  const onUnlocked = async () => {
    await useHistory.getState().hydrate();
    const legacy = detectLegacyCount();
    setBoot(legacy > 0 ? { phase: "migrate", count: legacy } : { phase: "ready" });
  };

  const onMigrationDone = async () => {
    await useHistory.getState().hydrate();
    setBoot({ phase: "ready" });
  };

  const onVaultWiped = async (pw: string) => {
    try {
      await vault.clear(pw || null);
      await vault.unlock(null);
      await useHistory.getState().hydrate();
    } catch (e) {
      reportError("vault.clear", e);
    }
    setBoot({ phase: "ready" });
  };

  return { boot, onUnlocked, onMigrationDone, onVaultWiped };
}
