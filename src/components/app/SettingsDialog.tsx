import { LocalHttpsSettings } from "./LocalHttpsSettings";
import type {
  LocalHttpsStatus,
  LocalHttpsDraft,
} from "@/core/local-https-types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { memo, useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { LanguageSetting, TranslationKey } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  defaultSettingsValues,
  settingsFormSchema,
  settingsInput,
  type SettingsFormValues,
} from "./form-validation";
import { LanguageSelect } from "./LanguageSelect";
import { useI18n } from "@/contexts/I18nContext";

type SettingsDialogProps = {
  localHttps?: LocalHttpsStatus;
  saveError?: string;
  open: boolean;
  busy: boolean;
  languageSetting: LanguageSetting;
  port: string;
  origins: string;
  autoStart: boolean;
  showAutoStart: boolean;
  autoStartWarning?: "macos_move_to_applications";
  onOpenChange: (open: boolean) => void;
  onSave: (input: {
    https?: LocalHttpsDraft;
    language: LanguageSetting;
    port: number;
    allowedOrigins: string[];
    autoStart: boolean;
  }) => Promise<boolean>;
};

export const SettingsDialog = memo(function SettingsDialog({
  localHttps,
  saveError,
  open,
  busy,
  languageSetting,
  port,
  origins,
  autoStart,
  showAutoStart,
  autoStartWarning,
  onOpenChange,
  onSave,
}: SettingsDialogProps) {
  const { tr } = useI18n();
  const [httpsDraft, setHttpsDraft] = useState<LocalHttpsDraft>({
    enabled: false,
  });
  const [initialHttps, setInitialHttps] = useState("");
  const [failure, setFailure] = useState("");
  const wasOpen = useRef(false);
  const httpsInitialized = useRef(false);
  const supportedHttps =
    localHttps && ["win32", "darwin"].includes(window.bridge.platform);

  const {
    register,
    reset,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<SettingsFormValues>({
    defaultValues: defaultSettingsValues(
      languageSetting,
      port,
      origins,
      autoStart,
    ),
    resolver: zodResolver(settingsFormSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  useEffect(() => {
    if (open && !wasOpen.current) {
      reset(defaultSettingsValues(languageSetting, port, origins, autoStart));
      const draft = {
        enabled: localHttps?.state === "active",
        selection: localHttps?.selection,
      };
      setHttpsDraft(draft);
      setInitialHttps(JSON.stringify(draft));
      setFailure("");
      httpsInitialized.current = Boolean(localHttps);
    } else if (open && !httpsInitialized.current && localHttps) {
      const draft = {
        enabled: localHttps.state === "active",
        selection: localHttps.selection,
      };
      setHttpsDraft(draft);
      setInitialHttps(JSON.stringify(draft));
      httpsInitialized.current = true;
    }
    wasOpen.current = open;
  }, [autoStart, languageSetting, open, origins, port, reset, localHttps]);
  const httpsDirty =
    Boolean(supportedHttps) && JSON.stringify(httpsDraft) !== initialHttps;
  const saving = busy || isSubmitting;
  const submit = handleSubmit(async (values) => {
    setFailure("");
    if (
      supportedHttps &&
      httpsDraft.enabled &&
      !localHttps.interfaces.some(
        (item) =>
          item.name === httpsDraft.selection?.name &&
          item.address === httpsDraft.selection?.address,
      )
    ) {
      setFailure(tr("https_select_interface"));
      return;
    }
    const saved = await onSave({
      ...settingsInput(values),
      ...(supportedHttps ? { https: httpsDraft } : {}),
    });
    if (!saved) setFailure(tr("settings_save_failed"));
  });

  const error = (name: keyof SettingsFormValues) =>
    errors[name]?.message
      ? tr(errors[name]?.message as TranslationKey)
      : undefined;
  const selectedLanguage = watch("language");
  const selectedAutoStart = watch("autoStart");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{tr("advanced_settings")}</DialogTitle>
          <DialogDescription>{tr("settings_description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-1 pt-2">
            <fieldset disabled={saving} className="min-w-0">
              <FieldGroup className="gap-6">
                <FieldSet className="gap-4 rounded-lg border bg-muted/20 p-4">
                  <FieldLegend>{tr("settings_connection_section")}</FieldLegend>
                  {localHttps && (
                    <FieldDescription>
                      {tr("settings_active_connection", {
                        transport: localHttps.transport.toUpperCase(),
                        host: localHttps.host || tr("https_stopped"),
                      })}
                    </FieldDescription>
                  )}
                  {(failure || saveError) && (
                    <Alert variant="destructive">
                      <AlertDescription>
                        {failure && failure !== tr("settings_save_failed")
                          ? failure
                          : saveError || failure}
                      </AlertDescription>
                    </Alert>
                  )}
                  {supportedHttps && (
                    <LocalHttpsSettings
                      status={localHttps}
                      value={httpsDraft}
                      onChange={setHttpsDraft}
                      disabled={saving}
                    />
                  )}
                  <Field data-invalid={Boolean(error("port")) || undefined}>
                    <FieldLabel htmlFor="settings-port">
                      {tr("port")}
                    </FieldLabel>
                    <Input
                      id="settings-port"
                      {...register("port")}
                      type="number"
                      aria-invalid={Boolean(error("port"))}
                    />
                    {error("port") && <FieldError>{error("port")}</FieldError>}
                  </Field>
                  <Field data-invalid={Boolean(error("origins")) || undefined}>
                    <FieldLabel htmlFor="settings-origins">
                      {tr("allowed_origins")}
                    </FieldLabel>
                    <Textarea
                      id="settings-origins"
                      {...register("origins")}
                      className="min-h-28"
                      placeholder="https://pos.ejemplo.com"
                      aria-invalid={Boolean(error("origins"))}
                    />
                    {error("origins") && (
                      <FieldError>{error("origins")}</FieldError>
                    )}
                  </Field>
                </FieldSet>
                <FieldSet className="gap-4 rounded-lg border bg-muted/20 p-4">
                  <FieldLegend>
                    {tr("settings_application_section")}
                  </FieldLegend>
                  <Field>
                    <FieldLabel htmlFor="settings-language">
                      {tr("language")}
                    </FieldLabel>
                    <LanguageSelect
                      id="settings-language"
                      value={selectedLanguage}
                      includeSystem
                      tr={tr}
                      onValueChange={(language) =>
                        setValue("language", language, { shouldDirty: true })
                      }
                    />
                  </Field>
                  {showAutoStart && (
                    <>
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldTitle>{tr("auto_start")}</FieldTitle>
                          <FieldDescription>
                            {tr(
                              autoStartWarning
                                ? "auto_start_macos_move_to_applications"
                                : "auto_start_description",
                            )}
                          </FieldDescription>
                        </FieldContent>
                        <Switch
                          id="settings-auto-start"
                          checked={selectedAutoStart}
                          aria-label={tr("auto_start")}
                          onCheckedChange={(next) =>
                            setValue("autoStart", next, { shouldDirty: true })
                          }
                        />
                      </Field>
                    </>
                  )}
                </FieldSet>
              </FieldGroup>
            </fieldset>
          </div>
          <DialogFooter className="mt-4 shrink-0">
            <Button
              type="button"
              disabled={saving}
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {tr("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={saving || (!isDirty && !httpsDirty)}
            >
              {tr("save_settings")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
});
