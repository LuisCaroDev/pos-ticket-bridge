import { memo } from "react";
import { Loader2, Radar } from "lucide-react";
import { translateMessage, type BridgeMessage } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { connectionLabel } from "./printer-utils";
import type { PrinterForm } from "./types";
import { useI18n } from "@/contexts/I18nContext";
import { usePrinterDiscovery } from "./usePrinterDiscovery";

type DiscoveryPanelProps = {
  onUseResult: (printer: PrinterForm) => void;
};

export const DiscoveryPanel = memo(function DiscoveryPanel({
  onUseResult,
}: DiscoveryPanelProps) {
  const { language, tr } = useI18n();
  const { discover, discovery, scanningKind } = usePrinterDiscovery();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radar className="size-5" />
          {tr("printer_detection")}
        </CardTitle>
        <CardDescription>{tr("printer_detection_description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 md:grid-cols-3">
        {(["network", "usb", "bluetooth"] as const).map((kind) => (
          <Button
            key={kind}
            variant="outline"
            disabled={Boolean(scanningKind)}
            onClick={() => void discover(kind)}
          >
            {scanningKind === kind && (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            )}
            {kind === "network"
              ? scanningKind === kind
                ? tr("searching_network")
                : tr("find_network")
              : kind === "usb"
                ? scanningKind === kind
                  ? tr("detecting_usb")
                  : tr("detect_usb")
                : scanningKind === kind
                  ? tr("searching_devices")
                  : tr("bluetooth_serial")}
          </Button>
        ))}
      </CardContent>
      {scanningKind && (
        <CardContent className="border-t pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {tr("wait_for_scan")}
          </div>
        </CardContent>
      )}
      {discovery && !scanningKind && (
        <CardContent className="border-t pt-4">
          <div className="mb-3">
            <p className="text-sm font-medium">{tr("latest_scan")}</p>
            <p className="text-xs text-muted-foreground">
              {discovery.notes
                ?.map((note: BridgeMessage) => translateMessage(language, note))
                .join(" ") ||
                tr("devices_found", { count: discovery.items?.length || 0 })}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {discovery.items?.length ? (
              discovery.items.map((item: PrinterForm, index: number) => (
                <div
                  key={`${item.nombre}-${index}`}
                  className="rounded-lg border p-3"
                >
                  <p className="font-medium">{item.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {connectionLabel(item)}
                  </p>
                  <Button
                    className="mt-3"
                    size="sm"
                    onClick={() => onUseResult(item)}
                  >
                    {tr("use_result")}
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                {tr("no_devices")}
              </p>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
});
