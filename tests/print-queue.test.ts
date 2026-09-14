import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PrintQueue,
  printerDestination,
  printQueue,
} from "../src/core/print-queue";
import {
  openDrawer,
  printJob,
  testPrint,
  characterProfileTrialPrint,
} from "../src/core/printer";
import { createBridgeServer } from "../src/core/server";
import { ConfigStore } from "../src/core/config-store";
import { testPrintTexts, characterProfileTrialTexts } from "../src/i18n";
import type { Printer, PrintJob } from "../src/core/types";

const printer = (id = "one", port = 9100): Printer => ({
  id,
  nombre: id,
  tipo: "network",
  anchoMm: 80,
  abreCajon: false,
  enabled: true,
  printProfile: {
    language: "en",
    mode: "auto",
    profileId: "xprinter-xp-e260l",
  },
  connection: { host: "127.0.0.1", port },
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("print queues", () => {
  it("runs a burst FIFO per destination, while another destination advances", async () => {
    const queue = new PrintQueue();
    const gate = deferred();
    const order: number[] = [];
    let active = 0;
    let maximum = 0;
    const jobs = Array.from({ length: 25 }, (_, index) =>
      queue.run(printer(String(index)), async () => {
        active++;
        maximum = Math.max(maximum, active);
        order.push(index);
        if (index === 0) await gate.promise;
        await Promise.resolve();
        active--;
        return index;
      }),
    );
    await Promise.resolve();
    expect(queue.status(printer())).toEqual({ active: true, pending: 24 });
    expect(await queue.run(printer("other", 9101), async () => "done")).toBe(
      "done",
    );
    expect(order).toEqual([0]);
    gate.resolve();
    expect(await Promise.all(jobs)).toEqual(
      Array.from({ length: 25 }, (_, i) => i),
    );
    expect(maximum).toBe(1);
    expect(order).toEqual(Array.from({ length: 25 }, (_, i) => i));
    expect(queue.status(printer())).toEqual({ active: false, pending: 0 });
    expect(await queue.run(printer(), async () => "reused")).toBe("reused");
  });

  it("holds the turn through cleanup and continues after rejection", async () => {
    const queue = new PrintQueue();
    const closing = deferred();
    const order: string[] = [];
    const first = queue.run(printer(), async () => {
      try {
        throw new Error("send failed");
      } finally {
        order.push("closing");
        await closing.promise;
        order.push("closed");
      }
    });
    const rejection = expect(first).rejects.toThrow("send failed");
    const next = queue.run(printer(), async () => {
      order.push("next");
    });
    await Promise.resolve();
    expect(order).toEqual(["closing"]);
    closing.resolve();
    await Promise.all([rejection, next]);
    expect(order).toEqual(["closing", "closed", "next"]);
    expect(queue.status(printer())).toEqual({ active: false, pending: 0 });
    const syncError = queue.run(printer(), () => {
      throw new Error("sync");
    });
    await expect(syncError).rejects.toThrow("sync");
    await expect(queue.run(printer(), async () => 42)).resolves.toBe(42);
  });

  it("uses transport identity, including duplicate Windows, serial and USB configurations", () => {
    const a = printer();
    const b = printer("duplicate");
    a.connection = { host: " PRINTER.LOCAL ", port: undefined };
    b.connection = { host: "printer.local", port: 9100 };
    expect(printerDestination(a)).toBe(printerDestination(b));
    a.tipo = b.tipo = "usb";
    a.connection = {
      systemPrinter: " Receipt ",
      vendorId: "0x04B8",
      productId: "0x0202",
      serialNumber: "a",
    };
    b.connection = {
      systemPrinter: "receipt",
      vendorId: "04b8",
      productId: "0202",
      serialNumber: "b",
    };
    expect(printerDestination(a, "win32")).toBe(printerDestination(b, "win32"));
    expect(printerDestination(a, "darwin")).toBe(
      printerDestination(b, "darwin"),
    );
    a.tipo = b.tipo = "bluetooth";
    a.connection = { path: "com4", baudRate: 9600 };
    b.connection = { path: "COM4", baudRate: 115200 };
    expect(printerDestination(a, "win32")).toBe(printerDestination(b, "win32"));
    b.connection.path = "COM5";
    expect(printerDestination(a, "win32")).not.toBe(
      printerDestination(b, "win32"),
    );
    a.connection.path = "/dev/tty.Printer";
    b.connection.path = "/dev/cu.Printer";
    expect(printerDestination(a, "darwin")).not.toBe(
      printerDestination(b, "darwin"),
    );
  });

  it("queues every print entry point, snapshots inputs and does not deduplicate jobId", async () => {
    const received: string[] = [];
    const listener = net.createServer((socket) => {
      const chunks: Buffer[] = [];
      socket.on("data", (data) => chunks.push(Buffer.from(data)));
      socket.on("end", () =>
        received.push(Buffer.concat(chunks).toString("latin1")),
      );
    });
    await new Promise<void>((resolve) =>
      listener.listen(0, "127.0.0.1", resolve),
    );
    const address = listener.address() as net.AddressInfo;
    const target = printer("one", address.port);
    target.printProfile = {
      language: "en",
      mode: "custom",
      custom: { encoding: "CP858", codeTable: 19, unicodeFallback: "native" },
    };
    const gate = deferred();
    const held = printQueue.run(target, () => gate.promise);
    const stages: Array<{ stage: string; detail?: Record<string, unknown> }> =
      [];
    const hooks = {
      onEvent: (stage: string, detail?: Record<string, unknown>) =>
        stages.push({ stage, detail }),
    };
    const job: PrintJob = {
      version: 1,
      jobId: "same",
      blocks: [{ type: "text", content: "ORIGINAL" }],
    };
    const jobs = [
      printJob(target, job, hooks),
      printJob({ ...target, id: "duplicate" }, job, hooks),
      openDrawer(target, hooks),
      testPrint(target, testPrintTexts("en", "Queue test"), hooks),
      characterProfileTrialPrint(
        target,
        characterProfileTrialTexts("en", {
          id: "test",
          encoding: "CP858",
          codeTable: 19,
        }),
        hooks,
      ),
    ];
    try {
      await Promise.resolve();
      expect(printQueue.status(target)).toEqual({ active: true, pending: 5 });
      expect(stages.every(({ stage }) => stage === "print_queue_entered")).toBe(
        true,
      );
      job.blocks = [{ type: "text", content: "MUTATED" }];
      target.connection.port = 1;
      target.printProfile.mode = "custom";
      target.printProfile.custom = {
        encoding: "invalid",
        unicodeFallback: "native",
        codeTable: 0,
      };
      gate.resolve();
      await held;
      await Promise.all(jobs);
    } finally {
      gate.resolve();
      await Promise.allSettled([held, ...jobs]);
      await new Promise<void>((resolve) => listener.close(() => resolve()));
    }
    expect(received).toHaveLength(5);
    expect(received[0]).toContain("ORIGINAL");
    expect(received[1]).toContain("ORIGINAL");
    expect(received.join("")).not.toContain("MUTATED");
    const starts = stages.filter(
      ({ stage }) => stage === "print_queue_started",
    );
    expect(starts).toHaveLength(5);
    expect(starts.every(({ detail }) => Number(detail?.waitMs) >= 0)).toBe(
      true,
    );
    expect(printQueue.status(printer("one", address.port))).toEqual({
      active: false,
      pending: 0,
    });
  });

  it("keeps HTTP responses and exposes shared queue status across recreated listeners", async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "print-queue-test-"),
    );
    const listener = net.createServer((socket) => socket.resume());
    await new Promise<void>((resolve) =>
      listener.listen(0, "127.0.0.1", resolve),
    );
    const address = listener.address() as net.AddressInfo;
    const store = new ConfigStore(path.join(directory, "config.json"));
    const target = store.create(printer("http", address.port)).printers[0];
    const first = createBridgeServer(store);
    const gate = deferred();
    const held = printQueue.run(target, () => gate.promise);
    await Promise.resolve();
    await first.stop();
    const second = createBridgeServer(store);
    let completed = false;
    const response = second.app
      .inject({
        method: "POST",
        url: "/print",
        headers: { "x-agent-token": store.get().token },
        payload: {
          printerId: target.id,
          job: { version: 1, blocks: [{ type: "text", content: "HTTP" }] },
        },
      })
      .then((result) => {
        completed = true;
        return result;
      });
    try {
      await expect.poll(() => printQueue.status(target).pending).toBe(1);
      const status = await second.app.inject({
        method: "GET",
        url: "/api/status",
      });
      expect(status.statusCode).toBe(200);
      expect(status.json().printers[0].runtime.queue).toEqual({
        active: true,
        pending: 1,
      });
      expect(completed).toBe(false);
      gate.resolve();
      await held;
      const result = await response;
      expect(result.statusCode).toBe(200);
      expect(result.json()).toEqual({ ok: true });
      expect((await second.status()).printers[0].runtime.queue).toEqual({
        active: false,
        pending: 0,
      });
      expect(second.recentDiagnostics()[0].steps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ stage: "print_queue_entered" }),
          expect.objectContaining({
            stage: "print_queue_started",
            waitMs: expect.any(Number),
          }),
        ]),
      );
    } finally {
      gate.resolve();
      await Promise.allSettled([held, response]);
      await second.stop();
      await new Promise<void>((resolve) => listener.close(() => resolve()));
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("closes a failed rendering operation before sending the next ticket", async () => {
    const received: Buffer[] = [];
    const listener = net.createServer((socket) =>
      socket.on("data", (data) => received.push(Buffer.from(data))),
    );
    await new Promise<void>((resolve) =>
      listener.listen(0, "127.0.0.1", resolve),
    );
    const target = printer(
      "failure",
      (listener.address() as net.AddressInfo).port,
    );
    const invalid = {
      version: 1,
      blocks: [{ type: "unsupported" }],
    } as unknown as PrintJob;
    const failure = expect(printJob(target, invalid)).rejects.toMatchObject({
      code: "unsupported_print_block",
    });
    const next = printJob(target, {
      version: 1,
      blocks: [{ type: "text", content: "AFTER_FAILURE" }],
    });
    try {
      await Promise.all([failure, next]);
    } finally {
      await Promise.allSettled([failure, next]);
      await new Promise<void>((resolve) => listener.close(() => resolve()));
    }
    expect(Buffer.concat(received).toString("latin1")).toContain(
      "AFTER_FAILURE",
    );
    expect(printQueue.status(target)).toEqual({ active: false, pending: 0 });
  });
});
