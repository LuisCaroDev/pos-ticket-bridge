import { memo } from "react";
import {
  Banknote,
  CheckCircle2,
  Pencil,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { translateMessage } from "@/i18n";
import { connectionLabel } from "./printer-utils";
import { useBridge } from "@/contexts/BridgeContext";
import { useI18n } from "@/contexts/I18nContext";

type PrinterListProps = {
  onCreate: () => void;
  onEdit: (printer: any) => void;
};

export const PrinterList = memo(function PrinterList({
  onCreate,
  onEdit,
}: PrinterListProps) {
  const { busy, deletePrinter, openDrawer, printers, testPrinter } =
    useBridge();
  const { language, tr } = useI18n();
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Printer className="size-5" />
              {tr("printers")}
            </CardTitle>
            <CardDescription>{tr("printers_description")}</CardDescription>
          </div>
          <Button onClick={onCreate}>
            <Plus data-icon="inline-start" />
            {tr("add")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!printers.length && (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {tr("no_printers")}
          </p>
        )}
        {printers.map((printer) => (
          <div key={printer.id} className="rounded-lg border bg-background p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{printer.nombre}</p>
                  <Badge variant={printer.enabled ? "secondary" : "outline"}>
                    {printer.enabled ? tr("enabled") : tr("disabled")}
                  </Badge>
                  <Badge variant="outline">{printer.tipo}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {connectionLabel(printer)}
                </p>
                {printer.runtime?.printProfile && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {tr("profile_label", {
                      profile:
                        printer.runtime.printProfile.mode === "custom"
                          ? tr("profile_custom")
                          : printer.runtime.printProfile.id,
                    })}
                    {" · "}
                    {printer.runtime.printProfile.language === "en"
                      ? tr("language_english")
                      : tr("language_spanish")}
                    {" · "}
                    {printer.runtime.printProfile.unicodeCoverage ===
                    "bitmap-fallback"
                      ? tr("profile_bitmap_fallback")
                      : tr("profile_native_coverage")}
                  </p>
                )}
                <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  {printer.runtime?.connection?.ok && (
                    <CheckCircle2 className="size-3 text-emerald-600" />
                  )}
                  {translateMessage(
                    language,
                    printer.runtime?.connection?.message,
                  ) || tr("no_recent_check")}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  title={tr("print_test")}
                  disabled={Boolean(busy)}
                  onClick={() => testPrinter(printer.id)}
                >
                  <Printer data-icon="inline-start" />
                  {tr("print_test")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  title={tr("open_drawer")}
                  disabled={Boolean(busy) || !printer.abreCajon}
                  onClick={() => openDrawer(printer.id)}
                >
                  <Banknote data-icon="inline-start" />
                  {tr("open_drawer")}
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={tr("edit")}
                  onClick={() => onEdit(printer)}
                >
                  <Pencil />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={tr("delete")}
                  onClick={() => deletePrinter(printer)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
});
