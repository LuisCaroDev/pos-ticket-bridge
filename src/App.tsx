import { useCallback, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AppHeader } from "@/components/app/AppHeader";
import { BridgeAccessCards } from "@/components/app/BridgeAccessCards";
import { DiscoveryPanel } from "@/components/app/DiscoveryPanel";
import { PrinterEditorPanel } from "@/components/app/PrinterEditorPanel";
import { PrinterList } from "@/components/app/PrinterList";
import { PrinterWorkspace } from "@/components/app/PrinterWorkspace";
import { SettingsDialog } from "@/components/app/SettingsDialog";
import {
  blankPrinter,
  diagnosticsForForm,
  formFor,
  printerForSaving,
} from "@/components/app/printer-utils";
import type { PrinterForm } from "@/components/app/types";
import type {
  CharacterProfileCandidate,
  CharacterProfileTestSet,
} from "@/core/character-profile-tests";
import { BridgeProvider, useBridge } from "@/contexts/BridgeContext";
import { I18nProvider, useI18n } from "@/contexts/I18nContext";
import { PrintDiagnosticsProvider } from "@/contexts/PrintDiagnosticsContext";
import { TooltipProvider } from "@/components/ui/tooltip";

function AppContent() {
  const [form, setForm] = useState<PrinterForm>();
  const [draftDiagnostic, setDraftDiagnostic] = useState<any>();
  const [draftSessionId, setDraftSessionId] = useState<string>();
  const [detectedCreation, setDetectedCreation] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isWindows = window.bridge.platform === "win32";
  const { tr } = useI18n();
  const {
    busy,
    error,
    languageSetting,
    loadProfileCatalog,
    notice,
    origins,
    perform,
    port,
    profileCatalog,
    reportMessage,
    setNotice,
    saveSettings,
    status,
  } = useBridge();

  const openCreate = useCallback(
    (initial?: PrinterForm, detected = false) => {
      const next = initial || blankPrinter();
      setDraftDiagnostic(undefined);
      setDetectedCreation(detected);
      setDraftSessionId(
        globalThis.crypto?.randomUUID?.() ||
          `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      setForm(next);
      void loadProfileCatalog(next);
    },
    [loadProfileCatalog],
  );
  const openCreateFromDiscovery = useCallback(
    (detected: PrinterForm) => {
      const defaults = blankPrinter();
      const result = { ...detected };
      delete result.id;
      openCreate(
        {
          ...defaults,
          ...result,
          connection: { ...defaults.connection, ...result.connection },
        },
        true,
      );
    },
    [openCreate],
  );
  const openEdit = useCallback(
    (printer: any) => {
      const next = formFor(printer);
      setDraftDiagnostic(undefined);
      setDraftSessionId(undefined);
      setDetectedCreation(false);
      setForm(next);
      void loadProfileCatalog(next);
    },
    [loadProfileCatalog],
  );
  const closeForm = useCallback(
    (discardDraft = true) => {
      if (discardDraft && !form?.id && draftSessionId)
        void window.bridge.discardDraftDiagnostics(draftSessionId);
      setDraftDiagnostic(undefined);
      setDraftSessionId(undefined);
      setDetectedCreation(false);
      setForm(undefined);
    },
    [draftSessionId, form?.id],
  );
  const save = useCallback(async () => {
    if (!form) return;
    const printer = printerForSaving(form);
    const saved = await perform("save", () =>
      printer.id
        ? window.bridge.updatePrinter(printer.id, printer)
        : window.bridge.createPrinter(printer, draftSessionId),
    );
    if (saved) closeForm(false);
  }, [closeForm, draftSessionId, form, perform]);
  const testDraft = useCallback(async () => {
    if (!form) return;
    setDraftDiagnostic(undefined);
    const result = await perform("test-draft", () =>
      window.bridge.testPrinter(form, { draftSessionId }),
    );
    if (!result) return;
    setDraftDiagnostic(result.diagnostic);
    if (!result.ok) {
      reportMessage(result.error);
      return;
    }
    setNotice(tr("test_sent"));
  }, [draftSessionId, form, perform, reportMessage, setNotice, tr]);
  const runCharacterProfileTrial = useCallback(
    async (candidate: CharacterProfileCandidate) => {
      if (!form) return false;
      setDraftDiagnostic(undefined);
      const result = await perform("character-profile-trial", () =>
        window.bridge.runCharacterProfileTrial(form, candidate, draftSessionId),
      );
      if (!result) return false;
      setDraftDiagnostic(result.diagnostic);
      if (!result.ok) {
        reportMessage(result.error);
        return false;
      }
      setNotice(tr("character_profile_trial_sent"));
      return true;
    },
    [draftSessionId, form, perform, reportMessage, setNotice, tr],
  );
  const validateCharacterProfileTestSet = useCallback(
    (testSet: CharacterProfileTestSet) =>
      perform("validate-character-profile-test-set", () =>
        window.bridge.validateCharacterProfileTestSet(testSet),
      ),
    [perform],
  );
  const saveLocalProfile = useCallback(
    async (input: unknown) => {
      if (typeof window.bridge.saveLocalProfile !== "function") {
        setNotice(tr("profile_save_restart_required"));
        return undefined;
      }
      const saved = await perform("save-local-profile", () =>
        window.bridge.saveLocalProfile(input),
      );
      if (!saved) return undefined;
      if (form) await loadProfileCatalog(form);
      setNotice(tr("local_profile_saved"));
      return saved;
    },
    [form, loadProfileCatalog, perform, setNotice, tr],
  );
  const exportLocalProfile = useCallback(
    async (target: "clipboard" | "file") => {
      if (!form) return false;
      const content = await perform(
        `export-local-profile-${target}`,
        async () => {
          const profile = await window.bridge.exportLocalProfile(form);
          const next = `${JSON.stringify(profile, null, 2)}\n`;
          if (target === "clipboard") await window.bridge.copy(next);
          return next;
        },
      );
      if (!content) return false;
      if (target === "file") {
        const url = URL.createObjectURL(
          new Blob([content], { type: "application/json" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = "pos-ticket-bridge-local-profile.json";
        link.click();
        URL.revokeObjectURL(url);
      }
      setNotice(
        tr(
          target === "clipboard"
            ? "local_profile_copied"
            : "local_profile_downloaded",
        ),
      );
      return true;
    },
    [form, perform, setNotice, tr],
  );
  const importLocalProfile = useCallback(
    async (input: unknown) => {
      const imported = await perform("import-local-profile", () =>
        window.bridge.importLocalProfile(input),
      );
      if (!imported) return false;
      if (form) await loadProfileCatalog(form);
      setNotice(tr("local_profile_imported"));
      return true;
    },
    [form, loadProfileCatalog, perform, setNotice, tr],
  );
  const deleteLocalProfile = useCallback(
    async (profileId: string) => {
      const deleted = await perform("delete-local-profile", () =>
        window.bridge.deleteLocalProfile(profileId),
      );
      if (!deleted) return false;
      const nextForm =
        form?.printProfile.mode === "custom" &&
        form.printProfile.localProfileId === profileId
          ? {
              ...form,
              printProfile: {
                ...form.printProfile,
                localProfileId: undefined,
              },
            }
          : form;
      if (nextForm !== form) {
        setDraftDiagnostic(undefined);
        setForm(nextForm);
      }
      if (nextForm) await loadProfileCatalog(nextForm);
      setNotice(tr("local_profile_deleted"));
      return true;
    },
    [form, loadProfileCatalog, perform, setNotice, tr],
  );
  const pasteLocalProfile = useCallback(async () => {
    const content = await window.bridge.paste();
    return importLocalProfile(JSON.parse(content));
  }, [importLocalProfile]);
  const formDiagnostics = useMemo(
    () =>
      diagnosticsForForm(
        status?.diagnostics || [],
        form?.id,
        draftSessionId,
        draftDiagnostic,
      ),
    [draftDiagnostic, draftSessionId, form?.id, status?.diagnostics],
  );

  const primaryContent = (
    <>
      <AppHeader onOpenSettings={() => setSettingsOpen(true)} />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <BridgeAccessCards />
      <section className="flex flex-col gap-5">
        <PrinterList onCreate={() => openCreate()} onEdit={openEdit} />
        <DiscoveryPanel onUseResult={openCreateFromDiscovery} />
      </section>
    </>
  );
  const printerForm = (
    <PrinterEditorPanel
      form={form}
      detected={detectedCreation}
      diagnostics={formDiagnostics}
      profileCatalog={profileCatalog}
      isWindows={isWindows}
      onClose={closeForm}
      onFormChange={setForm}
      onClearDraftDiagnostic={() => setDraftDiagnostic(undefined)}
      onTest={testDraft}
      onRunCharacterProfileTrial={runCharacterProfileTrial}
      onValidateCharacterProfileTestSet={validateCharacterProfileTestSet}
      onSaveLocalProfile={saveLocalProfile}
      onExportLocalProfile={exportLocalProfile}
      onImportLocalProfile={importLocalProfile}
      onPasteLocalProfile={pasteLocalProfile}
      onDeleteLocalProfile={deleteLocalProfile}
      onSave={save}
    />
  );

  return (
    <main className="h-screen overflow-hidden bg-muted/40 text-foreground">
      <PrinterWorkspace editor={form ? printerForm : undefined}>
        {primaryContent}
      </PrinterWorkspace>
      <div className="mx-auto w-full max-w-6xl">
        <SettingsDialog
          open={settingsOpen}
          busy={busy === "settings"}
          languageSetting={languageSetting}
          port={port}
          origins={origins}
          onOpenChange={setSettingsOpen}
          onSave={async (input) => {
            const saved = await saveSettings(input);
            if (saved) setSettingsOpen(false);
            return saved;
          }}
        />
      </div>
    </main>
  );
}

export function App() {
  return (
    <I18nProvider>
      <BridgeProvider>
        <TooltipProvider>
          <PrintDiagnosticsProvider>
            <AppContent />
          </PrintDiagnosticsProvider>
        </TooltipProvider>
      </BridgeProvider>
    </I18nProvider>
  );
}
