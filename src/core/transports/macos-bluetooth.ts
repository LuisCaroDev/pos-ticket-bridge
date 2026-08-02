/* eslint-disable @typescript-eslint/no-var-requires */
import { existsSync } from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
const { Adapter }: any = require("@node-escpos/adapter");
import {
  BluetoothSerialAdapter,
  createBluetoothSerialAdapter,
} from "./bluetooth-serial";

type Hooks = {
  onEvent?: (stage: string, detail?: Record<string, unknown>) => void;
};

type NativeMessage = {
  ok?: boolean;
  error?: string;
  probe?: boolean;
  bytes?: number;
  hex?: string;
  ready?: boolean;
  sent?: number;
  device?: string;
  address?: string;
  channel?: number;
};

type NativeBluetoothOptions = {
  path: string;
  channel?: string;
  hooks?: Hooks;
};

type BluetoothTransport = {
  open: (callback?: (error: Error | null) => void) => BluetoothTransport;
  write: (
    data: Buffer | string,
    callback?: (error: Error | null) => void,
  ) => BluetoothTransport;
  close: (
    callback?: (error: Error | null) => void,
    ...args: any[]
  ) => BluetoothTransport;
  read: (callback?: (data: Buffer) => void) => void;
  reopen?: (callback?: (error: Error | null) => void) => BluetoothTransport;
  probeStatus?: (timeoutMs?: number) => Promise<boolean>;
  reconnectAfterStatusTimeout?: boolean;
};

const emit = (
  hooks: Hooks | undefined,
  stage: string,
  detail: Record<string, unknown> = {},
) => hooks?.onEvent?.(stage, detail);

const helperFileName = "pos-ticket-bridge-bluetooth";

// The native helper waits up to 1.5s for a printer response. Keep a margin
// here so the parent process cannot time out while the helper is still
// serializing its probe result, especially in a packaged Electron process.
export const macosBluetoothStatusProbeTimeoutMs = 2000;

export const macosBluetoothHelperPath = () => {
  const candidates = [
    path.join(
      process.resourcesPath,
      "POS Ticket Bridge Bluetooth.app",
      "Contents",
      "MacOS",
      helperFileName,
    ),
    path.join(process.resourcesPath, helperFileName),
    path.join(
      process.cwd(),
      "native",
      "macos",
      ".build",
      "POS Ticket Bridge Bluetooth.app",
      "Contents",
      "MacOS",
      helperFileName,
    ),
    path.join(process.cwd(), "native", "macos", ".build", helperFileName),
  ];
  return candidates.find((candidate) => existsSync(candidate));
};

const nativeError = (message: string) =>
  new Error(`macOS Bluetooth SPP helper: ${message}`);

