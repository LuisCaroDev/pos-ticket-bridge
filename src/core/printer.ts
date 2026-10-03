import { nativeTableRowLines } from "./native-table-row";
// Vite resolves explicit inline asset imports; eslint-import does not.
// eslint-disable-next-line import/no-unresolved
import robotoMonoLatin from "../assets/fonts/RobotoMono-Latin.woff2?inline";
// eslint-disable-next-line import/no-unresolved
import robotoMonoLatinExt from "../assets/fonts/RobotoMono-LatinExt.woff2?inline";
/* eslint-disable @typescript-eslint/no-var-requires */
import { BrowserWindow } from "electron";
import {
  BridgeError,
  type CharacterProfileTrialTexts,
  type TestPrintTexts,
} from "../i18n";
import {
  resolvePrintProfile,
  shouldRasterizeText,
  type ResolvedPrintProfile,
} from "./printer-profiles";
import type { PrintJob, Printer } from "./types";
import { printQueue } from "./print-queue";
import {
  bluetoothSerialOptions,
  createBluetoothSerialAdapter,
  resolveBluetoothSerialPath,
} from "./transports/bluetooth-serial";
import { createMacOSBluetoothAdapter } from "./transports/macos-bluetooth";
import { createUsbAdapter } from "./transports/usb";
const escpos: any = require("@node-escpos/core");
const NetworkAdapter: any = require("@node-escpos/network-adapter");
type Hooks = {
  onEvent?: (stage: string, detail?: Record<string, unknown>) => void;
};
type WithPrinterOptions = {
  probeBluetoothStatus?: boolean;
};
type PrintableImage = {
  size: { width: number; height: number; colors: number };
  pixels: { data: Uint8Array };
};
type RasterQueuePrinter = {
  flush: () => Promise<unknown>;
  raster: (image: unknown) => unknown;
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
    const configuredPath = String(printer.connection.path);
    const path = resolveBluetoothSerialPath(configuredPath);
    emit(hooks, "adapter_prepare", {
      transport: "serial",
      path,
      serialOptions: bluetoothSerialOptions(
        Number(printer.connection.baudRate) || 9600,
      ),
      ...(path !== configuredPath ? { configuredPath } : {}),
    });
    if (process.platform !== "darwin")
      return createBluetoothSerialAdapter(
        path,
        Number(printer.connection.baudRate) || 9600,
        hooks,
      );
    return createMacOSBluetoothAdapter(
      path,
      Number(printer.connection.baudRate) || 9600,
      String(printer.connection.channel || ""),
      hooks,
    );
  }
  return createUsbAdapter(printer, hooks);
}
const align = (printer: any, value: unknown) =>
  printer.align(value === "center" ? "ct" : value === "right" ? "rt" : "lt");
type FontSelectablePrinter = {
  font?: (family: "A" | "B" | "C") => unknown;
};
const selectNativeFont = (printer: FontSelectablePrinter, value: unknown) => {
  const family =
    value === "compact" ? "B" : value === "compact-tall" ? "C" : "A";
  if (typeof printer.font !== "function") return;
  try {
    printer.font(family);
  } catch {
    // Some ESC/POS implementations expose no requested font. Keep the document
    // printable with its standard native font instead of falling back to a bitmap.
    printer.font("A");
  }
};
type NativeTextPrinter = {
  text: (content: string) => unknown;
  raw: (data: Buffer) => unknown;
  lineSpace: (dots?: number | null) => unknown;
};
// Keep a fixed visual gap between native lines. Do not scale it with the font:
// large text already advances by its own ROM glyph height.
const nativeLineGap = Buffer.from([0x1b, 0x4a, 8]); // ESC J 8: feed eight dots.
// A dotted divider uses the low part of a native glyph cell. Compact the LF
// before it and compensate after it so the visible dots sit between both
// sections instead of appearing attached to the following text.
const nativeSeparatorBeforeLineSpace = 18;
const nativeSeparatorAfterGap = Buffer.from([0x1b, 0x4a, 16]);
const printNativeText = (
  printer: NativeTextPrinter,
  content: string,
  appendTrailingGap = true,
) => {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  for (const [index, line] of lines.entries()) {
    const isCompactSeparatorLead =
      !appendTrailingGap && index === lines.length - 1;
    if (isCompactSeparatorLead)
      printer.lineSpace(nativeSeparatorBeforeLineSpace);
    printer.text(line);
    if (isCompactSeparatorLead) printer.lineSpace();
    if (appendTrailingGap || index < lines.length - 1)
      printer.raw(nativeLineGap);
  }
};
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

