import { memo, useEffect, useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type FieldPath, type Resolver } from "react-hook-form";
import { Clipboard, Loader2 } from "lucide-react";
import { translateMessage, type TranslationKey } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxPortal,
  ComboboxPositioner,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LanguageSelect } from "./LanguageSelect";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useBridge } from "@/contexts/BridgeContext";
import { useI18n } from "@/contexts/I18nContext";
import { printerFormSchema, printerTransportSchema } from "./form-validation";
import type { PrinterForm, ProfileValues } from "./types";

const encodingPresets = [
  { encoding: "CP437", codeTable: 0 },
  { encoding: "CP850", codeTable: 2 },
  { encoding: "CP860", codeTable: 3 },
  { encoding: "WINDOWS-1252", codeTable: 16 },
  { encoding: "CP858", codeTable: 19 },
] as const;
const characterTablePresets = [
  { value: 0, label: "0 — CP437" },
  { value: 2, label: "2 — CP850" },
  { value: 3, label: "3 — CP860" },
  { value: 16, label: "16 — Windows-1252" },
  { value: 19, label: "19 — CP858" },
] as const;
const selectedCharacterTable = (codeTable: number, customSelected = false) =>
  !customSelected &&
  characterTablePresets.some((item) => item.value === codeTable)
    ? String(codeTable)
    : "custom";
const diagnosticDetails = (entry: Record<string, unknown>) =>
  Object.entries(entry)
    .filter(([key]) => key !== "at" && key !== "stage")
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");

type PrinterFormDialogProps = {
  form?: PrinterForm;
  diagnostics: any[];
  draftDiagnostic: any;
  profileCatalog: any;
  isWindows: boolean;
  onClose: () => void;
  onFormChange: (form: PrinterForm) => void;
  onClearDraftDiagnostic: () => void;
  onTest: (operation: "test-draft" | "spanish-validation") => void;
  onConfirmSpanish: (catalogVersion: number) => void;
  onExportReport: () => void;
  onSave: () => void;
};

