import { execFile } from "node:child_process";
import { X509Certificate } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { BridgeError } from "../i18n";

export type TrustState = "trusted" | "missing" | "error" | "unsupported";
type Runner = (file: string, args: string[]) => Promise<string>;
const execute: Runner = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });

/** Only public certificates enter this service. Trust is scoped to the current user. */
export class LocalCaTrust {
  state: TrustState = "missing";
  constructor(
    private readonly receipt: string,
    private readonly platform = process.platform,
    private readonly run: Runner = execute,
    private readonly home = homedir(),
  ) {
    if (platform !== "win32" && platform !== "darwin")
      this.state = "unsupported";
  }

  private async windows(
    cert: X509Certificate,
    action: "check" | "add" | "remove",
  ) {
    const executable = path.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "certutil.exe",
    );
    const fingerprint = cert.fingerprint.replace(/:/g, "").toUpperCase();
    if (action === "add") {
      await this.run(executable, ["-user", "-addstore", "Root", this.receipt]);
    } else if (action === "remove") {
      await this.run(executable, ["-user", "-delstore", "Root", fingerprint]);
    }
    // Read the store again instead of trusting a localized success message.
    const output = await this.run(executable, ["-user", "-store", "Root"]);
    return output
      .split(/\r?\n/)
      .some((line) =>
        line.replace(/[\s:]/g, "").toUpperCase().endsWith(fingerprint),
      );
  }

  private remember(cert: X509Certificate) {
    if (fs.existsSync(this.receipt)) {
      if (
        !new X509Certificate(fs.readFileSync(this.receipt)).raw.equals(cert.raw)
      )
        throw new BridgeError("https_trust_failed");
    } else {
      fs.writeFileSync(this.receipt, cert.raw, { flag: "wx", mode: 0o600 });
    }
  }

  async inspect(pem: string): Promise<TrustState> {
    if (this.state === "unsupported") return this.state;
    try {
      const cert = new X509Certificate(pem);
      if (this.platform === "win32")
        this.state = (await this.windows(cert, "check"))
          ? "trusted"
          : "missing";
      else {
        this.remember(cert);
        await this.run("/usr/bin/security", [
          "verify-cert",
          "-c",
          this.receipt,
          "-l",
          "-L",
          "-q",
          "-p",
          "ssl",
        ]);
        this.state = "trusted";
      }
    } catch {
      this.state = "missing";
    }
    return this.state;
  }

  async install(pem: string) {
    if (this.state === "unsupported") return;
    try {
      const cert = new X509Certificate(pem);
      this.remember(cert);
      if ((await this.inspect(pem)) === "trusted") return;
      if (this.platform === "win32") {
        if (!(await this.windows(cert, "add"))) throw new Error("trust");
      } else {
        await this.run("/usr/bin/security", [
          "add-trusted-cert",
          "-r",
          "trustRoot",
          "-p",
          "ssl",
          "-k",
          path.posix.join(this.home, "Library/Keychains/login.keychain-db"),
          this.receipt,
        ]);
      }
      if ((await this.inspect(pem)) !== "trusted") throw new Error("trust");
    } catch {
      this.state = "error";
      throw new BridgeError("https_trust_failed");
    }
  }

  async remove(pem?: string) {
    if (this.state === "unsupported") return;
    try {
      const cert = fs.existsSync(this.receipt)
        ? new X509Certificate(fs.readFileSync(this.receipt))
        : pem
          ? new X509Certificate(pem)
          : undefined;
      if (!cert) return;
      if (this.platform === "win32") {
        if (await this.windows(cert, "remove"))
          throw new Error("trust removal incomplete");
      } else {
        const keychain = path.posix.join(
          this.home,
          "Library/Keychains/login.keychain-db",
        );
        const listed = await this.run("/usr/bin/security", [
          "find-certificate",
          "-a",
          "-Z",
          keychain,
        ]);
        if (listed.toUpperCase().includes(cert.fingerprint.replace(/:/g, "")))
          await this.run("/usr/bin/security", [
            "delete-certificate",
            "-t",
            "-Z",
            cert.fingerprint.replace(/:/g, ""),
            keychain,
          ]);
      }
      fs.rmSync(this.receipt, { force: true });
      this.state = "missing";
    } catch {
      this.state = "error";
      throw new BridgeError("https_trust_remove_failed");
    }
  }
}
