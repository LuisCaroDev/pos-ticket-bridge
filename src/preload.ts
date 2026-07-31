import { contextBridge, ipcRenderer } from "electron";
const invoke = async (channel: string, ...args: unknown[]) => {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result?.ok) throw new Error(JSON.stringify(result?.error));
  return result.value;
};
contextBridge.exposeInMainWorld("bridge", {
  platform: process.platform,
  status: () => invoke("bridge:status"),
  settings: (input: unknown) => invoke("bridge:settings", input),
  createPrinter: (input: unknown) => invoke("bridge:create-printer", input),
  updatePrinter: (id: string, input: unknown) =>
    invoke("bridge:update-printer", id, input),
  deletePrinter: (id: string) => invoke("bridge:delete-printer", id),
  duplicatePrinter: (id: string) => invoke("bridge:duplicate-printer", id),
  discover: (kind: "network" | "usb" | "bluetooth") =>
    invoke("bridge:discover", kind),
  request: (route: string, method?: string, body?: unknown) =>
    invoke("bridge:request", route, method, body),
  testPrinter: (input: unknown) => invoke("bridge:test-printer", input),
  copy: (value: string) => invoke("bridge:copy", value),
});
