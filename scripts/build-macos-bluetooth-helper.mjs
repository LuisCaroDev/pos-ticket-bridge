import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") process.exit(0);

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const source = path.join(projectRoot, "native/macos/bluetooth_reconnect.swift");
const outputDirectory = path.join(projectRoot, "native/macos/.build");
const helperFileName = "pos-ticket-bridge-bluetooth";
const output = path.join(outputDirectory, helperFileName);
const bundleDirectory = path.join(
  outputDirectory,
  "POS Ticket Bridge Bluetooth.app",
);
const bundleContents = path.join(bundleDirectory, "Contents");
const bundleMacOS = path.join(bundleContents, "MacOS");
const bundleExecutable = path.join(bundleMacOS, helperFileName);
const bundleInfo = path.join(bundleContents, "Info.plist");

mkdirSync(outputDirectory, { recursive: true });
mkdirSync(bundleMacOS, { recursive: true });
writeFileSync(
  bundleInfo,
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>POS Ticket Bridge Bluetooth</string>
  <key>CFBundleExecutable</key>
  <string>${helperFileName}</string>
  <key>CFBundleIdentifier</key>
  <string>com.pos.ticketbridge.bluetooth</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>POS Ticket Bridge Bluetooth</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.3</string>
  <key>CFBundleVersion</key>
  <string>1.0.3</string>
  <key>NSBluetoothAlwaysUsageDescription</key>
  <string>This app needs access to Bluetooth</string>
  <key>NSBluetoothPeripheralUsageDescription</key>
  <string>This app needs access to Bluetooth</string>
</dict>
</plist>
`,
  "utf8",
);
const result = spawnSync(
  "xcrun",
  ["swiftc", "-O", "-framework", "IOBluetooth", source, "-o", output],
  { cwd: projectRoot, stdio: "inherit" },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

cpSync(output, bundleExecutable, { force: true });
const signResult = spawnSync(
  "codesign",
  ["--force", "--deep", "--sign", "-", bundleDirectory],
  { cwd: projectRoot, stdio: "inherit" },
);
if (signResult.error) throw signResult.error;
if (signResult.status !== 0) process.exit(signResult.status || 1);
