import "reflect-metadata";
import fs from "node:fs";
import path from "node:path";
import {
  createPrivateKey,
  randomBytes,
  randomUUID,
  webcrypto,
  X509Certificate as NodeCertificate,
} from "node:crypto";
import {
  BasicConstraintsExtension,
  ExtendedKeyUsageExtension,
  ExtendedKeyUsage,
  KeyUsagesExtension,
  KeyUsageFlags,
  SubjectAlternativeNameExtension,
  SubjectKeyIdentifierExtension,
  AuthorityKeyIdentifierExtension,
  X509Certificate,
  X509CertificateGenerator,
} from "@peculiar/x509";
import { z } from "zod";
import { BridgeError } from "../i18n";
import type { HttpsState, NetworkSelection } from "./local-https-types";

export interface SecretStorage {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}
const bundleSchema = z
  .object({ cert: z.string().min(1), encryptedKey: z.string().min(1) })
  .strict();
const storeSchema = z
  .object({
    version: z.literal(1),
    state: z.enum(["unconfigured", "active", "paused"]),
    selection: z
      .object({ name: z.string().min(1), address: z.string().min(1) })
      .strict()
      .optional(),
    ca: bundleSchema.optional(),
    tls: bundleSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.state !== "unconfigured" &&
      (!value.ca || !value.tls || !value.selection)
    )
      ctx.addIssue({ code: "custom", message: "incomplete_https_store" });
    if (value.state === "unconfigured" && (value.ca || value.tls))
      ctx.addIssue({ code: "custom", message: "unexpected_https_material" });
  });
export type HttpsRecord = z.infer<typeof storeSchema>;
const day = 86_400_000;
const provider = webcrypto as unknown as Crypto;
const algorithm = { name: "ECDSA", namedCurve: "P-256" };
const signingAlgorithm = { name: "ECDSA", hash: "SHA-256" };
const serial = () => `01${randomBytes(15).toString("hex")}`;
const pemKey = (bytes: ArrayBuffer) =>
  `-----BEGIN PRIVATE KEY-----\n${Buffer.from(bytes)
    .toString("base64")
    .match(/.{1,64}/g)!
    .join("\n")}\n-----END PRIVATE KEY-----\n`;

export class HttpsStore {
  constructor(
    readonly file: string,
    private readonly secrets: SecretStorage,
  ) {}

  read(): HttpsRecord {
    if (!fs.existsSync(this.file)) return { version: 1, state: "unconfigured" };
    try {
      return storeSchema.parse(JSON.parse(fs.readFileSync(this.file, "utf8")));
    } catch {
      throw new BridgeError("https_store_invalid");
    }
  }

