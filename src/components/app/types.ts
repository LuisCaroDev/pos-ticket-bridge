import type { TranslationKey } from "@/i18n";

export type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export type PrinterForm = {
  id?: string;
  customCharacterTable?: boolean;
  nombre: string;
  reportedBrand?: string;
  reportedModel?: string;
  tipo: "network" | "usb" | "bluetooth";
  anchoMm: 58 | 80;
  printProfile: {
    language: "es" | "en";
    mode: "auto" | "custom";
    profileId?: string;
    validation?: {
      ascii?: { catalogVersion: number; confirmedAt: string };
      "spanish-latin"?: { catalogVersion: number; confirmedAt: string };
    };
    custom?: {
      encoding: string;
      codeTable: number;
      unicodeFallback: "auto" | "raster" | "native";
      automaticUnicodePolicy?: "encoding" | "ascii";
      confirmation?: {
        confirmedAt: string;
        testSetName: string;
        candidateId: string;
      };
    };
    localProfileId?: string;
  };
  abreCajon: boolean;
  enabled: boolean;
  connection: Record<string, string | number>;
};

export type ProfileValues = NonNullable<PrinterForm["printProfile"]["custom"]>;
