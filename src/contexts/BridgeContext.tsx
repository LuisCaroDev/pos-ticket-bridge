import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import {
  t,
  translateMessage,
  type BridgeMessage,
  type LanguageSetting,
} from "@/i18n";
import type { PrinterForm } from "@/components/app/types";
import { useI18n } from "./I18nContext";

type SettingsInput = {
  language: LanguageSetting;
  port: number;
  allowedOrigins: string[];
  autoStart: boolean;
};

type BridgeContextValue = {
  status: any;
  appVersion: string;
  profileCatalog: any;
  busy: string;
  error: string;
  notice: string;
  languageSetting: LanguageSetting;
  port: string;
  origins: string;
  autoStart: boolean;
  autoStartWarning?: "macos_move_to_applications";
  printers: any[];
  refresh: () => Promise<void>;
  perform: <T>(
    name: string,
    action: () => Promise<T>,
  ) => Promise<T | undefined>;
  loadProfileCatalog: (input?: PrinterForm) => Promise<any>;
  saveSettings: (input: SettingsInput) => Promise<boolean>;
  testPrinter: (printerId: string) => void;
  openDrawer: (printerId: string) => void;
  deletePrinter: (printer: any) => void;
  copy: (value: string) => void;
  setNotice: (notice: string) => void;
  reportMessage: (message?: BridgeMessage | null) => void;
  reportFailure: (cause: unknown) => void;
  clearFeedback: () => void;
};

const BridgeContext = createContext<BridgeContextValue | undefined>(undefined);

export function BridgeProvider({ children }: PropsWithChildren) {
  const { language, setLanguage, tr } = useI18n();
  const [status, setStatus] = useState<any>();
  const [appVersion, setAppVersion] = useState("");
  const [profileCatalog, setProfileCatalog] = useState<any>({ profiles: [] });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [origins, setOrigins] = useState("");
  const [port, setPort] = useState("9977");
  const [languageSetting, setLanguageSetting] =
    useState<LanguageSetting>("system");
  const [autoStart, setAutoStart] = useState(true);
  const [autoStartWarning, setAutoStartWarning] =
    useState<"macos_move_to_applications">();
  const languageRef = useRef(language);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  const errorMessage = useCallback((cause: unknown) => {
    try {
      return translateMessage(
        languageRef.current,
        JSON.parse((cause as Error).message) as BridgeMessage,
      );
    } catch {
      return t(languageRef.current, "operation_failed");
    }
  }, []);
  const refresh = useCallback(async () => {
    try {
      const next = await window.bridge.status();
      setAppVersion(next.version || "");
      setStatus(next);
      setPort(String(next.port));
      setOrigins((next.allowedOrigins || []).join("\n"));
      setLanguageSetting(next.language || "system");
      setAutoStart(next.autoStart !== false);
      setAutoStartWarning(
        next.autoStartStatus?.reason === "macos_move_to_applications"
          ? "macos_move_to_applications"
          : undefined,
      );
      setLanguage(next.activeLanguage || "es");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, [errorMessage, setLanguage]);

  const refreshDiagnostics = useCallback(async () => {
    if (typeof window.bridge.diagnostics !== "function") return;
    try {
      const diagnostics = await window.bridge.diagnostics();
      setStatus((current: any) =>
        current ? { ...current, diagnostics } : current,
      );
    } catch {
      // A background refresh must not replace the user's current feedback.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = window.setInterval(() => void refreshDiagnostics(), 1000);
    return () => window.clearInterval(interval);
  }, [refreshDiagnostics]);

  const perform = useCallback(
    async <T,>(name: string, action: () => Promise<T>) => {
      try {
        setBusy(name);
        setError("");
        setNotice("");
        const value = await action();
        await refresh();
        return value;
      } catch (cause) {
        await refresh();
        setError(errorMessage(cause));
        return undefined;
      } finally {
        setBusy("");
      }
    },
    [errorMessage, refresh],
  );
  const loadProfileCatalog = useCallback(async (input?: PrinterForm) => {
    const next = await window.bridge.printerProfiles(input);
    setProfileCatalog(next);
    return next;
  }, []);
  const saveSettings = useCallback(
    async (input: SettingsInput) =>
      Boolean(
        await perform("settings", () =>
          window.bridge.settings({
            port: input.port,
            allowedOrigins: input.allowedOrigins,
            language: input.language,
            autoStart: input.autoStart,
          }),
        ),
      ),
    [perform],
  );
  const testPrinter = useCallback(
    (printerId: string) => {
      void perform(`test-${printerId}`, () =>
        window.bridge
          .request(`/api/printers/${printerId}/test`)
          .then((result: { message?: BridgeMessage }) => {
            if (result?.message)
              setNotice(translateMessage(languageRef.current, result.message));
            return result;
          }),
      );
    },
    [perform, setNotice],
  );
  const openDrawer = useCallback(
    (printerId: string) => {
      void perform(`drawer-${printerId}`, () =>
        window.bridge.request(`/api/printers/${printerId}/open-drawer`),
      );
    },
    [perform],
  );
  const deletePrinter = useCallback(
    (printer: any) => {
      if (!confirm(tr("delete_printer_confirm", { name: printer.nombre })))
        return;
      void perform(`delete-${printer.id}`, () =>
        window.bridge.deletePrinter(printer.id),
      );
    },
    [perform, tr],
  );
  const copy = useCallback((value: string) => {
    void window.bridge.copy(value);
  }, []);
  const reportMessage = useCallback(
    (message?: BridgeMessage | null) =>
      setError(translateMessage(language, message)),
    [language],
  );
  const reportFailure = useCallback(
    (cause: unknown) => setError(errorMessage(cause)),
    [errorMessage],
  );
  const clearFeedback = useCallback(() => {
    setError("");
    setNotice("");
  }, []);
  const value = useMemo(
    () => ({
      status,
      appVersion,
      profileCatalog,
      busy,
      error,
      notice,
      languageSetting,
      port,
      origins,
      autoStart,
      autoStartWarning,
      printers: status?.printers || [],
      refresh,
      perform,
      loadProfileCatalog,
      saveSettings,
      testPrinter,
      openDrawer,
      deletePrinter,
      copy,
      setNotice,
      reportMessage,
      reportFailure,
      clearFeedback,
    }),
    [
      appVersion,
      autoStart,
      autoStartWarning,
      busy,
      clearFeedback,
      copy,
      deletePrinter,
      error,
      languageSetting,
      loadProfileCatalog,
      notice,
      openDrawer,
      origins,
      perform,
      port,
      profileCatalog,
      refresh,
      reportFailure,
      reportMessage,
      saveSettings,
      status,
      testPrinter,
    ],
  );

  return (
    <BridgeContext.Provider value={value}>{children}</BridgeContext.Provider>
  );
}

export function useBridge() {
  const value = useContext(BridgeContext);
  if (!value) throw new Error("Bridge context is unavailable.");
  return value;
}
