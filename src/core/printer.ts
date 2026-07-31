/* eslint-disable @typescript-eslint/no-var-requires */
import { BrowserWindow } from "electron";
import { BridgeError, type TestPrintTexts } from "../i18n";
import {
  resolvePrintProfile,
  shouldRasterizeText,
  type ResolvedPrintProfile,
} from "./printer-profiles";
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

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const linesFor = (value: string, columns: number) =>
  value
    .replace(/\r/g, "")
    .split("\n")
    .flatMap((line) => {
      if (!line) return [""];
      const lines: string[] = [];
      for (let offset = 0; offset < line.length; offset += columns)
        lines.push(line.slice(offset, offset + columns));
      return lines;
    });

const trimToColumns = (value: string, columns: number) =>
  value.length > columns
    ? `${value.slice(0, Math.max(0, columns - 1))}…`
    : value;

const alignCell = (
  value: string,
  columns: number,
  align: "left" | "center" | "right",
) => {
  const text = trimToColumns(value, columns);
  const remaining = Math.max(0, columns - text.length);
  if (align === "right") return `${" ".repeat(remaining)}${text}`;
  if (align === "center") {
    const start = Math.floor(remaining / 2);
    return `${" ".repeat(start)}${text}${" ".repeat(remaining - start)}`;
  }
  return `${text}${" ".repeat(remaining)}`;
};

type RasterLine = {
  text: string;
  align: "left" | "center" | "right";
  bold?: boolean;
  underline?: boolean;
  size?: number;
};

type RasterDocument = {
  svg: string;
  width: number;
  height: number;
};

