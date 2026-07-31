import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(fileURLToPath(new URL(".", import.meta.url)), "./src"),
    },
  },
  test: {
    environment: "jsdom",
  },
});
