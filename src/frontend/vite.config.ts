import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";

// The dashboard source is in src/frontend. Its build goes to dist/frontend, which the backend serves.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [preact(), tailwindcss()],
  build: {
    outDir: fileURLToPath(new URL("../../dist/frontend", import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // In dev, forward API calls to the backend running on its usual port.
    proxy: { "/api": "http://127.0.0.1:3000" },
  },
});
