import { contextBridge, ipcRenderer } from "electron";
const invoke = async (channel: string, ...args: unknown[]) => {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result?.ok) {
    const error = new Error(JSON.stringify(result?.error)) as Error & {
      diagnostic?: unknown;
    };
    error.diagnostic = result?.diagnostic;
    throw error;
  }
  return result.value;
};
contextBridge.exposeInMainWorld("bridge", {
  platform: process.platform,
  status: () => invoke("bridge:status"),
  settings: (input: unknown) => invoke("bridge:settings", input),
  createPrinter: (input: unknown, draftSessionId?: string) =>
    invoke("bridge:create-printer", input, draftSessionId),
  updatePrinter: (id: string, input: unknown) =>
    invoke("bridge:update-printer", id, input),
  deletePrinter: (id: string) => invoke("bridge:delete-printer", id),
  duplicatePrinter: (id: string) => invoke("bridge:duplicate-printer", id),
  discover: (kind: "network" | "usb" | "bluetooth") =>
    invoke("bridge:discover", kind),
  printerProfiles: (input?: unknown) =>
    invoke("bridge:printer-profiles", input),
  compatibilityReport: (input: unknown, diagnostic?: unknown) =>
    invoke("bridge:compatibility-report", input, diagnostic),
  request: (route: string, method?: string, body?: unknown) =>
    invoke("bridge:request", route, method, body),
  testPrinter: (
    input: unknown,
    options?: {
      draftSessionId?: string;
      operation?: "test-draft" | "spanish-validation";
    },
  ) => invoke("bridge:test-printer", input, options),
  discardDraftDiagnostics: (draftSessionId: string) =>
    invoke("bridge:discard-draft-diagnostics", draftSessionId),
  copy: (value: string) => invoke("bridge:copy", value),
});
