/* eslint-disable @typescript-eslint/no-var-requires, no-useless-escape */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PrintJob, Printer } from "./types";
const exec = promisify(execFile);
const escpos: any = require("@node-escpos/core");
const NetworkAdapter: any = require("@node-escpos/network-adapter");
const SerialAdapter: any = require("@node-escpos/serialport-adapter");
const { Adapter }: any = require("@node-escpos/adapter");
const { usb }: any = require("usb");
const hex = (value: unknown) =>
  Number.parseInt(String(value || "").replace(/^0x/i, ""), 16);
type Hooks = {
  onEvent?: (stage: string, detail?: Record<string, unknown>) => void;
};
const emit = (
  hooks: Hooks,
  stage: string,
  detail: Record<string, unknown> = {},
) => hooks.onEvent?.(stage, detail);

async function rawWindowsPrint(printerName: string, data: Buffer) {
  if (process.platform !== "win32")
    throw new Error(
      "El spooler de Windows no está disponible en esta plataforma",
    );
  const temp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pos-ticket-"));
  const bytes = path.join(temp, "job.bin");
  const script = path.join(temp, "raw.ps1");
  const source = `param([string]$Name,[string]$Data)\nAdd-Type -TypeDefinition @"\nusing System; using System.Runtime.InteropServices; public class Raw { [DllImport(\"winspool.drv\",SetLastError=true,CharSet=CharSet.Ansi)] public static extern bool OpenPrinter(string n,out IntPtr h,IntPtr d); [DllImport(\"winspool.drv\",SetLastError=true)] public static extern bool ClosePrinter(IntPtr h); [DllImport(\"winspool.drv\",SetLastError=true,CharSet=CharSet.Ansi)] public static extern bool StartDocPrinter(IntPtr h,int l,IntPtr d); [DllImport(\"winspool.drv\",SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h); [DllImport(\"winspool.drv\",SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h); [DllImport(\"winspool.drv\",SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h); [DllImport(\"winspool.drv\",SetLastError=true)] public static extern bool WritePrinter(IntPtr h,byte[] b,int c,out int w); public static void Send(string n,string p){ IntPtr h; if(!OpenPrinter(n,out h,IntPtr.Zero)) throw new Exception(\"No se pudo abrir la impresora\"); try { if(!StartDocPrinter(h,1,IntPtr.Zero)) throw new Exception(\"No se pudo iniciar el trabajo\"); StartPagePrinter(h); byte[] b=System.IO.File.ReadAllBytes(p); int w; if(!WritePrinter(h,b,b.Length,out w)||w!=b.Length) throw new Exception(\"No se enviaron todos los bytes\"); EndPagePrinter(h); EndDocPrinter(h); } finally { ClosePrinter(h); } } }\n"@\n[Raw]::Send($Name,$Data)`;
  try {
    await fs.promises.writeFile(bytes, data);
    await fs.promises.writeFile(script, source, "utf8");
    await exec("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      script,
      "-Name",
      printerName,
      "-Data",
      bytes,
    ]);
  } finally {
    await fs.promises.rm(temp, { recursive: true, force: true });
  }
}

class WindowsSpoolerAdapter extends Adapter {
  constructor(private readonly printerName: string) {
    super();
  }
  async open(callback?: (error?: Error | null) => void) {
    try {
      this.emit("connect", this.printerName);
      callback?.(null);
    } catch (error) {
      callback?.(error as Error);
    }
    return this;
  }
  write(data: Buffer, callback?: (error?: Error | null) => void) {
    rawWindowsPrint(this.printerName, Buffer.from(data))
      .then(() => {
        this.emit("data", data);
        callback?.(null);
      })
      .catch((error) => callback?.(error));
    return this;
  }
  close(callback?: (error?: Error | null) => void) {
    this.emit("close");
    callback?.(null);
    return this;
  }
}

