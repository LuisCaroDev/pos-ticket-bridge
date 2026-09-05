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
import { errorPayload, resolveLanguage, t } from "./i18n";
import {
  AutoStartManager,
  BACKGROUND_ARGUMENT,
  type AutoStartStatus,
} from "./core/auto-start";
import { ConfigStore } from "./core/config-store";
import {
  discoverBluetooth,
  discoverNetwork,
  discoverUsb,
} from "./core/discovery";
import {
  createCompatibilityReport,
  createLocalProfileExport,
} from "./core/compatibility-report";
import {
  PROFILE_CATALOG_VERSION,
  getCatalogProfile,
  selectablePrinterProfiles,
  suggestedCatalogProfileId,
} from "./core/printer-profile-catalog";
import { defaultPrinterLanguage } from "./core/printer-profiles";
import { createBridgeServer } from "./core/server";
import type { Diagnostic } from "./core/types";

let window: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let bridge: ReturnType<typeof createBridgeServer>;
let autoStartManager: AutoStartManager;
let autoStartStatus: AutoStartStatus = {
  enabled: false,
  registered: false,
};
const launchedInBackground =
  app.isPackaged && process.argv.includes(BACKGROUND_ARGUMENT);
const activeLanguage = () =>
  resolveLanguage(bridge.store.get().language, app.getLocale());
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
    activeLanguage,
  );
  await bridge.start();
  buildTray();
}
function createAutoStartManager() {
  return new AutoStartManager({
    platform: process.platform,
    isPackaged: app.isPackaged,
    execPath: process.execPath,
    appPath: app.getAppPath(),
    homePath: app.getPath("home"),
    setWindowsLoginItemSettings: (settings) =>
      app.setLoginItemSettings(settings),
    getWindowsLoginItemSettings: (settings) =>
      app.getLoginItemSettings(settings),
  });
}
async function synchronizeAutoStart(enabled: boolean) {
  autoStartStatus = await autoStartManager.sync(enabled);
  return autoStartStatus;
}
function buildTray() {
  if (!tray) {
    tray = new Tray(icon());
    tray.on("double-click", showWindow);
  }
  const config = bridge.store.get();
  const language = activeLanguage();
  tray.setToolTip("POS Ticket Bridge");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t(language, "tray_open"), click: showWindow },
      {
        label: t(language, "tray_copy_token"),
        click: () => clipboard.writeText(config.token),
      },
      {
        label: t(language, "tray_show_hosts"),
        click: async () =>
          dialog.showMessageBox({
            title: t(language, "bridge_hosts"),
            message: (await bridge.status()).suggestedHosts.join("\n"),
          }),
      },
      {
        label: t(language, "tray_print_test"),
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
              t(language, "print_failed"),
              t(
                language,
                errorPayload(error).code as any,
                errorPayload(error).params,
              ),
            );
          }
        },
      },
      {
        label: t(language, "tray_restart"),
        click: () =>
          restartBridge().catch((error) =>
            dialog.showErrorBox(
              t(activeLanguage(), "operation_failed"),
              t(
                activeLanguage(),
                errorPayload(error).code as any,
                errorPayload(error).params,
              ),
            ),
          ),
      },
      { type: "separator" },
      { label: t(language, "tray_quit"), click: () => quit() },
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
  const ipc = (
    channel: string,
    handler: (...args: any[]) => Promise<any> | any,
  ) =>
    ipcMain.handle(channel, async (...args) => {
      try {
        return { ok: true, value: await handler(...args) };
      } catch (error) {
        return {
          ok: false,
          error: errorPayload(error),
          diagnostic: (error as { diagnostic?: Diagnostic }).diagnostic,
        };
      }
    });
  ipc("bridge:status", async () => ({
    ...(await bridge.status()),
    version: app.getVersion(),
    autoStart: bridge.store.get().autoStart,
    autoStartStatus,
  }));
  ipc("bridge:diagnostics", () => bridge.recentDiagnostics());
  ipc("bridge:settings", async (_event, input) => {
    const oldPort = bridge.store.get().port;
    const oldLanguage = bridge.store.get().language;
    const oldAutoStart = bridge.store.get().autoStart;
    const config = bridge.store.settings(input);
    if (oldAutoStart !== config.autoStart)
      await synchronizeAutoStart(config.autoStart);
    if (oldPort !== config.port) await restartBridge();
    else if (oldLanguage !== config.language) buildTray();
    return config;
  });
  ipc("bridge:create-printer", (_event, input, draftSessionId?: string) => {
    const before = new Set(
      bridge.store.get().printers.map((printer) => printer.id),
    );
    const config = bridge.store.create(input);
    const printer = config.printers.find((item) => !before.has(item.id));
    if (draftSessionId && printer)
      bridge.promoteDraftDiagnostics(draftSessionId, printer.id);
    return config;
  });
  ipc("bridge:update-printer", (_event, id, input) =>
    bridge.store.update(id, input),
  );
  ipc("bridge:delete-printer", (_event, id) => bridge.store.remove(id));
  ipc("bridge:duplicate-printer", (_event, id) => bridge.store.duplicate(id));
  ipc("bridge:discover", (_event, kind) =>
    kind === "network"
      ? discoverNetwork()
      : kind === "usb"
        ? discoverUsb()
        : discoverBluetooth(),
  );
  ipc("bridge:printer-profiles", (_event, input = {}) => {
    const printer = {
      ...input,
      tipo: input.tipo || "network",
      connection: input.connection || {},
    } as any;
    const selected = getCatalogProfile(input.printProfile?.profileId);
    const profiles = selectablePrinterProfiles();
    const config = bridge.store.get();
    const localProfiles = config.localProfiles.map((profile) => ({
      ...profile,
      local: true,
      usageCount: config.printers.filter(
        (item) => item.printProfile.localProfileId === profile.id,
      ).length,
    }));
    return {
      version: PROFILE_CATALOG_VERSION,
      suggestedProfileId: suggestedCatalogProfileId(printer),
      profiles: profiles.some((profile) => profile.id === selected.id)
        ? profiles
        : [...profiles, selected],
      localProfiles,
    };
  });
  ipc("bridge:compatibility-report", (_event, input, diagnostic) =>
    createCompatibilityReport(
      {
        ...input,
        id: input.id || "compatibility-report",
        printProfile: input.printProfile || {
          language: defaultPrinterLanguage(app.getLocale()),
          mode: "auto",
        },
      },
      app.getVersion(),
      diagnostic,
    ),
  );
  ipc("bridge:export-local-profile", (_event, input) =>
    createLocalProfileExport(input),
  );
  ipc("bridge:import-local-profile", (_event, input) =>
    bridge.store.importLocalProfile(input),
  );
  ipc("bridge:save-local-profile", (_event, input) =>
    bridge.store.saveLocalProfile(input),
  );
  ipc("bridge:delete-local-profile", (_event, id) =>
    bridge.store.deleteLocalProfile(String(id)),
  );
  ipc("bridge:validate-character-profile-test-set", (_event, input) =>
    bridge.validateCharacterProfileTestSet(input),
  );
  ipc(
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
      if (!response.ok) throw payload.error || { code: "operation_failed" };
      return payload;
    },
  );
  ipc("bridge:test-printer", (_event, input, options) =>
    bridge.testPrinter(input, options),
  );
  ipc(
    "bridge:run-character-profile-trial",
    (_event, input, candidate, draftSessionId?: string) =>
      bridge.runCharacterProfileTrial(input, candidate, draftSessionId),
  );
  ipc("bridge:discard-draft-diagnostics", (_event, draftSessionId: string) =>
    bridge.discardDraftDiagnostics(draftSessionId),
  );
  ipc("bridge:copy", (_event, value: string) => clipboard.writeText(value));
  ipc("bridge:paste", () => clipboard.readText());
}
const isPrimaryInstance = app.requestSingleInstanceLock();

