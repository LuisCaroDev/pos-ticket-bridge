import { defineConfig, loadEnv } from "vite";

// https://vitejs.dev/config
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "POS_BRIDGE_HTTPS_");
  return {
    define: {
      __HTTPS_SETUP_TTL_MS__: JSON.stringify(
        env.POS_BRIDGE_HTTPS_SETUP_TTL_MS || "",
      ),
      __HTTPS_GUIDE_URLS__: JSON.stringify(
        Object.fromEntries(
          ["ios", "android", "windows", "macos"].map((os) => [
            os,
            env["POS_BRIDGE_HTTPS_GUIDE_" + os.toUpperCase()] || "",
          ]),
        ),
      ),
      __HTTPS_VIDEO_URLS__: JSON.stringify(
        Object.fromEntries(
          ["ios", "android", "windows", "macos"].map((os) => [
            os,
            env["POS_BRIDGE_HTTPS_VIDEO_" + os.toUpperCase()] || "",
          ]),
        ),
      ),
    },
    build: {
      rollupOptions: {
        external: [
          "usb",
          "serialport",
          "@node-escpos/core",
          "@node-escpos/adapter",
          "@node-escpos/network-adapter",
          "@node-escpos/serialport-adapter",
          "@node-escpos/usb-adapter",
        ],
      },
    },
  };
});
