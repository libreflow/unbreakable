import { describe, it, expect } from "vitest";
import { isSecretCopiedPayload, isSettingsChangedPayload } from "../src/utils/crossWindowEvents";

describe("crossWindowEvents type guards", () => {
  it("validates secret-copied payload", () => {
    expect(isSecretCopiedPayload({ kind: "password", ttl: 60 })).toBe(true);
    expect(isSecretCopiedPayload({ kind: "passphrase", ttl: 0 })).toBe(true);
    expect(isSecretCopiedPayload({ kind: "other", ttl: 60 })).toBe(false);
    expect(isSecretCopiedPayload(null)).toBe(false);
  });

  it("validates settings-changed payload", () => {
    expect(isSettingsChangedPayload({ key: "ttl_seconds", value: 60 })).toBe(true);
    expect(isSettingsChangedPayload({ key: 123, value: 1 })).toBe(false);
  });
});
