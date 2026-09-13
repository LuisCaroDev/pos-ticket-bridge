import { LocalCaTrust } from "./core/local-ca-trust";
import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  safeStorage,
  shell,
} from "electron";
import path from "node:path";
import { BridgeError, errorPayload, resolveLanguage, t } from "./i18n";
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
import { HttpsStore } from "./core/https-store";
import {
  LocalHttpsManager,
  type ListenerConfiguration,
} from "./core/local-https";
import { httpsGuideUrl, httpsVideoUrl } from "./core/https-help";
import type { ClientOS, NetworkSelection } from "./core/local-https-types";

let window: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let bridge: ReturnType<typeof createBridgeServer>;
let configStore: ConfigStore;
let httpsManager: LocalHttpsManager;
let autoStartManager: AutoStartManager;
let autoStartStatus: AutoStartStatus = {
  enabled: false,
  registered: false,
};
const launchedInBackground =
  app.isPackaged && process.argv.includes(BACKGROUND_ARGUMENT);
const activeLanguage = () =>
  resolveLanguage(bridge.store.get().language, app.getLocale());
const nativeAssetRoot = app.isPackaged
  ? process.resourcesPath
  : path.join(app.getAppPath(), "native");
const nativeAssetPath = (filename: string) =>
  path.join(nativeAssetRoot, filename);
const iconPath = nativeAssetPath("pos-ticket-bridge-icon.png");
const trayIconPath = nativeAssetPath("pos-ticket-bridge-trayTemplate.png");
const trayIconRetinaPath = nativeAssetPath(
  "pos-ticket-bridge-trayTemplate@2x.png",
);
const appIcon = () => nativeImage.createFromPath(iconPath);
const trayIcon = () => {
  const image = nativeImage.createFromPath(trayIconPath);
  const retinaImage = nativeImage.createFromPath(trayIconRetinaPath);
  image.addRepresentation({
    scaleFactor: 2,
    width: 32,
    height: 32,
    buffer: retinaImage.toPNG(),
  });
  if (process.platform === "darwin") image.setTemplateImage(true);
  return image;
};

