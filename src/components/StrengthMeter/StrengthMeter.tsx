import { useMemo } from "react";
import { analyzeStrength } from "../../utils/strength";

export function StrengthMeter({ secret }: { secret: string }) {
  const r = useMemo(() => analyzeStrength(secret), [secret]);
  return (
    <div className="strength" aria-label={`Force : ${r.label}, ${Math.round(r.bits)} bits`}>
      <div className="strength-segments" role="meter" aria-label="Force du secret" aria-valuemin={0} aria-valuemax={4} aria-valuenow={r.score} aria-valuetext={`${r.label}, ${Math.round(r.bits)} bits`}>
        <div className="seg" />
        <div className="seg" />
        <div className="seg" />
        <div className="seg" />
      </div>
      <div className="strength-meta">
        <span><span className="label">{r.label}</span> · {Math.round(r.bits)} bits</span>
        {r.score === 4 && <span className="unbreakable-stamp">Unbreakable ✓</span>}
      </div>
    </div>
  );
}
