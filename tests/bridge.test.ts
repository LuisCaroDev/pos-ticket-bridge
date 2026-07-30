import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigStore } from "../src/core/config-store";
import { createBridgeServer } from "../src/core/server";

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
    });
    expect(store.get().token).toHaveLength(48);
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
    await bridge.stop();
  });
});
