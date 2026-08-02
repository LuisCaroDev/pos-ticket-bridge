import {
  memo,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type FieldPath, type Resolver } from "react-hook-form";
import {
  ClipboardPaste,
  Clipboard,
  CircleHelp,
  Download,
  Loader2,
  Plus,
  Save,
  ScrollText,
  Share2,
  Settings2,
  Trash2,
  Upload,
  XIcon,
} from "lucide-react";
import { type TranslationKey } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, FormInfoPanel, FormSection } from "@/components/ui/form";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Combobox,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
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
import { Separator } from "@/components/ui/separator";
import { LanguageSelect } from "./LanguageSelect";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  type CharacterProfileCandidate,
  type CharacterProfileTestSet,
} from "@/core/character-profile-tests";
import { useBridge } from "@/contexts/BridgeContext";
import { useI18n } from "@/contexts/I18nContext";
import { usePrintDiagnostics } from "@/contexts/PrintDiagnosticsContext";
import { printerFormSchema, printerTransportSchema } from "./form-validation";
import type { PrinterForm, ProfileValues } from "./types";
import { CharacterProfileAssistant } from "./CharacterProfileAssistant";

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
function AdvancedFieldLabel({
  children,
  help,
}: {
  children: string;
  help: string;
}) {
  return (
    <FieldTitle>
      {children}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={help}
            />
          }
        >
          <CircleHelp />
        </TooltipTrigger>
        <TooltipContent>{help}</TooltipContent>
      </Tooltip>
    </FieldTitle>
  );
}
type PrinterEditorPanelProps = {
  form?: PrinterForm;
  draftSessionId?: string;
  detected: boolean;
  diagnostics: any[];
  profileCatalog: any;
  isWindows: boolean;
  onClose: () => void;
  onFormChange: (form: PrinterForm) => void;
  onClearDraftDiagnostic: () => void;
  onTest: () => void;
  onRunCharacterProfileTrial: (
    candidate: CharacterProfileCandidate,
  ) => Promise<boolean>;
  onValidateCharacterProfileTestSet: (
    testSet: CharacterProfileTestSet,
  ) => Promise<CharacterProfileTestSet | undefined>;
  onSaveLocalProfile: (input: unknown) => Promise<any>;
  onExportLocalProfile: (target: "clipboard" | "file") => Promise<boolean>;
  onImportLocalProfile: (input: unknown) => Promise<boolean>;
  onPasteLocalProfile: () => Promise<boolean>;
  onDeleteLocalProfile: (id: string) => Promise<boolean>;
  onSave: () => void;
};

type LocalProfileOption = {
  language?: "es" | "en";
  widthMm?: 58 | 80;
  values?: ProfileValues;
};

const exclusiveProfileWidth = (profile: any): 58 | 80 | undefined => {
  if (profile.local || typeof profile.name === "string") return profile.widthMm;
  return Array.isArray(profile.paperWidths) && profile.paperWidths.length === 1
    ? profile.paperWidths[0]
    : undefined;
};

export const profileDisplayName = (
  profile: any,
  language: "es" | "en",
  formatWidth: (width: 58 | 80) => string,
) => {
  const name =
    profile.local || typeof profile.name === "string"
      ? String(profile.name || profile.id)
      : profile.name?.[language] || profile.name?.en || profile.id;
  const width = exclusiveProfileWidth(profile);
  if (!width) return name;
  return `${name.replace(/\s+-\s+(?:58|80)\s*mm$/i, "")}${formatWidth(width)}`;
};

export const filterProfilesForPrintLanguage = (
  profiles: any[],
  localProfiles: LocalProfileOption[],
  language: PrinterForm["printProfile"]["language"],
  paperWidth?: 58 | 80,
) => {
  const catalogProfiles = profiles.filter((profile: any) => {
    if (
      paperWidth &&
      Array.isArray(profile.paperWidths) &&
      !profile.paperWidths.includes(paperWidth)
    )
      return false;
    if (language === "en")
      return (
        profile.ascii ||
        profile.verifiedCoverage?.includes("ascii") ||
        profile.verifiedCoverage === undefined
      );
    return (
      profile.spanishLatin ||
      profile.supportsRaster ||
      profile.verifiedCoverage?.includes("spanish-latin") ||
      profile.verifiedCoverage === undefined
    );
  });
  return [
    ...catalogProfiles,
    ...localProfiles.filter(
      (profile) =>
        profile.language === language &&
        (!paperWidth || profile.widthMm === paperWidth),
    ),
  ];
};

