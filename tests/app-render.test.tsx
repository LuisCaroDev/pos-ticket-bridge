import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

class ResizeObserverMock {
  observe() {
    return undefined;
  }
  unobserve() {
    return undefined;
  }
  disconnect() {
    return undefined;
  }
}

Object.defineProperty(window, "ResizeObserver", {
  value: ResizeObserverMock,
  configurable: true,
});

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
  discardDraftDiagnostics: vi.fn(),
  copy: vi.fn(),
};

Object.defineProperty(window, "bridge", { value: bridge, configurable: true });

const status = (printers = []) => ({
  version: "1.0.2",
  port: 9977,
  allowedOrigins: [],
  language: "es",
  activeLanguage: "es",
  printers,
  diagnostics: [],
  suggestedHosts: [],
});

describe("App", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    bridge.status.mockResolvedValue(status());
    bridge.printerProfiles.mockResolvedValue({ profiles: [] });
    bridge.createPrinter.mockResolvedValue({});
    bridge.updatePrinter.mockResolvedValue({});
    bridge.testPrinter.mockResolvedValue({
      ok: true,
      diagnostic: { ok: true },
    });
  });

  it("mounts with the Electron bridge available", async () => {
    const { App } = await import("../src/App");
    const view = render(<App />);

    await waitFor(() => expect(bridge.status).toHaveBeenCalled());
    expect(view.container.querySelector("main")).not.toBeNull();
  });

  it("opens a detected result as a draft in the printer drawer", async () => {
    bridge.discover.mockResolvedValue({
      items: [
        {
          id: "",
          nombre: "POS USB",
          tipo: "usb",
          anchoMm: 80,
          printProfile: {
            language: "es",
            mode: "auto",
            profileId: "unlisted-safe",
          },
          abreCajon: false,
          enabled: true,
          connection: { systemPrinter: "POS USB", port: "USB001" },
        },
      ],
      notes: [],
    });
    const { App } = await import("../src/App");
    render(<App />);

    await waitFor(() => expect(bridge.status).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Detectar USB" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Usar este resultado" }),
    );

    expect(screen.getByText("Agregar impresora")).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getAllByDisplayValue("POS USB")).toHaveLength(2);
    expect(document.querySelector('[data-slot="sheet-overlay"]')).toBeNull();
    expect(
      document.querySelector('[data-slot="resizable-handle"]'),
    ).not.toBeNull();
    expect(bridge.createPrinter).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Probar sin guardar" }));
    await waitFor(() => expect(bridge.testPrinter).toHaveBeenCalled());
    expect(bridge.testPrinter).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "POS USB", tipo: "usb" }),
      expect.objectContaining({
        draftSessionId: expect.any(String),
        operation: "test-draft",
      }),
    );
  });

  it("confirms before discarding edited drawer values", async () => {
    const { App } = await import("../src/App");
    render(<App />);

    await waitFor(() => expect(bridge.status).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    const editor = document.querySelector('[data-slot="printer-editor-panel"]');
    if (!editor) throw new Error("Printer editor did not open");
    fireEvent.change(within(editor).getAllByRole("textbox")[0], {
      target: { value: "Caja principal" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.getByText("Descartar cambios sin guardar")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(screen.getByText("Agregar impresora")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    await waitFor(() =>
      expect(bridge.discardDraftDiagnostics).toHaveBeenCalledWith(
        expect.any(String),
      ),
    );
  });

  it("updates an existing printer instead of creating another one", async () => {
    bridge.status.mockResolvedValue(
      status([
        {
          id: "caja-1",
          nombre: "Caja 1",
          tipo: "network",
          anchoMm: 80,
          printProfile: {
            language: "es",
            mode: "auto",
            profileId: "unlisted-safe",
          },
          abreCajon: false,
          enabled: true,
          connection: { host: "192.168.1.10", port: 9100 },
        },
      ]),
    );
    const { App } = await import("../src/App");
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    const editor = document.querySelector('[data-slot="printer-editor-panel"]');
    if (!editor) throw new Error("Printer editor did not open");
    fireEvent.change(within(editor).getAllByRole("textbox")[0], {
      target: { value: "Caja central" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar impresora" }));

    await waitFor(() => expect(bridge.updatePrinter).toHaveBeenCalled());
    expect(bridge.updatePrinter).toHaveBeenCalledWith(
      "caja-1",
      expect.objectContaining({ id: "caja-1", nombre: "Caja central" }),
    );
    expect(bridge.createPrinter).not.toHaveBeenCalled();
  });
});
