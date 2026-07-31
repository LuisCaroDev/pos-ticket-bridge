/* eslint-disable @typescript-eslint/no-var-requires */
import { BridgeError, type TestPrintTexts } from "../i18n";
import type { PrintJob, Printer } from "./types";
import { createUsbAdapter } from "./transports/usb";
const escpos: any = require("@node-escpos/core");
const NetworkAdapter: any = require("@node-escpos/network-adapter");
const SerialAdapter: any = require("@node-escpos/serialport-adapter");
type Hooks = {
  onEvent?: (stage: string, detail?: Record<string, unknown>) => void;
};
const emit = (
  hooks: Hooks,
  stage: string,
  detail: Record<string, unknown> = {},
) => hooks.onEvent?.(stage, detail);

async function adapter(printer: Printer, hooks: Hooks) {
  if (printer.tipo === "network") {
    emit(hooks, "adapter_prepare", { transport: "network" });
    return new NetworkAdapter(
      String(printer.connection.host),
      Number(printer.connection.port) || 9100,
      5000,
    );
  }
  if (printer.tipo === "bluetooth") {
    emit(hooks, "adapter_prepare", {
      transport: "serial",
      path: printer.connection.path,
    });
    return new SerialAdapter(String(printer.connection.path), {
      baudRate: Number(printer.connection.baudRate) || 9600,
    });
  }
  return createUsbAdapter(printer, hooks);
}
const align = (printer: any, value: unknown) =>
  printer.align(value === "center" ? "ct" : value === "right" ? "rt" : "lt");
async function loadImage(source: string) {
  if (source.startsWith("data:")) {
    const match = source.match(/^data:([^;,]+);base64,(.+)$/);
    if (!match) throw new BridgeError("invalid_request");
    return escpos.Image.load(Buffer.from(match[2], "base64"), match[1]);
  }
  const response = await fetch(source);
  if (!response.ok) throw new BridgeError("operation_failed");
  return escpos.Image.load(
    new Uint8Array(await response.arrayBuffer()),
    response.headers.get("content-type") || undefined,
  );
}
async function render(
  printer: any,
  job: PrintJob,
  hooks: Hooks,
  imageOmitted?: string,
) {
  for (const block of job.blocks || []) {
    const value: any = block;
    switch (block.type) {
      case "text":
        align(printer, value.align);
        printer.style(Boolean(value.bold), false, value.underline ? 1 : 0);
        printer.size(Number(value.size) || 1, Number(value.size) || 1);
        printer.println(String(value.content || ""));
        printer.style(false, false, 0);
        printer.size(1, 1);
        break;
      case "table-row":
        printer.tableCustom([
          {
            text: String(value.left || ""),
            width: 0.65,
            align: value.align || "left",
            style: value.bold ? "b" : "normal",
          },
          {
            text: String(value.right || ""),
            width: 0.35,
            align: "right",
            style: value.bold ? "b" : "normal",
          },
        ]);
        break;
      case "separator":
        printer.drawLine(value.style === "dotted" ? "." : "-");
        break;
      case "feed":
        printer.feed(Number(value.lines) || 1);
        break;
      case "cut":
        printer.cut(Boolean(value.partial));
        break;
      case "qr":
        align(printer, "center");
        printer.qrcode(
          String(value.content || ""),
          undefined,
          undefined,
          Number(value.size) || 6,
        );
        break;
      case "barcode":
        align(printer, "center");
        printer.barcode(
          String(value.content || ""),
          value.format || "CODE128",
          { width: 2, height: 80, position: "blw" },
        );
        break;
      case "open-drawer":
        printer.cashdraw(2);
        break;
      case "image":
        try {
          align(printer, "center");
          await printer.image(
            await loadImage(String(value.url || value.src || "")),
          );
        } catch (error) {
          emit(hooks, "image_omitted", { error: (error as Error).message });
          if (imageOmitted) printer.println(imageOmitted);
        }
        break;
      default:
        throw new BridgeError("unsupported_print_block", { type: block.type });
    }
  }
}
async function withPrinter(
  definition: Printer,
  work: (printer: any) => Promise<void>,
  hooks: Hooks = {},
) {
  const transport = await adapter(definition, hooks);
  const printer = new escpos.Printer(transport, {
    encoding: definition.codepage || "CP850",
  });
  await new Promise<void>((resolve, reject) =>
    transport.open((error: Error) => (error ? reject(error) : resolve())),
  );
  try {
    emit(hooks, "adapter_open_ok");
    await work(printer);
    await printer.flush();
  } finally {
    await printer.close().catch(() => undefined);
  }
}
export const printJob = (
  definition: Printer,
  job: PrintJob,
  hooks: Hooks = {},
  imageOmitted?: string,
) =>
  withPrinter(
    definition,
    (printer) => render(printer, job, hooks, imageOmitted),
    hooks,
  );
export const openDrawer = (definition: Printer, hooks: Hooks = {}) =>
  withPrinter(
    definition,
    async (printer) => {
      emit(hooks, "drawer_pulse");
      printer.cashdraw(2);
    },
    hooks,
  );
export const testPrint = (
  definition: Printer,
  texts: TestPrintTexts,
  hooks: Hooks = {},
) =>
  printJob(
    definition,
    {
      version: 1,
      widthMm: definition.anchoMm,
      reason: "test",
      blocks: [
        {
          type: "text",
          content: texts.title,
          align: "center",
          bold: true,
          size: 2,
        },
        { type: "text", content: texts.subtitle, align: "center" },
        { type: "separator", style: "solid" },
        { type: "text", content: texts.printer },
        { type: "text", content: new Date().toLocaleString() },
        { type: "feed", lines: 3 },
        { type: "cut" },
      ],
    },
    hooks,
    texts.imageOmitted,
  );
