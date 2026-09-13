import http from "node:http";
import { randomUUID, X509Certificate } from "node:crypto";
import type { Socket } from "node:net";
import { BridgeError } from "../i18n";
import type {
  ClientOS,
  EnrollmentStatus,
  LanInterface,
} from "./local-https-types";
import { isSameSubnet } from "./lan";

export const ENROLLMENT_PORT = 9978;
export const ENROLLMENT_DURATION = 10 * 60_000;
declare const __HTTPS_SETUP_TTL_MS__: string;
export function enrollmentDuration(
  environment: Record<string, string | undefined> = process.env,
): number {
  const baked =
    typeof __HTTPS_SETUP_TTL_MS__ === "undefined" ? "" : __HTTPS_SETUP_TTL_MS__;
  const value = environment.POS_BRIDGE_HTTPS_SETUP_TTL_MS ?? baked;
  const milliseconds = Number(value);
  // Node timers use a signed 32-bit millisecond delay.
  return Number.isInteger(milliseconds) &&
    milliseconds > 0 &&
    milliseconds <= 2_147_483_647
    ? milliseconds
    : ENROLLMENT_DURATION;
}
const filenames: Record<ClientOS, string> = {
  ios: "ios.mobileconfig",
  android: "android.cer",
  windows: "windows.cer",
  macos: "macos.cer",
};

export function iosProfile(caPem: string) {
  const cert = new X509Certificate(caPem);
  const identity = cert.fingerprint256.replace(/:/g, "").toLowerCase();
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>PayloadType</key><string>Configuration</string>
<key>PayloadVersion</key><integer>1</integer>
<key>PayloadIdentifier</key><string>com.pos.ticketbridge.ca.${identity}</string>
<key>PayloadUUID</key><string>${randomUUID()}</string>
<key>PayloadDisplayName</key><string>POS Ticket Bridge</string>
<key>PayloadContent</key><array><dict>
<key>PayloadType</key><string>com.apple.security.root</string>
<key>PayloadVersion</key><integer>1</integer>
<key>PayloadIdentifier</key><string>com.pos.ticketbridge.root.${identity}</string>
<key>PayloadUUID</key><string>${randomUUID()}</string>
<key>PayloadDisplayName</key><string>POS Ticket Bridge</string>
<key>PayloadContent</key><data>${cert.raw.toString("base64")}</data>
</dict></array></dict></plist>`;
}

export class HttpsEnrollment {
  private server?: http.Server;
  private sockets = new Set<Socket>();
  private timer?: ReturnType<typeof setTimeout>;
  private session?: EnrollmentStatus;
  constructor(
    private readonly port = ENROLLMENT_PORT,
    private readonly duration = enrollmentDuration(),
  ) {}

  durationMilliseconds() {
    return this.duration;
  }

  status() {
    return this.session ? { ...this.session } : undefined;
  }

  async start(local: LanInterface, caPem: string, os: ClientOS) {
    if (!Object.prototype.hasOwnProperty.call(filenames, os))
      throw new BridgeError("https_invalid_os");
    // Changing OS does not extend an existing session's deadline.
    if (this.session) {
      this.session = {
        ...this.session,
        os,
        url: `http://${local.address}:${this.port}/setup/${filenames[os]}`,
      };
      return this.status()!;
    }
    const cert = new X509Certificate(caPem).raw;
    const profile = Buffer.from(iosProfile(caPem));
    const expires = Date.now() + this.duration;
    const server = http.createServer((request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("X-Content-Type-Options", "nosniff");
      if (
        Date.now() >= expires ||
        !isSameSubnet(request.socket.remoteAddress, local)
      ) {
        response.writeHead(403).end();
        return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" }).end();
        return;
      }
      const filename = Object.values(filenames).find(
        (item) => request.url === `/setup/${item}`,
      );
      if (!filename) {
        response.writeHead(404).end();
        return;
      }
      const isProfile = filename === filenames.ios;
      const bytes = isProfile ? profile : cert;
      response.writeHead(200, {
        "Content-Type": isProfile
          ? "application/x-apple-aspen-config"
          : "application/pkix-cert",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": bytes.length,
      });
      response.end(request.method === "HEAD" ? undefined : bytes);
    });
    server.requestTimeout = 15_000;
    server.headersTimeout = 10_000;
    server.maxConnections = 16;
    server.on("connection", (socket) => {
      this.sockets.add(socket);
      socket.once("close", () => this.sockets.delete(socket));
    });
    this.server = server;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(this.port, local.address, () => {
          server.removeListener("error", reject);
          resolve();
        });
      });
    } catch {
      await this.stop();
      throw new BridgeError("https_setup_unavailable", { port: this.port });
    }
    server.on("error", () => {
      void this.stop();
    });
    this.session = {
      os,
      url: `http://${local.address}:${this.port}/setup/${filenames[os]}`,
      expiresAt: new Date(expires).toISOString(),
    };
    this.timer = setTimeout(
      () => {
        void this.stop();
      },
      Math.max(0, expires - Date.now()),
    );
    this.timer.unref();
    return this.status()!;
  }

  async stop() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.session = undefined;
    const server = this.server;
    this.server = undefined;
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    if (server)
      await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
