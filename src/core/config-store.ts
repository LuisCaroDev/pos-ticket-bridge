import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { BridgeError } from "../i18n";
import type { BridgeConfig, Printer } from "./types";

const printerSchema = z.object({
  id: z.string().min(1),
  nombre: z.string().min(1),
  tipo: z.enum(["network", "usb", "bluetooth"]),
  anchoMm: z.union([z.literal(58), z.literal(80)]).default(80),
  codepage: z.string().default("CP850"),
  abreCajon: z.boolean().default(false),
  enabled: z.boolean().default(true),
  connection: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.undefined()]),
  ),
});
const configSchema = z.object({
  version: z.literal(1),
  port: z.number().int().min(1).max(65535),
  token: z.string().min(1),
  allowedOrigins: z.array(z.string()),
  language: z.enum(["system", "es", "en"]).default("system"),
  printers: z.array(printerSchema),
});
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
    const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    return configSchema.parse(raw) as BridgeConfig;
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
    const merged = {
      ...current,
      ...input,
      connection: {
        ...(current?.connection || {}),
        ...(input.connection || {}),
      },
    } as Printer;
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
      anchoMm: Number(merged.anchoMm) === 58 ? 58 : 80,
      codepage: String(merged.codepage || "CP850").toUpperCase(),
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
    if (index < 0) throw new BridgeError("printer_not_found", { printerId: id });
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
