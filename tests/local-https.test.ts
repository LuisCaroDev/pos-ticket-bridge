import {
  httpsVideoUrl,
  httpsGuideUrl,
  HTTPS_HELP_URLS,
} from "../src/core/https-help";
// @vitest-environment node
import "reflect-metadata";
import { LocalCaTrust } from "../src/core/local-ca-trust";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import { checkServerIdentity } from "node:tls";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  X509Certificate,
} from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import {
  BasicConstraintsExtension,
  ExtendedKeyUsageExtension,
  KeyUsagesExtension,
  KeyUsageFlags,
  X509Certificate as ParsedCertificate,
} from "@peculiar/x509";
import { HttpsStore, type SecretStorage } from "../src/core/https-store";
import {
  LocalHttpsManager,
  type ListenerConfiguration,
} from "../src/core/local-https";
import {
  HttpsEnrollment,
  iosProfile,
  enrollmentDuration,
} from "../src/core/https-enrollment";
import { isSameSubnet, lanInterfaces } from "../src/core/lan";
import type { LanInterface } from "../src/core/local-https-types";
import { ConfigStore } from "../src/core/config-store";
import { createBridgeServer } from "../src/core/server";

const directories: string[] = [];
const cleanup: Array<() => Promise<unknown>> = [];
const local: LanInterface = {
  name: "Wi-Fi",
  address: "192.168.10.12",
  netmask: "255.255.255.0",
  mac: "00:01:02:03:04:05",
};

