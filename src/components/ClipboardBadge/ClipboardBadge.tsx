import { useEffect, useState } from "react";
import { useClipboard } from "../../stores/clipboardStore";
import { useSettings } from "../../stores/settingsStore";

const RADIUS = 36;
const CIRC = 2 * Math.PI * RADIUS;

export function ClipboardBadge() {
  const status = useClipboard((s) => s.status);
  const expiresAt = useClipboard((s) => s.expiresAt);
  const panel = useClipboard((s) => s.panel);
  const ttl = useSettings((s) => s.ttl_seconds);
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    if (status !== "copied" || !expiresAt) {
      setRemaining(0);
      return;
    }
    // P2: keep the raw fractional value for the arc, but only store the
    // displayed second in state — the component re-renders once per second
    // instead of five times per second while the TTL countdown is active.
    const tick = () =>
      setRemaining((prev) => {
        const seconds = Math.ceil(Math.max(0, (expiresAt - Date.now()) / 1000));
        return seconds === prev ? prev : seconds;
      });
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [status, expiresAt]);

  if (status === "idle") {
    return (
      <div className="hero-cell" role="status" aria-live="polite">
        <div className="status-block">
          <div className="status-eyebrow">État · presse-papiers</div>
          <div className="status-headline">en attente du premier secret…</div>
        </div>
      </div>
    );
  }

  const panelLabel = panel === "password" ? "mot de passe" : "passphrase";

  if (status === "copied") {
    const seconds = remaining;
    const fraction = ttl > 0 ? Math.max(0, Math.min(1, seconds / ttl)) : 1;
    const offset = CIRC * (1 - fraction);
    return (
      <div
        className="hero-cell"
        role="status"
        aria-live="polite"
        aria-label={`${panelLabel} copié, ${seconds} secondes restantes`}
      >
        {ttl > 0 ? (
          <div className="ttl-clock">
            <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true" focusable="false">
              <circle cx="42" cy="42" r={RADIUS} fill="none" strokeWidth="4" className="ttl-track" />
              <circle
                cx="42"
                cy="42"
                r={RADIUS}
                fill="none"
                strokeWidth="4"
                strokeDasharray={CIRC}
                strokeDashoffset={offset}
                className="ttl-progress"
              />
            </svg>
            <span className="ttl-label">{seconds}</span>
            <span className="ttl-unit">sec</span>
          </div>
        ) : (
          <span className="stamp">COPIÉ</span>
        )}
        <div className="status-block">
          <div className="status-eyebrow">Copié · {panelLabel}</div>
          <div className="status-headline" data-status="copied">
            prêt à coller, sans détour.
          </div>
        </div>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className="hero-cell" role="status" aria-live="polite">
        <span className="stamp" data-variant="expired">EXPIRÉ</span>
        <div className="status-block">
          <div className="status-eyebrow">Presse-papiers · effacé</div>
          <div className="status-headline" data-status="expired">
            le secret est repassé sous silence.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hero-cell" role="status" aria-live="polite">
      <span className="stamp" data-variant="modified">COLLÉ</span>
      <div className="status-block">
        <div className="status-eyebrow">Presse-papiers · libre</div>
        <div className="status-headline" data-status="modified">
          l'utilisateur a repris la main.
        </div>
      </div>
    </div>
  );
}
