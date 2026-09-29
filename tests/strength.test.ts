import { describe, it, expect } from "vitest";
import { analyzeStrength } from "../src/utils/strength";

describe("analyzeStrength", () => {
  it("returns score 0 and no bits for empty secret", () => {
    const r = analyzeStrength("");
    expect(r.score).toBe(0);
    expect(r.bits).toBe(0);
    expect(r.label).toBe("Inacceptable");
    expect(r.cssClass).toBe("score-0");
  });

  it("scores a weak password low", () => {
    const r = analyzeStrength("password");
    expect(r.score).toBeLessThanOrEqual(1);
  });

  it("scores a strong passphrase high with meaningful entropy", () => {
    const r = analyzeStrength("correct-horse-battery-staple-plunger");
    expect(r.score).toBeGreaterThanOrEqual(3);
    expect(r.bits).toBeGreaterThan(50);
  });

  it("maps score to consistent label and cssClass", () => {
    for (const secret of ["", "password", "correct-horse-battery-staple-plunger"]) {
      const r = analyzeStrength(secret);
      expect(r.label).toBeTruthy();
      expect(r.cssClass).toBe(`score-${r.score}`);
    }
  });
});
