import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nativeDir = path.join(projectRoot, "native");
const source = path.join(nativeDir, "pos-ticket-bridge-icon.png");
const iconset = path.join(nativeDir, "pos-ticket-bridge-icon.iconset");

const sizes = [16, 32, 128, 256, 512];
const pngs = new Map();

rmSync(iconset, { recursive: true, force: true });
mkdirSync(iconset, { recursive: true });

for (const size of sizes) {
  const standard = path.join(iconset, `icon_${size}x${size}.png`);
  const retina = path.join(iconset, `icon_${size}x${size}@2x.png`);
  const retinaSize = Math.min(size * 2, 1024);
  execFileSync("sips", ["-z", String(size), String(size), source, "--out", standard], {
    stdio: "ignore",
  });
  execFileSync("sips", [
    "-z",
    String(retinaSize),
    String(retinaSize),
    source,
    "--out",
    retina,
  ], { stdio: "ignore" });
  execFileSync("sips", ["-s", "dpiWidth", "72", "-s", "dpiHeight", "72", standard], {
    stdio: "ignore",
  });
  execFileSync("sips", ["-s", "dpiWidth", "144", "-s", "dpiHeight", "144", retina], {
    stdio: "ignore",
  });
  execFileSync("sips", ["--deleteColorManagementProperties", standard], {
    stdio: "ignore",
  });
  execFileSync("sips", ["--deleteColorManagementProperties", retina], {
    stdio: "ignore",
  });
  pngs.set(size, readFileSync(standard));
}

const icoEntries = [...pngs.entries()];
const headerSize = 6 + icoEntries.length * 16;
let offset = headerSize;
const header = Buffer.alloc(headerSize);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoEntries.length, 4);

icoEntries.forEach(([size, data], index) => {
  const entry = 6 + index * 16;
  header.writeUInt8(size >= 256 ? 0 : size, entry);
  header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
  header.writeUInt8(0, entry + 2);
  header.writeUInt8(0, entry + 3);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(data.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += data.length;
});

writeFileSync(path.join(nativeDir, "pos-ticket-bridge-icon.ico"), Buffer.concat([header, ...icoEntries.map(([, data]) => data)]));

// Build a PNG-backed ICNS container. This keeps the conversion reproducible on
// macOS versions where iconutil no longer accepts generated iconsets.
const icnsTypes = new Map([
  [16, "icp4"],
  [32, "icp5"],
  [128, "ic07"],
  [256, "ic08"],
  [512, "ic09"],
]);
const icnsChunks = icoEntries.map(([size, data]) => {
  const chunk = Buffer.alloc(8);
  chunk.write(icnsTypes.get(size), 0, 4, "ascii");
  chunk.writeUInt32BE(data.length + 8, 4);
  return Buffer.concat([chunk, data]);
});
const icnsHeader = Buffer.alloc(8);
icnsHeader.write("icns", 0, 4, "ascii");
icnsHeader.writeUInt32BE(8 + icnsChunks.reduce((total, chunk) => total + chunk.length, 0), 4);
writeFileSync(path.join(nativeDir, "pos-ticket-bridge-icon.icns"), Buffer.concat([icnsHeader, ...icnsChunks]));

rmSync(iconset, { recursive: true, force: true });
