import { memo, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { LanguageSetting, TranslationKey } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
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
  open: boolean;
  busy: boolean;
  languageSetting: LanguageSetting;
  port: string;
  origins: string;
  onOpenChange: (open: boolean) => void;
  onSave: (input: {
    language: LanguageSetting;
    port: number;
    allowedOrigins: string[];
  }) => Promise<boolean>;
};

export const SettingsDialog = memo(function SettingsDialog({
  open,
  busy,
  languageSetting,
  port,
  origins,
  onOpenChange,
  onSave,
}: SettingsDialogProps) {
  const { tr } = useI18n();
  const {
    register,
    reset,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<SettingsFormValues>({
    defaultValues: defaultSettingsValues(languageSetting, port, origins),
    resolver: zodResolver(settingsFormSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  useEffect(() => {
    if (!open) return;
    reset(defaultSettingsValues(languageSetting, port, origins));
  }, [languageSetting, open, origins, port, reset]);

  const error = (name: keyof SettingsFormValues) =>
    errors[name]?.message
      ? tr(errors[name]?.message as TranslationKey)
      : undefined;
  const selectedLanguage = watch("language");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tr("advanced_settings")}</DialogTitle>
          <DialogDescription>{tr("settings_description")}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
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
          <Field data-invalid={Boolean(error("port")) || undefined}>
            <FieldLabel htmlFor="settings-port">{tr("port")}</FieldLabel>
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
            {error("origins") && <FieldError>{error("origins")}</FieldError>}
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tr("cancel")}
          </Button>
          <Button
            disabled={busy || isSubmitting || !isDirty}
            onClick={() =>
              void handleSubmit((values) => onSave(settingsInput(values)))()
            }
          >
            {tr("save_settings")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
