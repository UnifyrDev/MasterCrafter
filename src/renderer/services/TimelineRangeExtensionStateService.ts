export interface TimelineRangeExtensionState {
  extraYears: number;
}

const DEFAULT_RANGE_EXTENSION_STATE: Readonly<TimelineRangeExtensionState> = Object.freeze({
  extraYears: 0,
});

export class TimelineRangeExtensionStateService {
  private static instance: TimelineRangeExtensionStateService | null = null;
  private readonly storage: Storage | null;
  private readonly cache = new Map<string, TimelineRangeExtensionState>();

  private constructor(storage: Storage | null = typeof window !== "undefined" ? window.localStorage : null) {
    this.storage = storage;
  }

  static getInstance(): TimelineRangeExtensionStateService {
    if (!TimelineRangeExtensionStateService.instance) {
      TimelineRangeExtensionStateService.instance = new TimelineRangeExtensionStateService();
    }

    return TimelineRangeExtensionStateService.instance;
  }

  loadExtensionYears(workspaceId: string): number {
    return this.loadState(workspaceId).extraYears;
  }

  saveExtensionYears(workspaceId: string, extraYears: number): void {
    const normalized = this.normalizeState({ extraYears });
    const key = this.buildKey(workspaceId);
    this.cache.set(key, normalized);
    this.storage?.setItem(key, JSON.stringify(normalized));
  }

  extendByYears(workspaceId: string, additionalYears = 1): number {
    const currentYears = this.loadExtensionYears(workspaceId);
    const nextYears = currentYears + Math.max(0, Math.floor(additionalYears));
    this.saveExtensionYears(workspaceId, nextYears);
    return nextYears;
  }

  clearExtensionYears(workspaceId: string): void {
    const key = this.buildKey(workspaceId);
    this.cache.delete(key);
    this.storage?.removeItem(key);
  }

  getDefaultState(): TimelineRangeExtensionState {
    return { ...DEFAULT_RANGE_EXTENSION_STATE };
  }

  private loadState(workspaceId: string): TimelineRangeExtensionState {
    const key = this.buildKey(workspaceId);
    const cached = this.cache.get(key);
    if (cached) {
      return { ...cached };
    }

    const raw = this.storage?.getItem(key);
    if (!raw) {
      return this.getDefaultState();
    }

    const parsed = this.parseState(raw);
    if (!parsed) {
      return this.getDefaultState();
    }

    this.cache.set(key, parsed);
    return { ...parsed };
  }

  private buildKey(workspaceId: string): string {
    return `mastercrafter.timelineRangeExtension.${workspaceId}`;
  }

  private parseState(raw: string): TimelineRangeExtensionState | null {
    try {
      const parsed = JSON.parse(raw) as Partial<TimelineRangeExtensionState>;
      return this.normalizeState(parsed);
    } catch {
      return null;
    }
  }

  private normalizeState(state: Partial<TimelineRangeExtensionState>): TimelineRangeExtensionState {
    const rawExtraYears = typeof state.extraYears === "number" ? state.extraYears : DEFAULT_RANGE_EXTENSION_STATE.extraYears;
    const extraYears = Number.isFinite(rawExtraYears) && rawExtraYears >= 0 ? Math.floor(rawExtraYears) : DEFAULT_RANGE_EXTENSION_STATE.extraYears;

    return {
      extraYears,
    };
  }
}
