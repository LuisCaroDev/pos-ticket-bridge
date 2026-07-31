/* eslint-disable @typescript-eslint/no-var-requires */
import { execFile } from "node:child_process";
import net from "node:net";
import os from "node:os";
import { promisify } from "node:util";
import { message } from "../i18n";
import {
  defaultAutomaticProfileId,
  defaultPrinterLanguage,
} from "./printer-profiles";
import type { Printer } from "./types";

const defaultPrintProfile = () => ({
  language: defaultPrinterLanguage(),
  mode: "auto" as const,
  profileId: defaultAutomaticProfileId(),
});

const exec = promisify(execFile);
const NETWORK_PROBE_TIMEOUT_MS = 700;
const NETWORK_DISCOVERY_RETRY_DELAY_MS = 100;
const NETWORK_DISCOVERY_CONCURRENCY = 64;

const probe = (host: string, port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    const end = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(NETWORK_PROBE_TIMEOUT_MS);
    socket.once("connect", () => end(true));
    socket.once("timeout", () => end(false));
    socket.once("error", () => end(false));
    socket.connect(port, host);
  });

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function probeForDiscovery(host: string, port: number) {
  if (await probe(host, port)) return true;
  await wait(NETWORK_DISCOVERY_RETRY_DELAY_MS);
  return probe(host, port);
}

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
  for (
    let index = 0;
    index < candidates.length;
    index += NETWORK_DISCOVERY_CONCURRENCY
  ) {
    const active = await Promise.all(
      candidates
        .slice(index, index + NETWORK_DISCOVERY_CONCURRENCY)
        .map(async (host) =>
          (await probeForDiscovery(host, 9100)) ? host : null,
        ),
    );
    active.filter(Boolean).forEach((host) =>
      items.push({
        id: "",
        nombre: host!,
        tipo: "network",
        anchoMm: 80,
        printProfile: defaultPrintProfile(),
        abreCajon: false,
        enabled: true,
        connection: { host: host!, port: 9100 },
      }),
    );
  }
  return {
    items,
    notes: [message("network_hosts_scanned", { count: candidates.length })],
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
        `USB ${index + 1}`,
      tipo: "usb" as const,
      anchoMm: 80 as const,
      printProfile: defaultPrintProfile(),
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
      notes: devices.length ? [] : [message("mac_usb_not_found")],
    };
  } catch {
    return { items: [], notes: [message("mac_usb_unavailable")] };
  }
}

export async function discoverUsb() {
  if (process.platform === "darwin") return discoverMacUsb();
  if (process.platform !== "win32")
    return { items: [], notes: [message("usb_detection_unsupported")] };
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
      printProfile: defaultPrintProfile(),
      abreCajon: false,
      enabled: true,
      connection: { systemPrinter: printer.Name, port: printer.PortName },
    }));
    return {
      items,
      notes: items.length ? [] : [message("windows_usb_not_found")],
    };
  } catch {
    return { items: [], notes: [message("windows_usb_unavailable")] };
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
        tipo: "bluetooth" as const,
        anchoMm: 80 as const,
        printProfile: defaultPrintProfile(),
        abreCajon: false,
        enabled: true,
        connection: {
          path: port.path,
          baudRate: 9600,
          channel: port.manufacturer || "",
        },
      })),
      notes: [message("bluetooth_pair_first")],
    };
  } catch {
    return { items: [], notes: [message("bluetooth_unavailable")] };
  }
}

export async function checkConnection(printer: Printer) {
  if (!printer.enabled)
    return {
      ok: false,
      state: "offline",
      message: message("printer_disabled"),
    };
  if (printer.tipo === "network") {
    const host = String(printer.connection.host);
    const port = Number(printer.connection.port) || 9100;
    const ok = await probe(host, port);
    return {
      ok,
      state: ok ? "ready" : "offline",
      message: message(ok ? "network_connected" : "network_unreachable", {
        host,
        port,
      }),
    };
  }
  if (printer.tipo === "bluetooth") {
    const found = (await discoverBluetooth()).items.some(
      (item) => item.connection.path === printer.connection.path,
    );
    return {
      ok: found,
      state: found ? "detected" : "offline",
      message: message(found ? "serial_detected" : "serial_not_detected"),
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
      message: message(found ? "mac_usb_detected" : "mac_usb_not_detected"),
    };
  }
  const systemPrinter = String(printer.connection.systemPrinter || "").trim();
  if (!systemPrinter)
    return {
      ok: false,
      state: "offline",
      message: message("windows_printer_required"),
    };
  const found = (await discoverUsb()).items.some(
    (item) => item.connection.systemPrinter === systemPrinter,
  );
  return {
    ok: found,
    state: found ? "ready" : "offline",
    message: message(
      found ? "windows_usb_detected" : "windows_usb_not_detected",
    ),
  };
}
