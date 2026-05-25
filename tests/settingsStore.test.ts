import { describe, it, expect, beforeEach } from "vitest";
import { useSettings } from "../src/stores/settingsStore";

describe("settingsStore — resident mode defaults", () => {
  beforeEach(() => localStorage.clear());

  it("defaults all resident-mode toggles to false", () => {
    const s = useSettings.getState();
    expect(s.tray_enabled).toBe(false);
    expect(s.autostart_enabled).toBe(false);
    expect(s.shortcut_enabled).toBe(false);
    expect(s.notifications_enabled).toBe(false);
  });

  it("defaults shortcut_combo to CommandOrControl+Alt+P", () => {
    expect(useSettings.getState().shortcut_combo).toBe("CommandOrControl+Alt+P");
  });

  it("set() merges resident-mode fields", () => {
    useSettings.getState().set({ tray_enabled: true });
    expect(useSettings.getState().tray_enabled).toBe(true);
    expect(useSettings.getState().autostart_enabled).toBe(false);
  });
});
