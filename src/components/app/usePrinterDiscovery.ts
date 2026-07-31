import { useCallback, useRef, useState } from "react";
import { useBridge } from "@/contexts/BridgeContext";

export function usePrinterDiscovery() {
  const { busy, perform } = useBridge();
  const [discovery, setDiscovery] = useState<any>();
  const scanInFlight = useRef(false);
  const discover = useCallback(
    async (kind: "network" | "usb" | "bluetooth") => {
      if (scanInFlight.current) return;
      scanInFlight.current = true;
      try {
        const result = await perform(`discover-${kind}`, () =>
          window.bridge.discover(kind),
        );
        if (result) setDiscovery({ ...result, kind });
      } finally {
        scanInFlight.current = false;
      }
    },
    [perform],
  );

  const scanningKind = busy.startsWith("discover-")
    ? busy.replace("discover-", "")
    : "";
  return { discovery, scanningKind, discover };
}
