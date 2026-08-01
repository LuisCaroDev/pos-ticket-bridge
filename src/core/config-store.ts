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
import type {
  BridgeConfig,
  LocalPrintProfile,
  Printer,
  PrintProfile,
} from "./types";

const customPrintProfileSchema = z
  .object({
    encoding: z.string().min(1),
    codeTable: z.number().int().min(0).max(255),
    unicodeFallback: z.enum(["auto", "raster", "native"]),
    automaticUnicodePolicy: z.enum(["encoding", "ascii"]).optional(),
    confirmation: z
      .object({
        confirmedAt: z.string().datetime(),
        testSetName: z.string().min(1).max(120),
        candidateId: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
      })
      .strict()
      .optional(),
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
      localProfileId: z
        .string()
        .regex(/^[A-Za-z0-9._-]{1,96}$/)
        .optional(),
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
  reportedBrand: z.string().max(160).optional(),
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
const localPrintProfileSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9._-]{1,96}$/),
    name: z.string().min(1).max(160),
    brand: z.string().min(1).max(160),
    model: z.string().min(1).max(160),
    language: z.enum(["es", "en"]),
    widthMm: z.union([z.literal(58), z.literal(80)]),
    values: customPrintProfileSchema,
  })
  .strict();
const persistedConfigSchema = z
  .object({
    version: z.literal(1),
    port: z.number().int().min(1).max(65535),
    token: z.string().min(1),
    allowedOrigins: z.array(z.string()),
    language: z.enum(["system", "es", "en"]),
    printers: z.array(z.unknown()),
    localProfiles: z.array(z.unknown()).optional(),
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
    localProfiles: z.array(localPrintProfileSchema),
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
const localProfileIdentity = (
  brand: string,
  model: string,
  widthMm: number,
  language: LocalPrintProfile["language"],
) =>
  `${brand.trim().toLocaleLowerCase()}::${model.trim().toLocaleLowerCase()}::${widthMm}::${language}`;
const localProfileId = (
  brand: string,
  model: string,
  widthMm: number,
  language: LocalPrintProfile["language"],
) => `local-${slug(`${brand}-${model}-${widthMm}mm`).slice(0, 87)}-${language}`;
const localProfileFromPrinter = (
  printer: Printer,
  id = localProfileId(
    String(printer.reportedBrand || ""),
    String(printer.reportedModel || ""),
    printer.anchoMm,
    printer.printProfile.language,
  ),
): LocalPrintProfile | undefined => {
  const custom =
    printer.printProfile.mode === "custom"
      ? printer.printProfile.custom
      : undefined;
  const brand = String(printer.reportedBrand || "").trim();
  const model = String(printer.reportedModel || "").trim();
  if (!brand || !model || !custom) return undefined;
  return {
    id,
    name: `${brand} ${model}`,
    brand,
    model,
    language: printer.printProfile.language,
    widthMm: printer.anchoMm,
    values: { ...custom },
  };
};
const importedLocalProfileSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("pos-ticket-bridge-local-profile"),
    brand: z.string().trim().min(1).max(160),
    model: z.string().trim().min(1).max(160),
    widthMm: z.union([z.literal(58), z.literal(80)]),
    encoding: z.string().trim().min(1).max(64),
    codeTable: z.number().int().min(0).max(255),
    unicodeFallback: z.enum(["auto", "raster", "native"]),
    confirmedAt: z.string().datetime().optional(),
    testSet: z
      .object({
        name: z.string().trim().min(1).max(120),
        candidateId: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
      })
      .strict()
      .optional(),
  })
  .strict();
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
  localProfiles: [],
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
      const localProfiles = (persisted.localProfiles || []).flatMap(
        (profile) => {
          const result = localPrintProfileSchema.safeParse(profile);
          return result.success ? [result.data] : [];
        },
      );
      const migratedPrinters = printers.map((printer) => {
        const localProfile = localProfileFromPrinter(printer);
        if (!localProfile) return printer;
        const profile =
          localProfiles.find(
            (item) =>
              localProfileIdentity(
                item.brand,
                item.model,
                item.widthMm,
                item.language,
              ) ===
              localProfileIdentity(
                localProfile.brand,
                localProfile.model,
                localProfile.widthMm,
                localProfile.language,
              ),
          ) || localProfile;
        if (!localProfiles.some((item) => item.id === profile.id))
          localProfiles.push(profile);
        return {
          ...printer,
          printProfile: {
            ...printer.printProfile,
            localProfileId: profile.id,
          },
        };
      });
      const synchronizedPrinters = migratedPrinters.map((printer) =>
        this.applyLocalProfile(printer, localProfiles),
      );
      const next = configSchema.parse({
        ...persisted,
        printers: synchronizedPrinters,
        localProfiles,
      }) as BridgeConfig;

      if (
        printers.length !== persisted.printers.length ||
        !persisted.localProfiles ||
        JSON.stringify(synchronizedPrinters) !== JSON.stringify(printers)
      )
        this.write(next);
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
  private uniqueLocalProfileId(base: string) {
    let next = base;
    let n = 2;
    while (this.config.localProfiles.some((profile) => profile.id === next))
      next = `${base}-${n++}`;
    return next;
  }
  private applyLocalProfile(
    printer: Printer,
    profiles = this.config.localProfiles,
  ): Printer {
    if (printer.printProfile.mode !== "custom") return printer;
    const profile = profiles.find(
      (item) => item.id === printer.printProfile.localProfileId,
    );
    if (!profile) return printer;
    return {
      ...printer,
      anchoMm: profile.widthMm,
      reportedBrand: profile.brand,
      reportedModel: profile.model,
      printProfile: {
        language: profile.language,
        mode: "custom",
        custom: { ...profile.values },
        localProfileId: profile.id,
      },
    };
  }
  private normalized(input: Partial<Printer>, current?: Printer): Printer {
    const requestedProfile = input.printProfile;
    const currentProfile = current?.printProfile;
    const legacyValidation =
      requestedProfile?.validation === undefined
        ? currentProfile?.validation
        : requestedProfile.validation;
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
        validation: legacyValidation,
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
    return this.applyLocalProfile({
      ...merged,
      id: slug(merged.id || merged.nombre || "printer"),
      nombre: String(merged.nombre || "").trim(),
      reportedBrand: String(merged.reportedBrand || "").trim() || undefined,
      reportedModel: String(merged.reportedModel || "").trim() || undefined,
      anchoMm: Number(merged.anchoMm) === 58 ? 58 : 80,
      printProfile: {
        language,
        mode,
        ...(mode === "auto" && selectedProfile.profileId
          ? { profileId: selectedProfile.profileId }
          : {}),
        ...(mode === "auto" && legacyValidation
          ? { validation: legacyValidation }
          : {}),
        ...(mode === "custom"
          ? {
              custom: {
                encoding: String(custom.encoding).toUpperCase(),
                codeTable: Number(custom.codeTable),
                unicodeFallback: custom.unicodeFallback,
                automaticUnicodePolicy: custom.automaticUnicodePolicy,
                confirmation: custom.confirmation,
              },
              ...(selectedProfile.localProfileId
                ? { localProfileId: selectedProfile.localProfileId }
                : {}),
            }
          : {}),
      },
      abreCajon: Boolean(merged.abreCajon),
      enabled: merged.enabled !== false,
      connection,
    });
  }
  private unique(id: string, skip?: string) {
    let next = id;
    let n = 2;
    while (this.config.printers.some((p) => p.id === next && p.id !== skip))
      next = `${id}-${n++}`;
    return next;
  }
  create(input: Partial<Printer>) {
    const normalized = this.normalized(input);
    normalized.id = this.unique(normalized.id);
    return this.save({
      ...this.config,
      printers: [
        ...this.config.printers,
        printerSchema.parse(normalized) as Printer,
      ],
    });
  }
  update(id: string, input: Partial<Printer>) {
    const index = this.config.printers.findIndex((p) => p.id === id);
    if (index < 0)
      throw new BridgeError("printer_not_found", { printerId: id });
    const normalized = this.normalized(input, this.config.printers[index]);
    normalized.id = this.unique(normalized.id, id);
    const printers = [...this.config.printers];
    printers[index] = printerSchema.parse(normalized) as Printer;
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
  importLocalProfile(input: unknown) {
    const parsed = importedLocalProfileSchema.safeParse(input);
    if (!parsed.success || !isSupportedEncoding(parsed.data.encoding))
      throw new BridgeError("invalid_request");
    const value = parsed.data;
    const existing = this.config.localProfiles.find(
      (profile) =>
        localProfileIdentity(
          profile.brand,
          profile.model,
          profile.widthMm,
          profile.language,
        ) ===
        localProfileIdentity(value.brand, value.model, value.widthMm, "es"),
    );
    const id =
      existing?.id ||
      this.uniqueLocalProfileId(
        localProfileId(value.brand, value.model, value.widthMm, "es"),
      );
    const profile: LocalPrintProfile = {
      id,
      name: `${value.brand} ${value.model}`,
      brand: value.brand,
      model: value.model,
      language: "es",
      widthMm: value.widthMm,
      values: {
        encoding: value.encoding.toUpperCase(),
        codeTable: value.codeTable,
        unicodeFallback: value.unicodeFallback,
        automaticUnicodePolicy: "encoding",
        ...(value.confirmedAt && value.testSet
          ? {
              confirmation: {
                confirmedAt: value.confirmedAt,
                testSetName: value.testSet.name,
                candidateId: value.testSet.candidateId,
              },
            }
          : {}),
      },
    };
    const localProfiles = [
      ...this.config.localProfiles.filter((item) => item.id !== id),
      profile,
    ];
    this.save({
      ...this.config,
      localProfiles,
      printers: this.config.printers.map((printer) =>
        this.applyLocalProfile(printer, localProfiles),
      ),
    });
    return profile;
  }

  saveLocalProfile(input: unknown) {
    const parsed = localPrintProfileSchema
      .omit({ id: true, name: true })
      .safeParse(input);
    if (!parsed.success || !isSupportedEncoding(parsed.data.values.encoding))
      throw new BridgeError("invalid_request");
    const value = parsed.data;
    const existing = this.config.localProfiles.find(
      (profile) =>
        localProfileIdentity(
          profile.brand,
          profile.model,
          profile.widthMm,
          profile.language,
        ) ===
        localProfileIdentity(
          value.brand,
          value.model,
          value.widthMm,
          value.language,
        ),
    );
    const id =
      existing?.id ||
      this.uniqueLocalProfileId(
        localProfileId(value.brand, value.model, value.widthMm, value.language),
      );
    const profile: LocalPrintProfile = {
      id,
      name: `${value.brand} ${value.model}`,
      ...value,
      values: {
        ...value.values,
        encoding: value.values.encoding.toUpperCase(),
      },
    };
    const localProfiles = [
      ...this.config.localProfiles.filter((item) => item.id !== id),
      profile,
    ];
    this.save({
      ...this.config,
      localProfiles,
      printers: this.config.printers.map((printer) =>
        this.applyLocalProfile(printer, localProfiles),
      ),
    });
    return profile;
  }

  deleteLocalProfile(id: string) {
    const localProfiles = this.config.localProfiles.filter(
      (profile) => profile.id !== id,
    );
    const detachedPrinterIds: string[] = [];
    const printers = this.config.printers.map((printer) => {
      if (
        printer.printProfile.mode !== "custom" ||
        printer.printProfile.localProfileId !== id
      )
        return printer;
      detachedPrinterIds.push(printer.id);
      const printProfile = { ...printer.printProfile };
      delete printProfile.localProfileId;
      return { ...printer, printProfile };
    });
    this.save({ ...this.config, localProfiles, printers });
    return { id, detachedPrinterIds };
  }
}
