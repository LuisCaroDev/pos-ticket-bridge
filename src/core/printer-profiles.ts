/* eslint-disable @typescript-eslint/no-var-requires */
import type {
  CustomPrintProfile,
  Printer,
  PrinterCharacterCoverage,
  PrinterLanguage,
  UnicodeFallback,
} from "./types";
import {
  PROFILE_CATALOG_VERSION,
  getCatalogProfile,
  suggestedCatalogProfileId,
} from "./printer-profile-catalog";

const iconv = require("iconv-lite") as {
  decode(buffer: Buffer, encoding: string): string;
  encode(value: string, encoding: string): Buffer;
  encodingExists(encoding: string): boolean;
};

export type ResolvedPrintProfile = {
  id: string;
  mode: "auto" | "custom";
  language: PrinterLanguage;
  encoding: string;
  /** Undefined means that no character table is assumed for native ASCII. */
  codeTable?: number;
  unicodeFallback: UnicodeFallback;
  nativePolicy: "encoding" | "ascii";
  source: "catalog" | "safe" | "custom";
  coverage: PrinterCharacterCoverage;
  validation: "confirmed" | "required" | "custom";
  catalogVersion?: number;
  initialization: { reset: boolean; cancelChineseMode: boolean };
  supportsRaster: boolean;
  rasterWidth: number;
  columns: number;
};

export type ProfileResolutionOptions = {
  /** Uses a candidate Latin table only while printing its validation ticket. */
  allowUnverifiedSpanish?: boolean;
};

export const defaultPrinterLanguage = (
  systemLocale = Intl.DateTimeFormat().resolvedOptions().locale,
): PrinterLanguage => (/^en(?:[-_]|$)/i.test(systemLocale) ? "en" : "es");

export const defaultCustomProfile = (
  language: PrinterLanguage,
): CustomPrintProfile =>
  language === "es"
    ? { encoding: "CP850", codeTable: 2, unicodeFallback: "auto" }
    : { encoding: "CP437", codeTable: 0, unicodeFallback: "auto" };

const dimensions = (widthMm: 58 | 80) =>
  widthMm === 58
    ? { rasterWidth: 384, columns: 32 }
    : { rasterWidth: 576, columns: 48 };

const hasConfirmedSpanish = (printer: Printer, version: number) =>
  printer.printProfile.validation?.["spanish-latin"]?.catalogVersion ===
  version;

const sourceFor = (id: string): ResolvedPrintProfile["source"] =>
  id === "unlisted-safe"
    ? "safe"
    : "catalog";

export const defaultAutomaticProfileId = () => "unlisted-safe";

export const resolvePrintProfile = (
  printer: Printer,
  options: ProfileResolutionOptions = {},
): ResolvedPrintProfile => {
  const dimensionsForPrinter = dimensions(printer.anchoMm);
  const language = printer.printProfile.language;
  if (printer.printProfile.mode === "custom") {
    const custom = {
      ...defaultCustomProfile(language),
      ...printer.printProfile.custom,
    };
    return {
      id: "custom",
      mode: "custom",
      language,
      encoding: custom.encoding,
      codeTable: custom.codeTable,
      unicodeFallback: custom.unicodeFallback,
      nativePolicy: custom.automaticUnicodePolicy || "encoding",
      source: "custom",
      coverage: language === "es" ? "spanish-latin" : "ascii",
      validation: "custom",
      initialization: { reset: true, cancelChineseMode: true },
      supportsRaster: true,
      ...dimensionsForPrinter,
    };
  }
  const profileId =
    printer.printProfile.profileId ||
    suggestedCatalogProfileId(printer) ||
    defaultAutomaticProfileId();
  const catalogProfile = getCatalogProfile(profileId);
  const spanishConfirmed = hasConfirmedSpanish(printer, catalogProfile.version);
  const shouldUseSpanishNative =
    language === "es" &&
    Boolean(catalogProfile.spanishLatin) &&
    (spanishConfirmed || options.allowUnverifiedSpanish);
  const values = shouldUseSpanishNative
    ? catalogProfile.spanishLatin!
    : catalogProfile.ascii;
  return {
    id: catalogProfile.id,
    mode: "auto",
    language,
    encoding: values.encoding,
    codeTable: values.codeTable,
    unicodeFallback: "auto",
    nativePolicy: values.nativePolicy,
    source: sourceFor(catalogProfile.id),
    coverage: shouldUseSpanishNative ? "spanish-latin" : "ascii",
    validation:
      shouldUseSpanishNative && spanishConfirmed ? "confirmed" : "required",
    catalogVersion: PROFILE_CATALOG_VERSION,
    initialization: catalogProfile.initialization,
    supportsRaster: catalogProfile.supportsRaster,
    ...dimensionsForPrinter,
  };
};

export const publicPrintProfile = (profile: ResolvedPrintProfile) => ({
  id: profile.id,
  mode: profile.mode,
  language: profile.language,
  encoding: profile.encoding,
  codeTable: profile.codeTable,
  unicodeFallback: profile.unicodeFallback,
  nativePolicy: profile.nativePolicy,
  source: profile.source,
  coverage: profile.coverage,
  validation: profile.validation,
  catalogVersion: profile.catalogVersion,
  supportsRaster: profile.supportsRaster,
  unicodeCoverage:
    profile.unicodeFallback === "raster" || profile.nativePolicy === "ascii"
      ? "bitmap-fallback"
      : profile.unicodeFallback === "native"
        ? "native-only"
        : "profile-native",
});

export const isSupportedEncoding = (encoding: string) =>
  iconv.encodingExists(encoding);

export const canEncodeLosslessly = (value: string, encoding: string) => {
  try {
    return iconv.decode(iconv.encode(value, encoding), encoding) === value;
  } catch {
    return false;
  }
};

export const shouldRasterizeText = (
  profile: ResolvedPrintProfile,
  value: string,
) => {
  if (!value) return false;
  if (profile.unicodeFallback === "raster") return true;
  if (profile.unicodeFallback === "native") return false;
  if (profile.nativePolicy === "ascii")
    return Array.from(value).some((character) => character.charCodeAt(0) > 127);
  return !canEncodeLosslessly(value, profile.encoding);
};
