import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  filterProfilesForPrintLanguage,
  hasUnsavedCustomProfile,
  profileDisplayName,
} from "../src/components/app/PrinterEditorPanel";

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
  exportLocalProfile: vi.fn(),
  importLocalProfile: vi.fn(),
  saveLocalProfile: vi.fn(),
  deleteLocalProfile: vi.fn(),
  validateCharacterProfileTestSet: vi.fn(),
  request: vi.fn(),
  testPrinter: vi.fn(),
  runCharacterProfileTrial: vi.fn(),
  discardDraftDiagnostics: vi.fn(),
  copy: vi.fn(),
  paste: vi.fn(),
};

Object.defineProperty(window, "bridge", { value: bridge, configurable: true });

const status = (printers = [], diagnostics = []) => ({
  version: "1.0.2",
  port: 9977,
  allowedOrigins: [],
  language: "es",
  activeLanguage: "es",
  printers,
  diagnostics,
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
    bridge.saveLocalProfile.mockImplementation(async (input) => {
      const profile = {
        id: "local-acme-generic-80-mm-80mm",
        name: "ACME Generic 80 mm - 80 mm",
        ...(input as object),
      };
      bridge.printerProfiles.mockResolvedValue({
        profiles: [],
        localProfiles: [profile],
      });
      return profile;
    });
    bridge.deleteLocalProfile.mockResolvedValue({
      id: "local-acme-tp-80",
      detachedPrinterIds: [],
    });
    bridge.validateCharacterProfileTestSet.mockImplementation(
      async (value) => value,
    );
    bridge.paste.mockResolvedValue("");
    bridge.runCharacterProfileTrial.mockResolvedValue({
      ok: true,
      diagnostic: { ok: true },
    });
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

  it("keeps the millimeter unit visible for the selected width", async () => {
    const { App } = await import("../src/App");
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Agregar" }));

    expect(screen.getByText("80 mm")).toBeTruthy();
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

  it("imports a shared profile from the clipboard", async () => {
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
    const pastedProfile = {
      schemaVersion: 1,
      kind: "pos-ticket-bridge-local-profile",
      brand: "ACME",
      model: "TP-80",
      widthMm: 80,
      encoding: "CP858",
      codeTable: 19,
      unicodeFallback: "auto",
    };
    bridge.paste.mockResolvedValue(JSON.stringify(pastedProfile));
    bridge.importLocalProfile.mockResolvedValue({ id: "local-acme-tp-80" });
    const { App } = await import("../src/App");
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    fireEvent.click(screen.getByRole("button", { name: "Importar perfil" }));
    fireEvent.click(screen.getByRole("button", { name: "Pegar perfil" }));

    await waitFor(() =>
      expect(bridge.importLocalProfile).toHaveBeenCalledWith(pastedProfile),
    );
    expect(bridge.paste).toHaveBeenCalledOnce();
  });

  it("offers separate copy and download options for a local profile", async () => {
    bridge.status.mockResolvedValue(
      status([
        {
          id: "caja-1",
          nombre: "Caja 1",
          tipo: "network",
          anchoMm: 80,
          printProfile: {
            language: "es",
            mode: "custom",
            localProfileId: "local-acme-tp-80",
            custom: {
              encoding: "CP858",
              codeTable: 19,
              unicodeFallback: "auto",
            },
          },
          abreCajon: false,
          enabled: true,
          connection: { host: "192.168.1.10", port: 9100 },
        },
      ]),
    );
    bridge.printerProfiles.mockResolvedValue({
      profiles: [],
      localProfiles: [
        {
          id: "local-acme-tp-80",
          name: "ACME TP-80",
          values: {
            encoding: "CP858",
            codeTable: 19,
            unicodeFallback: "auto",
          },
        },
      ],
    });
    bridge.exportLocalProfile.mockResolvedValue({
      kind: "pos-ticket-bridge-local-profile",
      model: "TP-80",
    });
    const { App } = await import("../src/App");
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Exportar perfil" }),
    );

    expect(
      screen.getByRole("button", { name: "Descargar archivo" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copiar perfil" }));

    await waitFor(() => expect(bridge.copy).toHaveBeenCalledOnce());
    expect(bridge.copy).toHaveBeenCalledWith(
      expect.stringContaining('"kind": "pos-ticket-bridge-local-profile"'),
    );
  });

  it("manages and deletes local profiles without leaving the editor linked", async () => {
    let localProfiles = [
      {
        id: "local-acme-tp-80",
        name: "ACME TP-80 - 80 mm",
        language: "es",
        widthMm: 80,
        usageCount: 1,
        values: {
          encoding: "CP858",
          codeTable: 19,
          unicodeFallback: "auto",
        },
      },
    ];
    bridge.status.mockResolvedValue(
      status([
        {
          id: "caja-1",
          nombre: "Caja 1",
          tipo: "network",
          anchoMm: 80,
          printProfile: {
            language: "es",
            mode: "custom",
            localProfileId: "local-acme-tp-80",
            custom: {
              encoding: "CP858",
              codeTable: 19,
              unicodeFallback: "auto",
            },
          },
          abreCajon: false,
          enabled: true,
          connection: { host: "192.168.1.10", port: 9100 },
        },
      ]),
    );
    bridge.printerProfiles.mockImplementation(async () => ({
      profiles: [],
      localProfiles,
    }));
    bridge.deleteLocalProfile.mockImplementation(async () => {
      localProfiles = [];
      return { id: "local-acme-tp-80", detachedPrinterIds: ["caja-1"] };
    });
    const { App } = await import("../src/App");
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Administrar perfiles personalizados",
      }),
    );
    expect(screen.getByText("En uso por 1 impresoras")).toBeTruthy();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Eliminar perfil" })[0],
    );
    expect(
      await screen.findByText("¿Eliminar este perfil personalizado?"),
    ).toBeTruthy();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Eliminar perfil" })[0],
    );

    await waitFor(() =>
      expect(bridge.deleteLocalProfile).toHaveBeenCalledWith(
        "local-acme-tp-80",
      ),
    );
    expect(
      await screen.findByText("Aún no hay perfiles personalizados guardados."),
    ).toBeTruthy();
  });

  it("provides help for every advanced printing field", async () => {
    bridge.status.mockResolvedValue(
      status([
        {
          id: "caja-1",
          nombre: "Caja 1",
          tipo: "bluetooth",
          anchoMm: 80,
          printProfile: {
            language: "es",
            mode: "auto",
            profileId: "unlisted-safe",
          },
          abreCajon: false,
          enabled: true,
          connection: { path: "COM4", baudRate: 9600 },
        },
      ]),
    );
    const { App } = await import("../src/App");
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    fireEvent.click(screen.getByText("Opciones avanzadas de impresión"));

    expect(
      screen.getByRole("button", {
        name: /Velocidad de conexión por Bluetooth en baudios/,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /Define cómo la impresora convierte los caracteres/,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /Número de tabla ESC\/POS/,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /Decide cómo imprimir caracteres fuera de la tabla elegida/,
      }),
    ).toBeTruthy();
  });

  it("groups printing profiles by brand in the selector", async () => {
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
    bridge.printerProfiles.mockResolvedValue({
      profiles: [
        {
          id: "unlisted-safe",
          name: { es: "Modelo no listado", en: "Model not listed" },
        },
        {
          id: "epson-escpos-usb",
          brand: "Epson",
          name: { es: "Epson ESC/POS USB", en: "Epson ESC/POS USB" },
        },
        {
          id: "xprinter-xp-e260l",
          brand: "Xprinter",
          name: { es: "Xprinter XP-E260L", en: "Xprinter XP-E260L" },
        },
      ],
      localProfiles: [
        {
          id: "local-xprinter-80",
          brand: "Xprinter",
          name: "Xprinter personalizado - 80 mm",
        },
      ],
    });
    const { App } = await import("../src/App");
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    await waitFor(() =>
      expect(bridge.printerProfiles).toHaveBeenCalledWith(
        expect.objectContaining({ id: "caja-1" }),
      ),
    );
    const profileTrigger = screen.getByRole("button", {
      name: "Perfil de impresión",
    });
    fireEvent.click(profileTrigger);

    expect(await screen.findByText("Epson")).toBeTruthy();
    expect(screen.getByText("Xprinter")).toBeTruthy();
    expect(screen.getByText("Modelos genéricos")).toBeTruthy();
  });

  it("filters profiles by print language and paper width", () => {
    const profiles = [
      { id: "ascii", verifiedCoverage: ["ascii"] },
      { id: "spanish", verifiedCoverage: ["spanish-latin"] },
      { id: "bitmap", supportsRaster: true, verifiedCoverage: [] },
      {
        id: "xprinter-xp-e260l",
        spanishLatin: { encoding: "CP858", codeTable: 19 },
        paperWidths: [80],
      },
    ];
    const localProfiles = [
      { id: "local-es-80", language: "es" as const, widthMm: 80 as const },
      { id: "local-es-58", language: "es" as const, widthMm: 58 as const },
      { id: "local-en-80", language: "en" as const, widthMm: 80 as const },
      { id: "local-en-58", language: "en" as const, widthMm: 58 as const },
    ];

    expect(
      filterProfilesForPrintLanguage(profiles, localProfiles, "es").map(
        (profile) => profile.id,
      ),
    ).toEqual([
      "spanish",
      "bitmap",
      "xprinter-xp-e260l",
      "local-es-80",
      "local-es-58",
    ]);
    expect(
      filterProfilesForPrintLanguage(profiles, localProfiles, "en").map(
        (profile) => profile.id,
      ),
    ).toEqual(["ascii", "xprinter-xp-e260l", "local-en-80", "local-en-58"]);
    expect(
      filterProfilesForPrintLanguage(profiles, localProfiles, "es", 58).map(
        (profile) => profile.id,
      ),
    ).toEqual(["spanish", "bitmap", "local-es-58"]);
    expect(
      filterProfilesForPrintLanguage(profiles, localProfiles, "en", 58).map(
        (profile) => profile.id,
      ),
    ).toEqual(["ascii", "local-en-58"]);
  });

  it("only shows a paper width for profiles limited to one width", () => {
    const formatWidth = (width: 58 | 80) => ` · ${width} mm`;

    expect(
      profileDisplayName(
        {
          id: "xprinter-xp-e260l",
          name: { es: "Xprinter XP-E260L", en: "Xprinter XP-E260L" },
          paperWidths: [80],
        },
        "es",
        formatWidth,
      ),
    ).toBe("Xprinter XP-E260L · 80 mm");
    expect(
      profileDisplayName(
        {
          id: "unlisted-safe",
          name: { es: "Modelo no listado", en: "Model not listed" },
        },
        "es",
        formatWidth,
      ),
    ).toBe("Modelo no listado");
    expect(
      profileDisplayName(
        {
          id: "local-xprinter-80",
          local: true,
          name: "Xprinter personalizado - 80 mm",
          widthMm: 80,
        },
        "es",
        formatWidth,
      ),
    ).toBe("Xprinter personalizado · 80 mm");
  });

  it("recognizes the profile settings that need confirmation before a language change", () => {
    const values = {
      encoding: "CP858",
      codeTable: 19,
      unicodeFallback: "auto" as const,
    };

    expect(
      hasUnsavedCustomProfile(
        { language: "es", mode: "auto", profileId: "unlisted-safe" },
        { language: "es", values },
      ),
    ).toBe(false);
    expect(
      hasUnsavedCustomProfile({
        language: "es",
        mode: "custom",
        custom: values,
      }),
    ).toBe(true);
    expect(
      hasUnsavedCustomProfile(
        { language: "es", mode: "custom", custom: values },
        { language: "es", values },
      ),
    ).toBe(false);
    expect(
      hasUnsavedCustomProfile(
        {
          language: "es",
          mode: "custom",
          custom: { ...values, codeTable: 2 },
        },
        { language: "es", values },
      ),
    ).toBe(true);
  });

  it("opens a printer's diagnostics from the printer list", async () => {
    bridge.status.mockResolvedValue(
      status(
        [
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
        ],
        [
          {
            printerId: "caja-1",
            operation: "test-print",
            ok: false,
            message: { code: "operation_failed" },
            startedAt: "2026-08-01T12:00:00.000Z",
            durationMs: 42,
            steps: [],
          },
        ],
      ),
    );
    const { App } = await import("../src/App");
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Diagnóstico de impresión" }),
    );

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(
      screen
        .getByText(/No se pudo completar la operaci.n\./)
        .classList.contains("text-destructive"),
    ).toBe(true);
  });

  it("validates a pasted temporary character-profile test set", async () => {
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

    await waitFor(() => expect(bridge.status).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Encuentra el perfil correcto para tu impresora",
      }),
    );
    fireEvent.change(screen.getByPlaceholderText("Marca"), {
      target: { value: "ACME" },
    });
    fireEvent.change(screen.getByPlaceholderText("Modelo"), {
      target: { value: "Generic 80 mm" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar set" }));
    fireEvent.change(
      screen.getByPlaceholderText(/"version":1,"name":"Mi impresora"/),
      {
        target: {
          value:
            '{"version":1,"name":"Importado","candidates":[{"id":"CP858-T2","encoding":"CP858","codeTable":2}]}',
        },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Usar este set" }));
    await waitFor(() =>
      expect(bridge.validateCharacterProfileTestSet).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Importado" }),
      ),
    );
    expect(screen.getByRole("button", { name: "Importado" })).toBeDefined();
    expect(screen.getByText("Prueba 1 · CP858-T2")).toBeDefined();
    expect(bridge.createPrinter).not.toHaveBeenCalled();
    expect(bridge.updatePrinter).not.toHaveBeenCalled();
  });

  it("prints a test set in order and marks every completed row", async () => {
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
    fireEvent.click(
      screen.getByRole("button", {
        name: "Encuentra el perfil correcto para tu impresora",
      }),
    );
    fireEvent.change(screen.getByPlaceholderText("Marca"), {
      target: { value: "ACME" },
    });
    fireEvent.change(screen.getByPlaceholderText("Modelo"), {
      target: { value: "Generic 80 mm" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Imprimir todas las pruebas" }),
    );

    await waitFor(() =>
      expect(bridge.runCharacterProfileTrial).toHaveBeenCalledTimes(6),
    );
    expect(screen.getAllByText("Ticket enviado")).toHaveLength(6);
  });

  it("opens directly on tests when the printer already has a make and model", async () => {
    bridge.status.mockResolvedValue(
      status([
        {
          id: "caja-1",
          nombre: "Caja 1",
          tipo: "network",
          anchoMm: 80,
          reportedBrand: "ACME",
          reportedModel: "Generic 80 mm",
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
    fireEvent.click(
      screen.getByRole("button", {
        name: "Encuentra el perfil correcto para tu impresora",
      }),
    );

    expect(
      screen.getByRole("button", { name: "Probar perfiles" }),
    ).toBeDefined();
    expect(screen.queryByPlaceholderText("Marca")).toBeNull();
  });

  it("requires make and model before saving a manual custom profile", async () => {
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
    fireEvent.click(screen.getByText("Opciones avanzadas de impresión"));
    fireEvent.click(
      screen.getByRole("button", { name: "Crear perfil personalizado" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar perfil" }));

    const dialog = screen.getByRole("dialog", { name: "Guardar perfil" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Guardar perfil" }),
    );
    expect(within(dialog).getByText("Este campo es obligatorio.")).toBeTruthy();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Marca" }), {
      target: { value: "ACME" },
    });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Modelo" }), {
      target: { value: "TP-80" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Guardar perfil" }),
    );

    await waitFor(() =>
      expect(bridge.saveLocalProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: "ACME",
          model: "TP-80",
          widthMm: 80,
        }),
      ),
    );
  });

  it("confirms a selected candidate as a local custom profile without printing it", async () => {
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
    fireEvent.click(
      screen.getByRole("button", {
        name: "Encuentra el perfil correcto para tu impresora",
      }),
    );
    fireEvent.change(screen.getByPlaceholderText("Marca"), {
      target: { value: "ACME" },
    });
    fireEvent.change(screen.getByPlaceholderText("Modelo"), {
      target: { value: "Generic 80 mm" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(
      screen.getByRole("radio", {
        name: "Este ticket se ve correcto: Prueba 1 · CP437-T0",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Usar perfil seleccionado" }),
    );
    await waitFor(() => expect(bridge.saveLocalProfile).toHaveBeenCalled());
    const savePrinter = screen.getByRole("button", {
      name: "Guardar impresora",
    });
    await waitFor(() =>
      expect((savePrinter as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(savePrinter);

    await waitFor(() => expect(bridge.updatePrinter).toHaveBeenCalled());
    expect(bridge.updatePrinter).toHaveBeenCalledWith(
      "caja-1",
      expect.objectContaining({
        printProfile: expect.objectContaining({
          mode: "custom",
          localProfileId: "local-acme-generic-80-mm-80mm",
          custom: expect.objectContaining({
            encoding: "CP437",
            codeTable: 0,
            confirmation: expect.objectContaining({ candidateId: "CP437-T0" }),
          }),
        }),
      }),
    );
  });
});
