/* eslint-disable @typescript-eslint/no-var-requires */
const { Adapter }: any = require("@node-escpos/adapter");
const { usb }: any = require("usb");

class DirectUsbAdapter extends Adapter {
  private device: any;
  private interfaceNumber?: number;
  private endpointNumber?: number;

  constructor(
    private readonly vendorId: number,
    private readonly productId: number,
  ) {
    super();
  }

  open(callback?: (error?: Error | null) => void) {
    void this.connect(callback);
    return this;
  }

  private async connect(callback?: (error?: Error | null) => void) {
    try {
      this.device = await usb.findDeviceByIds(this.vendorId, this.productId);
      if (!this.device)
        throw new Error(
          `No se encontró el dispositivo USB ${this.vendorId.toString(16)}:${this.productId.toString(16)}`,
        );
      await this.device.open();
      const usbInterface = this.device.configurations
        .flatMap((configuration: any) => configuration.interfaces)
        .find(
          (item: any) =>
            item.alternate?.interfaceClass === 7 ||
            item.alternates?.some(
              (alternate: any) => alternate.interfaceClass === 7,
            ),
        );
      const alternate =
        usbInterface?.alternate?.interfaceClass === 7
          ? usbInterface.alternate
          : usbInterface?.alternates?.find(
              (item: any) => item.interfaceClass === 7,
            );
      const endpoint = alternate?.endpoints?.find(
        (item: any) => item.direction === "out",
      );
      if (!usbInterface || !endpoint)
        throw new Error(
          "El dispositivo USB no expone una interfaz de impresión compatible",
        );
      this.interfaceNumber = usbInterface.interfaceNumber;
      this.endpointNumber = endpoint.endpointNumber;
      await this.device.claimInterface(this.interfaceNumber);
      this.emit("connect", this.device);
      callback?.(null);
    } catch (error) {
      await this.device?.close().catch(() => undefined);
      callback?.(error as Error);
    }
  }

  write(data: Buffer, callback?: (error?: Error | null) => void) {
    void this.transfer(Buffer.from(data), callback);
    return this;
  }

  private async transfer(
    data: Buffer,
    callback?: (error?: Error | null) => void,
  ) {
    try {
      if (!this.device || this.endpointNumber === undefined)
        throw new Error("La impresora USB no está conectada");
      await this.device.nativeTransferOut(
        this.endpointNumber,
        5000,
        new Uint8Array(data),
      );
      this.emit("data", data);
      callback?.(null);
    } catch (error) {
      callback?.(error as Error);
    }
  }

  close(callback?: (error?: Error | null) => void) {
    void this.disconnect(callback);
    return this;
  }

  private async disconnect(callback?: (error?: Error | null) => void) {
    try {
      if (this.device && this.interfaceNumber !== undefined)
        await this.device.releaseInterface(this.interfaceNumber);
      await this.device?.close();
      this.emit("close");
      callback?.(null);
    } catch (error) {
      callback?.(error as Error);
    }
  }
}

export const createDirectUsbAdapter = (vendorId: number, productId: number) =>
  new DirectUsbAdapter(vendorId, productId);
