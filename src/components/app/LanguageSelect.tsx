import type { LanguageSetting } from "@/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { languageLabel } from "./language-utils";
import type { Translate } from "./types";

type LanguageSelectProps = {
  value: LanguageSetting;
  includeSystem?: boolean;
  tr: Translate;
  onValueChange: (value: LanguageSetting) => void;
};

export function LanguageSelect({
  value,
  includeSystem = false,
  tr,
  onValueChange,
}: LanguageSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange(next as LanguageSetting)}
    >
      <SelectTrigger className="w-full">
        <SelectValue>{languageLabel(tr, value)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {includeSystem && (
          <SelectItem value="system">{tr("language_system")}</SelectItem>
        )}
        <SelectItem value="es">{tr("language_spanish")}</SelectItem>
        <SelectItem value="en">{tr("language_english")}</SelectItem>
      </SelectContent>
    </Select>
  );
}
