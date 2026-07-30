import { useEffect, useRef, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  Clipboard,
  Loader2,
  Pencil,
  Plus,
  Power,
  Printer,
  Radar,
  Settings2,
  Trash2,
  Wifi,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type PrinterForm = {
  id?: string;
  nombre: string;
  tipo: "network" | "usb" | "bluetooth";
  anchoMm: 58 | 80;
  codepage: string;
  abreCajon: boolean;
  enabled: boolean;
  connection: Record<string, string | number>;
};
const blankPrinter = (): PrinterForm => ({
  nombre: "",
  tipo: "network",
  anchoMm: 80,
  codepage: "CP850",
  abreCajon: false,
  enabled: true,
  connection: { host: "", port: 9100 },
});
const connectionLabel = (printer: any) =>
  printer.tipo === "network"
    ? `${printer.connection.host}:${printer.connection.port}`
    : printer.tipo === "usb"
      ? [
          printer.connection.vendorId,
          printer.connection.productId,
          printer.connection.systemPrinter,
        ]
          .filter(Boolean)
          .join(" · ") || "USB manual"
      : `${printer.connection.path || ""}${printer.connection.channel ? ` · ${printer.connection.channel}` : ""}`;

export function App() {
  const [status, setStatus] = useState<any>();
  const [appVersion, setAppVersion] = useState("");
  const [form, setForm] = useState<PrinterForm>();
  const [discovery, setDiscovery] = useState<any>();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [origins, setOrigins] = useState("");
  const [port, setPort] = useState("9977");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scanInFlight = useRef(false);

  const refresh = async () => {
    try {
      const next = await window.bridge.status();
      setAppVersion(next.version || "");
      setStatus(next);
      setPort(String(next.port));
      setOrigins((next.allowedOrigins || []).join("\n"));
    } catch (cause) {
      setError((cause as Error).message);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const run = async (name: string, action: () => Promise<unknown>) => {
    try {
      setBusy(name);
      setError("");
      setNotice("");
      await action();
      await refresh();
      return true;
    } catch (cause) {
      setError((cause as Error).message);
      return false;
    } finally {
      setBusy("");
    }
  };
  const setConnection = (key: string, value: string | number) =>
    setForm((current) =>
      current
        ? { ...current, connection: { ...current.connection, [key]: value } }
        : current,
    );
  const openCreate = () => setForm(blankPrinter());
  const openEdit = (printer: any) =>
    setForm({ ...printer, connection: { ...printer.connection } });
  const closeForm = () => setForm(undefined);
  const save = async () => {
    if (!form) return;
    const saved = await run("save", () =>
      form.id
        ? window.bridge.updatePrinter(form.id, form)
        : window.bridge.createPrinter(form),
    );
    if (saved) closeForm();
  };
  const testDraft = async () => {
    if (
      form &&
      (await run("test-draft", () => window.bridge.testPrinter(form)))
    )
      setNotice(
        "Ticket de prueba enviado. Puedes guardar la impresora cuando estés conforme.",
      );
  };
  const discover = async (kind: "network" | "usb" | "bluetooth") => {
    if (scanInFlight.current) return;
    scanInFlight.current = true;
    await run(`discover-${kind}`, async () => {
      const result = await window.bridge.discover(kind);
      setDiscovery({ ...result, kind });
    });
    scanInFlight.current = false;
  };
  const saveSettings = () =>
    run("settings", () =>
      window.bridge.settings({
        port: Number(port),
        allowedOrigins: origins
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
      }),
    );
  const changeType = (tipo: PrinterForm["tipo"]) =>
    setForm(
      (current) =>
        current && {
          ...current,
          tipo,
          connection:
            tipo === "network"
              ? { host: "", port: 9100 }
              : tipo === "usb"
                ? { vendorId: "", productId: "", systemPrinter: "" }
                : { path: "", baudRate: 9600 },
        },
    );
  const scanningKind = busy.startsWith("discover-")
    ? busy.replace("discover-", "")
    : "";

  return (
    <main className="min-h-screen bg-muted/40 p-6 text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">POS Ticket Bridge</h1>
              <Badge variant="secondary">Activo</Badge>
              {appVersion && (
                <span className="text-xs text-muted-foreground">
                  v{appVersion}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Puente local de impresión para tu punto de venta.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void refresh()}>
              <Radar data-icon="inline-start" />
              Actualizar
            </Button>
            <Button
              size="icon"
              variant="outline"
              aria-label="Abrir ajustes avanzados"
              title="Ajustes avanzados"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 />
            </Button>
          </div>
        </header>
        {error && (
          <Card className="border-destructive/40">
            <CardContent className="p-4 text-sm text-destructive">
              {error}
            </CardContent>
          </Card>
        )}
        {notice && (
          <Card className="border-emerald-300">
            <CardContent className="p-4 text-sm text-emerald-700">
              {notice}
            </CardContent>
          </Card>
        )}
        {status && (
          <section className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wifi className="size-4" />
                  Host del puente
                </CardTitle>
                <CardDescription>
                  Configúralo en el POS que enviará los trabajos.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3">
                <code className="truncate rounded bg-muted px-2 py-1 text-sm">
                  {status.suggestedHosts?.[0]}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void window.bridge.copy(status.suggestedHosts?.[0] || "")
                  }
                >
                  <Clipboard data-icon="inline-start" />
                  Copiar
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Power className="size-4" />
                  Token de acceso
                </CardTitle>
                <CardDescription>
                  Obligatorio para las solicitudes de impresión.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3">
                <code className="truncate rounded bg-muted px-2 py-1 text-sm">
                  {status.token}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void window.bridge.copy(status.token)}
                >
                  <Clipboard data-icon="inline-start" />
                  Copiar
                </Button>
              </CardContent>
            </Card>
          </section>
        )}
        <section className="space-y-5">
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Printer className="size-5" />
                      Impresoras
                    </CardTitle>
                    <CardDescription>
                      Conexiones configuradas en este equipo.
                    </CardDescription>
                  </div>
                  <Button onClick={openCreate}>
                    <Plus data-icon="inline-start" />
                    Agregar
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {!status?.printers?.length && (
                  <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Todavía no hay impresoras configuradas.
                  </p>
                )}
                {status?.printers?.map((printer: any) => (
                  <div
                    key={printer.id}
                    className="rounded-lg border bg-background p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{printer.nombre}</p>
                          <Badge
                            variant={printer.enabled ? "secondary" : "outline"}
                          >
                            {printer.enabled ? "Habilitada" : "Deshabilitada"}
                          </Badge>
                          <Badge variant="outline">{printer.tipo}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {connectionLabel(printer)}
                        </p>
                        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                          {printer.runtime?.connection?.ok && (
                            <CheckCircle2 className="size-3 text-emerald-600" />
                          )}
                          {printer.runtime?.connection?.message ||
                            "Sin comprobación reciente"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          title="Imprime un ticket de prueba"
                          disabled={Boolean(busy)}
                          onClick={() =>
                            void run(`test-${printer.id}`, () =>
                              window.bridge.request(
                                `/api/printers/${printer.id}/test`,
                              ),
                            )
                          }
                        >
                          <Printer data-icon="inline-start" />
                          Imprimir prueba
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          title={
                            printer.abreCajon
                              ? "Envía la señal para abrir el cajón conectado"
                              : "Activa “Abrir cajón” al editar esta impresora para usar esta acción"
                          }
                          disabled={Boolean(busy) || !printer.abreCajon}
                          onClick={() =>
                            void run(`drawer-${printer.id}`, () =>
                              window.bridge.request(
                                `/api/printers/${printer.id}/open-drawer`,
                              ),
                            )
                          }
                        >
                          <Banknote data-icon="inline-start" />
                          Abrir cajón
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Editar"
                          onClick={() => openEdit(printer)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Eliminar"
                          onClick={() => {
                            if (confirm(`¿Eliminar ${printer.nombre}?`))
                              void run(`delete-${printer.id}`, () =>
                                window.bridge.deletePrinter(printer.id),
                              );
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Radar className="size-5" />
                Detección de impresoras
              </CardTitle>
              <CardDescription>
                Busca impresoras en la red, por USB o por Bluetooth/serial.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-3">
              <Button
                variant="outline"
                disabled={Boolean(scanningKind)}
                onClick={() => void discover("network")}
              >
                {scanningKind === "network" && (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                )}
                {scanningKind === "network"
                  ? "Buscando en red…"
                  : "Buscar en red"}
              </Button>
              <Button
                variant="outline"
                disabled={Boolean(scanningKind)}
                onClick={() => void discover("usb")}
              >
                {scanningKind === "usb" && (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                )}
                {scanningKind === "usb" ? "Detectando USB…" : "Detectar USB"}
              </Button>
              <Button
                variant="outline"
                disabled={Boolean(scanningKind)}
                onClick={() => void discover("bluetooth")}
              >
                {scanningKind === "bluetooth" && (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                )}
                {scanningKind === "bluetooth"
                  ? "Buscando dispositivos…"
                  : "Bluetooth / serial"}
              </Button>
            </CardContent>
            {scanningKind && (
              <CardContent className="border-t pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Buscando dispositivos; espera a que termine.
                </div>
              </CardContent>
            )}
            {discovery && !scanningKind && (
              <CardContent className="border-t pt-4">
                <div className="mb-3">
                  <p className="text-sm font-medium">
                    Resultados del último escaneo
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {discovery.notes?.join(" ") ||
                      `${discovery.items?.length || 0} dispositivo(s) encontrado(s).`}
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
                          onClick={() =>
                            setForm({
                              ...item,
                              connection: { ...item.connection },
                            })
                          }
                        >
                          Usar este resultado
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No se encontraron dispositivos.
                    </p>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        </section>
        <Dialog
          open={Boolean(form)}
          onOpenChange={(open) => {
            if (!open) closeForm();
          }}
        >
          <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>
                {form?.id ? `Editar ${form.nombre}` : "Agregar impresora"}
              </DialogTitle>
              <DialogDescription>
                Comprueba la conexión antes de guardarla.
              </DialogDescription>
            </DialogHeader>
            {form && (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium">
                  Nombre
                  <Input
                    value={form.nombre}
                    onChange={(event) =>
                      setForm({ ...form, nombre: event.target.value })
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Tipo
                  <Select
                    value={form.tipo}
                    onValueChange={(value) =>
                      changeType(value as PrinterForm["tipo"])
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="network">
                        Red / Ethernet / Wi‑Fi
                      </SelectItem>
                      <SelectItem value="usb">USB</SelectItem>
                      <SelectItem value="bluetooth">
                        Bluetooth / serial
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Ancho
                  <Select
                    value={String(form.anchoMm)}
                    onValueChange={(value) =>
                      setForm({
                        ...form,
                        anchoMm: Number(value) as 58 | 80,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="80">80 mm</SelectItem>
                      <SelectItem value="58">58 mm</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Codepage
                  <Input
                    value={form.codepage}
                    onChange={(event) =>
                      setForm({ ...form, codepage: event.target.value })
                    }
                  />
                </label>
                {form.tipo === "network" && (
                  <>
                    <label className="grid gap-1 text-sm font-medium">
                      IP / host
                      <Input
                        value={String(form.connection.host || "")}
                        onChange={(event) =>
                          setConnection("host", event.target.value)
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-medium">
                      Puerto
                      <Input
                        type="number"
                        value={String(form.connection.port || 9100)}
                        onChange={(event) =>
                          setConnection("port", Number(event.target.value))
                        }
                      />
                    </label>
                  </>
                )}
                {form.tipo === "usb" && (
                  <>
                    <label className="grid gap-1 text-sm font-medium">
                      Vendor ID
                      <Input
                        placeholder="0x04b8"
                        value={String(form.connection.vendorId || "")}
                        onChange={(event) =>
                          setConnection("vendorId", event.target.value)
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-medium">
                      Product ID
                      <Input
                        placeholder="0x0202"
                        value={String(form.connection.productId || "")}
                        onChange={(event) =>
                          setConnection("productId", event.target.value)
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-medium md:col-span-2">
                      {form.connection.systemPrinter
                        ? "Impresora de Windows detectada"
                        : "Impresora de Windows (opcional)"}
                      <Input
                        value={String(form.connection.systemPrinter || "")}
                        onChange={(event) =>
                          setConnection("systemPrinter", event.target.value)
                        }
                      />
                    </label>
                  </>
                )}
                {form.tipo === "bluetooth" && (
                  <>
                    <label className="grid gap-1 text-sm font-medium">
                      Puerto / path
                      <Input
                        placeholder="COM5"
                        value={String(form.connection.path || "")}
                        onChange={(event) =>
                          setConnection("path", event.target.value)
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-medium">
                      Baud rate
                      <Input
                        type="number"
                        value={String(form.connection.baudRate || 9600)}
                        onChange={(event) =>
                          setConnection("baudRate", Number(event.target.value))
                        }
                      />
                    </label>
                  </>
                )}
                <label className="flex items-center justify-between rounded-lg border p-3 text-sm font-medium">
                  Abrir cajón
                  <Switch
                    checked={form.abreCajon}
                    onCheckedChange={(abreCajon) =>
                      setForm({ ...form, abreCajon })
                    }
                  />
                </label>
                <label className="flex items-center justify-between rounded-lg border p-3 text-sm font-medium">
                  Impresora habilitada
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(enabled) => setForm({ ...form, enabled })}
                  />
                </label>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={closeForm}>
                Cancelar
              </Button>
              <Button
                variant="outline"
                onClick={() => void testDraft()}
                disabled={busy === "test-draft"}
              >
                {busy === "test-draft" && (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                )}
                Probar sin guardar
              </Button>
              <Button onClick={() => void save()} disabled={busy === "save"}>
                Guardar impresora
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Ajustes avanzados</DialogTitle>
              <DialogDescription>
                Configura el servicio local y los orígenes autorizados.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <label className="grid gap-1 text-sm font-medium">
                Puerto
                <Input
                  value={port}
                  type="number"
                  onChange={(event) => setPort(event.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Orígenes autorizados
                <textarea
                  className="min-h-28 rounded-lg border bg-transparent px-2.5 py-2 text-sm"
                  value={origins}
                  placeholder="https://pos.ejemplo.com"
                  onChange={(event) => setOrigins(event.target.value)}
                />
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSettingsOpen(false)}>
                Cancelar
              </Button>
              <Button
                disabled={busy === "settings"}
                onClick={() =>
                  void (async () => {
                    if (await saveSettings()) setSettingsOpen(false);
                  })()
                }
              >
                Guardar ajustes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