const rasterDocument = (
  profile: ResolvedPrintProfile,
  lines: RasterLine[],
): RasterDocument => {
  const rendered = lines.flatMap((line) => {
    const size = Math.min(2, Math.max(1, Number(line.size) || 1));
    const columns = Math.max(1, Math.floor(profile.columns / size));
    return linesFor(line.text, columns).map((text) => ({
      ...line,
      text,
      size,
    }));
  });
  const lineHeight = (line: (typeof rendered)[number]) => 24 * line.size;
  const height = Math.max(
    24,
    rendered.reduce((total, line) => total + lineHeight(line), 0),
  );
  let y = 0;
  const text = rendered
    .map((line) => {
      const heightForLine = lineHeight(line);
      const x =
        line.align === "center"
          ? profile.rasterWidth / 2
          : line.align === "right"
            ? profile.rasterWidth - 1
            : 0;
      const anchor =
        line.align === "center"
          ? "middle"
          : line.align === "right"
            ? "end"
            : "start";
      y += heightForLine;
      return `<text x="${x}" y="${y - 4}" text-anchor="${anchor}" xml:space="preserve" font-family="monospace" font-size="${20 * line.size}" font-weight="${line.bold ? "700" : "400"}"${line.underline ? ' text-decoration="underline"' : ""}>${escapeXml(line.text)}</text>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${profile.rasterWidth}" height="${height}" viewBox="0 0 ${profile.rasterWidth} ${height}"><rect width="100%" height="100%" fill="white"/><g fill="black">${text}</g></svg>`;
  return { svg, width: profile.rasterWidth, height };
};

async function renderRasterDocument(document: RasterDocument) {
  const page = new BrowserWindow({
    show: false,
    frame: false,
    useContentSize: true,
    paintWhenInitiallyHidden: true,
    width: document.width,
    height: document.height,
    backgroundColor: "#ffffff",
    webPreferences: { sandbox: true },
  });
  try {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;overflow:hidden;background:white}</style></head><body>${document.svg}</body></html>`;
    await page.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    );
    const image = await page.webContents.capturePage({
      x: 0,
      y: 0,
      width: document.width,
      height: document.height,
    });
    if (image.isEmpty()) throw new Error("Chromium rendered an empty bitmap.");
    return image.resize({ width: document.width, height: document.height });
  } finally {
    if (!page.isDestroyed()) page.destroy();
  }
}

async function rasterLines(
  printer: any,
  profile: ResolvedPrintProfile,
  lines: RasterLine[],
  hooks: Hooks,
) {
  const document = rasterDocument(profile, lines);
  emit(hooks, "raster_prepare", {
    command: "GS v 0",
    width: profile.rasterWidth,
    lineCount: lines.length,
  });
  try {
    const image = await renderRasterDocument(document);
    const size = image.getSize();
    emit(hooks, "raster_image_ready", {
      width: size.width,
      height: size.height,
    });
    const escposImage = await escpos.Image.load(image.toPNG(), "image/png");
    emit(hooks, "raster_decoded", { width: size.width, height: size.height });
    // `Printer.image()` sends the legacy ESC * command one 24-dot band at a
    // time. Several generic POS printers accept the beginning of that command
    // but never finish it, leaving the rest of the ticket queued. GS v 0 is the
    // standard raster command and sends this Unicode fallback as one bitmap.
    printer.raster(escposImage);
    emit(hooks, "raster_queued", { command: "GS v 0" });
  } catch (error) {
    emit(hooks, "raster_error", {
      cause: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function renderText(
  printer: any,
  value: any,
  profile: ResolvedPrintProfile,
  hooks: Hooks,
) {
  const content = String(value.content || "");
  const alignValue =
    value.align === "center" || value.align === "right" ? value.align : "left";
  if (shouldRasterizeText(profile, content)) {
    await rasterLines(printer, profile, [
      {
        text: content,
        align: alignValue,
        bold: Boolean(value.bold),
        underline: Boolean(value.underline),
        size: Number(value.size) || 1,
      },
    ], hooks);
    return;
  }
  align(printer, value.align);
  printer.style(Boolean(value.bold), false, value.underline ? 1 : 0);
  printer.size(Number(value.size) || 1, Number(value.size) || 1);
  // `println()` writes its JavaScript string directly, which makes Node turn
  // it into UTF-8 bytes. `text()` is the escpos API that encodes the value
  // using `printer.encode(...)`, selected from the resolved profile above.
  // Sending UTF-8 while ESC t is active is what produced two incorrect glyphs
  // for each accented character on the physical printer.
  printer.text(content);
  printer.style(false, false, 0);
  printer.size(1, 1);
}

async function renderTableRow(
  printer: any,
  value: any,
  profile: ResolvedPrintProfile,
  hooks: Hooks,
) {
  const left = String(value.left || "");
  const right = String(value.right || "");
  if (shouldRasterizeText(profile, `${left}${right}`)) {
    const leftColumns = Math.floor(profile.columns * 0.65);
    const rightColumns = profile.columns - leftColumns;
    await rasterLines(printer, profile, [
      {
        text: `${alignCell(
          left,
          leftColumns,
          value.align === "center" || value.align === "right"
            ? value.align
            : "left",
        )}${alignCell(right, rightColumns, "right")}`,
        align: "left",
        bold: Boolean(value.bold),
      },
    ], hooks);
    return;
  }
  printer.tableCustom([
    {
      text: left,
      width: 0.65,
      align: value.align || "left",
      style: value.bold ? "b" : "normal",
    },
    {
      text: right,
      width: 0.35,
      align: "right",
      style: value.bold ? "b" : "normal",
    },
  ]);
}
async function render(
  printer: any,
  job: PrintJob,
  hooks: Hooks,
  profile: ResolvedPrintProfile,
  imageOmitted?: string,
) {
  for (const block of job.blocks || []) {
    const value: any = block;
    switch (block.type) {
      case "text":
        await renderText(printer, value, profile, hooks);
        break;
      case "table-row":
        await renderTableRow(printer, value, profile, hooks);
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
export const configurePrinterForProfile = (
  printer: any,
  profile: ResolvedPrintProfile,
  hooks: Hooks = {},
) => {
  // ESC/POS clones sold for the Chinese market can retain Chinese/Kanji mode
  // between network connections. In that mode bytes such as \xA0 ("á" in
  // CP858) are parsed as the first half of a multibyte ideogram and ESC t has
  // no useful effect. Reset the command state and explicitly cancel that mode
  // before choosing the single-byte character table.
  const initialization: number[] = [];
  if (profile.initialization.reset) initialization.push(0x1b, 0x40); // ESC @
  if (profile.initialization.cancelChineseMode) initialization.push(0x1c, 0x2e); // FS .
  if (initialization.length) printer.raw(Buffer.from(initialization));
  emit(hooks, "character_mode_reset", {
    command: profile.initialization.cancelChineseMode ? "ESC @, FS ." : "ESC @",
  });
  if (profile.codeTable !== undefined)
    printer.setCharacterCodeTable(profile.codeTable);
  printer.encode(profile.encoding);
};
async function withPrinter(
  definition: Printer,
  work: (printer: any, profile: ResolvedPrintProfile) => Promise<void>,
  hooks: Hooks = {},
  profileOptions: Parameters<typeof resolvePrintProfile>[1] = {},
) {
  const profile = resolvePrintProfile(definition, profileOptions);
  const transport = await adapter(definition, hooks);
  const printer = new escpos.Printer(transport, {
    encoding: profile.encoding,
  });
  await new Promise<void>((resolve, reject) =>
    transport.open((error: Error) => (error ? reject(error) : resolve())),
  );
  try {
    emit(hooks, "adapter_open_ok");
    configurePrinterForProfile(printer, profile, hooks);
    emit(hooks, "print_profile", {
      id: profile.id,
      mode: profile.mode,
      encoding: profile.encoding,
      codeTable: profile.codeTable,
      unicodeFallback: profile.unicodeFallback,
      source: profile.source,
      coverage: profile.coverage,
      validation: profile.validation,
    });
    await work(printer, profile);
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
  profileOptions: Parameters<typeof resolvePrintProfile>[1] = {},
) =>
  withPrinter(
    definition,
    (printer, profile) => render(printer, job, hooks, profile, imageOmitted),
    hooks,
    profileOptions,
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
        { type: "text", content: texts.characters },
        { type: "text", content: new Date().toLocaleString() },
        { type: "feed", lines: 3 },
        { type: "cut" },
      ],
    },
    hooks,
    texts.imageOmitted,
    { allowUnverifiedSpanish: true },
  );
