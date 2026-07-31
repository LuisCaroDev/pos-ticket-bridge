import {
  PROFILE_CATALOG_VERSION,
  getCatalogProfile,
} from "./printer-profile-catalog";
import type { Diagnostic, Printer } from "./types";

const safeSteps = (diagnostic?: Diagnostic) =>
  (diagnostic?.steps || []).map((step) => {
    const allowed = [
      "stage",
      "command",
      "transport",
      "encoding",
      "codeTable",
      "unicodeFallback",
      "source",
      "coverage",
      "validation",
      "width",
      "height",
      "lineCount",
    ];
    return Object.fromEntries(
      allowed
        .filter((key) => step[key] !== undefined)
        .map((key) => [key, step[key]]),
    );
  });

export const createCompatibilityReport = (
  printer: Printer,
  bridgeVersion: string,
  diagnostic?: Diagnostic,
) => {
  const profile = printer.printProfile;
  const hasSelectedProfile =
    profile.mode === "auto" && Boolean(profile.profileId);
  const catalogProfile = hasSelectedProfile
    ? getCatalogProfile(profile.profileId)
    : undefined;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    bridgeVersion,
    catalogVersion: PROFILE_CATALOG_VERSION,
    model: {
      selectedProfileId: catalogProfile?.id,
      selectedProfile: catalogProfile?.name,
      reportedModel: String(printer.reportedModel || "").trim() || undefined,
    },
    printer: {
      transport: printer.tipo,
      widthMm: printer.anchoMm,
      ...(printer.tipo === "usb"
        ? {
            usb: {
              vendorId: String(printer.connection.vendorId || "") || undefined,
              productId:
                String(printer.connection.productId || "") || undefined,
            },
          }
        : {}),
    },
    printProfile: {
      language: profile.language,
      mode: profile.mode,
      profileId: catalogProfile?.id,
      validation: profile.validation || {},
      ...(profile.mode === "custom"
        ? {
            custom: {
              encoding: profile.custom?.encoding,
              codeTable: profile.custom?.codeTable,
              unicodeFallback: profile.custom?.unicodeFallback,
              automaticUnicodePolicy: profile.custom?.automaticUnicodePolicy,
            },
          }
        : {}),
    },
    test: diagnostic
      ? {
          operation: diagnostic.operation,
          ok: diagnostic.ok,
          durationMs: diagnostic.durationMs,
          steps: safeSteps(diagnostic),
        }
      : undefined,
  };
};
