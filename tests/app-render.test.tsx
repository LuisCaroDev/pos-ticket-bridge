import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const bridge = {
  platform: "win32",
  status: vi.fn(),
  settings: vi.fn(),
  createPrinter: vi.fn(),
  updatePrinter: vi.fn(),
  deletePrinter: vi.fn(),
  duplicatePrinter: vi.fn(),
  discover: vi.fn(),
  printerProfiles: vi.fn(),
  compatibilityReport: vi.fn(),
  request: vi.fn(),
  testPrinter: vi.fn(),
  copy: vi.fn(),
};

Object.defineProperty(window, "bridge", { value: bridge, configurable: true });

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.status.mockResolvedValue({
      version: "1.0.2",
      port: 9977,
      allowedOrigins: [],
      language: "es",
      activeLanguage: "es",
      printers: [],
      diagnostics: [],
      suggestedHosts: [],
    });
  });

  it("mounts with the Electron bridge available", async () => {
    const { App } = await import("../src/App");
    const view = render(<App />);

    await waitFor(() => expect(bridge.status).toHaveBeenCalled());
    expect(view.container.querySelector("main")).not.toBeNull();
  });
});