function ensureWindow() {
  if (window && !window.isDestroyed()) return window;
  window = new BrowserWindow({
    width: 1120,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    show: false,
    title: "POS Ticket Bridge",
    icon: appIcon(),
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
      void httpsManager?.stopEnrollment().catch((): void => undefined);
      window?.hide();
      hideDockIcon();
    }
  });
  window.once("ready-to-show", () => {
    showDockIcon();
    window?.show();
  });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL)
    window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  else
    window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  return window;
}
function hideDockIcon() {
  if (process.platform === "darwin" && app.dock?.isVisible()) {
    app.dock.hide();
  }
}
function showDockIcon() {
  if (process.platform === "darwin" && !app.dock?.isVisible()) {
    app.dock.show();
  }
}
function showWindow() {
  const target = ensureWindow();
  if (target.isMinimized()) target.restore();
  target.show();
  target.focus();
  showDockIcon();
}
async function restartBridge() {
  await httpsManager.restart();
  buildTray();
}
async function replaceListener(configuration: ListenerConfiguration | null) {
  await bridge?.stop();
  bridge = createBridgeServer(configStore, activeLanguage, {
    ...(configuration
      ? {
          tls: configuration.tls,
          host: configuration.host,
          port: configuration.port,
        }
      : {}),
    httpsStatus: () => httpsManager.status(),
  });
  if (configuration) await bridge.start();
}
async function internalRequest(route: string, method = "POST", body?: unknown) {
  // Desktop actions execute internally and never disable TLS verification.
  if (
    !/^\/(?:api\/printers\/[^/?]+\/(?:test|open-drawer)|test\/[^/?]+)$/.test(
      route,
    ) ||
    method !== "POST"
  )
    throw new BridgeError("invalid_request");
  const response = await bridge.app.inject({
    method: "POST",
    url: route,
    headers: {
      "x-agent-token": configStore.get().token,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { payload: JSON.stringify(body) } : {}),
  });
  const payload = response.json();
  if (response.statusCode >= 400)
    throw payload.error || { code: "operation_failed" };
  return payload;
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
    tray = new Tray(trayIcon());
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
            await internalRequest(`/test/${first.id}`);
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
  await httpsManager?.shutdown().catch((): void => undefined);
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
  ipc("bridge:https-status", () => httpsManager.status());
  ipc("bridge:https-trust", () => httpsManager.trustLocal());
  ipc("bridge:https-activate", (_event, selection?: NetworkSelection) =>
    httpsManager.activate(selection),
  );
  ipc("bridge:https-pause", () => httpsManager.pause());
  ipc("bridge:https-select", (_event, selection: NetworkSelection) =>
    httpsManager.select(selection),
  );
  ipc("bridge:https-enroll", (_event, os: ClientOS) =>
    httpsManager.startEnrollment(os),
  );
  ipc("bridge:https-enroll-stop", () => httpsManager.stopEnrollment());
  ipc("bridge:https-reset", async () => {
    const language = activeLanguage();
    const confirmation = await dialog.showMessageBox({
      type: "warning",
      title: t(language, "https_reset"),
      message: t(language, "https_reset_confirm"),
      buttons: [t(language, "cancel"), t(language, "https_reset")],
      defaultId: 0,
      cancelId: 0,
    });
    if (confirmation.response === 1) return httpsManager.reset();
    return httpsManager.status();
  });
  ipc("bridge:https-videos", () =>
    Object.fromEntries(
      ["ios", "android", "windows", "macos"].map((os) => [
        os,
        Boolean(httpsVideoUrl(os as ClientOS)),
      ]),
    ),
  );
  ipc("bridge:https-video", (_event, os: ClientOS) => {
    const url = httpsVideoUrl(os);
    if (!url) throw new BridgeError("https_video_unavailable");
    return shell.openExternal(url);
  });
  ipc("bridge:https-health", () => {
    const current = httpsManager.status();
    if (current.transport !== "https")
      throw new BridgeError("https_must_be_active");
    return shell.openExternal(current.host + "/health");
  });
  ipc("bridge:https-help", (_event, os: ClientOS) => {
    const url = httpsGuideUrl(os);
    if (!url) throw new BridgeError("https_invalid_os");
    return shell.openExternal(url);
  });
  ipc("bridge:settings", async (_event, input) => {
    let before = configStore.get();
    await httpsManager.applySettings(
      input.https,
      async () => {
        before = configStore.get();
        const next = configStore.settings(input);
        if (before.autoStart !== next.autoStart)
          await synchronizeAutoStart(next.autoStart);
      },
      async () => {
        configStore.settings({
          port: before.port,
          allowedOrigins: before.allowedOrigins,
          language: before.language,
          autoStart: before.autoStart,
        });
        if (before.autoStart !== input.autoStart)
          await synchronizeAutoStart(before.autoStart);
      },
    );
    buildTray();
    return configStore.get();
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
      return internalRequest(route, method, body);
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
    configStore = new ConfigStore(
      path.join(app.getPath("userData"), "config.json"),
    );
    httpsManager = new LocalHttpsManager(
      new HttpsStore(
        path.join(app.getPath("userData"), "local-https.json"),
        safeStorage,
      ),
      {
        trust: new LocalCaTrust(
          path.join(app.getPath("userData"), "local-https-ca.cer"),
        ),
        getPort: () => configStore.get().port,
        replaceListener,
        restorePort: (port) => {
          configStore.settings({ port });
        },
      },
    );
    // Keep settings available when an interface or certificate needs repair.
    bridge = createBridgeServer(configStore, activeLanguage, {
      httpsStatus: () => httpsManager.status(),
    });
    registerIpc();
    try {
      await httpsManager.initialize();
      buildTray();
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
  if (process.platform === "darwin") {
    app.on("window-all-closed", (event) => event.preventDefault());
  }
  app.on("activate", showWindow);
  app.on("before-quit", (event) => {
    if (!quitting) {
      event.preventDefault();
      void quit();
    }
  });
}
