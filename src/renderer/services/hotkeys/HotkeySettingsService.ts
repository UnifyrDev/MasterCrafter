import { reactive } from "vue";

export interface HotkeySettingsState {
  open: boolean;
}

const DEFAULT_STATE: HotkeySettingsState = {
  open: false,
};

export class HotkeySettingsService {
  private static instance: HotkeySettingsService | null = null;
  private readonly state = reactive<HotkeySettingsState>({ ...DEFAULT_STATE });

  private constructor() {}

  static getInstance(): HotkeySettingsService {
    if (!HotkeySettingsService.instance) {
      HotkeySettingsService.instance = new HotkeySettingsService();
    }

    return HotkeySettingsService.instance;
  }

  get settingsState(): HotkeySettingsState {
    return this.state;
  }

  open(): void {
    this.state.open = true;
  }

  close(): void {
    this.state.open = false;
  }

  toggle(): void {
    this.state.open = !this.state.open;
  }
}

export const hotkeySettingsService = HotkeySettingsService.getInstance();
