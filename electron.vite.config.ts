import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "electron-vite";
import vue from "@vitejs/plugin-vue";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".");
const aliases = {
  "@shared": resolve(root, "src/shared"),
  "@domain": resolve(root, "src/domain"),
  "@infra": resolve(root, "src/infrastructure"),
  "@main": resolve(root, "src/main"),
  "@preload": resolve(root, "src/preload"),
  "@renderer": resolve(root, "src/renderer"),
};

export default defineConfig({
  main: {
    resolve: {
      alias: aliases,
    },
    build: {
      outDir: "dist/main",
      rollupOptions: {
        input: resolve(root, "src/main/index.ts"),
        external: ["better-sqlite3"],
      },
    },
  },
  preload: {
    resolve: {
      alias: aliases,
    },
    build: {
      outDir: "dist/preload",
      rollupOptions: {
        input: resolve(root, "src/preload/index.ts"),
      },
    },
  },
  renderer: {
    root,
    plugins: [vue()],
    resolve: {
      alias: aliases,
    },
    server: {
      host: "0.0.0.0",
      port: 4180,
      strictPort: true,
    },
    build: {
      outDir: "dist/renderer",
      rollupOptions: {
        input: resolve(root, "index.html"),
      },
    },
  },
});
