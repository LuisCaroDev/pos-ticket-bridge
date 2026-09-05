import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AutoStartManager,
  BACKGROUND_ARGUMENT,
  macLaunchAgentPath,
  MACOS_LAUNCH_AGENT_LABEL,
} from "../src/core/auto-start";

const directories: string[] = [];

const temporaryHome = () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "pos-ticket-bridge-auto-start-"),
  );
  directories.push(directory);
  return directory;
};

afterEach(() => {
  while (directories.length)
    fs.rmSync(directories.pop() as string, { recursive: true, force: true });
});

describe("AutoStartManager", () => {
  it("registers the installed Windows executable with the background argument", async () => {
    const setLoginItemSettings = vi.fn();
    const manager = new AutoStartManager({
      platform: "win32",
      isPackaged: true,
      execPath:
        "C:/Users/Ana/AppData/Local/Programs/POS Ticket Bridge/POS Ticket Bridge.exe",
      appPath: "",
      homePath: "",
      setWindowsLoginItemSettings: setLoginItemSettings,
      getWindowsLoginItemSettings: () => ({ openAtLogin: true }),
    });

    await expect(manager.sync(true)).resolves.toEqual({
      enabled: true,
      registered: true,
    });
    expect(setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      path: "C:/Users/Ana/AppData/Local/Programs/POS Ticket Bridge/POS Ticket Bridge.exe",
      args: [BACKGROUND_ARGUMENT],
      name: "POS Ticket Bridge",
      enabled: true,
    });

    await manager.sync(false);
    expect(setLoginItemSettings).toHaveBeenLastCalledWith({
      openAtLogin: false,
      path: "C:/Users/Ana/AppData/Local/Programs/POS Ticket Bridge/POS Ticket Bridge.exe",
      args: [BACKGROUND_ARGUMENT],
      name: "POS Ticket Bridge",
    });
  });

  it("creates and removes a LaunchAgent for an app in Applications", async () => {
    const homePath = temporaryHome();
    const runCommand = vi.fn().mockResolvedValue(undefined);
    const manager = new AutoStartManager({
      platform: "darwin",
      isPackaged: true,
      execPath:
        "/Applications/POS Ticket Bridge.app/Contents/MacOS/POS Ticket Bridge",
      appPath:
        "/Applications/POS Ticket Bridge.app/Contents/Resources/app.asar",
      homePath,
      runCommand,
    });

    await expect(manager.sync(true)).resolves.toEqual({
      enabled: true,
      registered: true,
    });
    const launchAgent = macLaunchAgentPath(homePath);
    expect(fs.readFileSync(launchAgent, "utf8")).toContain(
      MACOS_LAUNCH_AGENT_LABEL,
    );
    expect(fs.readFileSync(launchAgent, "utf8")).toContain(
      "/Applications/POS Ticket Bridge.app",
    );
    expect(fs.readFileSync(launchAgent, "utf8")).toContain(BACKGROUND_ARGUMENT);

    await expect(manager.sync(false)).resolves.toEqual({
      enabled: false,
      registered: false,
    });
    expect(runCommand).toHaveBeenCalledWith(
      "launchctl",
      expect.arrayContaining(["bootout", launchAgent]),
    );
    expect(fs.existsSync(launchAgent)).toBe(false);
  });

  it("does not register a macOS app outside Applications", async () => {
    const homePath = temporaryHome();
    const manager = new AutoStartManager({
      platform: "darwin",
      isPackaged: true,
      execPath:
        "/Users/Ana/Downloads/POS Ticket Bridge.app/Contents/MacOS/POS Ticket Bridge",
      appPath:
        "/Users/Ana/Downloads/POS Ticket Bridge.app/Contents/Resources/app.asar",
      homePath,
    });

    await expect(manager.sync(true)).resolves.toEqual({
      enabled: true,
      registered: false,
      reason: "macos_move_to_applications",
    });
    expect(fs.existsSync(macLaunchAgentPath(homePath))).toBe(false);
  });

  it("does not register startup entries during development", async () => {
    const setLoginItemSettings = vi.fn();
    const manager = new AutoStartManager({
      platform: "win32",
      isPackaged: false,
      execPath: "C:/project/electron.exe",
      appPath: "",
      homePath: "",
      setWindowsLoginItemSettings: setLoginItemSettings,
    });

    await expect(manager.sync(true)).resolves.toEqual({
      enabled: true,
      registered: false,
      reason: "development",
    });
    expect(setLoginItemSettings).not.toHaveBeenCalled();
  });
});