class UsbAdapter extends Adapter {
  private device: any;
  private interfaceNumber?: number;
  private endpointNumber?: number;
  constructor(
    private readonly vendorId: number,
    private readonly productId: number,
  ) {
    super();
  }
  open(callback?: (error?: Error | null) => void) {
    void this.connect(callback);
    return this;
  }
  private async connect(callback?: (error?: Error | null) => void) {
    try {
      this.device = await usb.findDeviceByIds(this.vendorId, this.productId);
      if (!this.device)
        throw new Error(
          `No se encontró el dispositivo USB ${this.vendorId.toString(16)}:${this.productId.toString(16)}`,
        );
      await this.device.open();
      const usbInterface = this.device.configurations
        .flatMap((configuration: any) => configuration.interfaces)
        .find(
          (item: any) =>
            item.alternate?.interfaceClass === 7 ||
            item.alternates?.some(
              (alternate: any) => alternate.interfaceClass === 7,
            ),
        );
      const alternate =
        usbInterface?.alternate?.interfaceClass === 7
          ? usbInterface.alternate
          : usbInterface?.alternates?.find(
              (item: any) => item.interfaceClass === 7,
            );
      const endpoint = alternate?.endpoints?.find(
        (item: any) => item.direction === "out",
      );
      if (!usbInterface || !endpoint)
        throw new Error(
          "El dispositivo USB no expone una interfaz de impresión compatible",
        );
      this.interfaceNumber = usbInterface.interfaceNumber;
      this.endpointNumber = endpoint.endpointNumber;
      await this.device.claimInterface(this.interfaceNumber);
      this.emit("connect", this.device);
      callback?.(null);
    } catch (error) {
      await this.device?.close().catch(() => undefined);
      callback?.(error as Error);
    }
  }
  write(data: Buffer, callback?: (error?: Error | null) => void) {
    void this.transfer(Buffer.from(data), callback);
    return this;
  }
  private async transfer(
    data: Buffer,
    callback?: (error?: Error | null) => void,
  ) {
    try {
      if (!this.device || this.endpointNumber === undefined)
        throw new Error("La impresora USB no está conectada");
      await this.device.nativeTransferOut(
        this.endpointNumber,
        5000,
        new Uint8Array(data),
      );
      this.emit("data", data);
      callback?.(null);
    } catch (error) {
      callback?.(error as Error);
    }
  }
  close(callback?: (error?: Error | null) => void) {
    void this.disconnect(callback);
    return this;
  }
  private async disconnect(callback?: (error?: Error | null) => void) {
    try {
      if (this.device && this.interfaceNumber !== undefined)
        await this.device.releaseInterface(this.interfaceNumber);
      await this.device?.close();
      this.emit("close");
      callback?.(null);
    } catch (error) {
      callback?.(error as Error);
    }
  }
}

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
  if (process.platform === "win32" && printer.connection.systemPrinter) {
    emit(hooks, "adapter_prepare", { transport: "windows-spooler" });
    return new WindowsSpoolerAdapter(String(printer.connection.systemPrinter));
  }
  const vendorId = hex(printer.connection.vendorId);
  const productId = hex(printer.connection.productId);
  if (!vendorId || !productId)
    throw new Error(`Impresora USB ${printer.id}: falta vendorId y productId`);
  emit(hooks, "adapter_prepare", {
    transport: "usb",
    vendorId: printer.connection.vendorId,
    productId: printer.connection.productId,
  });
  return new UsbAdapter(vendorId, productId);
}
const align = (printer: any, value: unknown) =>
  printer.align(value === "center" ? "ct" : value === "right" ? "rt" : "lt");
async function loadImage(source: string) {
  if (source.startsWith("data:")) {
    const match = source.match(/^data:([^;,]+);base64,(.+)$/);
    if (!match) throw new Error("Formato de imagen data URL no soportado");
    return escpos.Image.load(Buffer.from(match[2], "base64"), match[1]);
  }
  const response = await fetch(source);
  if (!response.ok)
    throw new Error(`No se pudo descargar la imagen: HTTP ${response.status}`);
  return escpos.Image.load(
    new Uint8Array(await response.arrayBuffer()),
    response.headers.get("content-type") || undefined,
  );
}
async function render(printer: any, job: PrintJob, hooks: Hooks) {
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
          printer.println("[Imagen omitida]");
        }
        break;
      default:
        throw new Error(`Bloque de impresión no soportado: ${block.type}`);
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
) => withPrinter(definition, (printer) => render(printer, job, hooks), hooks);
export const openDrawer = (definition: Printer, hooks: Hooks = {}) =>
  withPrinter(
    definition,
    async (printer) => {
      emit(hooks, "drawer_pulse");
      printer.cashdraw(2);
    },
    hooks,
  );
export const testPrint = (definition: Printer, hooks: Hooks = {}) =>
  printJob(
    definition,
    {
      version: 1,
      widthMm: definition.anchoMm,
      reason: "test",
      blocks: [
        {
          type: "text",
          content: "POS TICKET BRIDGE",
          align: "center",
          bold: true,
          size: 2,
        },
        { type: "text", content: "Prueba de impresión", align: "center" },
        { type: "separator", style: "solid" },
        { type: "text", content: `Impresora: ${definition.nombre}` },
        { type: "text", content: new Date().toLocaleString() },
        { type: "feed", lines: 3 },
        { type: "cut" },
      ],
    },
    hooks,
  );