/** Fits an ESC/POS image into a box without cropping, distortion, or upscaling. */
export function resizeImageContain(
  image: PrintableImage,
  bounds: { maxWidth: number; maxHeight: number },
): PrintableImage {
  const { width, height, colors } = image.size;
  const maxWidth = Math.max(1, Math.floor(bounds.maxWidth));
  const maxHeight = Math.max(1, Math.floor(bounds.maxHeight));
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  if (scale === 1) return image;

  const targetWidth = Math.min(
    maxWidth,
    Math.max(1, Math.round(width * scale)),
  );
  const targetHeight = Math.min(
    maxHeight,
    Math.max(1, Math.round(height * scale)),
  );
  const output = new Uint8Array(targetWidth * targetHeight * colors);

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(
      height - 1,
      Math.floor((y * height) / targetHeight),
    );
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(
        width - 1,
        Math.floor((x * width) / targetWidth),
      );
      const sourceIndex = (sourceY * width + sourceX) * colors;
      const targetIndex = (y * targetWidth + x) * colors;
      for (let channel = 0; channel < colors; channel += 1)
        output[targetIndex + channel] =
          image.pixels.data[sourceIndex + channel];
    }
  }

  return new escpos.Image({
    data: output,
    shape: [targetWidth, targetHeight, colors],
  }) as PrintableImage;
}

export function resizeImageToMaxWidth(
  image: PrintableImage,
  maxWidth: number,
): PrintableImage {
  return resizeImageContain(image, { maxWidth, maxHeight: maxWidth });
}

export function imageMaxWidth(
  value: { maxWidth?: unknown },
  printableWidth: number,
) {
  const requested = Number(value.maxWidth);
  return Number.isFinite(requested) && requested > 0
    ? Math.min(printableWidth, Math.floor(requested))
    : printableWidth;
}

export function imageMaxHeight(
  value: { maxHeight?: unknown },
  maxWidth: number,
) {
  const requested = Number(value.maxHeight);
  return Number.isFinite(requested) && requested > 0
    ? Math.floor(requested)
    : maxWidth;
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
  font?: "standard" | "compact" | "compact-tall";
  width?: number;
  height?: number;
};

type RasterDocument = {
  svg: string;
  width: number;
  height: number;
};

const rasterFontMetrics = {
  // OpenType em boxes include vertical whitespace. These sizes deliberately
  // exceed the ESC/POS cell height so the visible ink matches ROM Font A/B.
  standard: { cellWidth: 12, cellHeight: 24, fontSize: 29 },
  compact: { cellWidth: 9, cellHeight: 17, fontSize: 20 },
  "compact-tall": { cellWidth: 9, cellHeight: 24, fontSize: 29 },
} as const;

const rasterFontFaces = `<style>
@font-face{font-family:'Roboto Mono';font-style:normal;font-weight:400 700;font-display:block;src:url('${robotoMonoLatinExt}') format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:'Roboto Mono';font-style:normal;font-weight:400 700;font-display:block;src:url('${robotoMonoLatin}') format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
</style>`;

const rasterScale = (value: unknown) =>
  Math.min(8, Math.max(1, Number(value) || 1));

export const queueRasterAfterNative = async (
  printer: RasterQueuePrinter,
  image: unknown,
) => {
  await printer.flush();
  printer.raster(image);
};

