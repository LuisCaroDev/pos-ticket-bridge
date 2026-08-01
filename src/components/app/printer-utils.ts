import type { PrinterForm } from "./types";

const defaultPrinterLanguage = (): "es" | "en" =>
  /^en(?:[-_]|$)/i.test(navigator.language || "") ? "en" : "es";

export const automaticProfile = () => ({
  language: defaultPrinterLanguage(),
  mode: "auto" as const,
  profileId: "unlisted-safe",
});

export const formFor = (printer: any): PrinterForm => ({
  id: printer.id,
  nombre: printer.nombre,
  reportedBrand: printer.reportedBrand,
  reportedModel: printer.reportedModel,
  tipo: printer.tipo,
  anchoMm: printer.anchoMm,
  printProfile: printer.printProfile || automaticProfile(),
  abreCajon: printer.abreCajon,
  enabled: printer.enabled,
  connection: { ...(printer.connection || {}) },
});

export const blankPrinter = (): PrinterForm => ({
  nombre: "",
  tipo: "network",
  anchoMm: 80,
  printProfile: automaticProfile(),
  abreCajon: false,
  enabled: true,
  connection: { host: "", port: 9100 },
});

/** Removes state used only to render the form before sending it to the bridge. */
export const printerForSaving = (form: PrinterForm) => {
  const printer = { ...form };
  delete printer.customCharacterTable;
  return printer;
};

export const diagnosticsForForm = (
  diagnostics: any[],
  formId: string | undefined,
  draftSessionId: string | undefined,
  latestDiagnostic?: any,
) => {
  const matching = diagnostics.filter((entry) =>
    formId
      ? entry.printerId === formId
      : entry.draftSessionId === draftSessionId,
  );
  const alreadyRegistered = matching.some(
    (entry) =>
      entry.startedAt === latestDiagnostic?.startedAt &&
      entry.operation === latestDiagnostic?.operation &&
      entry.printerId === latestDiagnostic?.printerId,
  );
  return latestDiagnostic && !alreadyRegistered
    ? [latestDiagnostic, ...matching]
    : matching;
};

export const connectionLabel = (printer: any) =>
  printer.tipo === "network"
    ? `${printer.connection.host}:${printer.connection.port}`
    : printer.tipo === "usb"
      ? [
          printer.connection.vendorId,
          printer.connection.productId,
          printer.connection.systemPrinter,
        ]
          .filter(Boolean)
          .join(" · ") || "USB manual"
      : `${printer.connection.path || ""}${printer.connection.channel ? ` · ${printer.connection.channel}` : ""}`;
