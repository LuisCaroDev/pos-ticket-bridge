import { z } from "zod";
import { X509Certificate } from "node:crypto";
import type { ServerOptions } from "node:https";
import { BridgeError, errorPayload, type BridgeMessage } from "../i18n";
import { HttpsStore, type HttpsRecord } from "./https-store";
import { ENROLLMENT_PORT, HttpsEnrollment } from "./https-enrollment";
import { lanInterfaces } from "./lan";
import type {
  ClientOS,
  LanInterface,
  LocalHttpsStatus,
  LocalHttpsDraft,
  NetworkSelection,
} from "./local-https-types";

export type ListenerConfiguration = {
  transport: "http" | "https";
  host: string;
  port: number;
  tls?: ServerOptions;
};
import type { LocalCaTrust } from "./local-ca-trust";
type Dependencies = {
  trust?: LocalCaTrust;
  getPort: () => number;
  replaceListener: (
    configuration: ListenerConfiguration | null,
  ) => Promise<void>;
  interfaces?: () => LanInterface[];
  enrollment?: HttpsEnrollment;
  restorePort?: (port: number) => void;
};

export class LocalHttpsManager {
  private record: HttpsRecord = { version: 1, state: "unconfigured" };
  private loaded = false;
  private listener: ListenerConfiguration | null = null;
  private error?: BridgeMessage;
  private queue: Promise<unknown> = Promise.resolve();
  private timer?: ReturnType<typeof setInterval>;
  private checking = false;
  private enrollmentNetwork?: string;
  private readonly interfaces: () => LanInterface[];
  private readonly enrollment: HttpsEnrollment;

  constructor(
    private readonly store: HttpsStore,
    private readonly dependencies: Dependencies,
  ) {
    this.interfaces = dependencies.interfaces || lanInterfaces;
    this.enrollment = dependencies.enrollment || new HttpsEnrollment();
  }

  private run<T>(work: () => Promise<T>): Promise<T> {
    const pending = this.queue.then(work).catch((error) => {
      this.error =
        error instanceof BridgeError
          ? errorPayload(error)
          : { code: "https_operation_failed" };
      throw new BridgeError(this.error.code, this.error.params);
    });
    this.queue = pending.catch((): void => undefined);
    return pending;
  }

  private load() {
    if (!this.loaded) {
      this.record = this.store.read();
      this.loaded = true;
    }
  }

  private selected(selection = this.record.selection): LanInterface {
    if (!selection) throw new BridgeError("https_select_interface");
    const local = this.interfaces().find(
      (item) =>
        item.name === selection.name && item.address === selection.address,
    );
    if (!local) throw new BridgeError("https_interface_missing");
    return local;
  }

  private configuration(record: HttpsRecord): ListenerConfiguration {
    const port = this.dependencies.getPort();
    if (port === ENROLLMENT_PORT) throw new BridgeError("https_reserved_port");
    return record.state === "active"
      ? {
          transport: "https",
          host: this.selected(record.selection).address,
          port,
          tls: this.store.tlsOptions(record),
        }
      : { transport: "http", host: "0.0.0.0", port };
  }

  private previousIsValid(previous: ListenerConfiguration) {
    if (previous.transport === "http") return true;
    try {
      const cert = new X509Certificate(previous.tls!.cert as string);
      return (
        this.interfaces().some((item) => item.address === previous.host) &&
        cert.validFromDate.getTime() <= Date.now() &&
        cert.validToDate.getTime() > Date.now() &&
        cert.checkIP(previous.host) === previous.host
      );
    } catch {
      return false;
    }
  }

