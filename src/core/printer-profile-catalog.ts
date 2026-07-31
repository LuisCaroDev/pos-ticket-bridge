import type { Printer, PrinterCharacterCoverage } from "./types";

export const PROFILE_CATALOG_VERSION = 1;

type LocalizedText = { en: string; es: string };
export type CatalogEncoding = {
  encoding: string;
  codeTable?: number;
  nativePolicy: "encoding" | "ascii";
};
export type CatalogPrinterProfile = {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  selectable: boolean;
  version: number;
  verifiedCoverage: PrinterCharacterCoverage[];
  ascii: CatalogEncoding;
  spanishLatin?: CatalogEncoding;
  initialization: { reset: boolean; cancelChineseMode: boolean };
  supportsRaster: boolean;
  usbMatches?: Array<{ vendorId: string; productId?: string }>;
};

const profile = <T extends CatalogPrinterProfile>(value: T) => value;

export const printerProfileCatalog = [
  profile({
    id: "unlisted-safe",
    name: {
      en: "Model not listed — safe mode",
      es: "Modelo no listado — modo seguro",
    },
    description: {
      en: "Native ASCII; unsupported characters are printed as a bitmap.",
      es: "ASCII nativo; los demás caracteres se imprimen como bitmap.",
    },
    selectable: true,
    version: PROFILE_CATALOG_VERSION,
    verifiedCoverage: ["ascii"],
    ascii: { encoding: "CP437", codeTable: 0, nativePolicy: "ascii" },
    initialization: { reset: true, cancelChineseMode: true },
    supportsRaster: true,
  }),
  profile({
    id: "epson-escpos-usb",
    name: { en: "Epson ESC/POS USB", es: "Epson ESC/POS USB" },
    description: {
      en: "Verified ESC/POS profile for Epson USB printers.",
      es: "Perfil ESC/POS verificado para impresoras Epson por USB.",
    },
    selectable: true,
    version: PROFILE_CATALOG_VERSION,
    verifiedCoverage: ["ascii", "spanish-latin"],
    ascii: { encoding: "CP437", codeTable: 0, nativePolicy: "ascii" },
    spanishLatin: {
      encoding: "CP850",
      codeTable: 2,
      nativePolicy: "encoding",
    },
    initialization: { reset: true, cancelChineseMode: true },
    supportsRaster: true,
    usbMatches: [{ vendorId: "0x04b8" }],
  }),
  // This profile was confirmed on a physical XP-E260L over the network.
  // Network printers are intentionally never selected from their IP address;
  // users choose this model explicitly and confirm the Latin test per unit.
  profile({
    id: "xprinter-xp-e260l",
    name: { en: "Xprinter XP-E260L", es: "Xprinter XP-E260L" },
    description: {
      en: "Verified ESC/POS profile for the XP-E260L.",
      es: "Perfil ESC/POS verificado para la XP-E260L.",
    },
    selectable: true,
    version: PROFILE_CATALOG_VERSION,
    verifiedCoverage: ["ascii", "spanish-latin"],
    ascii: { encoding: "CP437", codeTable: 0, nativePolicy: "ascii" },
    spanishLatin: {
      encoding: "CP858",
      codeTable: 19,
      nativePolicy: "encoding",
    },
    initialization: { reset: true, cancelChineseMode: true },
    supportsRaster: true,
  }),
] as const;

export const getCatalogProfile = (id?: string) =>
  printerProfileCatalog.find((item) => item.id === id) ||
  printerProfileCatalog[0];

export const selectablePrinterProfiles = () =>
  printerProfileCatalog.filter((item) => item.selectable);

const normalizedId = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

export const suggestedCatalogProfileId = (printer: Printer) => {
  if (printer.tipo !== "usb") return undefined;
  const vendorId = normalizedId(printer.connection.vendorId);
  const productId = normalizedId(printer.connection.productId);
  return selectablePrinterProfiles().find((candidate) =>
    candidate.usbMatches?.some(
      (match) =>
        match.vendorId === vendorId &&
        (!match.productId || match.productId === productId),
    ),
  )?.id;
};
