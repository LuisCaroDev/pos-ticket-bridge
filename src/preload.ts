import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("bridge", {
  status: () => ipcRenderer.invoke("bridge:status"),
  settings: (input: unknown) => ipcRenderer.invoke("bridge:settings", input),
  createPrinter: (input: unknown) =>
    ipcRenderer.invoke("bridge:create-printer", input),
  updatePrinter: (id: string, input: unknown) =>
    ipcRenderer.invoke("bridge:update-printer", id, input),
  deletePrinter: (id: string) =>
    ipcRenderer.invoke("bridge:delete-printer", id),
  duplicatePrinter: (id: string) =>
    ipcRenderer.invoke("bridge:duplicate-printer", id),
  discover: (kind: "network" | "usb" | "bluetooth") =>
    ipcRenderer.invoke("bridge:discover", kind),
  request: (route: string, method?: string, body?: unknown) =>
    ipcRenderer.invoke("bridge:request", route, method, body),
  testPrinter: (input: unknown) =>
    ipcRenderer.invoke("bridge:test-printer", input),
  copy: (value: string) => ipcRenderer.invoke("bridge:copy", value),
});
