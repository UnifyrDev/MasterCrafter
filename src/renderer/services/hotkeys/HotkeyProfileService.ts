import { reactive } from "vue";
import { hotkeyDefinitionCatalogService } from "@renderer/services/hotkeys/HotkeyCatalogService";
import { hotkeyNormalizationService } from "@renderer/services/hotkeys/HotkeyNormalizationService";

export interface HotkeyConflictEntry {
  actionId: string;
  label: string;
  sectionLabel: string;
  groupLabel: string;
  binding: string | null;
}

export interface HotkeyProfileState {
  version: number;
  overrides: Record<string, string | null>;
}

const STORAGE_KEY = "mastercrafter.hotkeys.profile.v1";
const PROFILE_VERSION = 1;

const DEFAULT_PROFILE_STATE: HotkeyProfileState = {
  version: PROFILE_VERSION,
  overrides: {},
};

export class HotkeyProfileService {
  private static instance: HotkeyProfileService | null = null;
  private readonly state = reactive<HotkeyProfileState>({
    version: PROFILE_VERSION,
    overrides: {},
  });

  private constructor() {
    this.loadFromStorage();
  }

  static getInstance(): HotkeyProfileService {
    if (!HotkeyProfileService.instance) {
      HotkeyProfileService.instance = new HotkeyProfileService();
    }

    return HotkeyProfileService.instance;
  }

  get profileState(): HotkeyProfileState {
    return this.state;
  }

  getDefaultBinding(actionId: string): string | null {
    const action = hotkeyDefinitionCatalogService.getAction(actionId);
    return action?.defaultBinding ?? null;
  }

  getBinding(actionId: string): string | null {
    if (Object.prototype.hasOwnProperty.call(this.state.overrides, actionId)) {
      return this.state.overrides[actionId] ?? null;
    }

    return this.getDefaultBinding(actionId);
  }

  canEdit(actionId: string): boolean {
    const location = hotkeyDefinitionCatalogService.getActionLocation(actionId);
    return Boolean(location && !location.action.locked);
  }

  setBinding(actionId: string, binding: string | null): boolean {
    const location = hotkeyDefinitionCatalogService.getActionLocation(actionId);
    if (!location || location.action.locked) {
      return false;
    }

    const normalizedBinding = binding === null ? null : hotkeyNormalizationService.normalizeBinding(binding);
    if (binding !== null && !normalizedBinding) {
      return false;
    }

    if (normalizedBinding && hotkeyNormalizationService.isFixedOpenerBinding(normalizedBinding)) {
      return false;
    }

    const defaultBinding = location.action.defaultBinding ?? null;
    if (normalizedBinding === defaultBinding) {
      delete this.state.overrides[actionId];
      this.persist();
      return true;
    }

    this.state.overrides[actionId] = normalizedBinding;
    this.persist();
    return true;
  }

  resetAction(actionId: string): void {
    if (!this.canEdit(actionId)) {
      return;
    }

    delete this.state.overrides[actionId];
    this.persist();
  }

  resetSection(sectionId: string): void {
    const section = hotkeyDefinitionCatalogService.getSection(sectionId);
    if (!section) {
      return;
    }

    for (const group of section.groups) {
      for (const action of group.actions) {
        delete this.state.overrides[action.id];
      }
    }

    this.persist();
  }

  resetAll(): void {
    this.state.overrides = {};
    this.persist();
  }

  getConflicts(actionId: string): HotkeyConflictEntry[] {
    const location = hotkeyDefinitionCatalogService.getActionLocation(actionId);
    if (!location) {
      return [];
    }

    const binding = this.getBinding(actionId);
    if (!binding) {
      return [];
    }

    return hotkeyDefinitionCatalogService
      .getDefinitionsForContext(location.contextId)
      .filter((definition) => definition.id !== actionId && this.getBinding(definition.id) === binding)
      .map((definition) => {
        const conflictLocation = hotkeyDefinitionCatalogService.getActionLocation(definition.id);
        return {
          actionId: definition.id,
          label: conflictLocation?.action.label ?? definition.label,
          sectionLabel: conflictLocation?.sectionLabel ?? "",
          groupLabel: conflictLocation?.groupLabel ?? "",
          binding: this.getBinding(definition.id),
        };
      });
  }

  getResolvedBinding(actionId: string): string | null {
    return this.getBinding(actionId);
  }

  formatBinding(binding: string | null): string {
    return hotkeyNormalizationService.formatBinding(binding);
  }

  private loadFromStorage(): void {
    if (typeof window === "undefined") {
      return;
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      this.state.version = PROFILE_VERSION;
      this.state.overrides = {};
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<HotkeyProfileState> | null;
      const overrides = this.normalizeOverrides(parsed?.overrides ?? {});
      this.state.version = PROFILE_VERSION;
      this.state.overrides = overrides;
    } catch {
      this.state.version = PROFILE_VERSION;
      this.state.overrides = {};
      this.persist();
    }
  }

  private normalizeOverrides(overrides: Record<string, unknown>): Record<string, string | null> {
    const normalized: Record<string, string | null> = {};

    for (const [actionId, rawBinding] of Object.entries(overrides)) {
      const location = hotkeyDefinitionCatalogService.getActionLocation(actionId);
      if (!location || location.action.locked) {
        continue;
      }

      if (rawBinding === null) {
        normalized[actionId] = null;
        continue;
      }

      if (typeof rawBinding !== "string") {
        continue;
      }

      const binding = hotkeyNormalizationService.normalizeBinding(rawBinding);
      if (!binding || hotkeyNormalizationService.isFixedOpenerBinding(binding)) {
        continue;
      }

      const defaultBinding = location.action.defaultBinding ?? null;
      if (binding === defaultBinding) {
        continue;
      }

      normalized[actionId] = binding;
    }

    return normalized;
  }

  private persist(): void {
    if (typeof window === "undefined") {
      return;
    }

    const payload: HotkeyProfileState = {
      version: PROFILE_VERSION,
      overrides: this.state.overrides,
    };

    window.localStorage.setItem(STORAGE_KEY, `${JSON.stringify(payload, null, 2)}\n`);
  }
}

export const hotkeyProfileService = HotkeyProfileService.getInstance();
