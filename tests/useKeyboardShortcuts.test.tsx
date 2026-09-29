import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useKeyboardShortcuts } from "../src/hooks/useKeyboardShortcuts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

function mountHook(useHook: () => void): Root {
  const div = document.createElement("div");
  document.body.appendChild(div);
  const root = createRoot(div);
  let handlers: (() => void)[] = [];
  function Probe() {
    const cleanup = useHook() as unknown as () => void | undefined;
    handlers.push(() => cleanup?.());
    return null;
  }
  act(() => root.render(<Probe />));
  return {
    unmount: () => act(() => root.unmount()),
    // expose for future use
    _handlers: handlers,
  } as Root & { _handlers: (() => void)[] };
}

function press(key: string, opts?: KeyboardEventInit) {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, ...opts }),
  );
}

type Handlers = {
  regenerate: () => void;
  copyPassword: () => void;
  copyPassphrase: () => void;
  toggleHistory: () => void;
  toggleSettings: () => void;
};

function makeHandlers(): Handlers {
  return {
    regenerate: vi.fn(),
    copyPassword: vi.fn(),
    copyPassphrase: vi.fn(),
    toggleHistory: vi.fn(),
    toggleSettings: vi.fn(),
  };
}

describe("useKeyboardShortcuts", () => {
  let root: ReturnType<typeof mountHook> | null = null;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    root?.unmount();
    root = null;
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("triggers regenerate on Ctrl+R and bare Space", () => {
    const h = makeHandlers();
    root = mountHook(() => useKeyboardShortcuts(h));
    act(() => press("r", { ctrlKey: true }));
    act(() => press(" "));
    expect(h.regenerate).toHaveBeenCalledTimes(2);
    expect(h.copyPassword).not.toHaveBeenCalled();
  });

  it("triggers copyPassphrase on Ctrl+Shift+C, copyPassword on Ctrl+C", () => {
    const h = makeHandlers();
    root = mountHook(() => useKeyboardShortcuts(h));
    act(() => press("c", { ctrlKey: true, shiftKey: true }));
    act(() => press("c", { ctrlKey: true }));
    expect(h.copyPassphrase).toHaveBeenCalledTimes(1);
    expect(h.copyPassword).toHaveBeenCalledTimes(1);
  });

  it("triggers toggleSettings on Ctrl+, and toggleHistory on Ctrl+H", () => {
    const h = makeHandlers();
    root = mountHook(() => useKeyboardShortcuts(h));
    act(() => press(",", { ctrlKey: true }));
    act(() => press("h", { ctrlKey: true }));
    expect(h.toggleSettings).toHaveBeenCalledTimes(1);
    expect(h.toggleHistory).toHaveBeenCalledTimes(1);
  });

  it("stops handling keys after unmount", () => {
    const h = makeHandlers();
    root = mountHook(() => useKeyboardShortcuts(h));
    root.unmount();
    root = null;
    act(() => press(" "));
    expect(h.regenerate).not.toHaveBeenCalled();
  });
});
