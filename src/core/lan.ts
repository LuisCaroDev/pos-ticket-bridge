import os from "node:os";
import { isIPv4 } from "node:net";
import type { LanInterface } from "./local-https-types";

export function isPrivateIPv4(address: string) {
  if (!isIPv4(address)) return false;
  const [a, b] = address.split(".").map(Number);
  return (
    a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  );
}

export function lanInterfaces(): LanInterface[] {
  return Object.entries(os.networkInterfaces()).flatMap(([name, addresses]) =>
    (addresses || []).flatMap((item) =>
      item.family === "IPv4" && !item.internal && isPrivateIPv4(item.address)
        ? [
            {
              name,
              address: item.address,
              netmask: item.netmask,
              mac: item.mac,
            },
          ]
        : [],
    ),
  );
}

const ipv4Number = (address: string) =>
  address
    .split(".")
    .reduce((value, octet) => ((value << 8) | Number(octet)) >>> 0, 0);

export function isSameSubnet(
  remote: string | undefined,
  local: Pick<LanInterface, "address" | "netmask">,
) {
  const address = remote?.replace(/^::ffff:/, "") || "";
  if (
    !isPrivateIPv4(address) ||
    !isPrivateIPv4(local.address) ||
    !isIPv4(local.netmask)
  )
    return false;
  const mask = ipv4Number(local.netmask);
  // Reject an empty or non-contiguous mask rather than permitting an entire LAN range.
  const inverse = ~mask >>> 0;
  if (mask === 0 || (inverse & (inverse + 1)) !== 0) return false;
  return (ipv4Number(address) & mask) === (ipv4Number(local.address) & mask);
}
