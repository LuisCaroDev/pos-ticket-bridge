import type { BridgeMessage, LanguageSetting } from "../i18n";
import type { PrintJobBlock, PrintJobV1 } from "./print-job-contract";

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
  /** Local evidence for a character profile verified on this printer. */
  confirmation?: {
    confirmedAt: string;
    testSetName: string;
    candidateId: string;
  };
};
export type PrintProfile = {
  language: PrinterLanguage;
  mode: "auto" | "custom";
  /** Catalog profile chosen for automatic mode. */
  profileId?: string;
  /** Visual confirmations for the selected profile's character coverage. */
  validation?: ProfileValidation;
  custom?: CustomPrintProfile;
  /** Reusable local profile applied to this printer, independent of transport. */
  localProfileId?: string;
};
export type LocalPrintProfile = {
  id: string;
  name: string;
  brand: string;
  model: string;
  language: PrinterLanguage;
  widthMm: 58 | 80;
  /** Custom profiles may be saved manually before they have been verified. */
  values: CustomPrintProfile;
};
export type Printer = {
  id: string;
  nombre: string;
  tipo: PrinterType;
  anchoMm: 58 | 80;
  /** Optional make/model entered for an anonymous compatibility report. */
  reportedBrand?: string;
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
  autoStart: boolean;
  printers: Printer[];
  localProfiles: LocalPrintProfile[];
};
export type PrintBlock = PrintJobBlock;
export type PrintJob = PrintJobV1;
export type Diagnostic = {
  printerId: string;
  /** Identifies diagnostics created while a new printer is still a draft. */
  draftSessionId?: string;
  operation: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  ok: boolean;
  /** Distinguishes confirmed success from transport-only completion. */
  status?: DiagnosticStatus;
  message?: BridgeMessage;
  cause?: string;
  steps: Array<Record<string, unknown>>;
};

export type DiagnosticStatus = "success" | "warning" | "error";

/** Status probes are best-effort because some ESC/POS printers do not answer them. */
export const diagnosticStatusAfterStage = (
  current: DiagnosticStatus = "success",
  stage: string,
): DiagnosticStatus => {
  if (stage === "adapter_status_probe_response") return "success";
  if (
    stage === "adapter_status_probe_timeout" ||
    stage === "adapter_status_probe_error"
  )
    return "warning";
  return current;
};
