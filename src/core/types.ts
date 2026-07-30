export type PrinterType = "network" | "usb" | "bluetooth";
export type Printer = {
  id: string;
  nombre: string;
  tipo: PrinterType;
  anchoMm: 58 | 80;
  codepage: string;
  abreCajon: boolean;
  enabled: boolean;
  connection: Record<string, string | number | undefined>;
};
export type BridgeConfig = {
  version: 1;
  port: number;
  token: string;
  allowedOrigins: string[];
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
  operation: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  ok: boolean;
  message?: string;
  steps: Array<Record<string, unknown>>;
};