export const PrinterFormDialog = memo(function PrinterFormDialog({
  form,
  diagnostics,
  draftDiagnostic,
  profileCatalog,
  isWindows,
  onClose,
  onFormChange: onFormUpdate,
  onClearDraftDiagnostic,
  onTest,
  onConfirmSpanish,
  onExportReport,
  onSave,
}: PrinterFormDialogProps) {
  const { copy, busy, setNotice } = useBridge();
  const { language, tr } = useI18n();
  const wasOpen = useRef(false);
  const hasAttemptedValidation = useRef(false);
  const {
    reset,
    handleSubmit,
    setError,
    clearErrors,
    trigger,
    formState: { errors, isDirty },
  } = useForm<PrinterForm>({
    defaultValues: form,
    resolver: zodResolver(
      printerFormSchema(isWindows),
    ) as unknown as Resolver<PrinterForm>,
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  useEffect(() => {
    if (!form) {
      wasOpen.current = false;
      return;
    }
    if (!wasOpen.current) {
      reset(form);
      wasOpen.current = true;
    }
  }, [form, reset]);
  const onFormChange = (next: PrinterForm) => {
    onFormUpdate(next);
    reset(next, { keepDefaultValues: true });
    if (hasAttemptedValidation.current) void trigger();
  };
  const onConnectionChange = (key: string, value: string | number) => {
    if (!form) return;
    onFormChange({
      ...form,
      connection: { ...form.connection, [key]: value },
    });
  };
  const onTypeChange = (tipo: PrinterForm["tipo"]) => {
    if (!form) return;
    const connection =
      tipo === "network"
        ? { host: "", port: 9100 }
        : tipo === "usb"
          ? { vendorId: "", productId: "", systemPrinter: "" }
          : { path: "", baudRate: 9600 };
    onFormChange({ ...form, tipo, connection });
    clearErrors("connection" as any);
  };
  const error = (path: string) => {
    let value: unknown = errors;
    for (const key of path.split(".")) {
      if (!value || typeof value !== "object") return undefined;
      value = (value as Record<string, unknown>)[key];
    }
    if (!value || typeof value !== "object") return undefined;
    const message = (value as { message?: unknown }).message;
    return typeof message === "string"
      ? tr(message as TranslationKey)
      : undefined;
  };
  const testDraft = () => {
    if (!form) return;
    const result = printerTransportSchema(isWindows).safeParse(form);
    if (result.success) return onTest("test-draft");
    hasAttemptedValidation.current = true;
    result.error.issues.forEach((issue) =>
      setError(issue.path.join(".") as FieldPath<PrinterForm>, {
        type: "manual",
        message: issue.message,
      }),
    );
  };
  const profiles = profileCatalog.profiles || [];
  const selectedCatalogProfile =
    form?.printProfile.mode === "auto"
      ? profiles.find(
          (profile: any) => profile.id === form.printProfile.profileId,
        )
      : undefined;
  const automaticProfileValues: ProfileValues = (() => {
    const values =
      form?.printProfile.language === "es" &&
      selectedCatalogProfile?.spanishLatin
        ? selectedCatalogProfile.spanishLatin
        : selectedCatalogProfile?.ascii;
    return {
      encoding: String(values?.encoding || "CP437"),
      codeTable: Number(values?.codeTable ?? 0),
      unicodeFallback: "auto",
      automaticUnicodePolicy: values?.nativePolicy || "ascii",
    };
  })();
  const advancedProfileValues: ProfileValues =
    form?.printProfile.mode === "custom" && form
      ? form.printProfile.custom || automaticProfileValues
      : automaticProfileValues;
  const spanishValidated = Boolean(
    form?.printProfile.validation?.["spanish-latin"] &&
    Number(form.printProfile.validation?.["spanish-latin"]?.catalogVersion) ===
      Number(selectedCatalogProfile?.version),
  );
  const canConfirmSpanish = Boolean(
    form?.printProfile.mode === "auto" &&
    form.printProfile.language === "es" &&
    selectedCatalogProfile?.verifiedCoverage?.includes("spanish-latin") &&
    draftDiagnostic?.ok &&
    !spanishValidated,
  );

  const updateAdvancedProfile = (
    change: Partial<ProfileValues>,
    customCharacterTable = form?.customCharacterTable || false,
  ) => {
    if (!form) return;
    onFormChange({
      ...form,
      customCharacterTable,
      printProfile: {
        language: form.printProfile.language,
        mode: "custom",
        custom: { ...advancedProfileValues, ...change },
      },
    });
    onClearDraftDiagnostic();
  };

  return (
    <Dialog open={Boolean(form)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {form?.id
              ? tr("edit_printer", { name: form.nombre })
              : tr("add_printer")}
          </DialogTitle>
          <DialogDescription>
            {tr("check_connection_before_saving")}
          </DialogDescription>
        </DialogHeader>
        {form && (
          <div className="space-y-6">
            <label className="grid gap-1 text-sm font-medium">
              {tr("name")}
              <Input
                value={form.nombre}
                aria-invalid={Boolean(error("nombre"))}
                onChange={(event) =>
                  onFormChange({ ...form, nombre: event.target.value })
                }
              />
              {error("nombre") && (
                <p className="text-xs text-destructive">{error("nombre")}</p>
              )}
            </label>
            <div className="border-t" />
            <section className="space-y-3">
              <h3 className="font-semibold">{tr("connection_section")}</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="grid gap-1 text-sm font-medium">
                  {tr("type")}
                  <Select
                    value={form.tipo}
                    onValueChange={(value) =>
                      onTypeChange(value as PrinterForm["tipo"])
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="network">{tr("network")}</SelectItem>
                      <SelectItem value="usb">USB</SelectItem>
                      <SelectItem value="bluetooth">
                        {tr("bluetooth")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                {form.tipo === "network" && (
                  <>
                    <label className="grid gap-1 text-sm font-medium">
                      {tr("host")}
                      <Input
                        value={String(form.connection.host || "")}
                        aria-invalid={Boolean(error("connection.host"))}
                        onChange={(event) =>
                          onConnectionChange("host", event.target.value)
                        }
                      />
                      {error("connection.host") && (
                        <p className="text-xs text-destructive">
                          {error("connection.host")}
                        </p>
                      )}
                    </label>
                    <label className="grid gap-1 text-sm font-medium">
                      {tr("port")}
                      <Input
                        type="number"
                        value={String(form.connection.port || 9100)}
                        aria-invalid={Boolean(error("connection.port"))}
                        onChange={(event) =>
                          onConnectionChange("port", Number(event.target.value))
                        }
                      />
                      {error("connection.port") && (
                        <p className="text-xs text-destructive">
                          {error("connection.port")}
                        </p>
                      )}
                    </label>
                  </>
                )}
                {form.tipo === "usb" && (
                  <>
                    {!isWindows && (
                      <>
                        <label className="grid gap-1 text-sm font-medium">
                          Vendor ID
                          <Input
                            placeholder="0x04b8"
                            value={String(form.connection.vendorId || "")}
                            aria-invalid={Boolean(error("connection.vendorId"))}
                            onChange={(event) =>
                              onConnectionChange("vendorId", event.target.value)
                            }
                          />
                          {error("connection.vendorId") && (
                            <p className="text-xs text-destructive">
                              {error("connection.vendorId")}
                            </p>
                          )}
                        </label>
                        <label className="grid gap-1 text-sm font-medium">
                          Product ID
                          <Input
                            placeholder="0x0202"
                            value={String(form.connection.productId || "")}
                            aria-invalid={Boolean(
                              error("connection.productId"),
                            )}
                            onChange={(event) =>
                              onConnectionChange(
                                "productId",
                                event.target.value,
                              )
                            }
                          />
                          {error("connection.productId") && (
                            <p className="text-xs text-destructive">
                              {error("connection.productId")}
                            </p>
                          )}
                        </label>
                      </>
                    )}
                    {isWindows && (
                      <label className="grid gap-1 text-sm font-medium md:col-span-2">
                        {tr("installed_windows_printer")}
                        <Input
                          placeholder={tr("windows_printer_placeholder")}
                          value={String(form.connection.systemPrinter || "")}
                          aria-invalid={Boolean(
                            error("connection.systemPrinter"),
                          )}
                          onChange={(event) =>
                            onConnectionChange(
                              "systemPrinter",
                              event.target.value,
                            )
                          }
                        />
                        {error("connection.systemPrinter") && (
                          <p className="text-xs text-destructive">
                            {error("connection.systemPrinter")}
                          </p>
                        )}
                      </label>
                    )}
                  </>
                )}
                {form.tipo === "bluetooth" && (
                  <label className="grid gap-1 text-sm font-medium md:col-span-2">
                    {tr("path")}
                    <Input
                      placeholder="COM5"
                      value={String(form.connection.path || "")}
                      aria-invalid={Boolean(error("connection.path"))}
                      onChange={(event) =>
                        onConnectionChange("path", event.target.value)
                      }
                    />
                    {error("connection.path") && (
                      <p className="text-xs text-destructive">
                        {error("connection.path")}
                      </p>
                    )}
                  </label>
                )}
              </div>
            </section>
            <div className="border-t" />
            <section className="space-y-3">
              <h3 className="font-semibold">{tr("print_profile_section")}</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium">
                  {tr("width")}
                  <Select
                    value={String(form.anchoMm)}
                    onValueChange={(value) =>
                      onFormChange({
                        ...form,
                        anchoMm: Number(value) as 58 | 80,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="80">80 mm</SelectItem>
                      <SelectItem value="58">58 mm</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  {tr("printing_language")}
                  <LanguageSelect
                    value={form.printProfile.language}
                    tr={tr}
                    onValueChange={(profileLanguage) => {
                      if (profileLanguage === "system") return;
                      onFormChange({
                        ...form,
                        customCharacterTable: false,
                        printProfile: {
                          ...form.printProfile,
                          language: profileLanguage as "es" | "en",
                          mode: "auto",
                          profileId:
                            form.printProfile.profileId || "unlisted-safe",
                          custom: undefined,
                          validation: {
                            ascii: form.printProfile.validation?.ascii,
                          },
                        },
                      });
                      setNotice(tr("profile_reset_for_language"));
                    }}
                  />
                </label>
              </div>
              <div className="grid gap-2">
                <div className="grid gap-1 text-sm font-medium">
                  <span>{tr("printer_model")}</span>
                  <Combobox
                    key={`${form.printProfile.mode}:${selectedCatalogProfile?.id || "none"}`}
                    items={profiles}
                    value={selectedCatalogProfile || null}
                    itemToStringLabel={(profile: any) =>
                      profile.name?.[language] || profile.name?.en || profile.id
                    }
                    filter={(profile: any, query: string) => {
                      const normalizedQuery = query.trim().toLowerCase();
                      return (
                        !normalizedQuery ||
                        [profile.id, profile.name?.en, profile.name?.es].some(
                          (value) =>
                            String(value || "")
                              .toLowerCase()
                              .includes(normalizedQuery),
                        )
                      );
                    }}
                    onValueChange={(profile: any | null) => {
                      if (!profile) return;
                      onFormChange({
                        ...form,
                        printProfile: {
                          language: form.printProfile.language,
                          mode: "auto",
                          profileId: profile.id,
                        },
                        customCharacterTable: false,
                      });
                      onClearDraftDiagnostic();
                    }}
                  >
                    <ComboboxInputGroup>
                      <ComboboxInput
                        aria-label={tr("printer_model")}
                        placeholder={tr("search_profiles")}
                      />
                      <ComboboxTrigger aria-label={tr("printer_model")} />
                    </ComboboxInputGroup>
                    <ComboboxPortal>
                      <ComboboxPositioner>
                        <ComboboxPopup>
                          <ComboboxEmpty>{tr("search_profiles")}</ComboboxEmpty>
                          <ComboboxList>
                            {(profile: any) => (
                              <ComboboxItem key={profile.id} value={profile}>
                                {profile.name?.[language] ||
                                  profile.name?.en ||
                                  profile.id}
                              </ComboboxItem>
                            )}
                          </ComboboxList>
                        </ComboboxPopup>
                      </ComboboxPositioner>
                    </ComboboxPortal>
                  </Combobox>
                </div>
                {profileCatalog.suggestedProfileId &&
                  profileCatalog.suggestedProfileId !==
                    form.printProfile.profileId && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        onFormChange({
                          ...form,
                          printProfile: {
                            language: form.printProfile.language,
                            mode: "auto",
                            profileId: profileCatalog.suggestedProfileId,
                          },
                          customCharacterTable: false,
                        })
                      }
                    >
                      {tr("profile_suggested")}
                    </Button>
                  )}
                {selectedCatalogProfile && (
                  <div className="text-sm text-muted-foreground">
                    <p>
                      {selectedCatalogProfile.description?.[language] ||
                        selectedCatalogProfile.description?.en}
                    </p>
                    <p className="mt-1 font-medium text-foreground">
                      {tr("profile_coverage")}: {tr("coverage_ascii")}
                      {selectedCatalogProfile.verifiedCoverage?.includes(
                        "spanish-latin",
                      )
                        ? ` · ${tr(spanishValidated ? "coverage_spanish" : "coverage_spanish_pending")}`
                        : ` · ${tr("coverage_bitmap")}`}
                    </p>
                  </div>
                )}
              </div>
              {form.printProfile.language === "es" &&
                form.printProfile.mode === "auto" &&
                selectedCatalogProfile?.verifiedCoverage?.includes(
                  "spanish-latin",
                ) && (
                  <div className="text-sm">
                    <p className="text-muted-foreground">
                      {tr("spanish_validation_pending")}
                    </p>
                    {spanishValidated ? (
                      <p className="mt-2 font-medium text-emerald-700 dark:text-emerald-400">
                        {tr("spanish_validation_confirmed")}
                      </p>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => onTest("spanish-validation")}
                          disabled={busy === "test-draft"}
                        >
                          {tr("verify_spanish")}
                        </Button>
                        {canConfirmSpanish && (
                          <Button
                            type="button"
                            onClick={() =>
                              onConfirmSpanish(
                                Number(selectedCatalogProfile.version),
                              )
                            }
                          >
                            {tr("spanish_validation_confirm")}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              {(form.printProfile.profileId === "unlisted-safe" ||
                form.printProfile.mode === "custom") && (
                <div className="grid gap-3 border-t pt-4">
                  <label className="grid gap-1 text-sm font-medium">
                    {tr("reported_model")}
                    <Input
                      value={form.reportedModel || ""}
                      aria-invalid={Boolean(error("reportedModel"))}
                      onChange={(event) =>
                        onFormChange({
                          ...form,
                          reportedModel: event.target.value,
                        })
                      }
                    />
                    {error("reportedModel") && (
                      <p className="text-xs text-destructive">
                        {error("reportedModel")}
                      </p>
                    )}
                  </label>
                  <div>
                    <p className="font-medium">{tr("compatibility_report")}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {tr("compatibility_report_description")}
                    </p>
                    <Button
                      className="mt-3"
                      type="button"
                      variant="outline"
                      disabled={busy === "export-report"}
                      onClick={onExportReport}
                    >
                      <Clipboard data-icon="inline-start" />
                      {tr("export_report")}
                    </Button>
                  </div>
                </div>
              )}
            </section>
            <div className="border-t" />
            <section className="space-y-3">
              <h3 className="font-semibold">{tr("operation_section")}</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center justify-between text-sm font-medium">
                  {tr("open_drawer_setting")}
                  <Switch
                    checked={form.abreCajon}
                    onCheckedChange={(abreCajon) =>
                      onFormChange({ ...form, abreCajon })
                    }
                  />
                </label>
                <label className="flex items-center justify-between text-sm font-medium">
                  {tr("printer_enabled")}
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(enabled) =>
                      onFormChange({ ...form, enabled })
                    }
                  />
                </label>
              </div>
            </section>
            <div className="border-t" />
            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer font-semibold">
                {tr("advanced_printing")}
              </summary>
              <div className="mt-4 space-y-4">
                {form.tipo === "bluetooth" && (
                  <label className="grid gap-1 text-sm font-medium md:max-w-xs">
                    Baud rate
                    <Input
                      type="number"
                      value={String(form.connection.baudRate || 9600)}
                      aria-invalid={Boolean(error("connection.baudRate"))}
                      onChange={(event) =>
                        onConnectionChange(
                          "baudRate",
                          Number(event.target.value),
                        )
                      }
                    />
                    {error("connection.baudRate") && (
                      <p className="text-xs text-destructive">
                        {error("connection.baudRate")}
                      </p>
                    )}
                  </label>
                )}
                <p className="text-sm text-muted-foreground">
                  {form.printProfile.mode === "auto"
                    ? tr("advanced_profile_notice")
                    : tr("profile_custom_notice")}
                </p>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="grid gap-1 text-sm font-medium">
                    {tr("encoding")}
                    <Select
                      value={advancedProfileValues.encoding}
                      onValueChange={(encoding) => {
                        const preset = encodingPresets.find(
                          (item) => item.encoding === encoding,
                        );
                        if (preset)
                          updateAdvancedProfile(
                            {
                              encoding: preset.encoding,
                              codeTable: preset.codeTable,
                            },
                            false,
                          );
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {encodingPresets.map((preset) => (
                          <SelectItem
                            key={preset.encoding}
                            value={preset.encoding}
                          >
                            {preset.encoding}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {error("printProfile.custom.encoding") && (
                      <p className="text-xs text-destructive">
                        {error("printProfile.custom.encoding")}
                      </p>
                    )}
                  </label>
                  <label className="grid gap-1 text-sm font-medium">
                    {tr("character_table")}
                    <Select
                      value={selectedCharacterTable(
                        advancedProfileValues.codeTable,
                        form.customCharacterTable,
                      )}
                      onValueChange={(value) =>
                        value === "custom"
                          ? updateAdvancedProfile({}, true)
                          : updateAdvancedProfile(
                              { codeTable: Number(value) },
                              false,
                            )
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {characterTablePresets.map((preset) => (
                          <SelectItem
                            key={preset.value}
                            value={String(preset.value)}
                          >
                            {preset.label}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">
                          {tr("custom_character_table")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {selectedCharacterTable(
                      advancedProfileValues.codeTable,
                      form.customCharacterTable,
                    ) === "custom" && (
                      <Input
                        type="number"
                        min="0"
                        max="255"
                        aria-label={tr("custom_character_table_number")}
                        placeholder={tr("custom_character_table_number")}
                        value={String(advancedProfileValues.codeTable)}
                        onChange={(event) =>
                          updateAdvancedProfile(
                            { codeTable: Number(event.target.value) },
                            true,
                          )
                        }
                      />
                    )}
                    {error("printProfile.custom.codeTable") && (
                      <p className="text-xs text-destructive">
                        {error("printProfile.custom.codeTable")}
                      </p>
                    )}
                  </label>
                  <label className="grid gap-1 text-sm font-medium">
                    {tr("unicode_strategy")}
                    <Select
                      value={advancedProfileValues.unicodeFallback}
                      onValueChange={(unicodeFallback) =>
                        updateAdvancedProfile({
                          unicodeFallback:
                            unicodeFallback as ProfileValues["unicodeFallback"],
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">
                          {tr("unicode_auto")}
                        </SelectItem>
                        <SelectItem value="raster">
                          {tr("unicode_raster")}
                        </SelectItem>
                        <SelectItem value="native">
                          {tr("unicode_native")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                </div>
              </div>
            </details>
            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer font-semibold">
                {tr("print_diagnostics")}
              </summary>
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!diagnostics.length}
                    onClick={() => copy(JSON.stringify(diagnostics, null, 2))}
                  >
                    <Clipboard data-icon="inline-start" />
                    {tr("copy")}
                  </Button>
                </div>
                {diagnostics.length ? (
                  diagnostics.map((entry: any, index: number) => (
                    <article
                      key={`${entry.startedAt}-${index}`}
                      className="border-t pt-3 first:border-t-0 first:pt-0"
                    >
                      <p className="font-medium">
                        {entry.ok
                          ? tr("operation_completed")
                          : translateMessage(language, entry.message)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {entry.operation} ·{" "}
                        {new Date(entry.startedAt).toLocaleString()} ·{" "}
                        {entry.durationMs || 0} ms
                      </p>
                      {entry.cause && (
                        <div className="mt-3">
                          <p className="text-xs font-medium">
                            {tr("diagnostic_cause")}
                          </p>
                          <code className="mt-1 block break-words bg-muted p-2 text-xs">
                            {entry.cause}
                          </code>
                        </div>
                      )}
                      {entry.steps?.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-medium">
                            {tr("diagnostic_steps")}
                          </p>
                          <ol className="mt-1 space-y-1 text-xs text-muted-foreground">
                            {entry.steps.map(
                              (
                                step: Record<string, unknown>,
                                stepIndex: number,
                              ) => (
                                <li
                                  key={`${String(step.at)}-${stepIndex}`}
                                  className="break-words"
                                >
                                  <code>{String(step.stage)}</code>
                                  {diagnosticDetails(step) &&
                                    ` · ${diagnosticDetails(step)}`}
                                </li>
                              ),
                            )}
                          </ol>
                        </div>
                      )}
                    </article>
                  ))
                ) : (
                  <p className="text-muted-foreground">
                    {tr("no_print_diagnostics")}
                  </p>
                )}
              </div>
            </details>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tr("cancel")}
          </Button>
          <Button
            variant="outline"
            onClick={testDraft}
            disabled={busy === "test-draft"}
          >
            {busy === "test-draft" && (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            )}
            {tr("test_without_saving")}
          </Button>
          <Button
            onClick={() =>
              void handleSubmit(onSave, () => {
                hasAttemptedValidation.current = true;
              })()
            }
            disabled={busy === "save" || Boolean(form?.id && !isDirty)}
          >
            {tr("save_printer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