export const hasUnsavedCustomProfile = (
  printProfile: PrinterForm["printProfile"] | undefined,
  selectedLocalProfile?: LocalProfileOption,
) => {
  if (printProfile?.mode !== "custom") return false;
  if (!selectedLocalProfile?.values) return true;
  return (
    selectedLocalProfile.values.encoding !== printProfile.custom?.encoding ||
    selectedLocalProfile.values.codeTable !== printProfile.custom?.codeTable ||
    selectedLocalProfile.values.unicodeFallback !==
      printProfile.custom?.unicodeFallback ||
    selectedLocalProfile.values.automaticUnicodePolicy !==
      printProfile.custom?.automaticUnicodePolicy
  );
};

export const PrinterEditorPanel = memo(function PrinterEditorPanel({
  form,
  draftSessionId,
  detected,
  diagnostics,
  profileCatalog,
  isWindows,
  onClose,
  onFormChange: onFormUpdate,
  onClearDraftDiagnostic,
  onTest,
  onRunCharacterProfileTrial,
  onValidateCharacterProfileTestSet,
  onSaveLocalProfile,
  onExportLocalProfile,
  onImportLocalProfile,
  onPasteLocalProfile,
  onDeleteLocalProfile,
  onSave,
}: PrinterEditorPanelProps) {
  const { copy, busy, setNotice } = useBridge();
  const { openDiagnostics } = usePrintDiagnostics();
  const { language, tr } = useI18n();
  const wasOpen = useRef(false);
  const hasAttemptedValidation = useRef(false);
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const [pendingProfileLanguage, setPendingProfileLanguage] = useState<
    PrinterForm["printProfile"]["language"] | undefined
  >();
  const [saveProfileOpen, setSaveProfileOpen] = useState(false);
  const [profileImportOpen, setProfileImportOpen] = useState(false);
  const [profileExportOpen, setProfileExportOpen] = useState(false);
  const [profileManagerOpen, setProfileManagerOpen] = useState(false);
  const [profileDeletionTarget, setProfileDeletionTarget] = useState<any>();
  const [profileFileDragging, setProfileFileDragging] = useState(false);
  const [profileBrand, setProfileBrand] = useState("");
  const [profileModel, setProfileModel] = useState("");
  const [profileIdentityError, setProfileIdentityError] = useState(false);
  const profileImportInputRef = useRef<HTMLInputElement>(null);
  const openCurrentDiagnostics = () => {
    if (!form) return;
    openDiagnostics({
      title: form.nombre,
      ...(form.id
        ? { filter: { printerId: form.id } }
        : draftSessionId
          ? { filter: { draftSessionId } }
          : { diagnostics }),
    });
  };
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
    if (result.success) return onTest();
    hasAttemptedValidation.current = true;
    result.error.issues.forEach((issue) =>
      setError(issue.path.join(".") as FieldPath<PrinterForm>, {
        type: "manual",
        message: issue.message,
      }),
    );
  };
  const runCharacterProfileTrial = async (
    candidate: CharacterProfileCandidate,
  ) => {
    if (!form) return false;
    const result = printerTransportSchema(isWindows).safeParse(form);
    if (result.success) return onRunCharacterProfileTrial(candidate);
    hasAttemptedValidation.current = true;
    result.error.issues.forEach((issue) =>
      setError(issue.path.join(".") as FieldPath<PrinterForm>, {
        type: "manual",
        message: issue.message,
      }),
    );
    return false;
  };
  const profiles = profileCatalog.profiles || [];
  const localProfiles = profileCatalog.localProfiles || [];
  const selectedCatalogProfile =
    form?.printProfile.mode === "auto"
      ? profiles.find(
          (profile: any) => profile.id === form.printProfile.profileId,
        )
      : undefined;
  const selectedLocalProfile =
    form?.printProfile.mode === "custom"
      ? localProfiles.find(
          (profile: any) => profile.id === form.printProfile.localProfileId,
        )
      : undefined;
  const selectedModelProfile = selectedCatalogProfile || selectedLocalProfile;
  const displayProfileName = (profile: any) =>
    profileDisplayName(profile, language, (width) =>
      tr("profile_width", { width }),
    );
  const availableProfiles = form
    ? filterProfilesForPrintLanguage(
        profiles,
        localProfiles,
        form.printProfile.language,
        form.anchoMm,
      )
    : [];
  const profileGroups = Object.values(
    availableProfiles.reduce(
      (
        groups: Record<string, { value: string; items: any[] }>,
        profile: any,
      ) => {
        const label =
          profile.brand ||
          (profile.id === "unlisted-safe"
            ? tr("profile_brand_generic")
            : String(
                profile.name?.[language] || profile.name?.en || profile.id,
              ).split(/\s+/)[0]);
        const group = groups[label] || { value: label, items: [] };
        group.items.push(profile);
        groups[label] = group;
        return groups;
      },
      {},
    ),
  ).sort((left, right) => left.value.localeCompare(right.value, language));
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
  const customProfileNeedsSaving = hasUnsavedCustomProfile(
    form?.printProfile,
    selectedLocalProfile,
  );
  const canEditAdvancedProfile = form?.printProfile.mode === "custom";

  const applyAutomaticProfileForLanguage = (
    profileLanguage: PrinterForm["printProfile"]["language"],
  ) => {
    if (!form) return;
    onFormChange({
      ...form,
      customCharacterTable: false,
      printProfile: {
        language: profileLanguage,
        mode: "auto",
        profileId:
          form.printProfile.mode === "auto"
            ? form.printProfile.profileId || "unlisted-safe"
            : "unlisted-safe",
      },
    });
    onClearDraftDiagnostic();
    setNotice(tr("profile_reset_for_language"));
  };
  const updatePaperWidth = (paperWidth: 58 | 80) => {
    if (!form) return;
    const selectedProfile =
      form.printProfile.mode === "auto"
        ? profiles.find(
            (profile: any) => profile.id === form.printProfile.profileId,
          )
        : selectedLocalProfile;
    const selectedProfileSupportsWidth =
      form.printProfile.mode === "custom"
        ? selectedProfile.widthMm === paperWidth
        : !Array.isArray(selectedProfile?.paperWidths) ||
          selectedProfile.paperWidths.includes(paperWidth);
    onFormChange({
      ...form,
      anchoMm: paperWidth,
      printProfile: selectedProfileSupportsWidth
        ? form.printProfile
        : {
            language: form.printProfile.language,
            mode: "auto",
            profileId: "unlisted-safe",
          },
    });
    if (!selectedProfileSupportsWidth) onClearDraftDiagnostic();
  };
  const requestProfileLanguageChange = (
    profileLanguage: PrinterForm["printProfile"]["language"],
  ) => {
    if (!form || profileLanguage === form.printProfile.language) return;
    if (customProfileNeedsSaving) {
      setPendingProfileLanguage(profileLanguage);
      return;
    }
    applyAutomaticProfileForLanguage(profileLanguage);
  };

  const updateAdvancedProfile = (
    change: Partial<ProfileValues>,
    customCharacterTable = form?.customCharacterTable || false,
  ) => {
    if (!form || !canEditAdvancedProfile) return;
    onFormChange({
      ...form,
      customCharacterTable,
      printProfile: {
        language: form.printProfile.language,
        mode: "custom",
        custom: {
          ...advancedProfileValues,
          ...change,
          confirmation: undefined,
        },
        ...(form.printProfile.localProfileId
          ? { localProfileId: form.printProfile.localProfileId }
          : {}),
      },
    });
    onClearDraftDiagnostic();
  };
  const requestClose = () => {
    if (isDirty) {
      setDiscardConfirmationOpen(true);
      return;
    }
    onClose();
  };
  const confirmCharacterProfile = async (
    testSet: CharacterProfileTestSet,
    candidate: CharacterProfileCandidate,
  ) => {
    if (!form?.reportedBrand?.trim() || !form.reportedModel?.trim()) {
      setNotice(tr("character_profile_model_required"));
      return false;
    }
    const profile = await onSaveLocalProfile({
      brand: form.reportedBrand.trim(),
      model: form.reportedModel.trim(),
      language: "es",
      widthMm: form.anchoMm,
      values: {
        encoding: candidate.encoding,
        codeTable: candidate.codeTable,
        unicodeFallback: "auto",
        automaticUnicodePolicy: "encoding",
        confirmation: {
          confirmedAt: new Date().toISOString(),
          testSetName: testSet.name,
          candidateId: candidate.id,
        },
      },
    });
    if (!profile) return false;
    onFormChange({
      ...form,
      reportedBrand: profile.brand,
      reportedModel: profile.model,
      printProfile: {
        language: profile.language,
        mode: "custom",
        custom: { ...profile.values },
        localProfileId: profile.id,
      },
    });
    setNotice(tr("character_profile_confirmed"));
    return true;
  };
  const createCustomProfile = () => {
    if (!form) return;
    onFormChange({
      ...form,
      printProfile: {
        language: form.printProfile.language,
        mode: "custom",
        custom: { ...advancedProfileValues },
      },
      customCharacterTable: false,
    });
    onClearDraftDiagnostic();
  };
  const openSaveProfile = () => {
    if (!form) return;
    setProfileBrand(selectedLocalProfile?.brand || form.reportedBrand || "");
    setProfileModel(selectedLocalProfile?.model || form.reportedModel || "");
    setProfileIdentityError(false);
    setSaveProfileOpen(true);
  };
  const saveCustomProfile = async () => {
    if (!form || !profileBrand.trim() || !profileModel.trim()) {
      setProfileIdentityError(true);
      return;
    }
    const profile = await onSaveLocalProfile({
      brand: profileBrand.trim(),
      model: profileModel.trim(),
      language: form.printProfile.language,
      widthMm: form.anchoMm,
      values: { ...advancedProfileValues },
    });
    if (!profile) return;
    onFormChange({
      ...form,
      reportedBrand: profile.brand,
      reportedModel: profile.model,
      printProfile: {
        language: profile.language,
        mode: "custom",
        custom: { ...profile.values },
        localProfileId: profile.id,
      },
    });
    setSaveProfileOpen(false);
  };
  const importLocalProfileText = async (content: string) => {
    try {
      if (!(await onImportLocalProfile(JSON.parse(content)))) {
        setNotice(tr("local_profile_import_error"));
        return false;
      }
      setProfileImportOpen(false);
      return true;
    } catch {
      setNotice(tr("local_profile_import_error"));
      return false;
    }
  };
  const importLocalProfile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await importLocalProfileText(await file.text());
  };
  const pasteLocalProfile = async () => {
    try {
      if (!(await onPasteLocalProfile())) {
        setNotice(tr("local_profile_import_error"));
        return;
      }
      setProfileImportOpen(false);
    } catch {
      setNotice(tr("local_profile_import_error"));
    }
  };
  const importDroppedLocalProfile = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setProfileFileDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) await importLocalProfileText(await file.text());
  };
  const deleteManagedProfile = async () => {
    if (!profileDeletionTarget) return;
    if (await onDeleteLocalProfile(profileDeletionTarget.id))
      setProfileDeletionTarget(undefined);
  };

  if (!form) return null;

  return (
    <aside
      data-slot="printer-editor-panel"
      aria-label={tr("close")}
      className="relative flex h-full w-full max-w-2xl min-w-0 flex-col bg-popover text-sm text-popover-foreground"
    >
      <header className="shrink-0 border-b px-6 py-5 pr-12">
        <h2 className="text-lg font-semibold tracking-tight">
          {form?.id
            ? tr("edit_printer", { name: form.nombre })
            : tr("add_printer")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {tr("check_connection_before_saving")}
        </p>
      </header>
      <Button
        data-slot="printer-editor-close"
        variant="ghost"
        className="absolute top-3 right-3"
        size="icon-sm"
        onClick={requestClose}
        aria-label={tr("close")}
      >
        <XIcon />
      </Button>
      {form && (
        <div
          data-slot="printer-form-body"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 [scrollbar-gutter:stable]"
        >
          <div className="flex flex-col gap-6">
            {detected && (
              <p
                role="status"
                className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-muted-foreground"
              >
                {tr("detected_connection_notice")}
              </p>
            )}
            <FormField>
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
            </FormField>
            <Separator />
            <FormSection title={tr("connection_section")}>
              <FieldGroup className="grid gap-4 md:grid-cols-3">
                <FormField>
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
                      <SelectGroup>
                        <SelectItem value="network">{tr("network")}</SelectItem>
                        <SelectItem value="usb">USB</SelectItem>
                        <SelectItem value="bluetooth">
                          {tr("bluetooth")}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </FormField>
                {form.tipo === "network" && (
                  <>
                    <FormField>
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
                    </FormField>
                    <FormField>
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
                    </FormField>
                  </>
                )}
                {form.tipo === "usb" && (
                  <>
                    {!isWindows && (
                      <>
                        <FormField>
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
                        </FormField>
                        <FormField>
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
                        </FormField>
                      </>
                    )}
                    {isWindows && (
                      <FormField className="md:col-span-2">
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
                      </FormField>
                    )}
                  </>
                )}
                {form.tipo === "bluetooth" && (
                  <FormField className="md:col-span-2">
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
                  </FormField>
                )}
              </FieldGroup>
            </FormSection>
            <Separator />
            <FormSection title={tr("print_profile_section")}>
              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <FormField>
                  {tr("width")}
                  <Select
                    value={String(form.anchoMm)}
                    items={{ "80": "80 mm", "58": "58 mm" }}
                    onValueChange={(value) =>
                      updatePaperWidth(Number(value) as 58 | 80)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="80">80 mm</SelectItem>
                        <SelectItem value="58">58 mm</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField>
                  <FieldLabel htmlFor="printer-print-language">
                    {tr("printing_language")}
                  </FieldLabel>
                  <LanguageSelect
                    id="printer-print-language"
                    value={form.printProfile.language}
                    tr={tr}
                    onValueChange={(profileLanguage) => {
                      if (profileLanguage === "system") return;
                      requestProfileLanguageChange(
                        profileLanguage as "es" | "en",
                      );
                    }}
                  />
                </FormField>
              </FieldGroup>
              <div className="grid gap-2">
                <div className="grid gap-1 text-sm font-medium text-foreground">
                  <span>{tr("print_profile_selector")}</span>
                  <div className="flex items-center gap-2">
                    <Combobox
                      key={`${form.printProfile.mode}:${selectedModelProfile?.id || "none"}`}
                      className="min-w-0 flex-1"
                      items={profileGroups}
                      value={selectedModelProfile || null}
                      itemToStringLabel={displayProfileName}
                      filter={(profile: any, query: string) => {
                        const normalizedQuery = query.trim().toLowerCase();
                        return (
                          !normalizedQuery ||
                          [
                            profile.id,
                            profile.brand,
                            profile.model,
                            profile.name,
                            profile.name?.en,
                            profile.name?.es,
                          ].some((value) =>
                            String(value || "")
                              .toLowerCase()
                              .includes(normalizedQuery),
                          )
                        );
                      }}
                      onValueChange={(profile: any | null) => {
                        if (!profile) return;
                        if (profile.local) {
                          onFormChange({
                            ...form,
                            anchoMm: profile.widthMm || form.anchoMm,
                            reportedBrand: profile.brand,
                            reportedModel: profile.model,
                            printProfile: {
                              language: profile.language,
                              mode: "custom",
                              custom: { ...profile.values },
                              localProfileId: profile.id,
                            },
                            customCharacterTable: false,
                          });
                          onClearDraftDiagnostic();
                          return;
                        }
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
                          aria-label={tr("print_profile_selector")}
                          placeholder={tr("search_profiles")}
                        />
                        <ComboboxTrigger
                          aria-label={tr("print_profile_selector")}
                        />
                      </ComboboxInputGroup>
                      <ComboboxPortal>
                        <ComboboxPositioner>
                          <ComboboxPopup>
                            <ComboboxEmpty>
                              {tr("search_profiles")}
                            </ComboboxEmpty>
                            <ComboboxList>
                              {(group: any) => (
                                <ComboboxGroup
                                  key={group.value}
                                  items={group.items}
                                >
                                  <ComboboxGroupLabel>
                                    {group.value}
                                  </ComboboxGroupLabel>
                                  <ComboboxCollection>
                                    {(profile: any) => (
                                      <ComboboxItem
                                        key={profile.id}
                                        value={profile}
                                      >
                                        <span className="flex min-w-0 items-center gap-2">
                                          <span className="truncate">
                                            {displayProfileName(profile)}
                                          </span>
                                          <Badge
                                            variant={
                                              profile.local
                                                ? "secondary"
                                                : "outline"
                                            }
                                          >
                                            {tr(
                                              profile.local
                                                ? "profile_personalized"
                                                : "profile_verified",
                                            )}
                                          </Badge>
                                        </span>
                                      </ComboboxItem>
                                    )}
                                  </ComboboxCollection>
                                </ComboboxGroup>
                              )}
                            </ComboboxList>
                          </ComboboxPopup>
                        </ComboboxPositioner>
                      </ComboboxPortal>
                    </Combobox>
                    <CharacterProfileAssistant
                      busy={Boolean(busy)}
                      brand={form.reportedBrand || ""}
                      model={form.reportedModel || ""}
                      onBrandChange={(reportedBrand) =>
                        onFormChange({ ...form, reportedBrand })
                      }
                      onModelChange={(reportedModel) =>
                        onFormChange({ ...form, reportedModel })
                      }
                      onRunTrial={runCharacterProfileTrial}
                      onValidate={onValidateCharacterProfileTestSet}
                      onConfirm={confirmCharacterProfile}
                      onViewDiagnostics={openCurrentDiagnostics}
                      onCopyPrompt={(model) =>
                        copy(tr("character_profile_ai_prompt", { model }))
                      }
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      title={tr("local_profile_import")}
                      aria-label={tr("local_profile_import")}
                      disabled={Boolean(busy)}
                      onClick={() => setProfileImportOpen(true)}
                    >
                      <Upload />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      title={tr("manage_local_profiles")}
                      aria-label={tr("manage_local_profiles")}
                      disabled={Boolean(busy)}
                      onClick={() => setProfileManagerOpen(true)}
                    >
                      <Settings2 />
                    </Button>
                    {selectedLocalProfile && (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        title={tr("local_profile_export")}
                        aria-label={tr("local_profile_export")}
                        disabled={Boolean(busy)}
                        onClick={() => setProfileExportOpen(true)}
                      >
                        <Share2 />
                      </Button>
                    )}
                  </div>
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
                  <FormInfoPanel className="p-3">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {selectedCatalogProfile.description?.[language] ||
                        selectedCatalogProfile.description?.en}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-foreground">
                        {tr("profile_coverage")}
                      </span>
                      <Badge variant="outline">{tr("coverage_ascii")}</Badge>
                      <Badge variant="outline">
                        {tr(
                          selectedCatalogProfile.verifiedCoverage?.includes(
                            "spanish-latin",
                          )
                            ? "coverage_spanish"
                            : "coverage_bitmap",
                        )}
                      </Badge>
                    </div>
                  </FormInfoPanel>
                )}
              </div>
              <details className="rounded-lg border p-4">
                <summary className="cursor-pointer font-semibold">
                  {tr("advanced_printing")}
                </summary>
                <div className="mt-4 flex flex-col gap-4">
                  {form.tipo === "bluetooth" && (
                    <FormField className="md:max-w-xs">
                      <AdvancedFieldLabel help={tr("baud_rate_help")}>
                        {tr("baud_rate")}
                      </AdvancedFieldLabel>
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
                    </FormField>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {form.printProfile.mode === "auto"
                      ? tr("advanced_profile_notice")
                      : tr("profile_custom_notice")}
                  </p>
                  {!canEditAdvancedProfile ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{tr("profile_verified")}</Badge>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={createCustomProfile}
                      >
                        <Plus data-icon="inline-start" />
                        {tr("create_custom_profile")}
                      </Button>
                    </div>
                  ) : customProfileNeedsSaving ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        {tr("profile_changes_pending")}
                      </Badge>
                      <Button type="button" onClick={openSaveProfile}>
                        <Save data-icon="inline-start" />
                        {tr("save_custom_profile")}
                      </Button>
                    </div>
                  ) : (
                    <Badge variant="secondary">
                      {tr("profile_personalized")}
                    </Badge>
                  )}
                  <FieldGroup className="grid gap-4 md:grid-cols-3">
                    <FormField>
                      <AdvancedFieldLabel help={tr("encoding_help")}>
                        {tr("encoding")}
                      </AdvancedFieldLabel>
                      <Select
                        value={advancedProfileValues.encoding}
                        disabled={!canEditAdvancedProfile}
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
                          <SelectGroup>
                            {encodingPresets.map((preset) => (
                              <SelectItem
                                key={preset.encoding}
                                value={preset.encoding}
                              >
                                {preset.encoding}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      {error("printProfile.custom.encoding") && (
                        <p className="text-xs text-destructive">
                          {error("printProfile.custom.encoding")}
                        </p>
                      )}
                    </FormField>
                    <FormField>
                      <AdvancedFieldLabel help={tr("character_table_help")}>
                        {tr("character_table")}
                      </AdvancedFieldLabel>
                      <Select
                        value={selectedCharacterTable(
                          advancedProfileValues.codeTable,
                          form.customCharacterTable,
                        )}
                        disabled={!canEditAdvancedProfile}
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
                          <SelectGroup>
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
                          </SelectGroup>
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
                          disabled={!canEditAdvancedProfile}
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
                    </FormField>
                    <FormField>
                      <AdvancedFieldLabel help={tr("unicode_strategy_help")}>
                        {tr("unicode_strategy")}
                      </AdvancedFieldLabel>
                      <Select
                        value={advancedProfileValues.unicodeFallback}
                        disabled={!canEditAdvancedProfile}
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
                          <SelectGroup>
                            <SelectItem value="auto">
                              {tr("unicode_auto")}
                            </SelectItem>
                            <SelectItem value="raster">
                              {tr("unicode_raster")}
                            </SelectItem>
                            <SelectItem value="native">
                              {tr("unicode_native")}
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </FormField>
                  </FieldGroup>
                </div>
              </details>
            </FormSection>
            <Separator />
            <FormSection title={tr("operation_section")}>
              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <Field orientation="horizontal">
                  <FieldLabel htmlFor="open-drawer-setting">
                    {tr("open_drawer_setting")}
                  </FieldLabel>
                  <Switch
                    id="open-drawer-setting"
                    checked={form.abreCajon}
                    onCheckedChange={(abreCajon) =>
                      onFormChange({ ...form, abreCajon })
                    }
                  />
                </Field>
                <Field orientation="horizontal">
                  <FieldLabel htmlFor="printer-enabled-setting">
                    {tr("printer_enabled")}
                  </FieldLabel>
                  <Switch
                    id="printer-enabled-setting"
                    checked={form.enabled}
                    onCheckedChange={(enabled) =>
                      onFormChange({ ...form, enabled })
                    }
                  />
                </Field>
              </FieldGroup>
            </FormSection>
            <Button
              type="button"
              variant="outline"
              onClick={openCurrentDiagnostics}
            >
              <ScrollText data-icon="inline-start" />
              {tr("print_diagnostics")}
            </Button>
          </div>
        </div>
      )}
      <div className="shrink-0 bg-muted/50 p-4">
        <Separator className="-mx-4 -mt-4 mb-4 w-[calc(100%+2rem)]" />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={requestClose}>
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
            disabled={
              busy === "save" ||
              customProfileNeedsSaving ||
              Boolean(form?.id && !isDirty)
            }
          >
            {tr("save_printer")}
          </Button>
        </div>
      </div>
      <Dialog
        open={discardConfirmationOpen}
        onOpenChange={setDiscardConfirmationOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("discard_printer_changes_title")}</DialogTitle>
            <DialogDescription>
              {tr("discard_printer_changes_description")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDiscardConfirmationOpen(false)}
            >
              {tr("continue_editing")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDiscardConfirmationOpen(false);
                onClose();
              }}
            >
              {tr("discard_changes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(pendingProfileLanguage)}
        onOpenChange={(open) => {
          if (!open) setPendingProfileLanguage(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {tr("discard_profile_for_language_title")}
            </DialogTitle>
            <DialogDescription>
              {tr("discard_profile_for_language_description")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingProfileLanguage(undefined)}
            >
              {tr("keep_profile_settings")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingProfileLanguage)
                  applyAutomaticProfileForLanguage(pendingProfileLanguage);
                setPendingProfileLanguage(undefined);
              }}
            >
              {tr("discard_profile_and_change_language")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={saveProfileOpen} onOpenChange={setSaveProfileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("save_custom_profile")}</DialogTitle>
            <DialogDescription>
              {tr("save_custom_profile_description", {
                width: form.anchoMm,
              })}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={profileIdentityError || undefined}>
              <FieldLabel htmlFor="local-profile-brand">
                {tr("reported_brand")}
              </FieldLabel>
              <Input
                id="local-profile-brand"
                value={profileBrand}
                aria-invalid={profileIdentityError}
                onChange={(event) => {
                  setProfileBrand(event.target.value);
                  setProfileIdentityError(false);
                }}
              />
            </Field>
            <Field data-invalid={profileIdentityError || undefined}>
              <FieldLabel htmlFor="local-profile-model">
                {tr("reported_model")}
              </FieldLabel>
              <Input
                id="local-profile-model"
                value={profileModel}
                aria-invalid={profileIdentityError}
                onChange={(event) => {
                  setProfileModel(event.target.value);
                  setProfileIdentityError(false);
                }}
              />
              {profileIdentityError && (
                <FieldError>{tr("validation_required")}</FieldError>
              )}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveProfileOpen(false)}>
              {tr("cancel")}
            </Button>
            <Button onClick={() => void saveCustomProfile()}>
              <Save data-icon="inline-start" />
              {tr("save_custom_profile")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={profileImportOpen} onOpenChange={setProfileImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("local_profile_import")}</DialogTitle>
            <DialogDescription>
              {tr("local_profile_import_description")}
            </DialogDescription>
          </DialogHeader>
          <input
            ref={profileImportInputRef}
            className="sr-only"
            type="file"
            accept="application/json"
            aria-label={tr("local_profile_select_file")}
            onChange={importLocalProfile}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-28 flex-col gap-2 py-5"
              disabled={Boolean(busy)}
              onClick={() => void pasteLocalProfile()}
            >
              <ClipboardPaste className="size-5" />
              {tr("local_profile_paste")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(busy)}
              className={`flex min-h-28 flex-col items-center justify-center gap-2 rounded-md border border-dashed p-3 text-center transition-colors ${
                profileFileDragging ? "border-primary bg-primary/5" : ""
              }`}
              onClick={() => profileImportInputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setProfileFileDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setProfileFileDragging(false)}
              onDrop={(event) => void importDroppedLocalProfile(event)}
            >
              <Upload className="size-5 text-muted-foreground" />
              <span className="max-w-full whitespace-normal break-words text-sm leading-snug text-muted-foreground">
                {tr("local_profile_drop_file")}
              </span>
            </Button>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setProfileImportOpen(false)}
            >
              {tr("cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={profileExportOpen} onOpenChange={setProfileExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("local_profile_export")}</DialogTitle>
            <DialogDescription>
              {tr("local_profile_export_description")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-28 flex-col gap-2 py-5"
              disabled={Boolean(busy)}
              onClick={() =>
                void onExportLocalProfile("clipboard").then((exported) => {
                  if (exported) setProfileExportOpen(false);
                })
              }
            >
              <Clipboard className="size-5" />
              {tr("local_profile_copy")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-28 flex-col gap-2 py-5"
              disabled={Boolean(busy)}
              onClick={() =>
                void onExportLocalProfile("file").then((exported) => {
                  if (exported) setProfileExportOpen(false);
                })
              }
            >
              <Download className="size-5" />
              {tr("local_profile_download")}
            </Button>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setProfileExportOpen(false)}
            >
              {tr("cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={profileManagerOpen} onOpenChange={setProfileManagerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("manage_local_profiles")}</DialogTitle>
            <DialogDescription>
              {tr("manage_local_profiles_description")}
            </DialogDescription>
          </DialogHeader>
          {localProfiles.length ? (
            <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
              {localProfiles.map((profile: any) => (
                <article
                  key={profile.id}
                  className="flex items-center gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {displayProfileName(profile)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tr("local_profile_usage", {
                        count: Number(profile.usageCount) || 0,
                      })}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="destructive"
                    aria-label={tr("delete_local_profile")}
                    title={tr("delete_local_profile")}
                    disabled={Boolean(busy)}
                    onClick={() => setProfileDeletionTarget(profile)}
                  >
                    <Trash2 />
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {tr("no_local_profiles")}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setProfileManagerOpen(false)}
            >
              {tr("close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(profileDeletionTarget)}
        onOpenChange={(open) => {
          if (!open) setProfileDeletionTarget(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("delete_local_profile_title")}</DialogTitle>
            <DialogDescription>
              {tr("delete_local_profile_description", {
                profile: profileDeletionTarget
                  ? displayProfileName(profileDeletionTarget)
                  : "",
                count: Number(profileDeletionTarget?.usageCount) || 0,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setProfileDeletionTarget(undefined)}
            >
              {tr("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={Boolean(busy)}
              onClick={() => void deleteManagedProfile()}
            >
              <Trash2 data-icon="inline-start" />
              {tr("delete_local_profile")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
});
