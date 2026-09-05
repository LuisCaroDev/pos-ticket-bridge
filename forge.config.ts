import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { FuseV1Options, FuseVersion } from "@electron/fuses";

const config: ForgeConfig = {
  ...(process.platform === "darwin"
    ? {
        hooks: {
          postPackage: async (_forgeConfig, packageResult) => {
            for (const outputPath of packageResult.outputPaths) {
              const appPath = [
                outputPath,
                path.join(outputPath, "POS Ticket Bridge.app"),
              ].find((candidate) =>
                existsSync(path.join(candidate, "Contents", "Info.plist")),
              );
              if (!appPath) continue;
              const result = spawnSync(
                "codesign",
                [
                  "--force",
                  "--deep",
                  "--sign",
                  "-",
                  "--identifier",
                  "com.pos.ticketbridge",
                  appPath,
                ],
                { stdio: "inherit" },
              );
              if (result.error) throw result.error;
              if (result.status !== 0)
                throw new Error(`Ad-hoc signing failed for ${appPath}`);
            }
          },
        },
      }
    : {}),
  packagerConfig: {
    asar: true,
    icon: path.resolve(
      __dirname,
      process.platform === "darwin"
        ? "native/pos-ticket-bridge-icon.icns"
        : process.platform === "win32"
          ? "native/pos-ticket-bridge-icon.ico"
          : "native/pos-ticket-bridge-icon.png",
    ),
    asarUnpack: ["**/*.node"],
    extraResource: [
      "native/pos-ticket-bridge-icon.png",
      "native/pos-ticket-bridge-trayTemplate.png",
      "native/pos-ticket-bridge-trayTemplate@2x.png",
      ...(process.platform === "darwin"
        ? ["native/macos/.build/POS Ticket Bridge Bluetooth.app"]
        : []),
    ],
    // Vite solo incluye `.vite` por defecto. Las dependencias externalizadas del
    // proceso principal y los assets nativos del tray deben viajar junto con la
    // app para resolverse en runtime.
    ignore: (file) => {
      if (!file) return false;

      return (
        !file.startsWith("/.vite") &&
        !file.startsWith("/node_modules") &&
        file !== "/package.json" &&
        !file.startsWith("/native/pos-ticket-bridge-")
      );
    },
    // En Windows reutilizamos el runtime ya instalado por npm. Esto evita que el
    // empaquetado dependa de descargar Electron otra vez.
    ...(process.platform === "win32"
      ? { electronZipDir: ".electron-cache" }
      : {}),
    appBundleId: "com.pos.ticketbridge",
    appCategoryType: "public.app-category.utilities",
  },
  // El entorno de desarrollo puede arrancar sin compilador C++ local. El CI de
  // empaquetado reconstruye explícitamente los módulos nativos por plataforma.
  rebuildConfig: {
    onlyModules: [],
  },
  makers: [
    { name: "@electron-forge/maker-zip", platforms: ["darwin"] },
    { name: "@electron-forge/maker-rpm", platforms: ["linux"] },
    { name: "@electron-forge/maker-deb", platforms: ["linux"] },
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: "src/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.mts",
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