function encryptedStorage(): SecretStorage {
  const key = randomBytes(32);
  return {
    isEncryptionAvailable: () => true,
    encryptString(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const data = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final(),
      ]);
      return Buffer.concat([iv, cipher.getAuthTag(), data]);
    },
    decryptString(value) {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        value.subarray(0, 12),
      );
      decipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([
        decipher.update(value.subarray(28)),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}
function fixture() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "bridge-https-test-"),
  );
  directories.push(directory);
  const secrets = encryptedStorage();
  const store = new HttpsStore(path.join(directory, "https.json"), secrets);
  return { directory, secrets, store };
}
async function freePort(host = "127.0.0.1") {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, resolve);
  });
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
function request(url: string, options: https.RequestOptions = {}) {
  return new Promise<{
    status: number;
    headers: http.IncomingHttpHeaders;
    body: Buffer;
  }>((resolve, reject) => {
    const transport = url.startsWith("https:") ? https : http;
    const req = transport.request(
      url,
      { agent: false, ...options },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode!,
            headers: response.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on("error", reject);
    req.setTimeout(3000, () => req.destroy(new Error("timeout")));
    req.end();
  });
}
afterEach(async () => {
  for (const stop of cleanup.splice(0).reverse()) await stop();
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe("HTTPS certificates", () => {
  it("generates installation-specific P-256 CA and a valid signed IPv4 server certificate, persisted encrypted", async () => {
    const { store, secrets } = fixture();
    const record = await store.prepare(store.read(), local);
    store.write(record);
    const ca = new X509Certificate(record.ca!.cert);
    const cert = new X509Certificate(record.tls!.cert);
    expect(ca.ca).toBe(true);
    expect(ca.publicKey.asymmetricKeyDetails?.namedCurve).toBe("prime256v1");
    expect(ca.verify(ca.publicKey)).toBe(true);
    expect(cert.ca).toBe(false);
    expect(cert.verify(ca.publicKey)).toBe(true);
    expect(cert.checkIP(local.address)).toBe(local.address);
    expect(cert.checkIP("192.168.10.99")).toBeUndefined();
    expect(cert.subjectAltName).toBe(`IP Address:${local.address}`);
    expect(
      cert.validToDate.getTime() - cert.validFromDate.getTime(),
    ).toBeLessThanOrEqual(365 * 86400000);
    const parsed = new ParsedCertificate(record.tls!.cert);
    expect(parsed.signatureAlgorithm).toMatchObject({
      name: "ECDSA",
      hash: { name: "SHA-256" },
    });
    expect(parsed.getExtension(ExtendedKeyUsageExtension)?.usages).toEqual([
      "1.3.6.1.5.5.7.3.1",
    ]);
    expect(parsed.getExtension(KeyUsagesExtension)?.usages).toBe(
      KeyUsageFlags.digitalSignature,
    );
    expect(
      new ParsedCertificate(record.ca!.cert).getExtension(
        BasicConstraintsExtension,
      ),
    ).toMatchObject({ ca: true, pathLength: 0 });
    const disk = fs.readFileSync(store.file, "utf8");
    expect(disk).not.toContain("PRIVATE KEY");
    expect(JSON.stringify(store.metadata(record))).not.toContain(
      "encryptedKey",
    );
    const reopened = new HttpsStore(store.file, secrets);
    expect(reopened.read()).toEqual(record);
    expect(reopened.tlsOptions(record).key).toContain("PRIVATE KEY");
    const another = await fixture().store.prepare(
      { version: 1, state: "unconfigured" },
      local,
    );
    expect(another.ca!.cert).not.toBe(record.ca!.cert);
  });

  it("reuses valid material and renews for IP changes or expiry without changing the CA", async () => {
    const { store } = fixture();
    const record = await store.prepare(store.read(), local);
    const same = await store.prepare(record, local);
    expect(same).toEqual(record);
    const changed = await store.prepare(record, {
      ...local,
      address: "192.168.10.20",
    });
    expect(changed.ca).toEqual(record.ca);
    expect(changed.tls).not.toEqual(record.tls);
    const renewed = await store.prepare(
      record,
      local,
      Date.now() + 340 * 86400000,
    );
    expect(renewed.ca).toEqual(record.ca);
    expect(renewed.tls).not.toEqual(record.tls);
    const invalid = await store.prepare(
      { ...record, tls: { ...record.tls!, cert: "broken certificate" } },
      local,
    );
    expect(invalid.ca).toEqual(record.ca);
    expect(invalid.tls!.cert).not.toEqual(record.tls!.cert);
  });

  it("preserves corrupted or undecryptable files, and refuses plaintext fallback", async () => {
    const { store, secrets } = fixture();
    const record = await store.prepare(store.read(), local);
    store.write(record);
    const bytes = fs.readFileSync(store.file);
    const otherUser = new HttpsStore(store.file, encryptedStorage());
    await expect(
      otherUser.prepare(otherUser.read(), local),
    ).rejects.toMatchObject({ code: "https_decryption_failed" });
    expect(fs.readFileSync(store.file)).toEqual(bytes);
    secrets.isEncryptionAvailable = () => false;
    await expect(store.prepare(record, local)).rejects.toMatchObject({
      code: "https_storage_unavailable",
    });
    fs.writeFileSync(store.file, "{broken");
    expect(() => store.read()).toThrow("https_store_invalid");
    expect(fs.readFileSync(store.file, "utf8")).toBe("{broken");
  });

  it("performs real TLS verification with the generated CA and rejects wrong IP and untrusted CA", async () => {
    const { directory, store } = fixture();
    const record = await store.prepare(store.read(), {
      ...local,
      address: "127.0.0.1",
    });
    const config = new ConfigStore(path.join(directory, "config.json"));
    const bridge = createBridgeServer(config, undefined, {
      tls: store.tlsOptions(record),
      host: "127.0.0.1",
      port: 0,
    });
    await bridge.start();
    cleanup.push(() => bridge.stop());
    const port = (bridge.app.server.address() as net.AddressInfo).port;
    const url = `https://127.0.0.1:${port}/health`;
    const health = await request(url, { ca: record.ca!.cert });
    expect(health.status).toBe(200);
    expect(JSON.parse(health.body.toString()).transport).toBe("https");
    await expect(request(url)).rejects.toBeDefined();
    await expect(
      request(url, {
        ca: record.ca!.cert,
        checkServerIdentity: (_host, cert) =>
          checkServerIdentity("192.168.10.99", cert),
      }),
    ).rejects.toBeDefined();
    const denied = await request(`https://127.0.0.1:${port}/print`, {
      ca: record.ca!.cert,
      method: "POST",
      headers: { "x-agent-token": "incorrect" },
    });
    expect(denied.status).toBe(401);
    // Desktop calls are internal injections, with the same token middleware in HTTPS mode.
    const internal = await bridge.app.inject({
      method: "POST",
      url: "/print",
      headers: { "x-agent-token": config.get().token },
      payload: {},
    });
    expect(internal.statusCode).toBe(400);
  });

  it("creates a parseable iOS profile with exactly one public CA payload", async () => {
    const { store } = fixture();
    const record = await store.prepare(store.read(), local);
    const xml = iosProfile(record.ca!.cert);
    const dom = new JSDOM(xml, { contentType: "text/xml" });
    const document = dom.window.document;
    expect(document.querySelector("parsererror")).toBeNull();
    expect(
      document.querySelectorAll("plist > dict > array > dict"),
    ).toHaveLength(1);
    expect(document.querySelector("data")!.textContent).toBe(
      new X509Certificate(record.ca!.cert).raw.toString("base64"),
    );
    expect(xml).toContain("com.apple.security.root");
    expect(xml).not.toMatch(
      /PRIVATE KEY|encryptedKey|x-agent-token|com\.apple\.mdm|com\.apple\.wifi/,
    );
    dom.window.close();
  });
});

describe("HTTPS lifecycle", () => {
  function managerFixture() {
    const { store, directory } = fixture();
    const changes: Array<ListenerConfiguration | null> = [];
    let interfaces = [local];
    let fail = false;
    const manager = new LocalHttpsManager(store, {
      getPort: () => 9977,
      interfaces: () => interfaces,
      replaceListener: async (configuration) => {
        if (fail && configuration?.transport === "https") {
          fail = false;
          throw new Error("EADDRINUSE");
        }
        changes.push(configuration);
      },
    });
    cleanup.push(() => manager.shutdown());
    return {
      manager,
      store,
      changes,
      directory,
      setInterfaces: (value: LanInterface[]) => {
        interfaces = value;
      },
      failNext: () => {
        fail = true;
      },
    };
  }

  it("pauses, restarts and reactivates without losing CA or print configuration", async () => {
    const { manager, store, directory } = managerFixture();
    const config = new ConfigStore(path.join(directory, "config.json"));
    const token = config.get().token;
    await manager.initialize();
    expect(manager.status()).toMatchObject({
      state: "unconfigured",
      transport: "http",
    });
    await manager.activate(local);
    const saved = store.read();
    await manager.pause();
    expect(manager.status()).toMatchObject({
      state: "paused",
      transport: "http",
    });
    expect(store.read().ca).toEqual(saved.ca);
    await manager.restart();
    expect(manager.status().state).toBe("paused");
    await manager.activate();
    expect(store.read().tls).toEqual(saved.tls);
    expect(manager.status().enrollment).toBeUndefined();
    await manager.reset();
    expect(fs.existsSync(store.file)).toBe(false);
    expect(manager.status()).toMatchObject({
      state: "unconfigured",
      transport: "http",
    });
    expect(new ConfigStore(config.path()).get().token).toBe(token);
  });

  it("follows one replacement IPv4, stops on missing/ambiguous interfaces and recovers", async () => {
    const { manager, store, setInterfaces } = managerFixture();
    await manager.activate(local);
    const ca = store.read().ca;
    setInterfaces([{ ...local, address: "192.168.10.23" }]);
    await manager.reconcile();
    expect(manager.status().host).toBe("https://192.168.10.23:9977");
    expect(store.read().ca).toEqual(ca);
    setInterfaces([]);
    await expect(manager.reconcile()).rejects.toMatchObject({
      code: "https_interface_missing",
    });
    expect(manager.status()).toMatchObject({
      state: "active",
      transport: "stopped",
    });
    setInterfaces([
      { ...local, address: "192.168.10.24" },
      { ...local, address: "192.168.10.25" },
    ]);
    await expect(manager.reconcile()).rejects.toBeDefined();
    await manager.select({ ...local, address: "192.168.10.25" });
    expect(manager.status().transport).toBe("https");
    expect(store.read().ca).toEqual(ca);
  });

  it("rolls back a failed transition and serializes competing state changes", async () => {
    const { manager, store, failNext, changes } = managerFixture();
    await manager.initialize();
    failNext();
    await expect(manager.activate(local)).rejects.toMatchObject({
      code: "https_operation_failed",
    });
    expect(manager.status()).toMatchObject({
      state: "unconfigured",
      transport: "http",
    });
    expect(store.read().ca).toBeUndefined();
    await Promise.all([
      manager.activate(local),
      manager.pause(),
      manager.activate(local),
    ]);
    expect(manager.status()).toMatchObject({
      state: "active",
      transport: "https",
    });
    expect(changes.at(-1)?.transport).toBe("https");
  });

  it("keeps the application repairable when persisted HTTPS cannot be read", async () => {
    const { manager, store } = managerFixture();
    fs.writeFileSync(store.file, "bad");
    await manager.initialize();
    expect(manager.status()).toMatchObject({
      transport: "stopped",
      error: { code: "https_store_invalid" },
    });
    expect(fs.readFileSync(store.file, "utf8")).toBe("bad");
    await manager.reset();
    expect(manager.status().transport).toBe("http");
  });
});

describe("temporary enrollment", () => {
  it("restricts source addresses to the selected private subnet", () => {
    for (const remote of ["192.168.10.55", "::ffff:192.168.10.55"])
      expect(isSameSubnet(remote, local)).toBe(true);
    for (const remote of [
      undefined,
      "127.0.0.1",
      "192.168.11.5",
      "8.8.8.8",
      "::1",
      "garbage",
    ])
      expect(isSameSubnet(remote, local)).toBe(false);
    expect(
      isSameSubnet("192.168.10.55", { ...local, netmask: "0.0.0.0" }),
    ).toBe(false);
    expect(
      isSameSubnet("192.168.10.55", { ...local, netmask: "255.0.255.0" }),
    ).toBe(false);
  });

  it.runIf(lanInterfaces().length > 0)(
    "serves only certificates, ignores forwarded addresses and stops all sockets at expiry",
    async () => {
      const actual = lanInterfaces()[0];
      const { store } = fixture();
      const record = await store.prepare(store.read(), actual);
      const port = await freePort(actual.address);
      const server = new HttpsEnrollment(port, 1000);
      cleanup.push(() => server.stop());
      const session = await server.start(actual, record.ca!.cert, "ios");
      const download = await request(session.url, {
        headers: { "x-forwarded-for": "8.8.8.8" },
      });
      expect(download.status).toBe(200);
      expect(download.headers["content-type"]).toBe(
        "application/x-apple-aspen-config",
      );
      expect(download.headers["cache-control"]).toBe("no-store");
      expect(download.body.toString()).not.toMatch(
        /PRIVATE KEY|encryptedKey|token/,
      );
      for (const client of ["windows", "macos", "android"] as const) {
        const changed = await server.start(actual, record.ca!.cert, client);
        expect(changed.expiresAt).toBe(session.expiresAt);
        const downloaded = await request(changed.url);
        expect(new X509Certificate(downloaded.body).fingerprint256).toBe(
          new X509Certificate(record.ca!.cert).fingerprint256,
        );
        expect(
          (await request(changed.url, { method: "HEAD" })).body.length,
        ).toBe(0);
      }
      expect((await request(session.url, { method: "POST" })).status).toBe(405);
      expect(
        (await request(`http://${actual.address}:${port}/api/status`)).status,
      ).toBe(404);
      expect(
        (await request(`http://${actual.address}:${port}/setup/../https.json`))
          .status,
      ).toBe(404);
      const other = new HttpsEnrollment(port);
      cleanup.push(() => other.stop());
      await expect(
        other.start(actual, record.ca!.cert, "ios"),
      ).rejects.toMatchObject({ code: "https_setup_unavailable" });
      const socket = net.connect(port, actual.address);
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("error", reject);
      });
      await new Promise<void>((resolve) =>
        socket.once("close", () => resolve()),
      );
      expect(server.status()).toBeUndefined();
      await expect(request(session.url)).rejects.toBeDefined();
    },
  );
});

describe("HTTP authorization and preflight", () => {
  it("requires a token for remote admin routes even without Origin, preserving allowed CORS", async () => {
    const { directory } = fixture();
    const store = new ConfigStore(path.join(directory, "config.json"));
    store.settings({ allowedOrigins: ["https://pos.example.com"] });
    const bridge = createBridgeServer(store);
    cleanup.push(() => bridge.stop());
    for (const origin of [undefined, "http://localhost:9977"]) {
      const reply = await bridge.app.inject({
        method: "GET",
        url: "/api/status",
        remoteAddress: local.address,
        ...(origin ? { headers: { origin } } : {}),
      });
      expect(reply.statusCode).toBe(401);
      expect(reply.body).not.toContain(store.get().token);
    }
    const allowed = await bridge.app.inject({
      method: "OPTIONS",
      url: "/print",
      headers: {
        origin: "https://pos.example.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,x-agent-token",
        "access-control-request-private-network": "true",
      },
    });
    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "https://pos.example.com",
    );
    expect(allowed.headers["access-control-allow-private-network"]).toBe(
      "true",
    );
    const blocked = await bridge.app.inject({
      method: "OPTIONS",
      url: "/print",
      headers: {
        origin: "https://other.example.com",
        "access-control-request-method": "POST",
        "access-control-request-private-network": "true",
      },
    });
    expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
    expect(
      blocked.headers["access-control-allow-private-network"],
    ).toBeUndefined();
    expect(() => store.settings({ port: 9978 })).toThrow("https_reserved_port");
  });
});

