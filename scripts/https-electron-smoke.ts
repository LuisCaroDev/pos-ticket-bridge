// Bundled and invoked by test-https-electron.ps1 in an isolated userData directory.
import { app, safeStorage } from "electron";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { HttpsStore } from "../src/core/https-store";
import { LocalHttpsManager } from "../src/core/local-https";

const [directory, phase] = process.argv.slice(2);
if (!directory || !["create", "paused", "active"].includes(phase))
  process.exit(2);
app.setPath("userData", directory);
app
  .whenReady()
  .then(async () => {
    assert.equal(process.platform, "win32");
    assert.equal(safeStorage.isEncryptionAvailable(), true);
    const store = new HttpsStore(
      path.join(directory, "local-https.json"),
      safeStorage,
    );
    const local = {
      name: "Smoke test",
      address: "192.168.50.10",
      netmask: "255.255.255.0",
      mac: "00:11:22:33:44:55",
    };
    const manager = new LocalHttpsManager(store, {
      getPort: () => 9977,
      interfaces: () => [local],
      // Real sockets are exercised by Vitest; this smoke test targets actual DPAPI across processes.
      replaceListener: async (): Promise<void> => undefined,
    });
    await manager.initialize();
    try {
      if (phase === "create") {
        await manager.activate(local);
        const fingerprint = manager.status().fingerprint;
        assert.ok(fingerprint);
        fs.writeFileSync(path.join(directory, "fingerprint.txt"), fingerprint);
        await manager.pause();
      } else {
        assert.equal(
          manager.status().state,
          phase === "paused" ? "paused" : "active",
        );
        assert.equal(manager.status().enrollment, undefined);
        assert.equal(
          manager.status().fingerprint,
          fs.readFileSync(path.join(directory, "fingerprint.txt"), "utf8"),
        );
        assert.match(store.tlsOptions(store.read()).key, /BEGIN PRIVATE KEY/);
        if (phase === "paused") await manager.activate();
        else {
          await manager.reset();
          assert.equal(fs.existsSync(store.file), false);
        }
      }
      fs.writeFileSync(
        path.join(directory, `${phase}.result.json`),
        JSON.stringify({
          ok: true,
          phase,
          electron: process.versions.electron,
          state: manager.status().state,
        }),
      );
      await manager.shutdown();
      app.exit(0);
    } catch (error) {
      fs.writeFileSync(
        path.join(directory, `${phase}.result.json`),
        JSON.stringify({
          ok: false,
          phase,
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
      await manager.shutdown();
      app.exit(1);
    }
  })
  .catch(() => app.exit(1));
