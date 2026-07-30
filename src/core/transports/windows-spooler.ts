/* eslint-disable @typescript-eslint/no-var-requires, no-useless-escape */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const { Adapter }: any = require("@node-escpos/adapter");

async function printRaw(printerName: string, data: Buffer) {
  const temp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pos-ticket-"));
  const bytes = path.join(temp, "job.bin");
  const script = path.join(temp, "raw.ps1");
  const source = `param([string]$Name,[string]$Data)
Add-Type -TypeDefinition @"
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public class Raw {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOC_INFO_1 {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDatatype;
  }
  [DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern int StartDocPrinter(IntPtr handle, int level, DOC_INFO_1 document);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr handle, byte[] bytes, int count, out int written);
  static void Ensure(bool ok) { if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
  public static void Send(string name, string file) {
    IntPtr handle;
    Ensure(OpenPrinter(name, out handle, IntPtr.Zero));
    try {
      var document = new DOC_INFO_1 { pDocName = "POS Ticket Bridge", pDatatype = "RAW" };
      if (StartDocPrinter(handle, 1, document) == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
      try {
        Ensure(StartPagePrinter(handle));
        try {
          byte[] bytes = System.IO.File.ReadAllBytes(file);
          int written;
          Ensure(WritePrinter(handle, bytes, bytes.Length, out written));
          if (written != bytes.Length) throw new Exception("Windows no aceptó todos los bytes del ticket");
        } finally { Ensure(EndPagePrinter(handle)); }
      } finally { Ensure(EndDocPrinter(handle)); }
    } finally { ClosePrinter(handle); }
  }
}
"@
[Raw]::Send($Name,$Data)`;
  try {
    await fs.promises.writeFile(bytes, data);
    await fs.promises.writeFile(script, source, "utf8");
    await exec("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      script,
      "-Name",
      printerName,
      "-Data",
      bytes,
    ]);
  } finally {
    await fs.promises.rm(temp, { recursive: true, force: true });
  }
}

class WindowsSpoolerAdapter extends Adapter {
  constructor(private readonly printerName: string) {
    super();
  }
  async open(callback?: (error?: Error | null) => void) {
    this.emit("connect", this.printerName);
    callback?.(null);
    return this;
  }
  write(data: Buffer, callback?: (error?: Error | null) => void) {
    printRaw(this.printerName, Buffer.from(data))
      .then(() => {
        this.emit("data", data);
        callback?.(null);
      })
      .catch((error) => callback?.(error));
    return this;
  }
  close(callback?: (error?: Error | null) => void) {
    this.emit("close");
    callback?.(null);
    return this;
  }
}

export const createWindowsSpoolerAdapter = (printerName: string) =>
  new WindowsSpoolerAdapter(printerName);
