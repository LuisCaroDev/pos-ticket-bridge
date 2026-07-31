import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { BridgeError } from "../i18n";
import {
  defaultAutomaticProfileId,
  defaultCustomProfile,
  defaultPrinterLanguage,
  isSupportedEncoding,
} from "./printer-profiles";
import { getCatalogProfile } from "./printer-profile-catalog";
import type { BridgeConfig, Printer, PrintProfile } from "./types";

const customPrintProfileSchema = z
  .object({
    encoding: z.string().min(1),
    codeTable: z.number().int().min(0).max(255),
    unicodeFallback: z.enum(["auto", "raster", "native"]),
    automaticUnicodePolicy: z.enum(["encoding", "ascii"]).optional(),
  })
  .strict();
const profileValidationSchema = z
  .object({
    catalogVersion: z.number().int().positive(),
    confirmedAt: z.string().datetime(),
  })
  .strict();
const validationSchema = z
  .object({
    ascii: profileValidationSchema.optional(),
    "spanish-latin": profileValidationSchema.optional(),
  })
  .strict();
const knownCatalogProfileId = (value: string) =>
  getCatalogProfile(value).id === value;
const printProfileSchema = z.discriminatedUnion("mode", [
  z
    .object({
      language: z.enum(["es", "en"]),
      mode: z.literal("auto"),
      profileId: z.string().min(1).refine(knownCatalogProfileId),
      validation: validationSchema.optional(),
    })
    .strict(),
  z
    .object({
      language: z.enum(["es", "en"]),
      mode: z.literal("custom"),
      custom: customPrintProfileSchema,
    })
    .strict(),
]);
const networkConnectionSchema = z
  .object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
  })
  .strict();
const usbConnectionSchema = z
  .object({
    systemPrinter: z.string(),
    port: z.string(),
    vendorId: z.string(),
    productId: z.string(),
  })
  .strict();
const bluetoothConnectionSchema = z
  .object({
    path: z.string().min(1),
    baudRate: z.number().int().positive(),
    channel: z.string(),
  })
  .strict();
const printerFields = {
  id: z.string().min(1),
  nombre: z.string().min(1),
  anchoMm: z.union([z.literal(58), z.literal(80)]),
  reportedModel: z.string().max(160).optional(),
  printProfile: printProfileSchema,
  abreCajon: z.boolean(),
  enabled: z.boolean(),
};
const printerSchema = z.discriminatedUnion("tipo", [
  z
    .object({
      ...printerFields,
      tipo: z.literal("network"),
      connection: networkConnectionSchema,
    })
    .strict(),
  z
    .object({
      ...printerFields,
      tipo: z.literal("usb"),
      connection: usbConnectionSchema,
    })
    .strict(),
  z
    .object({
      ...printerFields,
      tipo: z.literal("bluetooth"),
      connection: bluetoothConnectionSchema,
    })
    .strict(),
]);
const persistedConfigSchema = z
  .object({
    version: z.literal(1),
    port: z.number().int().min(1).max(65535),
    token: z.string().min(1),
    allowedOrigins: z.array(z.string()),
    language: z.enum(["system", "es", "en"]),
    printers: z.array(z.unknown()),
  })
  .strict();
const configSchema = z
  .object({
    version: z.literal(1),
    port: z.number().int().min(1).max(65535),
    token: z.string().min(1),
    allowedOrigins: z.array(z.string()),
    language: z.enum(["system", "es", "en"]),
    printers: z.array(printerSchema),
  })
  .strict();
export const token = () => crypto.randomBytes(24).toString("hex");
export const slug = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "") ||
  `printer-${crypto.randomBytes(3).toString("hex")}`;
export const suggestedHosts = (port: number) =>
  [
    ...new Set(
      Object.values(os.networkInterfaces())
        .flat()
        .filter((item): item is os.NetworkInterfaceInfo =>
          Boolean(item && item.family === "IPv4" && !item.internal),
        )
        .map((item) => item.address),
    ),
  ]
    .map((ip) => `http://${ip}:${port}`)
    .concat(`http://127.0.0.1:${port}`);
export const defaultConfig = (): BridgeConfig => ({
  version: 1,
  port: 9977,
  token: token(),
  allowedOrigins: [],
  language: "system",
  printers: [],
});

export class ConfigStore {
  private config: BridgeConfig;
  constructor(private readonly filePath: string) {
    this.config = this.load();
  }
  private load() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      const next = defaultConfig();
      this.write(next);
      return next;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      const persisted = persistedConfigSchema.parse(raw);
      const printers = persisted.printers.flatMap((printer) => {
        const result = printerSchema.safeParse(printer);
        return result.success ? [result.data] : [];
      });
      const next = configSchema.parse({
        ...persisted,
        printers,
      }) as BridgeConfig;

