import { app, BrowserWindow, globalShortcut, type Input } from "electron";
import { IPC_CHANNELS } from "@shared/constants";

export class HotkeyService {
  private static instance: HotkeyService | null = null;
  private mainWindow: BrowserWindow | null = null;
  private hasWindowHotkeyListener = false;
  private registered = false;

  private constructor() {}

  static getInstance(): HotkeyService {
    if (!HotkeyService.instance) {
      HotkeyService.instance = new HotkeyService();
    }

    return HotkeyService.instance;
  }

  setMainWindow(window: BrowserWindow | null): void {
    this.detachWindowHotkeyListener();
    this.mainWindow = window;
    this.attachWindowHotkeyListener();
  }

  register(): void {
    if (this.registered) {
      return;
    }

    const registered = globalShortcut.register("Ctrl+Alt+H", () => {
      this.handleToggleSettingsShortcut();
    });

    if (!registered) {
      console.warn("Failed to register the MasterCrafter hotkey shortcut.");
      return;
    }

    this.registered = true;
  }

  unregister(): void {
    this.detachWindowHotkeyListener();

    if (!this.registered) {
      return;
    }

    globalShortcut.unregister("Ctrl+Alt+H");
    this.registered = false;
  }

  private handleToggleSettingsShortcut(): void {
    this.openSettings();
  }

  private handleWindowBeforeInputEvent = (event: Electron.Event, input: Input): void => {
    if (!this.isWindowHotkeyInput(input)) {
      return;
    }

    event.preventDefault();
    this.openSettings();
  };

  private attachWindowHotkeyListener(): void {
    const window = this.mainWindow;
    if (!window || this.hasWindowHotkeyListener) {
      return;
    }

    window.webContents.on("before-input-event", this.handleWindowBeforeInputEvent);
    this.hasWindowHotkeyListener = true;
  }

  private detachWindowHotkeyListener(): void {
    const window = this.mainWindow;
    if (!this.hasWindowHotkeyListener) {
      return;
    }

    if (window && !window.isDestroyed()) {
      window.webContents.removeListener("before-input-event", this.handleWindowBeforeInputEvent);
    }

    this.hasWindowHotkeyListener = false;
  }

  private openSettings(): void {
    const window = this.mainWindow;
    if (!window || window.isDestroyed()) {
      return;
    }

    if (window.isMinimized()) {
      window.restore();
    }

    if (!window.isVisible()) {
      window.show();
    }

    window.focus();
    window.webContents.send(IPC_CHANNELS.hotkeys.toggleSettings);
  }

  private isWindowHotkeyInput(input: Input): boolean {
    if (input.type !== "keyDown" || input.isAutoRepeat) {
      return false;
    }

    return input.control && input.alt && !input.shift && !input.meta && (input.code === "KeyH" || input.key?.toLowerCase() === "h");
  }
}

export const hotkeyService = HotkeyService.getInstance();