if (!isPrimaryInstance) {
  app.quit();
} else {
  app.on("second-instance", showWindow);
  app.whenReady().then(async () => {
    app.setName("POS Ticket Bridge");
    app.setAppUserModelId("com.pos.ticketbridge");
    autoStartManager = createAutoStartManager();
    registerIpc();
    try {
      await restartBridge();
      await synchronizeAutoStart(bridge.store.get().autoStart);
    } catch (error) {
      const message = (error as Error).message;
      const port = new ConfigStore(
        path.join(app.getPath("userData"), "config.json"),
      ).get().port;
      if (/EADDRINUSE|address already in use/i.test(message)) {
        const language = resolveLanguage(
          new ConfigStore(
            path.join(app.getPath("userData"), "config.json"),
          ).get().language,
          app.getLocale(),
        );
        await dialog.showMessageBox({
          type: "error",
          title: t(language, "port_busy"),
          message: t(language, "port_busy_message", { port }),
          detail: t(language, "port_busy_detail"),
        });
      } else {
        dialog.showErrorBox("POS Ticket Bridge", message);
      }
      app.quit();
      return;
    }
    if (!launchedInBackground) ensureWindow();
  });
  app.on("activate", showWindow);
  app.on("before-quit", (event) => {
    if (!quitting) {
      event.preventDefault();
      void quit();
    }
  });
}
