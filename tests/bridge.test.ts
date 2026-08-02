import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigStore } from "../src/core/config-store";
import { discoverUsb, pairedBluetoothNameForPort } from "../src/core/discovery";
import { configurePrinterForProfile, printJob } from "../src/core/printer";
import {
  defaultPrinterLanguage,
  resolvePrintProfile,
  shouldRasterizeText,
} from "../src/core/printer-profiles";
import { diagnosticStatusAfterStage } from "../src/core/types";
import { createBridgeServer } from "../src/core/server";
import {
  createCompatibilityReport,
  createLocalProfileExport,
} from "../src/core/compatibility-report";
import {
  BluetoothSerialAdapter,
  bluetoothOpenSettleMs,
  bluetoothSerialOptions,
  resolveBluetoothSerialPath,
} from "../src/core/transports/bluetooth-serial";
import {
  parseCharacterProfileTestSet,
  validateCharacterProfileCandidate,
  validateCharacterProfileTestSet,
} from "../src/core/character-profile-tests";
import {
  characterProfileTrialTexts,
  resolveLanguage,
  t,
  testPrintTexts,
} from "../src/i18n";
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
  it("preserves the configured Bluetooth path on every platform", () => {
    expect(resolveBluetoothSerialPath("/dev/tty.Printer001")).toBe(
      "/dev/tty.Printer001",
    );
    expect(resolveBluetoothSerialPath("/dev/cu.Printer001")).toBe(
      "/dev/cu.Printer001",
    );
    expect(resolveBluetoothSerialPath("COM4")).toBe("COM4");
    expect(bluetoothOpenSettleMs("darwin")).toBe(400);
    expect(bluetoothOpenSettleMs("win32")).toBe(0);
    expect(bluetoothSerialOptions(9600, "darwin")).toEqual({
      baudRate: 9600,
      hupcl: false,
    });
    expect(bluetoothSerialOptions(9600, "win32")).toEqual({
      baudRate: 9600,
    });
  });

  it("drains Bluetooth output without flushing it away on close", async () => {
    const calls: string[] = [];
    const stages: string[] = [];
    class FakeSerialPort {
      private listeners = new Map<string, (...args: any[]) => void>();

      on(event: string, listener: (...args: any[]) => void) {
        this.listeners.set(event, listener);
      }

      open(callback: (error?: Error | null) => void) {
        calls.push("open");
        callback(null);
      }

      write(data: Buffer, callback?: (error?: Error | null) => void) {
        calls.push(`write:${data.length}`);
        callback?.(null);
      }

      drain(callback?: (error?: Error | null) => void) {
        calls.push("drain");
        callback?.(null);
      }

      set(
        _options: { dtr: boolean; rts: boolean },
        callback?: (error?: Error | null) => void,
      ) {
        calls.push("set");
        callback?.(null);
      }

      flush() {
        calls.push("flush");
      }

      close(callback?: (error?: Error | null) => void) {
        calls.push("close");
        callback?.(null);
        this.listeners.get("close")?.();
      }
    }

    const adapter = new BluetoothSerialAdapter(
      "/dev/tty.Printer001",
      { baudRate: 9600 },
      { onEvent: (stage) => stages.push(stage) },
      FakeSerialPort as any,
      "linux",
    );
    await new Promise<void>((resolve, reject) =>
      adapter.open((error) => (error ? reject(error) : resolve())),
    );
    await new Promise<void>((resolve, reject) =>
      adapter.write(Buffer.from("ticket"), (error) =>
        error ? reject(error) : resolve(),
      ),
    );
    await new Promise<void>((resolve, reject) =>
      adapter.close((error) => (error ? reject(error) : resolve())),
    );

    expect(calls).toEqual(["open", "write:6", "drain", "close"]);
    expect(stages).toEqual([
      "adapter_write_ok",
      "adapter_drain_ok",
      "adapter_close_ok",
    ]);
  });

  it("creates a fresh serial session after closing Bluetooth", async () => {
    const calls: string[] = [];
    const devices: FakeSerialPort[] = [];
    class FakeSerialPort {
      private listeners = new Map<string, (...args: any[]) => void>();

      constructor() {
        devices.push(this);
      }

      on(event: string, listener: (...args: any[]) => void) {
        this.listeners.set(event, listener);
      }

      open(callback: (error?: Error | null) => void) {
        calls.push("open");
        callback(null);
      }

      drain(callback?: (error?: Error | null) => void) {
        calls.push("drain");
        callback?.(null);
      }

      close(callback?: (error?: Error | null) => void) {
        calls.push("close");
        callback?.(null);
        this.listeners.get("close")?.();
      }
    }

    const adapter = new BluetoothSerialAdapter(
      "/dev/tty.Printer001",
      { baudRate: 9600 },
      {},
      FakeSerialPort as any,
      "linux",
    );
    const open = () =>
      new Promise<void>((resolve, reject) =>
        adapter.open((error) => (error ? reject(error) : resolve())),
      );
    const close = () =>
      new Promise<void>((resolve, reject) =>
        adapter.close((error) => (error ? reject(error) : resolve())),
      );

    await open();
    await close();
    await open();

    expect(devices).toHaveLength(2);
    expect(calls).toEqual(["open", "drain", "close", "open"]);
  });

  it("can reuse a Bluetooth session between jobs and force a reconnect", async () => {
    const calls: string[] = [];
    const stages: string[] = [];
    class FakeSerialPort {
      private listeners = new Map<string, (...args: any[]) => void>();

      on(event: string, listener: (...args: any[]) => void) {
        this.listeners.set(event, listener);
      }

      removeListener(event: string) {
        this.listeners.delete(event);
      }

      open(callback: (error?: Error | null) => void) {
        calls.push("open");
        callback(null);
      }

      write(data: Buffer, callback?: (error?: Error | null) => void) {
        calls.push(`write:${data.length}`);
        callback?.(null);
      }

      drain(callback?: (error?: Error | null) => void) {
        calls.push("drain");
        callback?.(null);
      }

      close(callback?: (error?: Error | null) => void) {
        calls.push("close");
        callback?.(null);
        this.listeners.get("close")?.();
      }
    }

    const adapter = new BluetoothSerialAdapter(
      "/dev/tty.Printer001",
      { baudRate: 9600 },
      { onEvent: (stage) => stages.push(stage) },
      FakeSerialPort as any,
      "linux",
      true,
    );
    const open = () =>
      new Promise<void>((resolve, reject) =>
        adapter.open((error) => (error ? reject(error) : resolve())),
      );
    const write = () =>
      new Promise<void>((resolve, reject) =>
        adapter.write(Buffer.from("ticket"), (error) =>
          error ? reject(error) : resolve(),
        ),
      );
    const close = () =>
      new Promise<void>((resolve, reject) =>
        adapter.close((error) => (error ? reject(error) : resolve())),
      );

    await open();
    await write();
    await close();
    await open();
    await write();
    await close();
    expect(calls).toEqual(["open", "write:6", "drain", "write:6", "drain"]);
    expect(stages).toEqual(
      expect.arrayContaining(["adapter_keep_open", "adapter_open_reused"]),
    );

    await new Promise<void>((resolve, reject) =>
      adapter.reopen((error) => (error ? reject(error) : resolve())),
    );
    expect(calls).toEqual([
      "open",
      "write:6",
      "drain",
      "write:6",
      "drain",
      "drain",
      "close",
      "open",
    ]);
  });

  it("uses the paired Bluetooth device name for a serial port when available", () => {
    const pnpId =
      "BTHENUM\\{00001101-0000-1000-8000-00805F9B34FB}_LOCALMFG&08E7\\7&113820F4&0&DC0D30F2D71D_C00000000";
    const pairedDevices = [
      {
        FriendlyName: "Printer001",
        InstanceId:
          "BTHENUM\\DEV_DC0D30F2D71D\\7&2C945B11&0&BLUETOOTHDEVICE_DC0D30F2D71D",
      },
    ];

    expect(pairedBluetoothNameForPort(pnpId, pairedDevices)).toBe("Printer001");
    expect(pairedBluetoothNameForPort("BTHENUM\\unknown", pairedDevices)).toBe(
      undefined,
    );
  });

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
    expect(t("es", "print_sent_without_confirmation")).toContain("no confirmó");
    expect(t("en", "print_sent_without_confirmation")).toContain(
      "did not confirm",
    );
  });

  it("classifies an unanswered printer status probe as a warning", () => {
    expect(
      diagnosticStatusAfterStage("success", "adapter_status_probe_timeout"),
    ).toBe("warning");
    expect(
      diagnosticStatusAfterStage("warning", "adapter_status_probe_response"),
    ).toBe("success");
    expect(diagnosticStatusAfterStage("warning", "adapter_write_ok")).toBe(
      "warning",
    );
  });

  it("builds grouped test tickets for each printing language", () => {
    expect(testPrintTexts("es", "Caja 1")).toMatchObject({
      ascii: expect.stringContaining("ASCII:"),
      spanish: expect.stringContaining("áéíóúüñÑ"),
      symbols: expect.stringContaining("€ $ S/"),
    });
    expect(testPrintTexts("en", "Till 1")).toMatchObject({
      ascii: expect.stringContaining("ASCII:"),
      spanish: undefined,
      symbols: expect.stringContaining("€ $ S/"),
    });
  });

  it("uses the same grouped characters for profile trials", () => {
    expect(
      characterProfileTrialTexts("es", {
        id: "CP858-T19",
        encoding: "CP858",
        codeTable: 19,
      }),
    ).toMatchObject({
      ascii: expect.stringContaining("ASCII:"),
      spanish: expect.stringContaining("áéíóúüñÑ"),
      symbols: expect.stringContaining("€ $ S/"),
    });
  });

  it("validates strict, bounded character-profile test sets", () => {
    expect(
      parseCharacterProfileTestSet({
        version: 1,
        name: "Generic ESC/POS",
        candidates: [{ id: "CP858-T19", encoding: "cp858", codeTable: 19 }],
      }),
    ).toMatchObject({ candidates: [{ encoding: "CP858", codeTable: 19 }] });
    expect(() =>
      parseCharacterProfileTestSet({
        version: 1,
        name: "Duplicates",
        candidates: [
          { id: "same", encoding: "CP850", codeTable: 2 },
          { id: "same", encoding: "CP858", codeTable: 19 },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseCharacterProfileTestSet({
        version: 1,
        name: "Unsafe",
        candidates: [
          { id: "raw", encoding: "CP858", codeTable: 256, raw: "\\u001b@" },
        ],
      }),
    ).toThrow();
    expect(() =>
      validateCharacterProfileCandidate(
        { id: "unknown", encoding: "NOT-A-CODEPAGE", codeTable: 1 },
        () => false,
      ),
    ).toThrow();
    expect(() =>
      validateCharacterProfileTestSet(
        {
          version: 1,
          name: "Unsupported",
          candidates: [
            { id: "unknown", encoding: "NOT-A-CODEPAGE", codeTable: 1 },
          ],
        },
        () => false,
      ),
    ).toThrow();
  });

  it("exports only the confirmed local profile metadata", () => {
    const profile = createLocalProfileExport({
      id: "secret-printer",
      nombre: "Caja privada",
      tipo: "network",
      anchoMm: 80,
      reportedBrand: "ACME",
      reportedModel: "Generic 80 mm",
      printProfile: {
        language: "es",
        mode: "custom",
        custom: {
          encoding: "CP858",
          codeTable: 19,
          unicodeFallback: "auto",
          confirmation: {
            confirmedAt: "2026-07-31T00:00:00.000Z",
            testSetName: "Defaults",
            candidateId: "CP858-T19",
          },
        },
      },
      abreCajon: false,
      enabled: true,
      connection: { host: "192.168.1.25", port: 9100, token: "secret" },
    });
    expect(profile).toMatchObject({
      brand: "ACME",
      model: "Generic 80 mm",
      encoding: "CP858",
      codeTable: 19,
      confirmedAt: "2026-07-31T00:00:00.000Z",
    });
    expect(JSON.stringify(profile)).not.toMatch(/192\.168|secret|Caja privada/);
  });

  it("persists a confirmed local custom profile independently from its printer", () => {
    const { store } = fixture();
    const profile = store.saveLocalProfile({
      brand: "ACME",
      model: "Generic 80 mm",
      language: "es",
      widthMm: 80,
      values: {
        encoding: "CP858",
        codeTable: 19,
        unicodeFallback: "auto",
        confirmation: {
          confirmedAt: "2026-07-31T00:00:00.000Z",
          testSetName: "Defaults",
          candidateId: "CP858-T19",
        },
      },
    });
    const saved = store.create({
      nombre: "Caja",
      tipo: "network",
      connection: { host: "127.0.0.1", port: 9100 },
      reportedBrand: "ACME",
      reportedModel: "Generic 80 mm",
      printProfile: {
        language: "es",
        mode: "custom",
        custom: { ...profile.values },
        localProfileId: profile.id,
      },
    });
    expect(saved.printers[0].printProfile).toMatchObject({
      mode: "custom",
      localProfileId: "local-acme-generic-80-mm-80mm-es",
      custom: {
        confirmation: { candidateId: "CP858-T19" },
      },
    });
    expect(saved.localProfiles).toMatchObject([
      {
        id: "local-acme-generic-80-mm-80mm-es",
        brand: "ACME",
        model: "Generic 80 mm",
        values: { encoding: "CP858", codeTable: 19 },
      },
    ]);
    expect(
      new ConfigStore(store.path()).get().printers[0].printProfile,
    ).toMatchObject({ custom: { confirmation: { testSetName: "Defaults" } } });

    const reused = store.create({
      nombre: "Caja USB",
      tipo: "usb",
      connection: {
        systemPrinter: "POS USB",
        port: "USB001",
        vendorId: "",
        productId: "",
      },
      anchoMm: 80,
      printProfile: {
        language: "en",
        mode: "custom",
        localProfileId: profile.id,
        custom: { encoding: "CP437", codeTable: 0, unicodeFallback: "auto" },
      },
    });
    expect(reused.printers[1]).toMatchObject({
      tipo: "usb",
      printProfile: {
        localProfileId: profile.id,
        custom: { encoding: "CP858", codeTable: 19 },
      },
    });

    store.saveLocalProfile({
      brand: "ACME",
      model: "Generic 80 mm",
      language: "es",
      widthMm: 80,
      values: { encoding: "CP850", codeTable: 2, unicodeFallback: "auto" },
    });
    expect(
      store
        .get()
        .printers.map((printer) => printer.printProfile.custom?.encoding),
    ).toEqual(["CP850", "CP850"]);
  });

  it("deletes a local profile while preserving attached printer settings", () => {
    const { store } = fixture();
    const profile = store.saveLocalProfile({
      brand: "ACME",
      model: "TP-80",
      language: "es",
      widthMm: 80,
      values: { encoding: "CP858", codeTable: 19, unicodeFallback: "auto" },
    });
    const created = store.create({
      nombre: "Caja",
      tipo: "network",
      connection: { host: "192.168.1.20", port: 9100 },
      printProfile: {
        language: "es",
        mode: "custom",
        localProfileId: profile.id,
        custom: { ...profile.values },
      },
    });

    expect(store.deleteLocalProfile(profile.id)).toEqual({
      id: profile.id,
      detachedPrinterIds: [created.printers[0].id],
    });
    expect(store.get().localProfiles).toEqual([]);
    expect(store.get().printers[0].printProfile).toMatchObject({
      mode: "custom",
      custom: { encoding: "CP858", codeTable: 19 },
    });
    expect(store.get().printers[0].printProfile).not.toHaveProperty(
      "localProfileId",
    );

    store.update(created.printers[0].id, {
      printProfile: {
        language: "es",
        mode: "custom",
        custom: { encoding: "CP850", codeTable: 2, unicodeFallback: "auto" },
      },
    });
    expect(store.get().localProfiles).toEqual([]);
  });

  it("imports a shared local profile for reuse by another printer", () => {
    const { store } = fixture();
    const imported = store.importLocalProfile({
      schemaVersion: 1,
      kind: "pos-ticket-bridge-local-profile",
      brand: "ACME",
      model: "Generic 80 mm",
      widthMm: 80,
      encoding: "CP858",
      codeTable: 19,
      unicodeFallback: "auto",
      confirmedAt: "2026-07-31T00:00:00.000Z",
      testSet: { name: "Defaults", candidateId: "CP858-T19" },
    });

    expect(imported).toMatchObject({
      id: "local-acme-generic-80-mm-80mm-es",
      values: { encoding: "CP858", codeTable: 19 },
    });
    expect(new ConfigStore(store.path()).get().localProfiles).toHaveLength(1);
  });

  it("migrates confirmed profiles from existing printers into the local registry", () => {
    const { store } = fixture();
    fs.writeFileSync(
      store.path(),
      JSON.stringify({
        version: 1,
        port: 9977,
        token: "a".repeat(48),
        allowedOrigins: [],
        language: "es",
        printers: [
          {
            id: "caja",
            nombre: "Caja",
            tipo: "network",
            anchoMm: 80,
            reportedBrand: "ACME",
            reportedModel: "Generic 80 mm",
            printProfile: {
              language: "es",
              mode: "custom",
              custom: {
                encoding: "CP858",
                codeTable: 19,
                unicodeFallback: "auto",
                confirmation: {
                  confirmedAt: "2026-07-31T00:00:00.000Z",
                  testSetName: "Defaults",
                  candidateId: "CP858-T19",
                },
              },
            },
            abreCajon: false,
            enabled: true,
            connection: { host: "127.0.0.1", port: 9100 },
          },
        ],
      }),
    );

    const migrated = new ConfigStore(store.path()).get();
    expect(migrated.localProfiles).toHaveLength(1);
    expect(migrated.printers[0].printProfile.localProfileId).toBe(
      "local-acme-generic-80-mm-80mm-es",
    );
  });

  it("keeps legacy local profile IDs usable", () => {
    const { store } = fixture();
    const profile = store.saveLocalProfile({
      brand: "ACME",
      model: "TP-80",
      language: "es",
      widthMm: 80,
      values: { encoding: "CP858", codeTable: 19, unicodeFallback: "auto" },
    });
    store.create({
      nombre: "Caja",
      tipo: "network",
      connection: { host: "127.0.0.1", port: 9100 },
      reportedBrand: "ACME",
      reportedModel: "TP-80",
      printProfile: {
        language: "es",
        mode: "custom",
        custom: { ...profile.values },
        localProfileId: profile.id,
      },
    });
    const legacy = structuredClone(store.get());
    const legacyId = "local-acme-tp-80-80mm";
    legacy.localProfiles[0].id = legacyId;
    const legacyPrinter = legacy.printers[0];
    if (legacyPrinter.printProfile.mode !== "custom")
      throw new Error("Expected a custom profile");
    legacyPrinter.printProfile.localProfileId = legacyId;
    fs.writeFileSync(store.path(), JSON.stringify(legacy));

    const loaded = new ConfigStore(store.path()).get();
    expect(loaded.localProfiles[0].id).toBe(legacyId);
    expect(loaded.printers[0].printProfile).toMatchObject({
      language: "es",
      localProfileId: legacyId,
      custom: { encoding: "CP858", codeTable: 19 },
    });
  });

  it("updates a custom profile by make, model, and paper width", () => {
    const { store } = fixture();
    const first = store.saveLocalProfile({
      brand: "ACME",
      model: "TP-80",
      language: "es",
      widthMm: 80,
      values: { encoding: "CP850", codeTable: 2, unicodeFallback: "auto" },
    });
    const updated = store.saveLocalProfile({
      brand: "acme",
      model: "tp-80",
      language: "es",
      widthMm: 80,
      values: { encoding: "CP858", codeTable: 19, unicodeFallback: "auto" },
    });
    const narrow = store.saveLocalProfile({
      brand: "ACME",
      model: "TP-80",
      language: "es",
      widthMm: 58,
      values: { encoding: "CP437", codeTable: 0, unicodeFallback: "auto" },
    });
    const english = store.saveLocalProfile({
      brand: "ACME",
      model: "TP-80",
      language: "en",
      widthMm: 80,
      values: { encoding: "CP437", codeTable: 0, unicodeFallback: "auto" },
    });

    expect(updated.id).toBe(first.id);
    expect(narrow.id).not.toBe(first.id);
    expect(english.id).not.toBe(first.id);
    expect(store.get().localProfiles).toHaveLength(3);
    expect(store.get().localProfiles).toContainEqual(
      expect.objectContaining({
        id: first.id,
        values: expect.objectContaining({ encoding: "CP858" }),
      }),
    );
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
        printProfile: {
          language: "es",
          mode: "auto",
          profileId: "xprinter-xp-e260l",
        },
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
        { draftSessionId: "draft-1" },
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
            operation: "test-draft",
          }),
        ]),
      );

      bridge.promoteDraftDiagnostics("draft-1", printer.id);
      const promoted = (await bridge.status()).diagnostics.find(
        (diagnostic) => diagnostic.operation === "test-draft",
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

  it("runs a temporary native character-profile trial and records its candidate", async () => {
    const { bridge } = fixture();
    const listener = net.createServer((socket) => socket.resume());
    await new Promise<void>((resolve) =>
      listener.listen(0, "127.0.0.1", resolve),
    );
    const address = listener.address();
    if (!address || typeof address === "string")
      throw new Error("No test port");
    try {
      const result = await bridge.runCharacterProfileTrial(
        {
          id: "",
          nombre: "Borrador",
          tipo: "network",
          anchoMm: 80,
          abreCajon: false,
          enabled: true,
          printProfile: {
            language: "es",
            mode: "auto",
            profileId: "unlisted-safe",
          },
          connection: { host: "127.0.0.1", port: address.port },
        },
        { id: "CP858-T19", encoding: "CP858", codeTable: 19 },
        "profile-trial",
      );
      expect(result).toMatchObject({ ok: true });
      expect(result.diagnostic.steps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            stage: "character_profile_candidate",
            id: "CP858-T19",
            encoding: "CP858",
            codeTable: 19,
          }),
          expect.objectContaining({
            stage: "print_profile",
            encoding: "CP858",
            codeTable: 19,
            unicodeFallback: "native",
          }),
        ]),
      );
    } finally {
      await bridge.stop();
      await new Promise<void>((resolve) => listener.close(() => resolve()));
    }
  });

  it("records an invalid character-profile candidate as a failed trial", async () => {
    const { bridge } = fixture();
    try {
      const result = await bridge.runCharacterProfileTrial(
        {
          id: "",
          nombre: "Borrador",
          tipo: "network",
          anchoMm: 80,
          abreCajon: false,
          enabled: true,
          printProfile: {
            language: "es",
            mode: "auto",
            profileId: "unlisted-safe",
          },
          connection: { host: "127.0.0.1", port: 9100 },
        },
        { id: "invalid", encoding: "NOT-AN-ENCODING", codeTable: 0 },
        "invalid-profile-trial",
      );
      expect(result).toMatchObject({
        ok: false,
        error: { code: "invalid_character_profile_test_set" },
      });
      expect((await bridge.status()).diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: "character-profile-trial",
            draftSessionId: "invalid-profile-trial",
            ok: false,
          }),
        ]),
      );
    } finally {
      await bridge.stop();
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
        printProfile: {
          language: "es",
          mode: "auto",
          profileId: "xprinter-xp-e260l",
        },
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
    const profile = resolvePrintProfile(printer);
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
    const profile = resolvePrintProfile({
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
    });

    expect(profile).toMatchObject({
      id: "xprinter-xp-e260l",
      encoding: "CP858",
      codeTable: 19,
      coverage: "spanish-latin",
    });
  });

  it("uses the safe unlisted profile when Spanish support is unavailable", () => {
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

  it("uses catalog Spanish support without per-printer confirmation", () => {
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
    const profile = resolvePrintProfile({
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
    expect(profile).toMatchObject({
      encoding: "CP850",
      codeTable: 2,
      coverage: "spanish-latin",
      validation: "confirmed",
    });
    expect(shouldRasterizeText(profile, "José")).toBe(false);
    expect(shouldRasterizeText(profile, "€")).toBe(true);

    const profileWithoutLegacyConfirmation = resolvePrintProfile(printer);
    expect(profileWithoutLegacyConfirmation).toMatchObject({
      encoding: "CP850",
      codeTable: 2,
      coverage: "spanish-latin",
      validation: "confirmed",
    });
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

  it("retains legacy character confirmation metadata without using it", () => {
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
      validation: {
        "spanish-latin": {
          catalogVersion: 1,
          confirmedAt: "2026-07-31T00:00:00.000Z",
        },
      },
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