export const rasterDocument = (
  profile: ResolvedPrintProfile,
  lines: RasterLine[],
): RasterDocument => {
  const rendered = lines.flatMap((line) => {
    const font = line.font || "standard";
    const metrics = rasterFontMetrics[font];
    const width = rasterScale(line.width);
    const height = rasterScale(line.height);
    const columns = Math.max(
      1,
      Math.floor(profile.rasterWidth / (metrics.cellWidth * width)),
    );
    return linesFor(line.text, columns).map((text) => ({
      ...line,
      text,
      font,
      width,
      height,
      metrics,
    }));
  });
  const lineHeight = (line: (typeof rendered)[number]) =>
    Math.max(line.metrics.cellHeight, line.metrics.fontSize) * line.height;
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
      const textWidth = line.text.length * line.metrics.cellWidth * line.width;
      return `<text x="${x}" y="${y - heightForLine / 2}" dominant-baseline="central" text-anchor="${anchor}" xml:space="preserve" font-family="'Roboto Mono', monospace" font-size="${line.metrics.fontSize * line.height}" font-weight="${line.bold ? "650" : "400"}"${textWidth ? ` textLength="${textWidth}" lengthAdjust="spacingAndGlyphs"` : ""}${line.underline ? ' text-decoration="underline"' : ""}>${line.text ? escapeXml(line.text) : "&#160;"}</text>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${profile.rasterWidth}" height="${height}" viewBox="0 0 ${profile.rasterWidth} ${height}">${rasterFontFaces}<rect width="100%" height="100%" fill="white"/><g fill="black">${text}</g></svg>`;
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
    await page.webContents.executeJavaScript(
      "document.fonts ? document.fonts.ready.then(() => true) : true",
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
    // Flush native text first because some firmware drops bytes immediately
    // preceding GS v 0 when both modes arrive in the same transport write.
    await queueRasterAfterNative(printer, escposImage);
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
  appendTrailingGap = true,
) {
  const content = String(value.content || "");
  const alignValue =
    value.align === "center" || value.align === "right" ? value.align : "left";
  if (
    profile.unicodeFallback !== "native" &&
    shouldRasterizeText(profile, content)
  ) {
    await rasterLines(
      printer,
      profile,
      [
        {
          text: content,
          align: alignValue,
          bold: Boolean(value.bold),
          underline: Boolean(value.underline),
          font: value.font,
          width: Number(value.width) || 1,
          height: Number(value.height) || 1,
        },
      ],
      hooks,
    );
    return;
  }
  align(printer, value.align);
  printer.style(Boolean(value.bold), false, value.underline ? 1 : 0);
  selectNativeFont(printer, value.font);
  printer.size(Number(value.width) || 1, Number(value.height) || 1);
  // `println()` writes its JavaScript string directly, which makes Node turn
  // it into UTF-8 bytes. `text()` is the escpos API that encodes the value
  // using `printer.encode(...)`, selected from the resolved profile above.
  // Sending UTF-8 while ESC t is active is what produced two incorrect glyphs
  // for each accented character on the physical printer.
  printNativeText(printer, content, appendTrailingGap);
  printer.style(false, false, 0);
  selectNativeFont(printer, "standard");
  printer.size(1, 1);
}

async function renderTableRow(
  printer: any,
  value: any,
  profile: ResolvedPrintProfile,
  hooks: Hooks,
  appendTrailingGap = true,
) {
  const left = String(value.left || "");
  const right = String(value.right || "");
  if (
    profile.unicodeFallback !== "native" &&
    shouldRasterizeText(profile, `${left}${right}`)
  ) {
    const leftColumns = Math.floor(profile.columns * 0.65);
    const rightColumns = profile.columns - leftColumns;
    await rasterLines(
      printer,
      profile,
      [
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
      ],
      hooks,
    );
    return;
  }
  // Fix the printer state explicitly: rows always use the profile's standard cells.
  align(printer, "left");
  selectNativeFont(printer, "standard");
  printer.size(1, 1);
  printer.style(Boolean(value.bold), false, 0);
  const lines = nativeTableRowLines(
    { left, right, align: value.align },
    profile.columns,
    profile.encoding,
  );
  for (const [index, line] of lines.entries()) {
    printNativeText(
      printer,
      line,
      appendTrailingGap || index < lines.length - 1,
    );
  }
  printer.style(false, false, 0);
}
async function render(
  printer: any,
  job: PrintJob,
  hooks: Hooks,
  profile: ResolvedPrintProfile,
  imageOmitted?: string,
) {
  const blocks = job.blocks || [];
  for (const [blockIndex, block] of blocks.entries()) {
    const value: any = block;
    const separatorFollows = blocks[blockIndex + 1]?.type === "separator";
    switch (block.type) {
      case "text":
        await renderText(printer, value, profile, hooks, !separatorFollows);
        break;
      case "table-row":
        await renderTableRow(printer, value, profile, hooks, !separatorFollows);
        break;
      case "separator":
        printer.drawLine(value.style === "dotted" ? "." : "-");
        printer.raw(nativeSeparatorAfterGap);
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
          const image = await loadImage(String(value.url || value.src || ""));
          const maxWidth = imageMaxWidth(value, profile.rasterWidth);
          await printer.image(
            resizeImageContain(image, {
              maxWidth,
              maxHeight: imageMaxHeight(value, maxWidth),
            }),
          );
        } catch (error) {
          emit(hooks, "image_omitted", { error: (error as Error).message });
          if (imageOmitted) printer.println(imageOmitted);
        }
        break;
      default:
        throw new BridgeError("unsupported_print_block", { type: value.type });
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
async function withPrinterAttempt(
  definition: Printer,
  work: (printer: any, profile: ResolvedPrintProfile) => Promise<void>,
  hooks: Hooks = {},
  options: WithPrinterOptions = {},
) {
  const profile = resolvePrintProfile(definition);
  const transport = await adapter(definition, hooks);
  const printer = new escpos.Printer(transport, {
    encoding: profile.encoding,
    // `font("A")` otherwise restores node-escpos' 42-column default even
    // when this 80 mm profile prints 48 columns. Keep text rows and dividers
    // aligned with the raster width after any native font selection.
    width: profile.columns,
  });
  await new Promise<void>((resolve, reject) =>
    transport.open((error: Error) => (error ? reject(error) : resolve())),
  );
  let workError: unknown;
  try {
    emit(hooks, "adapter_open_ok");
    if (
      options.probeBluetoothStatus &&
      typeof transport.probeStatus === "function"
    ) {
      const responded = await transport.probeStatus();
      if (
        !responded &&
        transport.reconnectAfterStatusTimeout === true &&
        typeof transport.reopen === "function"
      ) {
        emit(hooks, "adapter_reconnect_after_status_timeout");
        await new Promise<void>((resolve, reject) =>
          transport.reopen((error: Error | null) =>
            error ? reject(error) : resolve(),
          ),
        );
        emit(hooks, "adapter_reopen_ok");
        await transport.probeStatus();
      }
    }
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
  } catch (error) {
    workError = error;
  }
  let closeError: unknown;
  try {
    await new Promise<void>((resolve, reject) =>
      transport.close((error: Error | null) =>
        error ? reject(error) : resolve(),
      ),
    );
  } catch (error) {
    closeError = error;
    emit(hooks, "adapter_close_error", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (workError) throw workError;
  if (closeError) throw closeError;
}

const shouldRetryBluetoothNotReady = (definition: Printer, error: unknown) =>
  process.platform === "darwin" &&
  definition.tipo === "bluetooth" &&
  error instanceof Error &&
  error.message === "macOS Bluetooth SPP helper: not ready";

async function withPrinter(
  definition: Printer,
  work: (printer: any, profile: ResolvedPrintProfile) => Promise<void>,
  hooks: Hooks = {},
  options: WithPrinterOptions = {},
) {
  // Capture configuration before waiting for another operation.
  const snapshot: Printer = JSON.parse(JSON.stringify(definition));
  const acceptedOptions = { ...options };
  const queuedAt = Date.now();
  emit(hooks, "print_queue_entered");
  return printQueue.run(snapshot, async () => {
    emit(hooks, "print_queue_started", { waitMs: Date.now() - queuedAt });
    try {
      return await withPrinterAttempt(snapshot, work, hooks, acceptedOptions);
    } catch (error) {
      if (!shouldRetryBluetoothNotReady(snapshot, error)) throw error;
      emit(hooks, "adapter_retry_after_not_ready");
      return withPrinterAttempt(snapshot, work, hooks, acceptedOptions);
    }
  });
}

export const printJob = (
  definition: Printer,
  job: PrintJob,
  hooks: Hooks = {},
  imageOmitted?: string,
  options: WithPrinterOptions = {},
) => {
  const acceptedJob: PrintJob = JSON.parse(JSON.stringify(job));
  return withPrinter(
    definition,
    (printer, profile) =>
      render(printer, acceptedJob, hooks, profile, imageOmitted),
    hooks,
    options,
  );
};
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
          font: "standard",
          width: 2,
          height: 2,
        },
        {
          type: "text",
          content: texts.subtitle,
          align: "center",
          font: "compact",
          width: 1,
          height: 1,
        },
        { type: "separator", style: "solid" },
        { type: "text", content: texts.printer },
        { type: "text", content: texts.ascii },
        ...(texts.spanish
          ? [{ type: "text" as const, content: texts.spanish }]
          : []),
        { type: "text", content: texts.symbols },
        { type: "text", content: new Date().toLocaleString() },
        { type: "feed", lines: 3 },
        { type: "cut" },
      ],
    },
    hooks,
    texts.imageOmitted,
    { probeBluetoothStatus: true },
  );

/** Prints native characters deliberately; this ticket verifies ESC/POS tables. */
export const characterProfileTrialPrint = (
  definition: Printer,
  texts: CharacterProfileTrialTexts,
  hooks: Hooks = {},
) =>
  printJob(
    definition,
    {
      version: 1,
      widthMm: definition.anchoMm,
      reason: "character-profile-trial",
      blocks: [
        {
          type: "text",
          content: texts.title,
          align: "center",
          bold: true,
        },
        { type: "text", content: texts.profile, align: "center" },
        { type: "separator", style: "solid" },
        {
          type: "text",
          content: [texts.ascii, texts.spanish, texts.symbols].join("\n"),
        },
        { type: "feed", lines: 3 },
        { type: "cut" },
      ],
    },
    hooks,
    undefined,
    { probeBluetoothStatus: true },
  );
