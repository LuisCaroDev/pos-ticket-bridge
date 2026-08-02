/* eslint-disable @typescript-eslint/no-var-requires */
const { Adapter }: any = require("@node-escpos/adapter");
const { SerialPort }: any = require("serialport");

type SerialPortLike = {
  open: (callback: (error?: Error | null) => void) => void;
  write: (data: Buffer, callback?: (error?: Error | null) => void) => void;
  drain: (callback?: (error?: Error | null) => void) => void;
  close: (callback?: (error?: Error | null) => void) => void;
  removeListener?: (event: string, listener: (...args: any[]) => void) => void;
  set?: (
    options: { dtr: boolean; rts: boolean },
    callback?: (error?: Error | null) => void,
  ) => void;
  get?: (
    callback: (
      error?: Error | null,
      status?: { cts: boolean; dsr: boolean; dcd: boolean },
    ) => void,
  ) => void;
  on: (event: string, listener: (...args: any[]) => void) => void;
};

type SerialPortConstructor = new (
  options: Record<string, unknown>,
) => SerialPortLike;

export type BluetoothSerialHooks = {
  onEvent?: (stage: string, detail?: Record<string, unknown>) => void;
};

const emit = (
  hooks: BluetoothSerialHooks,
  stage: string,
  detail: Record<string, unknown> = {},
) => hooks.onEvent?.(stage, detail);

export const bluetoothOpenSettleMs = (
  platform: NodeJS.Platform = process.platform,
) => (platform === "darwin" ? 400 : 0);

export const bluetoothCloseSettleMs = (
  platform: NodeJS.Platform = process.platform,
) => (platform === "darwin" ? 300 : 0);

/**
 * macOS serial devices default to HUPCL, which lowers DTR when the port is
 * closed. A Bluetooth SPP bridge can treat that transition as a disconnect
 * before its final packet reaches the printer, so keep the line asserted for
 * this transport only. Windows and other transports keep their defaults.
 */
export const bluetoothSerialOptions = (
  baudRate: number,
  platform: NodeJS.Platform = process.platform,
) => ({
  baudRate,
  ...(platform === "darwin" ? { hupcl: false } : {}),
});

/**
 * Keep the path selected by macOS or the user. Both `/dev/tty.*` and
 * `/dev/cu.*` can exist for a paired Bluetooth service, but they are not
 * interchangeable for every SPP bridge. The configured path is the only
 * reliable compatibility signal available without talking to the printer.
 */
export const resolveBluetoothSerialPath = (path: string) => path;

/**
 * SerialPort's `flush()` is destructive: on macOS it calls tcflush() and
 * discards bytes that have not reached the Bluetooth device yet. The
 * @node-escpos/serialport-adapter package calls flush() after drain() in its
 * close() implementation, which makes short Bluetooth tickets intermittent.
 */
export class BluetoothSerialAdapter extends Adapter {
  private device: SerialPortLike | null;
  private readonly portOptions: Record<string, unknown>;
  private readonly Port: SerialPortConstructor;
  private readonly keepOpen: boolean;
  private hooks: BluetoothSerialHooks;
  private openState = false;

  constructor(
    path: string,
    options: Record<string, unknown>,
    hooks: BluetoothSerialHooks = {},
    Port: SerialPortConstructor = SerialPort,
    private readonly platform: NodeJS.Platform = process.platform,
    keepOpen = false,
  ) {
    super();
    this.portOptions = { path, ...options, autoOpen: false };
    this.Port = Port;
    this.keepOpen = keepOpen;
    this.hooks = hooks;
    this.device = this.createDevice();
  }

  setHooks(hooks: BluetoothSerialHooks = {}) {
    this.hooks = hooks;
    return this;
  }

  private createDevice() {
    const device = new this.Port(this.portOptions);
    device.on("close", () => {
      this.emit("disconnect", device);
      this.openState = false;
      if (this.device === device) this.device = null;
    });
    return device;
  }

  open(callback?: (error: Error | null) => void) {
    const device = this.device || (this.device = this.createDevice());
    if (this.openState) {
      emit(this.hooks, "adapter_open_reused");
      callback?.(null);
      return this;
    }
    device.open((error) => {
      if (error) {
        callback?.(error);
        return;
      }
      this.openState = true;
      const settle = () => {
        const settleMs = bluetoothOpenSettleMs(this.platform);
        if (settleMs)
          emit(this.hooks, "adapter_open_settle", { milliseconds: settleMs });
        setTimeout(() => callback?.(null), settleMs);
      };
      const inspectModemStatus = () => {
        if (this.platform === "darwin" && device.get) {
          device.get((statusError, status) => {
            if (statusError) {
              emit(this.hooks, "adapter_modem_status_error", {
                cause: statusError.message,
              });
            } else if (status) {
              emit(this.hooks, "adapter_modem_status", status);
            }
            settle();
          });
          return;
        }
        settle();
      };
      if (this.platform === "darwin" && device.set) {
        emit(this.hooks, "adapter_line_state", { dtr: true, rts: true });
        device.set({ dtr: true, rts: true }, (setError) => {
          if (setError) {
            callback?.(setError);
            return;
          }
          inspectModemStatus();
        });
        return;
      }
      inspectModemStatus();
    });
    return this;
  }