describe("enrollment lifecycle integration", () => {
  for (const action of [
    "pause",
    "reset",
    "select",
    "shutdown",
    "network-loss",
  ] as const) {
    it.runIf(lanInterfaces().length > 0)(
      "closes the enrollment socket on " + action,
      async () => {
        const actual = lanInterfaces()[0];
        const { store } = fixture();
        let available = [actual];
        const enrollment = new HttpsEnrollment(await freePort(actual.address));
        const manager = new LocalHttpsManager(store, {
          getPort: () => 9977,
          interfaces: () => available,
          enrollment,
          replaceListener: async (): Promise<void> => undefined,
        });
        cleanup.push(() => manager.shutdown());
        await manager.activate(actual);
        const session = await manager.startEnrollment("windows");
        expect((await request(session.url)).status).toBe(200);
        if (action === "network-loss") {
          available = [];
          await expect(manager.reconcile()).rejects.toBeDefined();
        } else if (action === "select") await manager.select(actual);
        else await manager[action]();
        expect(manager.status().enrollment).toBeUndefined();
        await expect(request(session.url)).rejects.toBeDefined();
      },
    );
  }
});

describe("host CA trust", () => {
  it("installs once in Windows CurrentUser and removes only the matching root", async () => {
    const { directory, store } = fixture();
    const record = await store.prepare(
      { version: 1, state: "unconfigured" },
      local,
    );
    let installed = false;
    const scripts: string[][] = [];
    const trust = new LocalCaTrust(
      path.join(directory, "public.cer"),
      "win32",
      async (_file, args) => {
        expect(_file).toMatch(/certutil\.exe$/);
        scripts.push(args);
        if (args.includes("-addstore")) installed = true;
        if (args.includes("-delstore")) installed = false;
        return installed
          ? "Cert Hash(sha1): " +
              new X509Certificate(
                fs.readFileSync(path.join(directory, "public.cer")),
              ).fingerprint.replace(/:/g, " ")
          : "Root";
      },
    );
    await trust.install(record.ca!.cert);
    await trust.install(record.ca!.cert);
    expect(trust.state).toBe("trusted");
    expect(scripts.filter((s) => s.includes("-addstore"))).toHaveLength(1);
    expect(
      scripts.every(
        (s) => s.includes("-user") && !s.join(" ").includes("PRIVATE KEY"),
      ),
    ).toBe(true);
    await trust.remove();
    expect(scripts.find((args) => args.includes("-delstore"))).toEqual([
      "-user",
      "-delstore",
      "Root",
      new X509Certificate(record.ca!.cert).fingerprint.replace(/:/g, ""),
    ]);
    expect(installed).toBe(false);
    expect(fs.existsSync(path.join(directory, "public.cer"))).toBe(false);
    const replacement = await store.prepare(
      { version: 1, state: "unconfigured" },
      local,
    );
    expect(replacement.ca!.cert).not.toBe(record.ca!.cert);
    await trust.install(replacement.ca!.cert);
    expect(trust.state).toBe("trusted");
    expect(scripts.filter((args) => args.includes("-addstore"))).toHaveLength(
      2,
    );
  });
  it("uses user SSL trust on macOS and keeps the public receipt on cancellation", async () => {
    const { directory, store } = fixture();
    const record = await store.prepare(
      { version: 1, state: "unconfigured" },
      local,
    );
    const commands: string[][] = [];
    const receipt = path.join(directory, "public.cer");
    const trust = new LocalCaTrust(
      receipt,
      "darwin",
      async (_file, args) => {
        commands.push(args);
        throw new Error("cancelled");
      },
      "/Users/test",
    );
    await expect(trust.install(record.ca!.cert)).rejects.toThrow(
      "https_trust_failed",
    );
    expect(trust.state).toBe("error");
    expect(commands.find((args) => args[0] === "add-trusted-cert")).toEqual([
      "add-trusted-cert",
      "-r",
      "trustRoot",
      "-p",
      "ssl",
      "-k",
      "/Users/test/Library/Keychains/login.keychain-db",
      receipt,
    ]);
    expect(
      new X509Certificate(fs.readFileSync(receipt)).raw.equals(
        new X509Certificate(record.ca!.cert).raw,
      ),
    ).toBe(true);
  });
  it("keeps HTTPS and CA on installation failure, preserves trust when paused", async () => {
    const { directory, store } = fixture();
    const trust = new LocalCaTrust(
      path.join(directory, "public.cer"),
      "win32",
      async () => {
        throw new Error("denied");
      },
    );
    const manager = new LocalHttpsManager(store, {
      trust,
      interfaces: () => [local],
      getPort: () => 9977,
      replaceListener: async () => undefined,
    });
    await manager.activate(local);
    const ca = store.read().ca!.cert;
    expect(manager.status().transport).toBe("https");
    expect(manager.status().localTrust).toBe("error");
    await manager.pause();
    expect(store.read().ca!.cert).toBe(ca);
    await manager.activate(local);
    await expect(manager.reset()).rejects.toThrow("https_trust_remove_failed");
    expect(store.read().ca!.cert).toBe(ca);
    expect(manager.status().state).toBe("active");
    expect(manager.status().transport).toBe("https");
    await manager.shutdown();
  });
});

