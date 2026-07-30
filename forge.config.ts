import type { ForgeConfig } from "@electron-forge/shared-types";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { FuseV1Options, FuseVersion } from "@electron/fuses";

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    asarUnpack: ["**/*.node"],
    // Vite solo incluye `.vite` por defecto. Las dependencias externalizadas del
    // proceso principal deben viajar junto con la app para resolverse en runtime.
    ignore: (file) => {
      if (!file) return false;

      return (
        !file.startsWith("/.vite") &&
        !file.startsWith("/node_modules") &&
        file !== "/package.json"
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
    {
      name: "@electron-forge/maker-squirrel",
      platforms: ["win32"],
      config: {
        // Squirrel/NuGet no admite espacios; productName sigue siendo visible para usuarios.
        name: "POSTicketBridge",
        authors: "LuisCaroDev",
        description: "Puente local de impresión ESC/POS para puntos de venta.",
      },
    },
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
