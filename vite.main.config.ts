import { defineConfig } from "vite";

// https://vitejs.dev/config
export default defineConfig({
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
});