describe("coordinated settings", () => {
  it("changes transport and port with one restart and restores both on failure", async () => {
    const { store } = fixture();
    let port = 9977;
    const changes: Array<ListenerConfiguration | null> = [];
    const manager = new LocalHttpsManager(store, {
      interfaces: () => [local],
      getPort: () => port,
      replaceListener: async (value) => {
        changes.push(value);
        if (value?.port === 9999) throw new Error("busy");
      },
    });
    await manager.restart();
    changes.length = 0;
    await manager.applySettings(
      {
        enabled: true,
        selection: { name: local.name, address: local.address },
      },
      async () => {
        port = 9988;
      },
      async () => {
        port = 9977;
      },
    );
    expect(changes).toHaveLength(1);
    expect(manager.status().host).toBe("https://192.168.10.12:9988");
    const ca = store.read().ca!.cert;
    await expect(
      manager.applySettings(
        {
          enabled: false,
          selection: { name: local.name, address: local.address },
        },
        async () => {
          port = 9999;
        },
        async () => {
          port = 9988;
        },
      ),
    ).rejects.toThrow();
    expect(port).toBe(9988);
    expect(manager.status().transport).toBe("https");
    expect(store.read().ca!.cert).toBe(ca);
    expect(store.read().state).toBe("active");
    await manager.shutdown();
  });
  it("validates selection before changing other settings", async () => {
    const { store } = fixture();
    let committed = false;
    const manager = new LocalHttpsManager(store, {
      interfaces: () => [local],
      getPort: () => 9977,
      replaceListener: async () => undefined,
    });
    await expect(
      manager.applySettings(
        {
          enabled: true,
          selection: { name: "missing", address: local.address },
        },
        async () => {
          committed = true;
        },
        async () => undefined,
      ),
    ).rejects.toThrow("https_interface_missing");
    expect(committed).toBe(false);
    await manager.shutdown();
  });
});