export class MacOSNativeBluetoothAdapter extends Adapter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private ready = false;
  private closing = false;
  private output = "";
  private probe: NativeMessage | undefined;
  private closeCallback?: (error: Error | null) => void;
  private sent = false;
  private pendingFrames = 0;
  private leased = false;
  private probeWaiter?: {
    finish: (message?: NativeMessage) => void;
    timer: ReturnType<typeof setTimeout>;
  };
  private hooks: Hooks;

  constructor(private readonly options: NativeBluetoothOptions) {
    super();
    this.hooks = options.hooks || {};
  }

  setHooks(hooks: Hooks = {}) {
    this.hooks = hooks;
    return this;
  }

  open(callback?: (error: Error | null) => void) {
    if (this.child && this.ready) {
      if (this.leased) {
        callback?.(nativeError("adapter busy"));
        return this;
      }
      this.leased = true;
      emit(this.hooks, "adapter_open_reused");
      callback?.(null);
      return this;
    }
    const executable = macosBluetoothHelperPath();
    if (!executable) {
      callback?.(nativeError("helper unavailable"));
      return this;
    }

    const args = ["--path", this.options.path];
    if (this.options.channel) args.push("--channel", this.options.channel);
    emit(this.hooks, "adapter_native_prepare", {
      executable,
      path: this.options.path,
    });

    const child = spawn(executable, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    this.ready = false;
    this.closing = false;
    this.output = "";
    this.probe = undefined;
    this.sent = false;
    this.pendingFrames = 0;
    this.leased = false;

    let openCallbackCalled = false;
    const failOpen = (error: Error) => {
      if (openCallbackCalled) return;
      openCallbackCalled = true;
      if (this.child === child) this.child = null;
      child.kill();
      callback?.(error);
    };
    const processMessage = (message: NativeMessage) => {
      if (message.error) {
        const error = nativeError(message.error);
        if (!this.ready) failOpen(error);
        else this.finishClose(error);
        return;
      }
      if (Object.prototype.hasOwnProperty.call(message, "probe")) {
        const waiter = this.probeWaiter;
        if (waiter) waiter.finish(message);
        else this.probe = message;
        return;
      }
      if (message.ready) {
        this.ready = true;
        emit(this.hooks, "adapter_native_ready", {
          device: message.device,
          address: message.address,
          channel: message.channel,
        });
        if (!openCallbackCalled) {
          openCallbackCalled = true;
          this.leased = true;
          callback?.(null);
        }
        return;
      }
      if (Object.prototype.hasOwnProperty.call(message, "sent")) {
        this.sent = true;
        this.pendingFrames = Math.max(0, this.pendingFrames - 1);
        emit(this.hooks, "adapter_native_sent", { bytes: message.sent });
        this.finishDrain();
      }
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      this.output += chunk;
      const lines = this.output.split("\n");
      this.output = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          processMessage(JSON.parse(line) as NativeMessage);
        } catch {
          emit(this.hooks, "adapter_native_protocol_error", { line });
        }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (cause: string) =>
      emit(this.hooks, "adapter_native_stderr", { cause: cause.trim() }),
    );
    child.on("error", (error) => {
      if (!this.ready) failOpen(error);
      else this.finishClose(error);
    });
    child.on("exit", (code, signal) => {
      if (!this.ready && code !== 0)
        failOpen(nativeError(`helper exited with ${code ?? signal}`));
      else if (this.closing)
        this.finishClose(
          code === 0
            ? null
            : nativeError(`helper exited with ${code ?? signal}`),
        );
    });
    return this;
  }

  private finishClose(error: Error | null) {
    const callback = this.closeCallback;
    this.closeCallback = undefined;
    this.probeWaiter?.finish();
    this.probeWaiter = undefined;
    this.child = null;
    this.ready = false;
    this.closing = false;
    this.leased = false;
    this.pendingFrames = 0;
    callback?.(error);
  }

  private finishDrain() {
    if (!this.closing || this.pendingFrames > 0) return;
    const callback = this.closeCallback;
    this.closeCallback = undefined;
    this.closing = false;
    this.leased = false;
    if (this.sent) emit(this.hooks, "adapter_drain_ok");
    callback?.(null);
  }

  write(data: Buffer | string, callback?: (error: Error | null) => void) {
    if (!this.child || !this.ready || this.child.stdin.destroyed) {
      emit(this.hooks, "adapter_native_not_ready");
      callback?.(nativeError("not ready"));
      return this;
    }
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const frame = Buffer.allocUnsafe(payload.length + 4);
    frame.writeUInt32BE(payload.length, 0);
    payload.copy(frame, 4);
    this.pendingFrames += 1;
    try {
      this.child.stdin.write(frame, (error) => {
        if (error) {
          this.pendingFrames = Math.max(0, this.pendingFrames - 1);
          callback?.(error);
          return;
        }
        emit(this.hooks, "adapter_write_ok", { bytes: payload.length });
        callback?.(null);
      });
    } catch (error) {
      callback?.(error as Error);
    }
    return this;
  }

  close(callback?: (error: Error | null) => void) {
    if (!this.child) {
      callback?.(null);
      return this;
    }
    this.closeCallback = callback;
    this.closing = true;
    this.finishDrain();
    return this;
  }

  reopen(callback?: (error: Error | null) => void) {
    this.close((error) => {
      if (error) callback?.(error);
      else this.open(callback);
    });
    return this;
  }

  read(callback?: (data: Buffer) => void) {
    void callback;
  }

  probeStatus(timeoutMs = macosBluetoothStatusProbeTimeoutMs) {
    const cached = this.probe;
    this.probe = undefined;
    if (cached) {
      if (cached.probe)
        emit(this.hooks, "adapter_status_probe_response", {
          bytes: cached.bytes,
          hex: cached.hex,
        });
      else
        emit(this.hooks, "adapter_status_probe_timeout", {
          milliseconds: timeoutMs,
        });
      return Promise.resolve(Boolean(cached.probe));
    }
    if (!this.child || !this.ready || this.child.stdin.destroyed) {
      emit(this.hooks, "adapter_status_probe_timeout", {
        milliseconds: timeoutMs,
      });
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      const finish = (message?: NativeMessage) => {
        if (this.probeWaiter?.finish !== finish) return;
        clearTimeout(timer);
        this.probeWaiter = undefined;
        if (message?.probe) {
          emit(this.hooks, "adapter_status_probe_response", {
            bytes: message.bytes,
            hex: message.hex,
          });
          resolve(true);
        } else {
          emit(this.hooks, "adapter_status_probe_timeout", {
            milliseconds: timeoutMs,
          });
          resolve(false);
        }
      };
      const timer = setTimeout(() => finish(), timeoutMs);
      this.probeWaiter = { finish, timer };
      const frame = Buffer.alloc(4, 0xff);
      try {
        this.child?.stdin.write(frame, (error) => {
          if (error) {
            emit(this.hooks, "adapter_status_probe_error", {
              cause: error.message,
            });
            finish();
            return;
          }
          emit(this.hooks, "adapter_status_probe_write_ok", {
            bytes: 3,
            command: "DLE EOT 1",
          });
        });
      } catch (error) {
        emit(this.hooks, "adapter_status_probe_error", {
          cause: (error as Error).message,
        });
        finish();
      }
    });
  }
}

