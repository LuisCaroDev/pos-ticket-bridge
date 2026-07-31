import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { t, type SupportedLanguage, type TranslationKey } from "@/i18n";
import type { Translate } from "@/components/app/types";

type I18nContextValue = {
  language: SupportedLanguage;
  setLanguage: (language: SupportedLanguage) => void;
  tr: Translate;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: PropsWithChildren) {
  const [language, setLanguage] = useState<SupportedLanguage>("es");
  const tr = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) =>
      t(language, key, params),
    [language],
  );
  const value = useMemo(() => ({ language, setLanguage, tr }), [language, tr]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("I18n context is unavailable.");
  return value;
}