  write(data: Buffer | string, callback?: (error: Error | null) => void) {
    if (!this.device) throw new Error("Serial port device disconnected");
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.device.write(payload, (error) => {
      if (!error)
        emit(this.hooks, "adapter_write_ok", { bytes: payload.length });
      callback?.(error || null);
    });
    return this;
  }

  close(callback?: (error: Error | null) => void, timeout = 0, force = false) {
    const device = this.device;
    if (!device) {
      callback?.(null);
      return this;
    }

    // drain() waits for the OS output queue to reach the serial device. Do
    // not call device.flush() afterwards: it discards pending output.
    device.drain((drainError) => {
      if (drainError) {
        emit(this.hooks, "adapter_drain_error", {
          cause: drainError.message,
        });
        callback?.(drainError);
        return;
      }
      emit(this.hooks, "adapter_drain_ok");
      if (this.keepOpen && !force) {
        emit(this.hooks, "adapter_keep_open");
        callback?.(null);
        return;
      }
      // Explicitly release the modem lines before closing. With HUPCL
      // disabled we own this transition and avoid leaving a Bluetooth SPP
      // bridge half-connected for the next print job.
      const closeDevice = (lineError?: Error | null) => {
        const settleMs = bluetoothCloseSettleMs(this.platform);
        setTimeout(
          () => {
            device.close((closeError) => {
              this.openState = false;
              if (this.device === device) this.device = null;
              const finalError = closeError || lineError || null;
              if (!finalError) emit(this.hooks, "adapter_close_ok");
              callback?.(finalError);
            });
          },
          Math.max(timeout, settleMs),
        );
      };
      if (this.platform === "darwin" && device.set) {
        emit(this.hooks, "adapter_line_state_close", {
          dtr: false,
          rts: false,
        });
        device.set({ dtr: false, rts: false }, (lineError) => {
          if (lineError)
            emit(this.hooks, "adapter_line_state_close_error", {
              cause: lineError.message,
            });
          closeDevice(lineError);
        });
      } else closeDevice();
    });
    return this;
  }

  reopen(callback?: (error: Error | null) => void) {
    this.close(
      (error) => {
        if (error) {
          callback?.(error);
          return;
        }
        this.open(callback);
      },
      0,
      true,
    );
    return this;
  }

  read(callback?: (data: Buffer) => void) {
    if (!this.device) throw new Error("Serial port device disconnected");
    this.device.on("data", (data) => callback?.(data as Buffer));
  }

  /**
   * Probe the ESC/POS real-time status channel without making it part of a
   * normal print job. A response proves that the printer, not only macOS,
   * received and understood bytes on this Bluetooth link.
   */
  probeStatus(timeoutMs = 600) {
    if (!this.device) throw new Error("Serial port device disconnected");
    const device = this.device;
    const command = Buffer.from([0x10, 0x04, 0x01]); // DLE EOT 1
    return new Promise<boolean>((resolve) => {
      let settled = false;
      let responded = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        device.removeListener?.("data", onData);
        resolve(responded);
      };
      const onData = (data: Buffer) => {
        responded = true;
        emit(this.hooks, "adapter_status_probe_response", {
          bytes: data.length,
          hex: data.toString("hex"),
        });
        finish();
      };
      device.on("data", onData);
      const timer = setTimeout(() => {
        emit(this.hooks, "adapter_status_probe_timeout", {
          milliseconds: timeoutMs,
        });
        finish();
      }, timeoutMs);
      device.write(command, (error) => {
        if (error) {
          emit(this.hooks, "adapter_status_probe_error", {
            cause: error.message,
          });
          finish();
          return;
        }
        emit(this.hooks, "adapter_status_probe_write_ok", {
          bytes: command.length,
          command: "DLE EOT 1",
        });
      });
    });
  }
}

export const createBluetoothSerialAdapter = (
  path: string,
  baudRate: number,
  hooks: BluetoothSerialHooks = {},
) => new BluetoothSerialAdapter(path, bluetoothSerialOptions(baudRate), hooks);
