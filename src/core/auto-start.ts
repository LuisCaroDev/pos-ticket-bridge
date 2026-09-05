import { execFile as execFileCallback } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

export const AUTO_START_NAME = "POS Ticket Bridge";
export const MACOS_LAUNCH_AGENT_LABEL = "com.pos.ticketbridge";
export const BACKGROUND_ARGUMENT = "--background";

export type AutoStartReason =
  "development" | "unsupported" | "macos_move_to_applications";

export type AutoStartStatus = {
  enabled: boolean;
  registered: boolean;
  reason?: AutoStartReason;
};

export type WindowsLoginItemSettings = {
  openAtLogin: boolean;
  path: string;
  args: string[];
  name: string;
  enabled?: boolean;
};

type AutoStartManagerOptions = {
  platform: NodeJS.Platform;
  isPackaged: boolean;
  execPath: string;
  appPath: string;
  homePath: string;
  setWindowsLoginItemSettings?: (settings: WindowsLoginItemSettings) => void;
  getWindowsLoginItemSettings?: (settings: {
    path: string;
    args: string[];
  }) => { openAtLogin: boolean };
  runCommand?: (command: string, args: string[]) => Promise<void>;
};

const execFile = promisify(execFileCallback);
const defaultRunCommand = async (command: string, args: string[]) => {
  await execFile(command, args);
};

const xmlEscape = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** Returns the outer .app bundle containing an Electron runtime path. */
export const macApplicationBundlePath = (value: string) => {
  const normalized = path.posix.normalize(value);
  const markerIndex = normalized.indexOf("/Contents/");
  if (markerIndex < 0) return undefined;
  const bundlePath = normalized.slice(0, markerIndex);
  return bundlePath.endsWith(".app") ? bundlePath : undefined;
};

export const isMacApplicationInApplications = (appBundlePath: string) => {
  const relative = path.posix.relative("/Applications", appBundlePath);
  return (
    Boolean(relative) && !relative.startsWith("..") && !relative.startsWith("/")
  );
};

export const macLaunchAgentPath = (homePath: string) =>
  path.join(
    homePath,
    "Library",
    "LaunchAgents",
    MACOS_LAUNCH_AGENT_LABEL + ".plist",
  );

export const macLaunchAgentPlist = (appBundlePath: string) => {
  const argumentsToLaunch = [
    "/usr/bin/open",
    "-gj",
    appBundlePath,
    "--args",
    BACKGROUND_ARGUMENT,
  ];
  const argumentXml = argumentsToLaunch
    .map((value) => "    <string>" + xmlEscape(value) + "</string>")
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "  <key>Label</key>",
    "  <string>" + MACOS_LAUNCH_AGENT_LABEL + "</string>",
    "  <key>ProgramArguments</key>",
    "  <array>",
    argumentXml,
    "  </array>",
    "  <key>RunAtLoad</key>",
    "  <true/>",
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
};

export const windowsLoginItemSettings = (
  enabled: boolean,
  executablePath: string,
): WindowsLoginItemSettings => ({
  openAtLogin: enabled,
  path: executablePath,
  args: [BACKGROUND_ARGUMENT],
  name: AUTO_START_NAME,
  ...(enabled ? { enabled: true } : {}),
});

export class AutoStartManager {
  private status: AutoStartStatus = { enabled: false, registered: false };
  private readonly runCommand: (
    command: string,
    args: string[],
  ) => Promise<void>;

  constructor(private readonly options: AutoStartManagerOptions) {
    this.runCommand = options.runCommand || defaultRunCommand;
  }

  getStatus() {
    return { ...this.status };
  }

  async sync(enabled: boolean): Promise<AutoStartStatus> {
    if (!this.options.isPackaged) {
      this.status = { enabled, registered: false, reason: "development" };
      return this.getStatus();
    }

    if (this.options.platform === "win32") {
      const setLoginItemSettings = this.options.setWindowsLoginItemSettings;
      if (!setLoginItemSettings)
        throw new Error("Windows login item settings are unavailable.");
      const settings = windowsLoginItemSettings(enabled, this.options.execPath);
      setLoginItemSettings(settings);
      const loginItem = this.options.getWindowsLoginItemSettings?.({
        path: settings.path,
        args: settings.args,
      });
      this.status = {
        enabled,
        registered: loginItem?.openAtLogin ?? enabled,
      };
      return this.getStatus();
    }

    if (this.options.platform !== "darwin") {
      this.status = { enabled, registered: false, reason: "unsupported" };
      return this.getStatus();
    }

    const agentPath = macLaunchAgentPath(this.options.homePath);
    if (!enabled) {
      await this.removeMacLaunchAgent(agentPath);
      this.status = { enabled: false, registered: false };
      return this.getStatus();
    }

    const appBundlePath = macApplicationBundlePath(this.options.appPath);
    if (!appBundlePath || !isMacApplicationInApplications(appBundlePath)) {
      this.status = {
        enabled: true,
        registered: false,
        reason: "macos_move_to_applications",
      };
      return this.getStatus();
    }

    const plist = macLaunchAgentPlist(appBundlePath);
    mkdirSync(path.dirname(agentPath), { recursive: true });
    if (!existsSync(agentPath) || readFileSync(agentPath, "utf8") !== plist)
      writeFileSync(agentPath, plist, "utf8");
    this.status = { enabled: true, registered: true };
    return this.getStatus();
  }

  private async removeMacLaunchAgent(agentPath: string) {
    try {
      await this.runCommand("launchctl", [
        "bootout",
        "gui/" + (process.getuid?.() || 0),
        agentPath,
      ]);
    } catch {
      // A LaunchAgent not loaded in the current session is still removed below.
    }
    rmSync(agentPath, { force: true });
  }
}
