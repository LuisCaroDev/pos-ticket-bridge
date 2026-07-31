import type { BridgeMessage, LanguageSetting } from "../i18n";

export type PrinterType = "network" | "usb" | "bluetooth";
export type PrinterLanguage = "es" | "en";
export type UnicodeFallback = "auto" | "raster" | "native";
export type PrinterCharacterCoverage = "ascii" | "spanish-latin";
export type ProfileValidation = Partial<
  Record<
    PrinterCharacterCoverage,
    { catalogVersion: number; confirmedAt: string }
  >
>;
export type CustomPrintProfile = {
  encoding: string;
  codeTable: number;
  unicodeFallback: UnicodeFallback;
  /** Keeps the automatic profile's safe Unicode rule after customization. */
  automaticUnicodePolicy?: "encoding" | "ascii";
};
export type PrintProfile = {
  language: PrinterLanguage;
  mode: "auto" | "custom";
  /** Catalog profile chosen for automatic mode. */
  profileId?: string;
  /** Visual confirmations for the selected profile's character coverage. */
  validation?: ProfileValidation;
  custom?: CustomPrintProfile;
};
export type Printer = {
  id: string;
  nombre: string;
  tipo: PrinterType;
  anchoMm: 58 | 80;
  /** Optional make/model entered for an anonymous compatibility report. */
  reportedModel?: string;
  printProfile: PrintProfile;
  abreCajon: boolean;
  enabled: boolean;
  connection: Record<string, string | number | undefined>;
};
export type BridgeConfig = {
  version: 1;
  port: number;
  token: string;
  allowedOrigins: string[];
  language: LanguageSetting;
  printers: Printer[];
};
export type PrintBlock = {
  type:
    | "text"
    | "table-row"
    | "separator"
    | "feed"
    | "cut"
    | "qr"
    | "barcode"
    | "open-drawer"
    | "image";
  [key: string]: unknown;
};
export type PrintJob = {
  version: number;
  widthMm?: 58 | 80;
  reason?: string;
  jobId?: string;
  blocks: PrintBlock[];
};
export type Diagnostic = {
  printerId: string;
  /** Identifies diagnostics created while a new printer is still a draft. */
  draftSessionId?: string;
  operation: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  ok: boolean;
  message?: BridgeMessage;
  cause?: string;
  steps: Array<Record<string, unknown>>;
};
