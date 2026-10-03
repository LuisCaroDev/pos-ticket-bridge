import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Bluetooth,
  Loader2,
  Network,
  RefreshCw,
  Usb,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useI18n } from "@/contexts/I18nContext";
import { translateMessage, type BridgeMessage } from "@/i18n";
import { connectionLabel } from "./printer-utils";
import type { PrinterForm } from "./types";
import { usePrinterDiscovery } from "./usePrinterDiscovery";

export type PrinterEditorStep =
  "connection-type" | "connection-select" | "printer-details";

type ConnectionKind = PrinterForm["tipo"];

type PrinterConnectionFlowProps = {
  step: Exclude<PrinterEditorStep, "printer-details">;
  isWindows: boolean;
  changingConnection: boolean;
  onStepChange: (step: PrinterEditorStep) => void;
  onApply: (printer: PrinterForm) => void;
};

const defaultConnection = (kind: ConnectionKind) =>
  kind === "network"
    ? { host: "", port: 9100 }
    : kind === "usb"
      ? { vendorId: "", productId: "", systemPrinter: "" }
      : { path: "", baudRate: 9600 };

export function PrinterConnectionFlow({
  step,
  isWindows,
  changingConnection,
  onStepChange,
  onApply,
}: PrinterConnectionFlowProps) {
  const { language, tr } = useI18n();
  const { discover, discovery, scanningKind, resetDiscovery } =
    usePrinterDiscovery();
  const [kind, setKind] = useState<ConnectionKind>();
  const [connection, setConnection] = useState<Record<string, string | number>>(
    {},
  );

  useEffect(() => resetDiscovery, [resetDiscovery]);

  const chooseKind = (nextKind: ConnectionKind) => {
    setKind(nextKind);
    setConnection(defaultConnection(nextKind));
    resetDiscovery();
    onStepChange("connection-select");
    if (nextKind !== "network") void discover(nextKind);
  };
  const returnFromSelection = () => {
    resetDiscovery();
    setKind(undefined);
    setConnection({});
    onStepChange("connection-type");
  };
  const updateConnection = (key: string, value: string | number) =>
    setConnection((current) => ({ ...current, [key]: value }));
  const manualConnectionValid =
    kind === "network"
      ? Boolean(String(connection.host || "").trim()) &&
        Number(connection.port) >= 1 &&
        Number(connection.port) <= 65535
      : kind === "bluetooth"
        ? Boolean(String(connection.path || "").trim())
        : kind === "usb"
          ? isWindows
            ? Boolean(String(connection.systemPrinter || "").trim())
            : Boolean(String(connection.vendorId || "").trim()) &&
              Boolean(String(connection.productId || "").trim())
          : false;
  const applyManualConnection = () => {
    if (!kind || !manualConnectionValid) return;
    onApply({
      nombre: "",
      tipo: kind,
      anchoMm: 80,
      printProfile: {
        language: language === "en" ? "en" : "es",
        mode: "auto",
        profileId: "unlisted-safe",
      },
      abreCajon: false,
      enabled: true,
      connection,
    });
  };

  if (step === "connection-type") {
    const options = [
      {
        value: "network" as const,
        Icon: Network,
        title: tr("network"),
        description: tr("network_connection_description"),
      },
      {
        value: "bluetooth" as const,
        Icon: Bluetooth,
        title: tr("bluetooth"),
        description: tr("bluetooth_connection_description"),
      },
      {
        value: "usb" as const,
        Icon: Usb,
        title: tr("usb"),
        description: tr("usb_connection_description"),
      },
    ];
    return (
      <div className="flex flex-col gap-5">
        {changingConnection && (
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            onClick={() => onStepChange("printer-details")}
          >
            <ArrowLeft data-icon="inline-start" />
            {tr("keep_current_connection")}
          </Button>
        )}
        <Field>
          <FieldLabel id="connection-type-label">
            {tr("choose_connection_type")}
          </FieldLabel>
          <ToggleGroup
            aria-labelledby="connection-type-label"
            orientation="vertical"
            variant="outline"
            className="w-full gap-3"
            value={kind ? [kind] : []}
            onValueChange={(values) => {
              if (values[0]) chooseKind(values[0] as ConnectionKind);
            }}
          >
            {options.map(({ value, Icon, title, description }) => (
              <ToggleGroupItem
                key={value}
                value={value}
                className="h-auto min-h-20 w-full justify-start gap-4 whitespace-normal p-4 text-left"
              >
                <Icon aria-hidden="true" />
                <span className="flex flex-col items-start gap-1">
                  <span className="font-semibold">{title}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {description}
                  </span>
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      </div>
    );
  }

  if (!kind) return null;
  const scanLabel =
    kind === "network"
      ? tr("find_network")
      : kind === "usb"
        ? tr("detect_usb")
        : tr("bluetooth_serial");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={returnFromSelection}>
          <ArrowLeft data-icon="inline-start" />
          {tr("back")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={Boolean(scanningKind)}
          onClick={() => void discover(kind)}
        >
          {scanningKind ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <RefreshCw data-icon="inline-start" />
          )}
          {scanLabel}
        </Button>
      </div>

      {scanningKind && (
        <Alert>
          <Loader2 className="animate-spin" />
          <AlertDescription>{tr("wait_for_scan")}</AlertDescription>
        </Alert>
      )}

      {discovery && !scanningKind && (
        <div className="flex flex-col gap-3">
          <div>
            <p className="font-medium">{tr("latest_scan")}</p>
            <p className="text-xs text-muted-foreground">
              {discovery.notes
                ?.map((note: BridgeMessage) => translateMessage(language, note))
                .join(" ") ||
                tr("devices_found", { count: discovery.items?.length || 0 })}
            </p>
          </div>
          {discovery.items?.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {discovery.items.map((item: PrinterForm, index: number) => (
                <Card key={`${item.nombre}-${index}`} size="sm">
                  <CardHeader>
                    <CardTitle>{item.nombre}</CardTitle>
                    <CardDescription>{connectionLabel(item)}</CardDescription>
                  </CardHeader>
                  <CardFooter>
                    <Button
                      type="button"
                      size="sm"
                      className="w-full"
                      onClick={() => onApply(item)}
                    >
                      {tr("use_result")}
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <Alert>
              <AlertDescription>{tr("no_devices")}</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{tr("manual_connection")}</CardTitle>
          <CardDescription>
            {tr("manual_connection_description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            {kind === "network" && (
              <>
                <Field>
                  <FieldLabel htmlFor="connection-host">
                    {tr("host")}
                  </FieldLabel>
                  <Input
                    id="connection-host"
                    value={String(connection.host || "")}
                    onChange={(event) =>
                      updateConnection("host", event.target.value)
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="connection-port">
                    {tr("port")}
                  </FieldLabel>
                  <Input
                    id="connection-port"
                    type="number"
                    value={String(connection.port || 9100)}
                    onChange={(event) =>
                      updateConnection("port", Number(event.target.value))
                    }
                  />
                </Field>
              </>
            )}
            {kind === "bluetooth" && (
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="connection-path">{tr("path")}</FieldLabel>
                <Input
                  id="connection-path"
                  placeholder="COM5"
                  value={String(connection.path || "")}
                  onChange={(event) =>
                    updateConnection("path", event.target.value)
                  }
                />
              </Field>
            )}
            {kind === "usb" && isWindows && (
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="connection-system-printer">
                  {tr("installed_windows_printer")}
                </FieldLabel>
                <Input
                  id="connection-system-printer"
                  placeholder={tr("windows_printer_placeholder")}
                  value={String(connection.systemPrinter || "")}
                  onChange={(event) =>
                    updateConnection("systemPrinter", event.target.value)
                  }
                />
              </Field>
            )}
            {kind === "usb" && !isWindows && (
              <>
                <Field>
                  <FieldLabel htmlFor="connection-vendor-id">
                    {tr("vendor_id")}
                  </FieldLabel>
                  <Input
                    id="connection-vendor-id"
                    placeholder="0x04b8"
                    value={String(connection.vendorId || "")}
                    onChange={(event) =>
                      updateConnection("vendorId", event.target.value)
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="connection-product-id">
                    {tr("product_id")}
                  </FieldLabel>
                  <Input
                    id="connection-product-id"
                    placeholder="0x0202"
                    value={String(connection.productId || "")}
                    onChange={(event) =>
                      updateConnection("productId", event.target.value)
                    }
                  />
                </Field>
              </>
            )}
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            type="button"
            disabled={!manualConnectionValid}
            onClick={applyManualConnection}
          >
            {tr("use_this_connection")}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
