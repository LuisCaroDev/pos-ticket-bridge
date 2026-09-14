import type { Printer } from "./types";

/** Match the destination selected by the transport, rather than a saved ID. */
export function printerDestination(
  printer: Printer,
  platform: NodeJS.Platform = process.platform,
): string {
  const connection = printer.connection;
  if (printer.tipo === "network")
    return JSON.stringify([
      "network",
      String(connection.host).trim().toLowerCase(),
      Number(connection.port) || 9100,
    ]);
  if (printer.tipo === "bluetooth") {
    const path = String(connection.path);
    return JSON.stringify([
      "serial",
      platform === "win32" ? path.replace(/^\\\\\.\\/, "").toUpperCase() : path,
    ]);
  }
  if (platform === "win32")
    return JSON.stringify([
      "windows-spooler",
      String(connection.systemPrinter || "")
        .trim()
        .toLowerCase(),
    ]);
  const hex = (value: unknown) =>
    Number.parseInt(String(value || "").replace(/^0x/i, ""), 16);
  // Direct USB currently selects by VID/PID, even if a serial number is saved.
  return JSON.stringify([
    "direct-usb",
    hex(connection.vendorId),
    hex(connection.productId),
  ]);
}

type Queue = { tail: Promise<void>; active: boolean; pending: number };

export class PrintQueue {
  private readonly queues = new Map<string, Queue>();

  status(printer: Printer): { active: boolean; pending: number } {
    const queue = this.queues.get(printerDestination(printer));
    return { active: queue?.active || false, pending: queue?.pending || 0 };
  }

  run<T>(printer: Printer, work: () => Promise<T>): Promise<T> {
    const key = printerDestination(printer);
    let queue = this.queues.get(key);
    if (!queue) {
      queue = { tail: Promise.resolve(), active: false, pending: 0 };
      this.queues.set(key, queue);
    }
    const entry = queue;
    entry.pending++;
    const result = entry.tail.then(async () => {
      entry.pending--;
      entry.active = true;
      try {
        return await work();
      } finally {
        entry.active = false;
        if (entry.pending === 0) this.queues.delete(key);
      }
    });
    // A rejected operation must not poison the next operation's turn.
    entry.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

// Shared by HTTP listeners and direct/IPC printing calls for this process.
export const printQueue = new PrintQueue();
