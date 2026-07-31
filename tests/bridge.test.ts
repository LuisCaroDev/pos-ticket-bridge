import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigStore } from "../src/core/config-store";
import { discoverUsb } from "../src/core/discovery";
import { configurePrinterForProfile, printJob } from "../src/core/printer";
import {
  defaultPrinterLanguage,
  resolvePrintProfile,
  shouldRasterizeText,
} from "../src/core/printer-profiles";
import { createBridgeServer } from "../src/core/server";
import { createCompatibilityReport } from "../src/core/compatibility-report";
import { resolveLanguage, t } from "../src/i18n";
import {
  diagnosticsForForm,
  formFor,
  printerForSaving,
} from "../src/components/app/printer-utils";
import { languageLabel } from "../src/components/app/language-utils";
import {
  normalizeOrigins,
  printerFormSchema,
  settingsFormSchema,
} from "../src/components/app/form-validation";

const dirs: string[] = [];
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pos-ticket-bridge-test-"));
  dirs.push(dir);
  const store = new ConfigStore(path.join(dir, "config.json"));
  return { store, bridge: createBridgeServer(store) };
}
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("POS Ticket Bridge", () => {
  it("validates required printer fields by transport", () => {
    const invalid = printerFormSchema(false).safeParse({
      nombre: " ",
      tipo: "network",
      connection: { host: "", port: 70000 },
      printProfile: { mode: "auto" },
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success)
      expect(invalid.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining(["validation_required", "validation_port"]),
      );
  });

  it("validates Bluetooth and platform-specific USB connections", () => {
    expect(
      printerFormSchema(true).safeParse({
        nombre: "POS",
        tipo: "usb",
        connection: {},
        printProfile: { mode: "auto" },
      }).success,
    ).toBe(false);
    expect(
      printerFormSchema(false).safeParse({
        nombre: "POS",
        tipo: "bluetooth",
        connection: { path: "", baudRate: 0 },
        printProfile: { mode: "auto" },
      }).success,
    ).toBe(false);
  });

  it("validates and normalizes allowed origins", () => {
    expect(
      settingsFormSchema.safeParse({
        language: "es",
        port: "9977",
        origins: "https://pos.example.com/\nhttps://pos.example.com",
      }).success,
    ).toBe(true);
    expect(
      normalizeOrigins("https://pos.example.com/\nhttps://pos.example.com"),
    ).toEqual(["https://pos.example.com"]);
    expect(
      settingsFormSchema.safeParse({
        language: "es",
        port: "0",
        origins: "https://pos.example.com/ventas",
      }).success,
    ).toBe(false);
  });

  it("renders diagnostic translations with valid Spanish characters", () => {
    expect(t("es", "print_diagnostics")).toBe("Diagnóstico de impresión");
    expect(t("es", "diagnostic_cause")).toBe("Causa técnica");
  });

  it("uses full translated names for language select values", () => {
    expect(languageLabel((key, params) => t("es", key, params), "es")).toBe(
      "Español",
    );
    expect(languageLabel((key, params) => t("en", key, params), "en")).toBe(
      "English",
    );
  });

  it("labels selected printer profiles without calling them automatic", () => {
    expect(t("es", "profile_label", { profile: "xprinter-xp-e260l" })).toBe(
      "Perfil: xprinter-xp-e260l",
    );
    expect(
      t("es", "profile_label", { profile: t("es", "profile_custom") }),
    ).toBe("Perfil: personalizado");
  });

  it("does not persist form-only printer state", () => {
    const printer = printerForSaving({
      id: "pos",
      nombre: "POS",
      tipo: "network",
      anchoMm: 80,
      printProfile: {
        language: "es",
        mode: "auto",
        profileId: "unlisted-safe",
      },
      abreCajon: false,
      enabled: true,
      connection: { host: "192.168.18.200", port: 9100 },
      customCharacterTable: false,
    });

    expect(printer).not.toHaveProperty("customCharacterTable");
    expect(printer.printProfile.language).toBe("es");
  });

  it("shows the latest draft diagnostic before status refresh catches up", () => {
    const latest = {
      printerId: "draft:session-1",
      draftSessionId: "session-1",
      operation: "test-draft",
      startedAt: "2026-07-31T00:00:00.000Z",
    };
    expect(diagnosticsForForm([], undefined, "session-1", latest)).toEqual([
      latest,
    ]);
    expect(
      diagnosticsForForm([latest], undefined, "session-1", latest),
    ).toEqual([latest]);
  });

  it("keeps the print profile but excludes runtime state when editing", () => {
    const printProfile = {
      language: "es" as const,
      mode: "custom" as const,
      custom: {
        encoding: "CP858",
        codeTable: 19,
        unicodeFallback: "auto" as const,
      },
    };
    const form = formFor({
      id: "pos",
      nombre: "POS",
      tipo: "network",
      anchoMm: 80,
      printProfile,
      abreCajon: false,
      enabled: true,
      connection: { host: "192.168.18.200", port: 9100 },
      runtime: { connection: { ok: true } },
    });

    expect(form).not.toHaveProperty("runtime");
    expect(form.printProfile).toEqual(printProfile);
  });

  it("creates a clean persisted configuration", () => {
    const { store } = fixture();
    expect(store.get()).toMatchObject({
      version: 1,
      port: 9977,
      printers: [],
      allowedOrigins: [],
      language: "system",
    });
    expect(store.get().token).toHaveLength(48);
  });

  it("resets obsolete root configurations to clean defaults", () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), "pos-ticket-bridge-test-"),
    );
    dirs.push(dir);
    const configPath = path.join(dir, "config.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        port: 9977,
        token: "a".repeat(48),
        allowedOrigins: [],
        printers: [],
      }),
    );

    const config = new ConfigStore(configPath).get();
    expect(config).toMatchObject({
      version: 1,
      port: 9977,
      language: "system",
      printers: [],
    });
    expect(config.token).toHaveLength(48);
    expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toMatchObject({
      language: "system",
      printers: [],
    });
  });

  it("stores all language preferences and resolves system locales safely", () => {
    const { store } = fixture();
    store.settings({ language: "en" });
    expect(store.get().language).toBe("en");
    store.settings({ language: "es" });
    expect(store.get().language).toBe("es");
    store.settings({ language: "system" });
    expect(resolveLanguage("system", "en-US")).toBe("en");
    expect(resolveLanguage("system", "es-419")).toBe("es");
    expect(resolveLanguage("system", "fr-FR")).toBe("es");
  });

  it("persists settings after reopening the config store", () => {
    const { store } = fixture();
    store.settings({
      port: 9988,
      allowedOrigins: ["https://pos.example.com"],
      language: "en",
    });

    const reopened = new ConfigStore(store.path());
    expect(reopened.get()).toMatchObject({
      port: 9988,
      allowedOrigins: ["https://pos.example.com"],
      language: "en",
    });
  });

  it("exposes advanced settings in the status used by the app", async () => {
    const { store, bridge } = fixture();

    store.settings({
      port: 9988,
      allowedOrigins: [" https://pos.ejemplo.com ", ""],
    });

    await expect(bridge.status()).resolves.toMatchObject({
      port: 9988,
      allowedOrigins: ["https://pos.ejemplo.com"],
    });
  });

  it("keeps print diagnostics in memory and promotes draft history", async () => {
    const { store, bridge } = fixture();
    const listener = net.createServer((socket) => socket.resume());
    await new Promise<void>((resolve) =>
      listener.listen(0, "127.0.0.1", resolve),
    );
    const address = listener.address();
    if (!address || typeof address === "string")
      throw new Error("No test port");

    try {
      const created = store.create({
        nombre: "Caja",
        tipo: "network",
        connection: { host: "127.0.0.1", port: address.port },
      });
      const printer = created.printers[0];
      const printed = await bridge.app.inject({
        method: "POST",
        url: "/print",
        headers: { "x-agent-token": store.get().token },
        payload: {
          printerId: printer.id,
          job: { version: 1, blocks: [{ type: "text", content: "Ticket" }] },
        },
      });
      expect(printed.statusCode).toBe(200);

      const draft = await bridge.testPrinter(
        { ...printer, id: "", nombre: "Borrador" },
        { draftSessionId: "draft-1", operation: "spanish-validation" },
      );
      expect(draft.ok).toBe(true);
      expect((await bridge.status()).diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            printerId: printer.id,
            operation: "print-job",
          }),
          expect.objectContaining({
            draftSessionId: "draft-1",
            operation: "spanish-validation",
          }),
        ]),
      );

      bridge.promoteDraftDiagnostics("draft-1", printer.id);
      const promoted = (await bridge.status()).diagnostics.find(
        (diagnostic) => diagnostic.operation === "spanish-validation",
      );
      expect(promoted).toMatchObject({ printerId: printer.id });
      expect(promoted).not.toHaveProperty("draftSessionId");

      await new Promise<void>((resolve) => listener.close(() => resolve()));
      const failed = await bridge.testPrinter(
        { ...printer, id: "", nombre: "Borrador fallido" },
        { draftSessionId: "draft-failed" },
      );
      expect(failed.ok).toBe(false);
      expect((await bridge.status()).diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            draftSessionId: "draft-failed",
            ok: false,
          }),
        ]),
      );
    } finally {
      await bridge.stop();
      if (listener.listening)
        await new Promise<void>((resolve) => listener.close(() => resolve()));
    }
  });

  it("discards draft diagnostics and starts each bridge without history", async () => {
    const { store, bridge } = fixture();
    const listener = net.createServer((socket) => socket.resume());
    await new Promise<void>((resolve) =>
      listener.listen(0, "127.0.0.1", resolve),
    );
    const address = listener.address();
    if (!address || typeof address === "string")
      throw new Error("No test port");

    try {
      const printer = store.create({
        nombre: "Borrador",
        tipo: "network",
        connection: { host: "127.0.0.1", port: address.port },
      }).printers[0];
      const result = await bridge.testPrinter(
        { ...printer, id: "" },
        { draftSessionId: "discard-me" },
      );
      expect(result).toMatchObject({ ok: true });
      bridge.discardDraftDiagnostics("discard-me");
      expect((await bridge.status()).diagnostics).toEqual([]);
      await bridge.stop();

      const restarted = createBridgeServer(store);
      await expect(restarted.status()).resolves.toMatchObject({
        diagnostics: [],
      });
      await restarted.stop();
    } finally {
      await new Promise<void>((resolve) => listener.close(() => resolve()));
    }
  });

  it("exposes the effective print profile in runtime status", async () => {
    const { store, bridge } = fixture();
    store.create({
      nombre: "Caja",
      tipo: "network",
      connection: { host: "192.168.1.20", port: 9100 },
    });

    await expect(bridge.status()).resolves.toMatchObject({
      printers: [
        {
          runtime: {
            printProfile: {
              id: "unlisted-safe",
              mode: "auto",
              unicodeCoverage: "bitmap-fallback",
            },
          },
        },
      ],
    });
    await bridge.stop();
  });

  it("does not use the Windows-only USB message on macOS", async () => {
    if (process.platform !== "darwin") return;

    const result = await discoverUsb();
    expect(result.notes.join(" ")).not.toContain(
      "solo está disponible en Windows",
    );
  });

  it("stores USB printers by their Windows print queue", () => {
    const { store } = fixture();
    store.create({
      nombre: "Ticket caja",
      tipo: "usb",
      connection: {
        vendorId: "0x1fc9",
        productId: "0x2016",
        systemPrinter: "POS-80",
        port: "USB001",
      },
    });
    expect(store.get().printers[0].connection).toEqual({
      systemPrinter: "POS-80",
      port: "USB001",
      vendorId: "0x1fc9",
      productId: "0x2016",
    });
    expect(store.get().printers[0].printProfile.mode).toBe("auto");
  });

  it("defaults printer languages from the system locale without storing system", () => {
    expect(defaultPrinterLanguage("en-US")).toBe("en");
    expect(defaultPrinterLanguage("es-PE")).toBe("es");
    expect(defaultPrinterLanguage("fr-FR")).toBe("es");
  });

  it("uses a known Epson profile and selects its ESC/POS character table", () => {
    const printer = {
      id: "epson",
      nombre: "Epson",
      tipo: "usb" as const,
      anchoMm: 80 as const,
      abreCajon: false,
      enabled: true,
      printProfile: { language: "es" as const, mode: "auto" as const },
      connection: { vendorId: "0x04b8", productId: "0x0202" },
    };
    const profile = resolvePrintProfile(printer, {
      allowUnverifiedSpanish: true,
    });
    const calls: Array<[string, string | number]> = [];
    configurePrinterForProfile(
      {
        raw: (value: Buffer) => calls.push(["raw", value.toString("hex")]),
        setCharacterCodeTable: (value: number) => calls.push(["table", value]),
        encode: (value: string) => calls.push(["encoding", value]),
      },
      profile,
    );

    expect(profile).toMatchObject({
      id: "epson-escpos-usb",
      encoding: "CP850",
      codeTable: 2,
    });
    expect(calls).toEqual([
      ["raw", "1b401c2e"],
      ["table", 2],
      ["encoding", "CP850"],
    ]);
    expect(shouldRasterizeText(profile, "áéíóúüñÑ ¿¡")).toBe(false);
    expect(shouldRasterizeText(profile, "€")).toBe(true);
  });

  it("uses the verified Xprinter XP-E260L Spanish character table", () => {
    const profile = resolvePrintProfile(
      {
        id: "xp-e260l",
        nombre: "XP-E260L",
        tipo: "network",
        anchoMm: 80,
        abreCajon: false,
        enabled: true,
        printProfile: {
          language: "es",
          mode: "auto",
          profileId: "xprinter-xp-e260l",
        },
        connection: { host: "192.168.1.20", port: 9100 },
      },
      { allowUnverifiedSpanish: true },
    );

    expect(profile).toMatchObject({
      id: "xprinter-xp-e260l",
      encoding: "CP858",
      codeTable: 19,
      coverage: "spanish-latin",
    });
  });

  it("uses the safe unlisted profile until Spanish support is verified", () => {
    const profile = resolvePrintProfile({
      id: "generic",
      nombre: "POS",
      tipo: "network",
      anchoMm: 80,
      abreCajon: false,
      enabled: true,
      printProfile: { language: "es", mode: "auto" },
      connection: { host: "192.168.1.20", port: 9100 },
    });

    expect(profile.id).toBe("unlisted-safe");
    expect(profile).toMatchObject({ encoding: "CP437", codeTable: 0 });
    expect(shouldRasterizeText(profile, "Caja 1 - total 20")).toBe(false);
    expect(shouldRasterizeText(profile, "José, mañana")).toBe(true);
    expect(shouldRasterizeText(profile, "José, mañana y €")).toBe(true);
    expect(shouldRasterizeText(profile, "Caja 漢字")).toBe(true);
  });

  it("requires Spanish confirmation before a catalog profile prints Latin natively", () => {
    const printer = {
      id: "epson",
      nombre: "Epson",
      tipo: "usb" as const,
      anchoMm: 80 as const,
      abreCajon: false,
      enabled: true,
      printProfile: {
        language: "es" as const,
        mode: "auto" as const,
        profileId: "epson-escpos-usb",
      },
      connection: { vendorId: "0x04b8", productId: "0x0202" },
    };
    const unconfirmed = resolvePrintProfile(printer);
    expect(unconfirmed).toMatchObject({
      encoding: "CP437",
      codeTable: 0,
      coverage: "ascii",
      validation: "required",
    });
    expect(shouldRasterizeText(unconfirmed, "José")).toBe(true);

    const confirmed = resolvePrintProfile({
      ...printer,
      printProfile: {
        ...printer.printProfile,
        validation: {
          "spanish-latin": {
            catalogVersion: 1,
            confirmedAt: "2026-07-31T00:00:00.000Z",
          },
        },
      },
    });
    expect(confirmed).toMatchObject({
      encoding: "CP850",
      codeTable: 2,
      coverage: "spanish-latin",
      validation: "confirmed",
    });
    expect(shouldRasterizeText(confirmed, "José")).toBe(false);
    expect(shouldRasterizeText(confirmed, "€")).toBe(true);
  });

  it("keeps English native for ASCII and falls back for extended characters", () => {
    const profile = resolvePrintProfile({
      id: "epson-en",
      nombre: "Epson",
      tipo: "usb",
      anchoMm: 80,
      abreCajon: false,
      enabled: true,
      printProfile: {
        language: "en",
        mode: "auto",
        profileId: "epson-escpos-usb",
      },
      connection: { vendorId: "0x04b8", productId: "0x0202" },
    });
    expect(shouldRasterizeText(profile, "Cash total 20")).toBe(false);
    expect(shouldRasterizeText(profile, "José")).toBe(true);
  });

  it("encodes native Spanish text in the resolved ESC/POS encoding", async () => {
    const received: Buffer[] = [];
    const server = net.createServer((socket) =>
      socket.on("data", (chunk) => received.push(Buffer.from(chunk))),
    );
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No test port");

    try {
      await printJob(
        {
          id: "generic-network",
          nombre: "POS",
          tipo: "network",
          anchoMm: 80,
          abreCajon: false,
          enabled: true,
          printProfile: {
            language: "es",
            mode: "auto",
            profileId: "xprinter-xp-e260l",
            validation: {
              "spanish-latin": {
                catalogVersion: 1,
                confirmedAt: "2026-07-31T00:00:00.000Z",
              },
            },
          },
          connection: { host: "127.0.0.1", port: address.port },
        },
        {
          version: 1,
          blocks: [{ type: "text", content: "áéíóúüñÑ ¿¡ €" }, { type: "cut" }],
        },
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    const output = Buffer.concat(received);
    expect(
      output.includes(
        Buffer.from([
          0xa0, 0x82, 0xa1, 0xa2, 0xa3, 0x81, 0xa4, 0xa5, 0x20, 0xa8, 0xad,
          0x20, 0xd5,
        ]),
      ),
    ).toBe(true);
    expect(
      output.includes(Buffer.from([0x1b, 0x40, 0x1c, 0x2e, 0x1b, 0x74, 19])),
    ).toBe(true);
    expect(output.includes(Buffer.from("áéíóúüñÑ ¿¡ €", "utf8"))).toBe(false);
  });

  it("clears the selected model when an override becomes custom", () => {
    const { store } = fixture();
    const created = store.create({
      nombre: "Caja",
      tipo: "network",
      connection: { host: "192.168.1.20", port: 9100 },
      printProfile: {
        language: "es",
        mode: "custom",
        custom: {
          encoding: "CP858",
          codeTable: 19,
          unicodeFallback: "raster",
        },
      },
    });
    const custom = resolvePrintProfile(created.printers[0]);
    expect(custom).toMatchObject({
      id: "custom",
      encoding: "CP858",
      codeTable: 19,
      unicodeFallback: "raster",
    });
    expect(created.printers[0].printProfile).not.toHaveProperty("profileId");

    store.update(created.printers[0].id, {
      printProfile: { language: "es", mode: "auto" },
    });
    expect(store.get().printers[0].printProfile).toEqual({
      language: "es",
      mode: "auto",
      profileId: "unlisted-safe",
    });
  });

  it("keeps the selected model but invalidates Spanish confirmation on language change", () => {
    const { store } = fixture();
    const created = store.create({
      nombre: "Epson",
      tipo: "usb",
      connection: { vendorId: "0x04b8", productId: "0x0202" },
      printProfile: {
        language: "es",
        mode: "auto",
        profileId: "epson-escpos-usb",
        validation: {
          "spanish-latin": {
            catalogVersion: 1,
            confirmedAt: "2026-07-31T00:00:00.000Z",
          },
        },
      },
    });
    store.update(created.printers[0].id, {
      printProfile: { language: "en", mode: "auto" },
    });
    expect(store.get().printers[0].printProfile).toEqual({
      language: "en",
      mode: "auto",
      profileId: "epson-escpos-usb",
    });
  });

  it("preserves the generic Unicode safety rule in a customized snapshot", () => {
    const profile = resolvePrintProfile({
      id: "generic-custom",
      nombre: "POS",
      tipo: "network",
      anchoMm: 80,
      abreCajon: false,
      enabled: true,
      printProfile: {
        language: "es",
        mode: "custom",
        custom: {
          encoding: "CP437",
          codeTable: 0,
          unicodeFallback: "auto",
          automaticUnicodePolicy: "ascii",
        },
      },
      connection: { host: "192.168.1.20", port: 9100 },
    });

    expect(shouldRasterizeText(profile, "José")).toBe(true);
    expect(shouldRasterizeText(profile, "Cash 1")).toBe(false);
  });

  it("deletes persisted printers that use an obsolete format", () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), "pos-ticket-bridge-test-"),
    );
    dirs.push(dir);
    const configPath = path.join(dir, "config.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        port: 9977,
        token: "a".repeat(48),
        allowedOrigins: [],
        printers: [
          {
            id: "old-profile",
            nombre: "Old profile",
            tipo: "network",
            anchoMm: 80,
            printProfile: {
              language: "es",
              mode: "auto",
              profileId: "unlisted-safe",
              codepage: "CP850",
            },
            abreCajon: false,
            enabled: true,
            connection: { host: "192.168.1.20", port: 9100 },
          },
        ],
      }),
    );

    expect(new ConfigStore(configPath).get().printers).toEqual([]);
    expect(JSON.parse(fs.readFileSync(configPath, "utf8")).printers).toEqual(
      [],
    );
  });

  it("exports an anonymous, shareable compatibility report", () => {
    const report = createCompatibilityReport(
      {
        id: "secret-printer",
        nombre: "Cafe secreto",
        reportedModel: "ACME TP-80",
        tipo: "network",
        anchoMm: 80,
        abreCajon: false,
        enabled: true,
        printProfile: {
          language: "es",
          mode: "custom",
          profileId: "unlisted-safe",
          validation: {
            "spanish-latin": {
              catalogVersion: 1,
              confirmedAt: "2026-07-31T00:00:00.000Z",
            },
          },
          custom: {
            encoding: "CP858",
            codeTable: 19,
            unicodeFallback: "auto",
          },
        },
        connection: {
          host: "192.168.18.200",
          port: 9100,
          serialNumber: "private-serial",
          systemPrinter: "Cafe secreto",
        },
      },
      "1.2.3",
      {
        printerId: "secret-printer",
        operation: "test-print",
        startedAt: "2026-07-31T00:00:00.000Z",
        ok: true,
        cause: "network 192.168.18.200",
        steps: [
          { stage: "print_profile", encoding: "CP858", codeTable: 19 },
          {
            stage: "adapter_prepare",
            transport: "network",
            host: "192.168.18.200",
          },
        ],
      },
    );
    const serialized = JSON.stringify(report);
    expect(report).toMatchObject({
      schemaVersion: 1,
      bridgeVersion: "1.2.3",
      model: { reportedModel: "ACME TP-80" },
      printer: { transport: "network", widthMm: 80 },
      printProfile: { mode: "custom" },
    });
    expect(serialized).not.toContain("192.168.18.200");
    expect(serialized).not.toContain("private-serial");
    expect(serialized).not.toContain("Cafe secreto");
  });

  it("serves health, creates printers and rejects an invalid print token", async () => {
    const { bridge } = fixture();
    const health = await bridge.app.inject({ method: "GET", url: "/health" });
    expect(health.json()).toMatchObject({ ok: true });
    const created = await bridge.app.inject({
      method: "POST",
      url: "/api/printers",
      payload: {
        nombre: "Caja",
        tipo: "network",
        connection: { host: "192.168.1.20", port: 9100 },
      },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().config.printers[0]).toMatchObject({
      id: "caja",
      tipo: "network",
    });
    const denied = await bridge.app.inject({
      method: "POST",
      url: "/print",
      headers: { "x-agent-token": "incorrecto" },
      payload: { printerId: "caja", job: { version: 1, blocks: [] } },
    });
    expect(denied.statusCode).toBe(401);
    expect(denied.json().error).toEqual({ code: "invalid_token" });
    const missing = await bridge.app.inject({
      method: "POST",
      url: "/test/missing",
      headers: { "x-agent-token": bridge.store.get().token },
    });
    expect(missing.json().error).toEqual({
      code: "printer_not_found",
      params: { printerId: "missing" },
    });
    await bridge.stop();
  });
});
