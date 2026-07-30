import type { Printer } from "../types";
import { createDirectUsbAdapter } from "./direct-usb";
import { createWindowsSpoolerAdapter } from "./windows-spooler";

export type TransportHooks = {
  onEvent?: (stage: string, detail?: Record<string, unknown>) => void;
};

const emit = (
  hooks: TransportHooks,
  stage: string,
  detail: Record<string, unknown> = {},
) => hooks.onEvent?.(stage, detail);

const hex = (value: unknown) =>
  Number.parseInt(String(value || "").replace(/^0x/i, ""), 16);

function createMacUsbAdapter(printer: Printer, hooks: TransportHooks) {
  // Punto de extensión para CUPS (`lp -d <cola> -o raw`). Mientras tanto se
  // conserva la ruta USB directa que ya usaba macOS.
  const vendorId = hex(printer.connection.vendorId);
  const productId = hex(printer.connection.productId);
  if (!vendorId || !productId)
    throw new Error(`Impresora USB ${printer.id}: falta vendorId y productId`);
  emit(hooks, "adapter_prepare", {
    transport: "macos-direct-usb",
    vendorId: printer.connection.vendorId,
    productId: printer.connection.productId,
  });
  return createDirectUsbAdapter(vendorId, productId);
}

function createWindowsUsbAdapter(printer: Printer, hooks: TransportHooks) {
  const systemPrinter = String(printer.connection.systemPrinter || "").trim();
  if (!systemPrinter)
    throw new Error(
      `Impresora USB ${printer.id}: selecciona una impresora instalada en Windows`,
    );
  emit(hooks, "adapter_prepare", { transport: "windows-spooler" });
  return createWindowsSpoolerAdapter(systemPrinter);
}

function createOtherUsbAdapter(printer: Printer, hooks: TransportHooks) {
  const vendorId = hex(printer.connection.vendorId);
  const productId = hex(printer.connection.productId);
  if (!vendorId || !productId)
    throw new Error(`Impresora USB ${printer.id}: falta vendorId y productId`);
  emit(hooks, "adapter_prepare", {
    transport: "direct-usb",
    vendorId: printer.connection.vendorId,
    productId: printer.connection.productId,
  });
  return createDirectUsbAdapter(vendorId, productId);
}

export function createUsbAdapter(printer: Printer, hooks: TransportHooks) {
  if (process.platform === "win32")
    return createWindowsUsbAdapter(printer, hooks);
  if (process.platform === "darwin") return createMacUsbAdapter(printer, hooks);
  return createOtherUsbAdapter(printer, hooks);
}
