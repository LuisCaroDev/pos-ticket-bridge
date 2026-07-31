import { memo, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { LanguageSetting, TranslationKey } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
        <div className="space-y-4">
          <label className="grid gap-1 text-sm font-medium">
            {tr("language")}
            <LanguageSelect
              value={selectedLanguage}
              includeSystem
              tr={tr}
              onValueChange={(language) =>
                setValue("language", language, { shouldDirty: true })
              }
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {tr("port")}
            <Input
              {...register("port")}
              type="number"
              aria-invalid={Boolean(error("port"))}
            />
            {error("port") && (
              <p className="text-xs text-destructive">{error("port")}</p>
            )}
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {tr("allowed_origins")}
            <textarea
              {...register("origins")}
              className="min-h-28 rounded-lg border bg-transparent px-2.5 py-2 text-sm"
              placeholder="https://pos.ejemplo.com"
              aria-invalid={Boolean(error("origins"))}
            />
            {error("origins") && (
              <p className="text-xs text-destructive">{error("origins")}</p>
            )}
          </label>
        </div>
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
