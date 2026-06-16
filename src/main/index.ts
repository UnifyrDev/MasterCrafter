import { app, BrowserWindow } from "electron";
import { spawnSync } from "node:child_process";
import { CampaignService } from "@main/services/CampaignService";
import { IpcController } from "@main/ipc/IpcController";
import { hotkeyService } from "@main/services/HotkeyService";
import { WindowService } from "@main/services/WindowService";

let mainWindow: BrowserWindow | null = null;
let campaignService: CampaignService | null = null;
let windowService: WindowService | null = null;
let ipcController: IpcController | null = null;
let devLauncherTerminationRequested = false;

app.setAppUserModelId("com.unifyr.mastercrafter");

function terminateDevLauncherTree(): void {
  if (devLauncherTerminationRequested || app.isPackaged || !process.env.VITE_DEV_SERVER_URL || process.ppid <= 1) {
    return;
  }

  devLauncherTerminationRequested = true;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(process.ppid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
    return;
  }

  try {
    process.kill(process.ppid, "SIGTERM");
  } catch (error) {
    console.error("Failed to terminate MasterCrafter dev launcher", error);
  }
}

async function bootstrap(): Promise<void> {
  campaignService ??= CampaignService.getInstance();
  windowService ??= WindowService.getInstance();
  ipcController ??= new IpcController(campaignService);

  await campaignService.initialize();
  ipcController.register();

  const window = windowService.createMainWindow();
  mainWindow = window;
  hotkeyService.setMainWindow(window);
  hotkeyService.register();
  window.once("ready-to-show", () => {
    window.show();
  });

  window.on("closed", () => {
    mainWindow = null;
    hotkeyService.setMainWindow(null);
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  hotkeyService.unregister();
  terminateDevLauncherTree();
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await bootstrap();
  }
});

app.whenReady().then(bootstrap).catch((error) => {
  console.error("Failed to bootstrap MasterCrafter", error);
  app.quit();
});
