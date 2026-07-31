import type { LanguageSetting } from "@/i18n";
import type { Translate } from "./types";

export const languageLabel = (tr: Translate, value: LanguageSetting) =>
  tr(
    value === "system"
      ? "language_system"
      : value === "es"
        ? "language_spanish"
        : "language_english",
  );
