import { UnlockModal } from "../Modals/UnlockModal";
import { MigrationModal } from "../Modals/MigrationModal";
import type { BootState } from "../../hooks/useBoot";

/**
 * Renders the non-ready boot phases: loading, unlock, migration, error.
 * Returns null once the app is ready so App() can render the main shell.
 */
export function BootScreen({
  boot,
  onUnlocked,
  onMigrationDone,
  onVaultWiped,
}: {
  boot: BootState;
  onUnlocked: () => Promise<void>;
  onMigrationDone: () => Promise<void>;
  onVaultWiped: (pw: string) => Promise<void>;
}) {
  if (boot.phase === "loading") {
    return <div className="boot-loading">Chargement…</div>;
  }

  if (boot.phase === "unlock") {
    return <UnlockModal onUnlocked={onUnlocked} onForgotten={onVaultWiped} />;
  }

  if (boot.phase === "error") {
    return (
      <div className="modal-overlay">
        <div className="modal" role="alertdialog" aria-label="Erreur au démarrage">
          <h2>Erreur au démarrage</h2>
          <p>
            Le coffre n'a pas pu être ouvert. L'application ne peut pas garantir la sauvegarde de
            l'historique.
          </p>
          <div className="error">{boot.message}</div>
          <button onClick={() => window.location.reload()}>Réessayer</button>
        </div>
      </div>
    );
  }

  if (boot.phase === "migrate") {
    return <MigrationModal count={boot.count} onDone={onMigrationDone} />;
  }

  return null;
}