  private async transition(
    next: HttpsRecord,
    persist = true,
    rollback?: () => Promise<void>,
  ) {
    const configuration = this.configuration(next);
    const previous = this.listener;
    await this.enrollment.stop();
    this.listener = null;
    try {
      await this.dependencies.replaceListener(configuration);
      if (persist) this.store.write(next);
      this.listener = configuration;
      this.record = next;
      this.error = undefined;
    } catch (error) {
      await rollback?.();
      await this.dependencies
        .replaceListener(null)
        .catch((): void => undefined);
      if (previous && this.previousIsValid(previous)) {
        try {
          await this.dependencies.replaceListener(previous);
          this.listener = previous;
        } catch {
          /* Public status remains stopped if rollback cannot listen. */
        }
      }
      if (previous) this.dependencies.restorePort?.(previous.port);
      throw error;
    }
  }

  async initialize() {
    await this.restart().catch((): void => undefined);
    if (this.record.ca)
      await this.dependencies.trust?.inspect(this.record.ca.cert);
    this.timer = setInterval(() => {
      if (this.checking) return;
      this.checking = true;
      void this.reconcile()
        .catch((): void => undefined)
        .finally(() => {
          this.checking = false;
        });
    }, 5000);
    this.timer.unref();
  }

  restart() {
    return this.run(async () => {
      this.load();
      const next =
        this.record.state === "active"
          ? await this.store.prepare(this.record, this.resolveSelection())
          : this.record;
      await this.transition(next);
      return this.status();
    });
  }

  private resolveSelection() {
    const selected = this.record.selection;
    if (!selected) throw new BridgeError("https_select_interface");
    const candidates = this.interfaces().filter(
      (item) => item.name === selected.name,
    );
    if (candidates.some((item) => item.address === selected.address))
      return selected;
    if (candidates.length === 1)
      return { name: candidates[0].name, address: candidates[0].address };
    throw new BridgeError("https_interface_missing");
  }

  reconcile() {
    return this.run(async () => {
      if (!this.loaded) return;
      if (this.record.state !== "active") {
        if (this.listener && this.listener.port !== this.dependencies.getPort())
          await this.transition(this.record);
        return;
      }
      try {
        const selected = this.resolveSelection();
        const local = this.selected(selected);
        if (
          this.enrollment.status() &&
          this.enrollmentNetwork !==
            JSON.stringify([local.address, local.netmask])
        )
          await this.enrollment.stop();
        const next = await this.store.prepare(this.record, selected);
        if (
          !this.listener ||
          this.listener.port !== this.dependencies.getPort() ||
          next.tls?.cert !== this.record.tls?.cert ||
          selected.address !== this.record.selection?.address
        )
          await this.transition(next);
        else this.error = undefined;
      } catch (error) {
        await this.enrollment.stop();
        if (this.listener && !this.previousIsValid(this.listener)) {
          await this.dependencies.replaceListener(null);
          this.listener = null;
        }
        throw error;
      }
    });
  }

  applySettings(
    draft: LocalHttpsDraft | undefined,
    commit: () => Promise<void>,
    rollback: () => Promise<void>,
  ) {
    return this.run(async () => {
      this.load();
      if (draft)
        draft = z
          .object({
            enabled: z.boolean(),
            selection: z
              .object({ name: z.string().min(1), address: z.string().min(1) })
              .strict()
              .optional(),
          })
          .strict()
          .parse(draft);
      const enabled = draft?.enabled ?? this.record.state === "active";
      const selection = draft ? draft.selection : this.record.selection;
      if (
        selection &&
        (enabled ||
          JSON.stringify(selection) !== JSON.stringify(this.record.selection))
      )
        this.selected(selection);
      const next = enabled
        ? await this.store.prepare(
            this.record,
            this.selected(selection || this.resolveSelection()),
          )
        : {
            ...this.record,
            selection,
            state: this.record.ca
              ? ("paused" as const)
              : ("unconfigured" as const),
          };
      if (enabled) this.store.tlsOptions(next);
      try {
        await commit();
      } catch (error) {
        await rollback();
        throw error;
      }
      await this.transition(next, true, rollback);
      if (enabled && next.ca && this.dependencies.trust?.state !== "trusted")
        await this.dependencies.trust
          ?.install(next.ca.cert)
          .catch((): void => undefined);
      return this.status();
    });
  }

