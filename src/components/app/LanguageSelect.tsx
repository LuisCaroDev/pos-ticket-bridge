import type { LanguageSetting } from "@/i18n";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { languageLabel } from "./language-utils";
import type { Translate } from "./types";

type LanguageSelectProps = {
  id?: string;
  value: LanguageSetting;
  includeSystem?: boolean;
  tr: Translate;
  onValueChange: (value: LanguageSetting) => void;
};

export function LanguageSelect({
  id,
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
      <SelectTrigger id={id} className="w-full">
        <SelectValue>{languageLabel(tr, value)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {includeSystem && (
            <SelectItem value="system">{tr("language_system")}</SelectItem>
          )}
          <SelectItem value="es">{tr("language_spanish")}</SelectItem>
          <SelectItem value="en">{tr("language_english")}</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