it("selects public HTTPS help videos by OS and rejects unsupported URLs", () => {
  expect(
    httpsVideoUrl("ios", {
      POS_BRIDGE_HTTPS_VIDEO_IOS: "https://example.com/ios",
    }),
  ).toBe("https://example.com/ios");
  expect(
    httpsVideoUrl("windows", {
      POS_BRIDGE_HTTPS_VIDEO_IOS: "https://example.com/ios",
    }),
  ).toBeUndefined();
  for (const url of [
    "",
    "javascript:alert(1)",
    "file:///video",
    "https://user:password@example.com",
    "invalid",
  ])
    expect(
      httpsVideoUrl("android", { POS_BRIDGE_HTTPS_VIDEO_ANDROID: url }),
    ).toBeUndefined();
});

it("parses the configurable session lifetime and defaults invalid values", () => {
  expect(enrollmentDuration({ POS_BRIDGE_HTTPS_SETUP_TTL_MS: "1200000" })).toBe(
    1200000,
  );
  expect(enrollmentDuration({ POS_BRIDGE_HTTPS_SETUP_TTL_MS: "1500" })).toBe(
    1500,
  );
  for (const value of [
    undefined,
    "",
    "0",
    "-2",
    "1.5",
    "NaN",
    "Infinity",
    "2147483648",
  ])
    expect(enrollmentDuration({ POS_BRIDGE_HTTPS_SETUP_TTL_MS: value })).toBe(
      600000,
    );
});
it.runIf(lanInterfaces().length > 0)(
  "allows sessions longer than ten minutes without extending them on download",
  async () => {
    const actual = lanInterfaces()[0];
    const { store } = fixture();
    const record = await store.prepare(store.read(), actual);
    const server = new HttpsEnrollment(
      await freePort(actual.address),
      enrollmentDuration({ POS_BRIDGE_HTTPS_SETUP_TTL_MS: "1200000" }),
    );
    cleanup.push(() => server.stop());
    const before = Date.now();
    const session = await server.start(actual, record.ca!.cert, "ios");
    expect(Date.parse(session.expiresAt) - before).toBeGreaterThanOrEqual(
      1200000,
    );
    expect(Date.parse(session.expiresAt) - before).toBeLessThan(1205000);
    expect(server.durationMilliseconds()).toBe(1200000);
    expect((await request(session.url)).status).toBe(200);
    expect(server.status()?.expiresAt).toBe(session.expiresAt);
  },
);

it("uses official guides by default and validates environment overrides", () => {
  expect(httpsGuideUrl("ios", {})).toBe(HTTPS_HELP_URLS.ios);
  expect(
    httpsGuideUrl("ios", {
      POS_BRIDGE_HTTPS_GUIDE_IOS: "https://support.apple.com/es-es/102390",
    }),
  ).toBe("https://support.apple.com/es-es/102390");
  for (const value of [
    "",
    "bad",
    "http://example.com",
    "https://user:pass@example.com",
  ]) {
    expect(httpsGuideUrl("ios", { POS_BRIDGE_HTTPS_GUIDE_IOS: value })).toBe(
      HTTPS_HELP_URLS.ios,
    );
  }
  expect(httpsGuideUrl("invalid" as any, {})).toBeUndefined();
});
