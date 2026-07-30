import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
} from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import { ConfigStore } from "./core/config-store";
import {
  discoverBluetooth,
  discoverNetwork,
  discoverUsb,
} from "./core/discovery";
import { testPrint } from "./core/printer";
import { createBridgeServer } from "./core/server";

let window: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let bridge: ReturnType<typeof createBridgeServer>;
const icon = () =>
  nativeImage.createFromDataURL(
    "data:image/svg+xml;base64," +
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect x="4" y="9" width="24" height="16" rx="3" fill="#18181b"/><rect x="9" y="3" width="14" height="8" fill="#18181b"/><rect x="9" y="20" width="14" height="8" rx="1" fill="white"/><circle cx="23" cy="14" r="2" fill="white"/></svg>',
      ).toString("base64"),
  );

function ensureWindow() {
  if (window && !window.isDestroyed()) return window;
  window = new BrowserWindow({
    width: 1120,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    show: false,
    title: "POS Ticket Bridge",
    icon: icon(),
    backgroundColor: "#fafafa",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
    },
  });
  window.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      window?.hide();
    }
  });
  window.once("ready-to-show", () => window?.show());
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL)
    window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  else
    window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  return window;
}
function showWindow() {
  const target = ensureWindow();
  if (target.isMinimized()) target.restore();
  target.show();
  target.focus();
}
async function restartBridge() {
  await bridge?.stop().catch(() => undefined);
  bridge = createBridgeServer(
    new ConfigStore(path.join(app.getPath("userData"), "config.json")),
  );
  await bridge.start();
  buildTray();
}
function buildTray() {
  if (!tray) {
    tray = new Tray(icon());
    tray.on("double-click", showWindow);
  }
  const config = bridge.store.get();
  tray.setToolTip("POS Ticket Bridge");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir POS Ticket Bridge", click: showWindow },
      { label: "Copiar token", click: () => clipboard.writeText(config.token) },
      {
        label: "Mostrar hosts",
        click: async () =>
          dialog.showMessageBox({
            title: "Hosts del puente",
            message: (await bridge.status()).suggestedHosts.join("\n"),
          }),
      },
      {
        label: "Imprimir prueba",
        enabled: config.printers.length > 0,
        click: async () => {
          const first = config.printers[0];
          try {
            await fetch(`http://127.0.0.1:${config.port}/test/${first.id}`, {
              method: "POST",
              headers: { "x-agent-token": config.token },
            });
          } catch (error) {
            dialog.showErrorBox(
              "No se pudo imprimir",
              (error as Error).message,
            );
          }
        },
      },
      {
        label: "Reiniciar servicio",
        click: () =>
          restartBridge().catch((error) =>
            dialog.showErrorBox("Error", error.message),
          ),
      },
      { type: "separator" },
      { label: "Salir", click: () => quit() },
    ]),
  );
}
async function quit() {
  quitting = true;
  tray?.destroy();
  await bridge?.stop().catch(() => undefined);
  app.quit();
}
function registerIpc() {
  ipcMain.handle("bridge:status", async () => ({
    ...(await bridge.status()),
    version: app.getVersion(),
  }));
  ipcMain.handle("bridge:settings", async (_event, input) => {
    const oldPort = bridge.store.get().port;
    const config = bridge.store.settings(input);
    if (oldPort !== config.port) await restartBridge();
    return config;
  });
  ipcMain.handle("bridge:create-printer", (_event, input) =>
    bridge.store.create(input),
  );
  ipcMain.handle("bridge:update-printer", (_event, id, input) =>
    bridge.store.update(id, input),
  );
  ipcMain.handle("bridge:delete-printer", (_event, id) =>
    bridge.store.remove(id),
  );
  ipcMain.handle("bridge:duplicate-printer", (_event, id) =>
    bridge.store.duplicate(id),
  );
  ipcMain.handle("bridge:discover", (_event, kind) =>
    kind === "network"
      ? discoverNetwork()
      : kind === "usb"
        ? discoverUsb()
        : discoverBluetooth(),
  );
  ipcMain.handle(
    "bridge:request",
    async (_event, route: string, method = "POST", body?: unknown) => {
      const config = bridge.store.get();
      const headers: Record<string, string> = { "x-agent-token": config.token };
      if (body !== undefined) headers["content-type"] = "application/json";
      const response = await fetch(`http://127.0.0.1:${config.port}${route}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || `HTTP ${response.status}`);
      return payload;
    },
  );
  ipcMain.handle("bridge:test-printer", async (_event, input) =>
    testPrint({ ...input, id: input.id || "test-printer" }),
  );
  ipcMain.handle("bridge:copy", (_event, value: string) =>
    clipboard.writeText(value),
  );
}
const isPrimaryInstance = !started && app.requestSingleInstanceLock();

if (!isPrimaryInstance) {
  app.quit();
} else {
  app.on("second-instance", showWindow);
  app.whenReady().then(async () => {
    app.setName("POS Ticket Bridge");
    app.setAppUserModelId("com.pos.ticketbridge");
    registerIpc();
    try {
      await restartBridge();
    } catch (error) {
      const message = (error as Error).message;
      const port = new ConfigStore(
        path.join(app.getPath("userData"), "config.json"),
      ).get().port;
      if (/EADDRINUSE|address already in use/i.test(message)) {
        await dialog.showMessageBox({
          type: "error",
          title: "Puerto ocupado",
          message: `El puerto ${port} ya está siendo usado por otra aplicación.`,
          detail:
            "Cierra la otra aplicación o cambia el puerto desde los ajustes de POS Ticket Bridge.",
        });
      } else {
        dialog.showErrorBox("POS Ticket Bridge", message);
      }
      app.quit();
      return;
    }
    ensureWindow();
  });
  app.on("activate", showWindow);
  app.on("before-quit", (event) => {
    if (!quitting) {
      event.preventDefault();
      void quit();
    }
  });
}
