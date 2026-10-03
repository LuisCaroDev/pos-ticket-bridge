import { useCallback, useRef, useState } from "react";
import { useBridge } from "@/contexts/BridgeContext";

export function usePrinterDiscovery() {
  const { busy, perform } = useBridge();
  const [discovery, setDiscovery] = useState<any>();
  const scanInFlight = useRef(false);
  const requestId = useRef(0);
  const resetDiscovery = useCallback(() => {
    requestId.current += 1;
    scanInFlight.current = false;
    setDiscovery(undefined);
  }, []);
  const discover = useCallback(
    async (kind: "network" | "usb" | "bluetooth") => {
      if (scanInFlight.current) return;
      const currentRequestId = requestId.current + 1;
      requestId.current = currentRequestId;
      scanInFlight.current = true;
      try {
        const result = await perform(`discover-${kind}`, () =>
          window.bridge.discover(kind),
        );
        if (result && requestId.current === currentRequestId)
          setDiscovery({ ...result, kind });
      } finally {
        scanInFlight.current = false;
      }
    },
    [perform],
  );

  const scanningKind = busy.startsWith("discover-")
    ? busy.replace("discover-", "")
    : "";
  return { discovery, scanningKind, discover, resetDiscovery };
}
