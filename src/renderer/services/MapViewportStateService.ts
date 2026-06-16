export interface MapViewportState {
  scale: number;
  translateX: number;
  translateY: number;
}

const DEFAULT_VIEWPORT: MapViewportState = {
  scale: 1,
  translateX: 0,
  translateY: 0,
};

export class MapViewportStateService {
  private static instance: MapViewportStateService | null = null;
  private readonly storage: Storage | null;
  private readonly cache = new Map<string, MapViewportState>();

  private constructor(storage: Storage | null = typeof window !== "undefined" ? window.localStorage : null) {
    this.storage = storage;
  }

  static getInstance(): MapViewportStateService {
    if (!MapViewportStateService.instance) {
      MapViewportStateService.instance = new MapViewportStateService();
    }

    return MapViewportStateService.instance;
  }

  loadViewport(workspaceId: string, mapId: string): MapViewportState | null {
    const key = this.buildKey(workspaceId, mapId);
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

  saveViewport(workspaceId: string, mapId: string, viewport: MapViewportState): void {
    const normalized = this.normalizeViewport(viewport);
    const key = this.buildKey(workspaceId, mapId);
    this.cache.set(key, normalized);
    this.storage?.setItem(key, JSON.stringify(normalized));
  }

  clearViewport(workspaceId: string, mapId: string): void {
    const key = this.buildKey(workspaceId, mapId);
    this.cache.delete(key);
    this.storage?.removeItem(key);
  }

  getDefaultViewport(): MapViewportState {
    return { ...DEFAULT_VIEWPORT };
  }

  private buildKey(workspaceId: string, mapId: string): string {
    return `mastercrafter.mapViewport.${workspaceId}.${mapId}`;
  }

  private parseViewport(raw: string): MapViewportState | null {
    try {
      const parsed = JSON.parse(raw) as Partial<MapViewportState>;
      return this.normalizeViewport(parsed);
    } catch {
      return null;
    }
  }

  private normalizeViewport(viewport: Partial<MapViewportState>): MapViewportState {
    const rawScale = typeof viewport.scale === "number" ? viewport.scale : DEFAULT_VIEWPORT.scale;
    const rawTranslateX = typeof viewport.translateX === "number" ? viewport.translateX : DEFAULT_VIEWPORT.translateX;
    const rawTranslateY = typeof viewport.translateY === "number" ? viewport.translateY : DEFAULT_VIEWPORT.translateY;
    const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : DEFAULT_VIEWPORT.scale;
    const translateX = Number.isFinite(rawTranslateX) ? rawTranslateX : DEFAULT_VIEWPORT.translateX;
    const translateY = Number.isFinite(rawTranslateY) ? rawTranslateY : DEFAULT_VIEWPORT.translateY;

    return {
      scale,
      translateX,
      translateY,
    };
  }
}
