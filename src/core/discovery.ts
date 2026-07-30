/* eslint-disable @typescript-eslint/no-var-requires */
import net from "node:net";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Printer } from "./types";
const exec = promisify(execFile);
const probe = (host: string, port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    const end = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(300);
    socket.once("connect", () => end(true));
    socket.once("timeout", () => end(false));
    socket.once("error", () => end(false));
    socket.connect(port, host);
  });
export async function discoverNetwork() {
  const candidates = Object.values(os.networkInterfaces())
    .flat()
    .filter((item): item is os.NetworkInterfaceInfo =>
      Boolean(item && item.family === "IPv4" && !item.internal),
    )
    .flatMap((item) => {
      const octets = item.address.split(".");
      return Array.from(
        { length: 254 },
        (_, index) => `${octets[0]}.${octets[1]}.${octets[2]}.${index + 1}`,
      ).filter((host) => host !== item.address);
    });
  const items: Printer[] = [];
  for (let index = 0; index < candidates.length; index += 40) {
    const active = await Promise.all(
      candidates
        .slice(index, index + 40)
        .map(async (host) => ((await probe(host, 9100)) ? host : null)),
    );
    active.filter(Boolean).forEach((host) =>
      items.push({
        id: "",
        nombre: `Impresora ${host}`,
        tipo: "network",
        anchoMm: 80,
        codepage: "CP850",
        abreCajon: false,
        enabled: true,
        connection: { host: host!, port: 9100 },
      }),
    );
  }
  return {
    items,
    notes: [`Hosts escaneados en puerto 9100: ${candidates.length}.`],
  };
}
const isUsbPrinter = (device: any) =>
  device.deviceClass === 7 ||
  device.configurations?.some((configuration: any) =>
    configuration.interfaces?.some(
      (iface: any) =>
        iface.alternate?.interfaceClass === 7 ||
        iface.alternates?.some(
          (alternate: any) => alternate.interfaceClass === 7,
        ),
    ),
  );
const usbString = (
  device: any,
  property: "productName" | "manufacturerName" | "serialNumber",
) => {
  try {
    return device[property] || "";
  } catch {
    return "";
  }
};
async function discoverMacUsb() {
  try {
    const { usb } = require("usb");
    const devices = (await usb.getDevices()).filter(isUsbPrinter);
    const items = devices.map((device: any, index: number) => ({
      id: "",
      nombre:
        usbString(device, "productName") ||
        usbString(device, "manufacturerName") ||
        `Impresora USB ${index + 1}`,
      tipo: "usb" as const,
      anchoMm: 80 as const,
      codepage: "CP850",
      abreCajon: false,
      enabled: true,
      connection: {
        vendorId: `0x${device.vendorId.toString(16)}`,
        productId: `0x${device.productId.toString(16)}`,
        serialNumber: usbString(device, "serialNumber"),
      },
    }));
    return {
      items,
      notes: devices.length
        ? []
        : ["No se detectaron dispositivos USB de clase impresora."],
    };
  } catch (error) {
    return {
      items: [],
      notes: [(error as Error).message || "USB no disponible en macOS"],
    };
  }
}
export async function discoverUsb() {
  if (process.platform === "darwin") return discoverMacUsb();
  if (process.platform !== "win32")
    return {
      items: [],
      notes: [
        "La detección USB del sistema solo está disponible en Windows y macOS.",
      ],
    };
  try {
    const script =
      "Get-CimInstance Win32_Printer | Where-Object { $_.PortName -match '^USB\\d+$' } | Select-Object Name,PortName | ConvertTo-Json -Compress";
    const { stdout } = await exec(
      "powershell",
      ["-NoProfile", "-Command", script],
      { windowsHide: true },
    );
    const result = stdout.trim()
      ? (JSON.parse(stdout) as
          | { Name: string; PortName: string }
          | Array<{ Name: string; PortName: string }>)
      : [];
    const printers = Array.isArray(result) ? result : [result];
    const items: Printer[] = printers.map((printer) => ({
        id: "",
        nombre: printer.Name,
        tipo: "usb" as const,
        anchoMm: 80 as const,
        codepage: "CP850",
        abreCajon: false,
        enabled: true,
        connection: {
          systemPrinter: printer.Name,
          port: printer.PortName,
        },
      }));
    return {
      items,
      notes: items.length
        ? []
        : ["No se detectaron impresoras USB instaladas en Windows."],
    };
  } catch (error) {
    return {
      items: [],
      notes: [
        (error as Error).message ||
          "No se pudo consultar las impresoras USB de Windows",
      ],
    };
  }
}
export async function discoverBluetooth() {
  try {
    const Adapter = require("@node-escpos/serialport-adapter");
    const ports = await Adapter.list();
    return {
      items: ports.map((port: any) => ({
        id: "",
        nombre: port.friendlyName || port.manufacturer || port.path,
        tipo: "bluetooth",
        anchoMm: 80,
        codepage: "CP850",
        abreCajon: false,
        enabled: true,
        connection: {
          path: port.path,
          baudRate: 9600,
          channel: port.manufacturer || "",
        },
      })),
      notes: [
        "Empareja la impresora con el sistema operativo antes de probarla.",
      ],
    };
  } catch (error) {
    return {
      items: [],
      notes: [(error as Error).message || "Bluetooth/serial no disponible"],
    };
  }
}
export async function checkConnection(printer: Printer) {
  if (!printer.enabled)
    return { ok: false, state: "offline", message: "Impresora deshabilitada" };
  if (printer.tipo === "network") {
    const host = String(printer.connection.host);
    const port = Number(printer.connection.port) || 9100;
    const ok = await probe(host, port);
    return {
      ok,
      state: ok ? "ready" : "offline",
      message: ok
        ? `Conectada a ${host}:${port}`
        : `No responde ${host}:${port}`,
    };
  }
  if (printer.tipo === "bluetooth") {
    const found = (await discoverBluetooth()).items.some(
      (item) => item.connection.path === printer.connection.path,
    );
    return {
      ok: found,
      state: found ? "detected" : "offline",
      message: found
        ? "Puerto serial detectado; valida con ticket de prueba."
        : "No se detecta el puerto configurado",
    };
  }
  if (process.platform === "darwin") {
    const found = (await discoverUsb()).items.some(
      (item) =>
        item.connection.vendorId === printer.connection.vendorId &&
        item.connection.productId === printer.connection.productId,
    );
    return {
      ok: found,
      state: found ? "ready" : "offline",
      message: found
        ? "Dispositivo USB detectado en macOS"
        : "No se detecta el dispositivo USB configurado en macOS",
    };
  }
  const systemPrinter = String(printer.connection.systemPrinter || "").trim();
  if (!systemPrinter)
    return {
      ok: false,
      state: "offline",
      message: "Configura una impresora instalada en Windows para usar USB.",
    };
  const found = (await discoverUsb()).items.some(
    (item) => item.connection.systemPrinter === systemPrinter,
  );
  return {
    ok: found,
    state: found ? "ready" : "offline",
    message: found
      ? "Impresora USB detectada por Windows"
      : "Windows no detecta la impresora USB configurada",
  };
}
