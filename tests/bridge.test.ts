import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigStore } from "../src/core/config-store";
import { discoverUsb } from "../src/core/discovery";
import { createBridgeServer } from "../src/core/server";
import { resolveLanguage } from "../src/i18n";

const dirs: string[] = [];
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pos-ticket-bridge-test-"));
  dirs.push(dir);
  const store = new ConfigStore(path.join(dir, "config.json"));
  return { store, bridge: createBridgeServer(store) };
}
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("POS Ticket Bridge", () => {
  it("creates a clean persisted configuration", () => {
    const { store } = fixture();
    expect(store.get()).toMatchObject({
      version: 1,
      port: 9977,
      printers: [],
      allowedOrigins: [],
      language: "system",
    });
    expect(store.get().token).toHaveLength(48);
  });

  it("loads legacy configurations without rewriting them", () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), "pos-ticket-bridge-test-"),
    );
    dirs.push(dir);
    const configPath = path.join(dir, "config.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        port: 9977,
        token: "a".repeat(48),
        allowedOrigins: [],
        printers: [],
      }),
    );

    expect(new ConfigStore(configPath).get().language).toBe("system");
    expect(JSON.parse(fs.readFileSync(configPath, "utf8")).language).toBeUndefined();
  });

  it("stores all language preferences and resolves system locales safely", () => {
    const { store } = fixture();
    store.settings({ language: "en" });
    expect(store.get().language).toBe("en");
    store.settings({ language: "es" });
    expect(store.get().language).toBe("es");
    store.settings({ language: "system" });
    expect(resolveLanguage("system", "en-US")).toBe("en");
    expect(resolveLanguage("system", "es-419")).toBe("es");
    expect(resolveLanguage("system", "fr-FR")).toBe("es");
  });

  it("persists settings after reopening the config store", () => {
    const { store } = fixture();
    store.settings({
      port: 9988,
      allowedOrigins: ["https://pos.example.com"],
      language: "en",
    });

    const reopened = new ConfigStore(store.path());
    expect(reopened.get()).toMatchObject({
      port: 9988,
      allowedOrigins: ["https://pos.example.com"],
      language: "en",
    });
  });

  it("exposes advanced settings in the status used by the app", async () => {
    const { store, bridge } = fixture();

    store.settings({
      port: 9988,
      allowedOrigins: [" https://pos.ejemplo.com ", ""],
    });

    await expect(bridge.status()).resolves.toMatchObject({
      port: 9988,
      allowedOrigins: ["https://pos.ejemplo.com"],
    });
  });

  it("does not use the Windows-only USB message on macOS", async () => {
    if (process.platform !== "darwin") return;

    const result = await discoverUsb();
    expect(result.notes.join(" ")).not.toContain(
      "solo está disponible en Windows",
    );
  });

  it("stores USB printers by their Windows print queue", () => {
    const { store } = fixture();
    store.create({
      nombre: "Ticket caja",
      tipo: "usb",
      connection: {
        vendorId: "0x1fc9",
        productId: "0x2016",
        systemPrinter: "POS-80",
        port: "USB001",
      },
    });
    expect(store.get().printers[0].connection).toEqual({
      systemPrinter: "POS-80",
      port: "USB001",
      vendorId: "0x1fc9",
      productId: "0x2016",
    });
  });

  it("serves health, creates printers and rejects an invalid print token", async () => {
    const { bridge } = fixture();
    const health = await bridge.app.inject({ method: "GET", url: "/health" });
    expect(health.json()).toMatchObject({ ok: true });
    const created = await bridge.app.inject({
      method: "POST",
      url: "/api/printers",
      payload: {
        nombre: "Caja",
        tipo: "network",
        connection: { host: "192.168.1.20", port: 9100 },
      },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().config.printers[0]).toMatchObject({
      id: "caja",
      tipo: "network",
    });
    const denied = await bridge.app.inject({
      method: "POST",
      url: "/print",
      headers: { "x-agent-token": "incorrecto" },
      payload: { printerId: "caja", job: { version: 1, blocks: [] } },
    });
    expect(denied.statusCode).toBe(401);
    expect(denied.json().error).toEqual({ code: "invalid_token" });
    const missing = await bridge.app.inject({
      method: "POST",
      url: "/test/missing",
      headers: { "x-agent-token": bridge.store.get().token },
    });
    expect(missing.json().error).toEqual({
      code: "printer_not_found",
      params: { printerId: "missing" },
    });
    await bridge.stop();
  });
});