      if (printers.length !== persisted.printers.length) this.write(next);
      return next;
    } catch {
      const next = defaultConfig();
      this.write(next);
      return next;
    }
  }
  private write(value: BridgeConfig) {
    fs.writeFileSync(
      this.filePath,
      `${JSON.stringify(value, null, 2)}\n`,
      "utf8",
    );
  }
  private save(value: BridgeConfig) {
    this.config = configSchema.parse(value) as BridgeConfig;
    this.write(this.config);
    return this.get();
  }
  get() {
    return structuredClone(this.config);
  }
  path() {
    return this.filePath;
  }
  configured() {
    return this.config.printers.some((printer) => printer.enabled);
  }
  publicConfig() {
    return {
      ...this.get(),
      __path: this.filePath,
      suggestedHosts: suggestedHosts(this.config.port),
    };
  }
  settings(
    input: Partial<Pick<BridgeConfig, "port" | "allowedOrigins" | "language">>,
  ) {
    return this.save({
      ...this.config,
      port: Number(input.port) || this.config.port,
      allowedOrigins:
        input.allowedOrigins?.map((x) => x.trim()).filter(Boolean) ||
        this.config.allowedOrigins,
      language: input.language || this.config.language,
    });
  }
  private normalized(input: Partial<Printer>, current?: Printer): Printer {
    const requestedProfile = input.printProfile;
    const currentProfile = current?.printProfile;
    const languageChanged =
      Boolean(requestedProfile?.language) &&
      requestedProfile?.language !== currentProfile?.language;
    const profileChanged =
      requestedProfile?.profileId !== undefined &&
      requestedProfile.profileId !== currentProfile?.profileId;
    const preservedValidation =
      requestedProfile?.validation === undefined
        ? currentProfile?.validation
        : requestedProfile.validation;
    const validation = profileChanged
      ? undefined
      : languageChanged
        ? preservedValidation?.ascii
          ? { ascii: preservedValidation.ascii }
          : undefined
        : preservedValidation;
    const merged = {
      ...current,
      ...input,
      printProfile: {
        ...(currentProfile || {
          language: defaultPrinterLanguage(),
          mode: "auto" as const,
          profileId: defaultAutomaticProfileId(),
        }),
        ...(requestedProfile || {}),
        profileId:
          requestedProfile?.mode === "custom"
            ? undefined
            : getCatalogProfile(
                requestedProfile?.profileId ||
                  currentProfile?.profileId ||
                  defaultAutomaticProfileId(),
              ).id,
        validation,
        custom:
          requestedProfile?.custom === undefined
            ? currentProfile?.custom
            : requestedProfile.custom,
      },
      connection: {
        ...(current?.connection || {}),
        ...(input.connection || {}),
      },
    } as Printer;
    const selectedProfile = merged.printProfile as PrintProfile;
    const language = selectedProfile.language === "en" ? "en" : "es";
    const mode = selectedProfile.mode === "custom" ? "custom" : "auto";
    const custom = {
      ...defaultCustomProfile(language),
      ...(selectedProfile.custom || {}),
    };
    if (mode === "custom" && !isSupportedEncoding(custom.encoding))
      throw new BridgeError("invalid_request");
    const connection =
      merged.tipo === "network"
        ? {
            host: String(merged.connection.host || "").trim(),
            port: Number(merged.connection.port) || 9100,
          }
        : merged.tipo === "bluetooth"
          ? {
              path: String(merged.connection.path || "").trim(),
              baudRate: Number(merged.connection.baudRate) || 9600,
              channel: String(merged.connection.channel || ""),
            }
          : {
              systemPrinter: String(
                merged.connection.systemPrinter || "",
              ).trim(),
              port: String(merged.connection.port || "").trim(),
              vendorId: String(merged.connection.vendorId || "").trim(),
              productId: String(merged.connection.productId || "").trim(),
            };
    return {
      ...merged,
      id: slug(merged.id || merged.nombre || "printer"),
      nombre: String(merged.nombre || "").trim(),
      reportedModel: String(merged.reportedModel || "").trim() || undefined,
      anchoMm: Number(merged.anchoMm) === 58 ? 58 : 80,
      printProfile: {
        language,
        mode,
        ...(mode === "auto" && selectedProfile.profileId
          ? { profileId: selectedProfile.profileId }
          : {}),
        ...(mode === "auto" && validation ? { validation } : {}),
        ...(mode === "custom"
          ? {
              custom: {
                encoding: String(custom.encoding).toUpperCase(),
                codeTable: Number(custom.codeTable),
                unicodeFallback: custom.unicodeFallback,
                automaticUnicodePolicy: custom.automaticUnicodePolicy,
              },
            }
          : {}),
      },
      abreCajon: Boolean(merged.abreCajon),
      enabled: merged.enabled !== false,
      connection,
    };
  }
  private unique(id: string, skip?: string) {
    let next = id;
    let n = 2;
    while (this.config.printers.some((p) => p.id === next && p.id !== skip))
      next = `${id}-${n++}`;
    return next;
  }
  create(input: Partial<Printer>) {
    const printer = this.normalized(input);
    printer.id = this.unique(printer.id);
    return this.save({
      ...this.config,
      printers: [
        ...this.config.printers,
        printerSchema.parse(printer) as Printer,
      ],
    });
  }
  update(id: string, input: Partial<Printer>) {
    const index = this.config.printers.findIndex((p) => p.id === id);
    if (index < 0)
      throw new BridgeError("printer_not_found", { printerId: id });
    const printer = this.normalized(input, this.config.printers[index]);
    printer.id = this.unique(printer.id, id);
    const printers = [...this.config.printers];
    printers[index] = printerSchema.parse(printer) as Printer;
    return this.save({ ...this.config, printers });
  }
  remove(id: string) {
    const deleted = this.find(id);
    return {
      config: this.save({
        ...this.config,
        printers: this.config.printers.filter((p) => p.id !== id),
      }),
      deleted,
    };
  }
  duplicate(id: string) {
    const source = this.find(id);
    return this.create({
      ...source,
      id: `${source.id}-copy`,
      nombre: source.nombre,
    });
  }
  find(id: string) {
    const printer = this.config.printers.find((p) => p.id === id);
    if (!printer) throw new BridgeError("printer_not_found", { printerId: id });
    return structuredClone(printer);
  }
}