  write(record: HttpsRecord) {
    const parsed = storeSchema.parse(record);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      const fd = fs.openSync(temporary, "wx", 0o600);
      try {
        fs.writeFileSync(fd, JSON.stringify(parsed));
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(temporary, this.file);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }

  remove() {
    const directory = path.dirname(this.file);
    if (fs.existsSync(directory)) {
      const prefix = path.basename(this.file) + ".";
      for (const file of fs.readdirSync(directory)) {
        if (
          file.startsWith(prefix) &&
          /^[0-9a-f-]{36}\.tmp$/.test(file.slice(prefix.length))
        )
          fs.rmSync(path.join(directory, file), { force: true });
      }
    }
    fs.rmSync(this.file, { force: true });
  }

  private encrypt(key: string) {
    if (!this.secrets.isEncryptionAvailable())
      throw new BridgeError("https_storage_unavailable");
    try {
      return this.secrets.encryptString(key).toString("base64");
    } catch {
      throw new BridgeError("https_storage_unavailable");
    }
  }

  private decrypt(key: string) {
    if (!this.secrets.isEncryptionAvailable())
      throw new BridgeError("https_storage_unavailable");
    try {
      return this.secrets.decryptString(Buffer.from(key, "base64"));
    } catch {
      throw new BridgeError("https_decryption_failed");
    }
  }

  tlsOptions(record: HttpsRecord) {
    if (!record.tls) throw new BridgeError("https_store_invalid");
    const key = this.decrypt(record.tls.encryptedKey);
    try {
      if (
        !new NodeCertificate(record.tls.cert).checkPrivateKey(
          createPrivateKey(key),
        )
      )
        throw new Error("key_mismatch");
    } catch {
      throw new BridgeError("https_store_invalid");
    }
    return { key, cert: record.tls.cert, minVersion: "TLSv1.2" as const };
  }

  metadata(record: HttpsRecord) {
    try {
      return {
        ...(record.ca
          ? {
              fingerprint: new NodeCertificate(record.ca.cert).fingerprint256,
              caExpiresAt: new NodeCertificate(
                record.ca.cert,
              ).validToDate.toISOString(),
            }
          : {}),
        ...(record.tls
          ? {
              expiresAt: new NodeCertificate(
                record.tls.cert,
              ).validToDate.toISOString(),
            }
          : {}),
      };
    } catch {
      throw new BridgeError("https_store_invalid");
    }
  }

  async prepare(
    current: HttpsRecord,
    selection: NetworkSelection,
    now = Date.now(),
  ): Promise<HttpsRecord> {
    let ca = current.ca;
    if (!ca) {
      const keys = (await provider.subtle.generateKey(algorithm, true, [
        "sign",
        "verify",
      ])) as CryptoKeyPair;
      const cert = await X509CertificateGenerator.createSelfSigned(
        {
          serialNumber: serial(),
          name: `CN=POS Ticket Bridge ${randomUUID()}`,
          notBefore: new Date(now - 5 * 60_000),
          notAfter: new Date(now + 3650 * day),
          signingAlgorithm,
          keys,
          extensions: [
            new BasicConstraintsExtension(true, 0, true),
            new KeyUsagesExtension(
              KeyUsageFlags.keyCertSign | KeyUsageFlags.cRLSign,
              true,
            ),
            await SubjectKeyIdentifierExtension.create(
              keys.publicKey,
              false,
              provider,
            ),
          ],
        },
        provider,
      );
      ca = {
        cert: cert.toString("pem"),
        encryptedKey: this.encrypt(
          pemKey(await provider.subtle.exportKey("pkcs8", keys.privateKey)),
        ),
      };
    }
    const caKeyPem = this.decrypt(ca.encryptedKey);
    let caCert: NodeCertificate;
    try {
      caCert = new NodeCertificate(ca.cert);
      if (
        !caCert.ca ||
        !caCert.verify(caCert.publicKey) ||
        !caCert.checkPrivateKey(createPrivateKey(caKeyPem))
      )
        throw new Error("invalid_ca");
    } catch {
      throw new BridgeError("https_store_invalid");
    }
    if (
      caCert.validFromDate.getTime() > now ||
      caCert.validToDate.getTime() <= now
    )
      throw new BridgeError("https_ca_expired");
    let tls = current.tls;
    if (tls) {
      // Decryption failure is not a reason to silently replace stored secrets.
      const key = this.decrypt(tls.encryptedKey);
      try {
        const cert = new NodeCertificate(tls.cert);
        const parsed = new X509Certificate(tls.cert);
        const eku = parsed.getExtension(ExtendedKeyUsageExtension);
        const usage = parsed.getExtension(KeyUsagesExtension);
        if (
          cert.ca ||
          cert.checkIP(selection.address) !== selection.address ||
          !cert.verify(caCert.publicKey) ||
          !cert.checkPrivateKey(createPrivateKey(key)) ||
          !eku?.usages.includes(ExtendedKeyUsage.serverAuth) ||
          !usage ||
          !(usage.usages & KeyUsageFlags.digitalSignature) ||
          cert.validFromDate.getTime() > now ||
          cert.validToDate.getTime() <= now ||
          (cert.validToDate.getTime() <= now + 30 * day &&
            cert.validToDate.getTime() < caCert.validToDate.getTime()) ||
          cert.validToDate.getTime() - cert.validFromDate.getTime() >
            365 * day ||
          cert.validToDate.getTime() > caCert.validToDate.getTime()
        )
          tls = undefined;
      } catch {
        tls = undefined;
      }
    }
    if (!tls) {
      const issuer = new X509Certificate(ca.cert);
      const caKey = await provider.subtle.importKey(
        "pkcs8",
        createPrivateKey(caKeyPem).export({ format: "der", type: "pkcs8" }),
        algorithm,
        false,
        ["sign"],
      );
      const keys = (await provider.subtle.generateKey(algorithm, true, [
        "sign",
        "verify",
      ])) as CryptoKeyPair;
      const notBefore = Math.max(
        now - 5 * 60_000,
        caCert.validFromDate.getTime(),
      );
      const cert = await X509CertificateGenerator.create(
        {
          serialNumber: serial(),
          subject: `CN=${selection.address}`,
          issuer: issuer.subject,
          notBefore: new Date(notBefore),
          notAfter: new Date(
            Math.min(notBefore + 365 * day, caCert.validToDate.getTime()),
          ),
          signingAlgorithm,
          publicKey: keys.publicKey,
          signingKey: caKey,
          extensions: [
            new BasicConstraintsExtension(false, undefined, true),
            new KeyUsagesExtension(KeyUsageFlags.digitalSignature, true),
            new ExtendedKeyUsageExtension([ExtendedKeyUsage.serverAuth]),
            new SubjectAlternativeNameExtension([
              { type: "ip", value: selection.address },
            ]),
            await SubjectKeyIdentifierExtension.create(
              keys.publicKey,
              false,
              provider,
            ),
            await AuthorityKeyIdentifierExtension.create(
              issuer,
              false,
              provider,
            ),
          ],
        },
        provider,
      );
      tls = {
        cert: cert.toString("pem"),
        encryptedKey: this.encrypt(
          pemKey(await provider.subtle.exportKey("pkcs8", keys.privateKey)),
        ),
      };
    }
    return {
      version: 1,
      state: "active" as HttpsState,
      selection: { name: selection.name, address: selection.address },
      ca,
      tls,
    };
  }
}
