import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: "main" }) }));
vi.mock("../src/utils/windowProtection", () => ({ setWindowProtected: vi.fn(async () => {}) }));
vi.mock("../src/utils/residentCommands", () => ({
  notifyClipboardCleared: vi.fn(),
  enableTray: vi.fn(),
  enableAutostart: vi.fn(),
  registerShortcut: vi.fn(),
  notifyGenerationFailed: vi.fn(),
}));

import App from "../src/App";

window.matchMedia =
  window.matchMedia ||
  ((q: string) =>
    ({
      matches: false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList);

const entries = [
  {
    id: "1",
    kind: "password" as const,
    value: "secret123",
    label: "test",
    score: 4,
    created_at: "2026-01-01T10:00:00Z",
  },
];

describe("History flyout", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "vault_status")
        return { master_pw_enabled: false, keyring_ok: true, entry_count: 1, vault_exists: true };
      if (cmd === "vault_load") return entries;
      if (cmd === "cmd_generate_password") return "x";
      if (cmd === "cmd_generate_passphrase") return "y";
      if (cmd === "cmd_generate_pair") return ["x", "y"];
      if (cmd === "cmd_generate_memorable") return "mot";
      return null;
    });
  });

  it("opens the History flyout when clicking Hist, in push mode", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Historique/ })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /Historique/ }));
    const dialog = await screen.findByRole("dialog", { name: "Historique" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/Historique \(1\)/)).toBeInTheDocument();
    expect(document.querySelector(".flyout-backdrop")).toBeNull();
    expect(document.querySelector(".app")!.className).toContain("app-pushed");
  });

  it("closes via Escape and removes push mode", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Historique/ })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /Historique/ }));
    await screen.findByRole("dialog", { name: "Historique" });
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Historique" })).not.toBeInTheDocument(),
    );
    expect(document.querySelector(".app")!.className).not.toContain("app-pushed");
  });
});
