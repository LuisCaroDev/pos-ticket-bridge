import { useI18n } from "@/contexts/I18nContext";
import type {
  LocalHttpsStatus,
  LocalHttpsDraft,
} from "@/core/local-https-types";
import { Switch } from "@/components/ui/switch";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function LocalHttpsSettings({
  status,
  value,
  onChange,
  disabled,
}: {
  status: LocalHttpsStatus;
  value: LocalHttpsDraft;
  onChange: (draft: LocalHttpsDraft) => void;
  disabled: boolean;
}) {
  const { tr } = useI18n();
  const selected = status.interfaces.find(
    (item) =>
      item.name === value.selection?.name &&
      item.address === value.selection?.address,
  );
  return (
    <>
      <Field>
        <FieldLabel htmlFor="https-interface">
          {tr("https_interface")}
        </FieldLabel>
        <Select
          value={
            selected ? JSON.stringify([selected.name, selected.address]) : null
          }
          disabled={disabled}
          onValueChange={(key) => {
            const item = status.interfaces.find(
              (entry) => JSON.stringify([entry.name, entry.address]) === key,
            );
            if (item)
              onChange({
                ...value,
                selection: { name: item.name, address: item.address },
              });
          }}
        >
          <SelectTrigger id="https-interface" className="w-full">
            <SelectValue>
              {selected
                ? selected.name + " — " + selected.address
                : tr("https_select_interface")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {status.interfaces.map((item) => (
                <SelectItem
                  key={item.name + item.address}
                  value={JSON.stringify([item.name, item.address])}
                >
                  {item.name} — {item.address}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldTitle>{tr("https_enable")}</FieldTitle>
          <FieldDescription>{tr("settings_https_draft_hint")}</FieldDescription>
        </FieldContent>
        <Switch
          aria-label={tr("https_enable")}
          checked={value.enabled}
          disabled={disabled}
          onCheckedChange={(enabled) => onChange({ ...value, enabled })}
        />
      </Field>
    </>
  );
}
