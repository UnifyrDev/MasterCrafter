export interface TimelineViewportState {
  zoomX: number;
  translateX: number;
  translateY: number;
}

const DEFAULT_VIEWPORT: TimelineViewportState = {
  zoomX: 1,
  translateX: 0,
  translateY: 0,
};

export class TimelineViewportStateService {
  private static instance: TimelineViewportStateService | null = null;
  private readonly storage: Storage | null;
  private readonly cache = new Map<string, TimelineViewportState>();

  private constructor(storage: Storage | null = typeof window !== "undefined" ? window.localStorage : null) {
    this.storage = storage;
  }

  static getInstance(): TimelineViewportStateService {
    if (!TimelineViewportStateService.instance) {
      TimelineViewportStateService.instance = new TimelineViewportStateService();
    }

    return TimelineViewportStateService.instance;
  }

  loadViewport(workspaceId: string): TimelineViewportState | null {
    const key = this.buildKey(workspaceId);
    const cached = this.cache.get(key);
    if (cached) {
      return { ...cached };
    }

    const raw = this.storage?.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = this.parseViewport(raw);
    if (!parsed) {
      return null;
    }

    this.cache.set(key, parsed);
    return { ...parsed };
  }

  saveViewport(workspaceId: string, viewport: TimelineViewportState): void {
    const normalized = this.normalizeViewport(viewport);
    const key = this.buildKey(workspaceId);
    this.cache.set(key, normalized);
    this.storage?.setItem(key, JSON.stringify(normalized));
  }

  clearViewport(workspaceId: string): void {
    const key = this.buildKey(workspaceId);
    this.cache.delete(key);
    this.storage?.removeItem(key);
  }

  getDefaultViewport(): TimelineViewportState {
    return { ...DEFAULT_VIEWPORT };
  }

  private buildKey(workspaceId: string): string {
    return `mastercrafter.timelineViewport.${workspaceId}`;
  }

  private parseViewport(raw: string): TimelineViewportState | null {
    try {
      const parsed = JSON.parse(raw) as Partial<TimelineViewportState>;
      return this.normalizeViewport(parsed);
    } catch {
      return null;
    }
  }

  private normalizeViewport(viewport: Partial<TimelineViewportState> & { scale?: number }): TimelineViewportState {
    const rawZoomX = typeof viewport.zoomX === "number" ? viewport.zoomX : typeof viewport.scale === "number" ? viewport.scale : DEFAULT_VIEWPORT.zoomX;
    const rawTranslateX = typeof viewport.translateX === "number" ? viewport.translateX : DEFAULT_VIEWPORT.translateX;
    const rawTranslateY = typeof viewport.translateY === "number" ? viewport.translateY : DEFAULT_VIEWPORT.translateY;
    const zoomX = Number.isFinite(rawZoomX) && rawZoomX > 0 ? rawZoomX : DEFAULT_VIEWPORT.zoomX;
    const translateX = Number.isFinite(rawTranslateX) ? rawTranslateX : DEFAULT_VIEWPORT.translateX;
    const translateY = Number.isFinite(rawTranslateY) ? rawTranslateY : DEFAULT_VIEWPORT.translateY;

    return {
      zoomX,
      translateX,
      translateY,
    };
  }
}
