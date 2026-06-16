import { app, BrowserWindow } from "electron";
import { dirname } from "node:path";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_NAME } from "@shared/constants";
import { ConfigService } from "@infra/config/ConfigService";

export class WindowService {
  private static instance: WindowService | null = null;

  private constructor(private readonly config = ConfigService.getInstance()) {}

  static getInstance(): WindowService {
    if (!WindowService.instance) {
      WindowService.instance = new WindowService();
    }

    return WindowService.instance;
  }

  createMainWindow(): BrowserWindow {
    const bounds = this.config.get().windowBounds;
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const window = new BrowserWindow({
      title: APP_NAME,
      width: bounds.width,
      height: bounds.height,
      x: bounds.x ?? undefined,
      y: bounds.y ?? undefined,
      show: false,
      backgroundColor: "#0c1017",
      autoHideMenuBar: true,
      minWidth: 1360,
      minHeight: 860,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        preload: path.join(currentDir, "../preload/index.mjs"),
      },
    });

    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (devUrl) {
      window.loadURL(devUrl);
    } else {
      window.loadFile(path.join(currentDir, "../renderer/index.html"));
    }

    let closeRequested = false;
    window.on("close", (event) => {
      if (closeRequested) {
        return;
      }

      event.preventDefault();
      closeRequested = true;

      const bounds = window.getBounds();
      void this.config.update({
        windowBounds: {
          width: bounds.width,
          height: bounds.height,
          x: bounds.x,
          y: bounds.y,
        },
      }).catch((error) => {
        console.error("Failed to persist MasterCrafter window bounds before shutdown", error);
      }).finally(() => {
        app.quit();
      });
    });

    return window;
  }
}
