import { useCallback, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AppHeader } from "@/components/app/AppHeader";
import { BridgeAccessCards } from "@/components/app/BridgeAccessCards";
import { DiscoveryPanel } from "@/components/app/DiscoveryPanel";
import { PrinterFormDialog } from "@/components/app/PrinterFormDialog";
import { PrinterList } from "@/components/app/PrinterList";
import { SettingsDialog } from "@/components/app/SettingsDialog";
import {
  blankPrinter,
  diagnosticsForForm,
  formFor,
  printerForSaving,
} from "@/components/app/printer-utils";
import type { PrinterForm } from "@/components/app/types";
import { BridgeProvider, useBridge } from "@/contexts/BridgeContext";
import { I18nProvider, useI18n } from "@/contexts/I18nContext";

function AppContent() {
  const [form, setForm] = useState<PrinterForm>();
  const [draftDiagnostic, setDraftDiagnostic] = useState<any>();
  const [draftSessionId, setDraftSessionId] = useState<string>();
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

  const openCreate = useCallback(() => {
    const next = blankPrinter();
    setDraftDiagnostic(undefined);
    setDraftSessionId(
      globalThis.crypto?.randomUUID?.() ||
        `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    setForm(next);
    void loadProfileCatalog(next);
  }, [loadProfileCatalog]);
  const openEdit = useCallback(
    (printer: any) => {
      const next = formFor(printer);
      setDraftDiagnostic(undefined);
      setDraftSessionId(undefined);
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
  const testDraft = useCallback(
    async (operation: "test-draft" | "spanish-validation") => {
      if (!form) return;
      setDraftDiagnostic(undefined);
      const result = await perform("test-draft", () =>
        window.bridge.testPrinter(form, { draftSessionId, operation }),
      );
      if (!result) return;
      setDraftDiagnostic(result.diagnostic);
      if (!result.ok) {
        reportMessage(result.error);
        return;
      }
      setNotice(tr("test_sent"));
    },
    [draftSessionId, form, perform, reportMessage, setNotice, tr],
  );
  const confirmSpanishValidation = useCallback(
    (catalogVersion: number) => {
      if (!form) return;
      setForm({
        ...form,
        printProfile: {
          ...form.printProfile,
          validation: {
            ...form.printProfile.validation,
            "spanish-latin": {
              catalogVersion,
              confirmedAt: new Date().toISOString(),
            },
          },
        },
      });
      setNotice(tr("spanish_validation_confirmed"));
    },
    [form, setNotice, tr],
  );
  const exportCompatibilityReport = useCallback(async () => {
    if (!form) return;
    const latestDiagnostic =
      draftDiagnostic ||
      (status?.diagnostics || []).find((entry: any) =>
        form.id
          ? entry.printerId === form.id
          : entry.draftSessionId === draftSessionId,
      );
    const content = await perform("export-report", async () => {
      const report = await window.bridge.compatibilityReport(
        form,
        latestDiagnostic,
      );
      const next = `${JSON.stringify(report, null, 2)}\n`;
      await window.bridge.copy(next);
      return next;
    });
    if (!content) return;
    const url = URL.createObjectURL(
      new Blob([content], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "pos-ticket-bridge-compatibility.json";
    link.click();
    URL.revokeObjectURL(url);
    setNotice(tr("report_exported"));
  }, [
    draftDiagnostic,
    draftSessionId,
    form,
    perform,
    setNotice,
    status?.diagnostics,
    tr,
  ]);
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

  return (
    <main className="min-h-screen bg-muted/40 p-6 text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <AppHeader onOpenSettings={() => setSettingsOpen(true)} />
        {error && (
          <Card className="border-destructive/40">
            <CardContent className="p-4 text-sm text-destructive">
              {error}
            </CardContent>
          </Card>
        )}
        {notice && (
          <Card className="border-emerald-300">
            <CardContent className="p-4 text-sm text-emerald-700">
              {notice}
            </CardContent>
          </Card>
        )}
        <BridgeAccessCards />
        <section className="space-y-5">
          <PrinterList onCreate={openCreate} onEdit={openEdit} />
          <DiscoveryPanel onUseResult={openEdit} />
        </section>
        <PrinterFormDialog
          form={form}
          diagnostics={formDiagnostics}
          draftDiagnostic={draftDiagnostic}
          profileCatalog={profileCatalog}
          isWindows={isWindows}
          onClose={closeForm}
          onFormChange={setForm}
          onClearDraftDiagnostic={() => setDraftDiagnostic(undefined)}
          onTest={testDraft}
          onConfirmSpanish={confirmSpanishValidation}
          onExportReport={exportCompatibilityReport}
          onSave={save}
        />
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
        <AppContent />
      </BridgeProvider>
    </I18nProvider>
  );
}
