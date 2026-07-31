import { z } from "zod";
import type { LanguageSetting } from "@/i18n";
import type { PrinterForm } from "./types";

export type FormErrorCode =
  | "validation_required"
  | "validation_port"
  | "validation_baud_rate"
  | "validation_vendor_id"
  | "validation_product_id"
  | "validation_windows_printer"
  | "validation_model_length"
  | "validation_encoding"
  | "validation_character_table"
  | "validation_origin";

const code = (message: FormErrorCode) => ({ message });
const connectionSchema = z.record(z.string(), z.union([z.string(), z.number()]));

const printerFields = z.object({
  nombre: z.string().trim().min(1, code("validation_required")),
  reportedModel: z.string().max(160, code("validation_model_length")).optional(),
  tipo: z.enum(["network", "usb", "bluetooth"]),
  connection: connectionSchema,
  printProfile: z.object({
    mode: z.enum(["auto", "custom"]),
    custom: z
      .object({
        encoding: z.string(),
        codeTable: z.number(),
      })
      .optional(),
  }),
});

const addConnectionIssues = (
  value: z.infer<typeof printerFields>,
  isWindows: boolean,
  context: z.RefinementCtx,
) => {
  const connection = value.connection;
  const add = (path: string[], message: FormErrorCode) =>
    context.addIssue({ code: "custom", path, message });
  if (value.tipo === "network") {
    if (!String(connection.host || "").trim())
      add(["connection", "host"], "validation_required");
    const port = Number(connection.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      add(["connection", "port"], "validation_port");
  }
  if (value.tipo === "usb") {
    if (isWindows && !String(connection.systemPrinter || "").trim())
      add(["connection", "systemPrinter"], "validation_windows_printer");
    if (!isWindows && !String(connection.vendorId || "").trim())
      add(["connection", "vendorId"], "validation_vendor_id");
    if (!isWindows && !String(connection.productId || "").trim())
      add(["connection", "productId"], "validation_product_id");
  }
  if (value.tipo === "bluetooth") {
    if (!String(connection.path || "").trim())
      add(["connection", "path"], "validation_required");
    const baudRate = Number(connection.baudRate);
    if (!Number.isInteger(baudRate) || baudRate < 1)
      add(["connection", "baudRate"], "validation_baud_rate");
  }
};

export const printerTransportSchema = (isWindows: boolean) =>
  printerFields.pick({ tipo: true, connection: true }).superRefine((value, context) =>
    addConnectionIssues(
      { ...value, nombre: "valid", printProfile: { mode: "auto" } },
      isWindows,
      context,
    ),
  );

export const printerFormSchema = (isWindows: boolean) =>
  printerFields.superRefine((value, context) => {
    addConnectionIssues(value, isWindows, context);
    if (value.printProfile.mode !== "custom") return;
    const custom = value.printProfile.custom;
    if (!custom?.encoding.trim())
      context.addIssue({
        code: "custom",
        path: ["printProfile", "custom", "encoding"],
        message: "validation_encoding",
      });
    if (
      !Number.isInteger(custom?.codeTable) ||
      Number(custom?.codeTable) < 0 ||
      Number(custom?.codeTable) > 255
    )
      context.addIssue({
        code: "custom",
        path: ["printProfile", "custom", "codeTable"],
        message: "validation_character_table",
      });
  });

export type SettingsFormValues = {
  language: LanguageSetting;
  port: string;
  origins: string;
};

const originLines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

export const normalizeOrigins = (value: string) =>
  [...new Set(originLines(value).map((line) => new URL(line).origin))];

export const settingsFormSchema = z
  .object({
    language: z.enum(["system", "es", "en"]),
    port: z
      .string()
      .trim()
      .regex(/^\d+$/, code("validation_port"))
      .refine(
        (value) => Number(value) >= 1 && Number(value) <= 65535,
        code("validation_port"),
      ),
    origins: z.string(),
  })
  .superRefine((value, context) => {
    for (const line of originLines(value.origins)) {
      try {
        const url = new URL(line);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.pathname !== "/" ||
          url.search ||
          url.hash
        )
          throw new Error("not an origin");
      } catch {
        context.addIssue({
          code: "custom",
          path: ["origins"],
          message: "validation_origin",
        });
        return;
      }
    }
  });

export const defaultSettingsValues = (
  language: LanguageSetting,
  port: string,
  origins: string,
): SettingsFormValues => ({ language, port, origins });

export const settingsInput = (values: SettingsFormValues) => ({
  language: values.language,
  port: Number(values.port),
  allowedOrigins: normalizeOrigins(values.origins),
});

export const printerInput = (value: PrinterForm) => value;