  activate(selection?: NetworkSelection) {
    return this.run(async () => {
      this.load();
      const local = this.selected(selection || this.resolveSelection());
      const next = await this.store.prepare(this.record, {
        name: local.name,
        address: local.address,
      });
      await this.transition(next);
      if (next.ca)
        await this.dependencies.trust
          ?.install(next.ca.cert)
          .catch((): void => undefined);
      return this.status();
    });
  }

  trustLocal() {
    return this.run(async () => {
      this.load();
      if (!this.record.ca) throw new BridgeError("https_must_be_active");
      await this.dependencies.trust?.install(this.record.ca.cert);
      this.error = undefined;
      return this.status();
    });
  }

  pause() {
    return this.run(async () => {
      this.load();
      await this.transition({
        ...this.record,
        state: this.record.ca ? "paused" : "unconfigured",
      });
      return this.status();
    });
  }

  select(selection: NetworkSelection) {
    return this.run(async () => {
      this.load();
      const local = this.selected(selection);
      const nextSelection = { name: local.name, address: local.address };
      await this.enrollment.stop();
      if (this.record.state === "active") {
        await this.transition(
          await this.store.prepare(this.record, nextSelection),
        );
      } else {
        const next = { ...this.record, selection: nextSelection };
        this.store.write(next);
        this.record = next;
        this.error = undefined;
      }
      return this.status();
    });
  }

  startEnrollment(os: ClientOS) {
    return this.run(async () => {
      if (
        this.record.state !== "active" ||
        this.listener?.transport !== "https" ||
        !this.record.ca
      )
        throw new BridgeError("https_must_be_active");
      const local = this.selected();
      if (local.address !== this.listener.host)
        throw new BridgeError("https_interface_missing");
      this.enrollmentNetwork = JSON.stringify([local.address, local.netmask]);
      return this.enrollment.start(local, this.record.ca.cert, os);
    });
  }

  stopEnrollment() {
    return this.run(() => this.enrollment.stop());
  }

  reset() {
    return this.run(async () => {
      const previous = this.record;
      await this.transition({ version: 1, state: "unconfigured" }, false);
      try {
        await this.dependencies.trust?.remove(previous.ca?.cert);
        this.store.remove();
      } catch (error) {
        this.record = previous;
        try {
          await this.transition(previous, false);
        } catch {
          if (previous.state === "active") {
            await this.dependencies.replaceListener(null);
            this.listener = null;
          }
        }
        throw error;
      }
      this.loaded = true;
      return this.status();
    });
  }

  status(): LocalHttpsStatus {
    let metadata = {};
    try {
      metadata = this.store.metadata(this.record);
    } catch {
      this.error = { code: "https_store_invalid" };
    }
    const interfaces = this.interfaces();
    const address =
      this.listener?.transport === "https"
        ? this.listener.host
        : interfaces.find(
            (item) =>
              item.name === this.record.selection?.name &&
              item.address === this.record.selection?.address,
          )?.address ||
          interfaces[0]?.address ||
          "127.0.0.1";
    return {
      localTrust: this.dependencies.trust?.state,
      state: this.record.state,
      transport: this.listener?.transport || "stopped",
      selection: this.record.selection
        ? { ...this.record.selection }
        : undefined,
      host: this.listener
        ? `${this.listener.transport}://${address}:${this.listener.port}`
        : "",
      interfaces,
      ...metadata,
      error: this.error,
      enrollmentDurationMs: this.enrollment.durationMilliseconds(),
      enrollment: this.enrollment.status(),
    };
  }

  shutdown() {
    clearInterval(this.timer);
    return this.run(async () => {
      await this.enrollment.stop();
      await this.dependencies.replaceListener(null);
      this.listener = null;
    });
  }
}