class MacOSBluetoothFallbackAdapter extends Adapter {
  private active: BluetoothTransport;
  readonly reconnectAfterStatusTimeout = false;

  constructor(
    private readonly native: MacOSNativeBluetoothAdapter,
    private readonly fallback: BluetoothSerialAdapter,
    private readonly hooks: Hooks,
  ) {
    super();
    this.active = native;
  }

  open(callback?: (error: Error | null) => void) {
    this.native.open((error) => {
      if (!error) {
        callback?.(null);
        return;
      }
      emit(this.hooks, "adapter_native_fallback", {
        cause: error.message,
      });
      this.active = this.fallback;
      this.fallback.open(callback);
    });
    return this;
  }

  write(data: Buffer | string, callback?: (error: Error | null) => void) {
    this.active.write(data, callback);
    return this;
  }

  close(callback?: (error: Error | null) => void, ...args: any[]) {
    this.active.close(callback, ...args);
    return this;
  }

  reopen(callback?: (error: Error | null) => void) {
    this.active.reopen?.(callback);
    return this;
  }

  read(callback?: (data: Buffer) => void) {
    this.active.read(callback);
  }

  probeStatus(timeoutMs = macosBluetoothStatusProbeTimeoutMs) {
    return this.active.probeStatus?.(timeoutMs) || Promise.resolve(false);
  }
}

const nativeAdapters = new Map<string, MacOSNativeBluetoothAdapter>();

const pooledNativeAdapter = (
  pathValue: string,
  channel: string,
  hooks: Hooks,
) => {
  const key = `${pathValue}\u0000${channel}`;
  const existing = nativeAdapters.get(key);
  if (existing) return existing.setHooks(hooks);
  const adapter = new MacOSNativeBluetoothAdapter({
    path: pathValue,
    channel,
    hooks,
  });
  nativeAdapters.set(key, adapter);
  return adapter;
};

export const createMacOSBluetoothAdapter = (
  pathValue: string,
  baudRate: number,
  channel: string,
  hooks: Hooks = {},
) =>
  new MacOSBluetoothFallbackAdapter(
    pooledNativeAdapter(pathValue, channel, hooks),
    createBluetoothSerialAdapter(pathValue, baudRate, hooks),
    hooks,
  );
