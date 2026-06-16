export interface QuestlineLaneLayoutState {
  widthPx: number;
  offsetXPx: number;
}

type QuestlineLaneLayoutMap = Record<string, QuestlineLaneLayoutState>;

const DEFAULT_LAYOUT_STATE: Readonly<QuestlineLaneLayoutState> = Object.freeze({
  widthPx: 0,
  offsetXPx: 0,
});

export class QuestlineLaneLayoutStateService {
  private static instance: QuestlineLaneLayoutStateService | null = null;
  private readonly storage: Storage | null;
  private readonly cache = new Map<string, QuestlineLaneLayoutMap>();

  private constructor(storage: Storage | null = typeof window !== "undefined" ? window.localStorage : null) {
    this.storage = storage;
  }

  static getInstance(): QuestlineLaneLayoutStateService {
    if (!QuestlineLaneLayoutStateService.instance) {
      QuestlineLaneLayoutStateService.instance = new QuestlineLaneLayoutStateService();
    }

    return QuestlineLaneLayoutStateService.instance;
  }

  loadWorkspaceLayouts(workspaceId: string): QuestlineLaneLayoutMap {
    const key = this.buildKey(workspaceId);
    const cached = this.cache.get(key);
    if (cached) {
      return this.cloneLayouts(cached);
    }

    const raw = this.storage?.getItem(key);
    if (!raw) {
      return {};
    }

    const parsed = this.parseLayouts(raw);
    if (!parsed) {
      return {};
    }

    this.cache.set(key, parsed);
    return this.cloneLayouts(parsed);
  }

  loadLayout(workspaceId: string, laneId: string): QuestlineLaneLayoutState | null {
    const layouts = this.loadWorkspaceLayouts(workspaceId);
    return layouts[laneId] ? { ...layouts[laneId] } : null;
  }

  saveWorkspaceLayouts(workspaceId: string, layouts: QuestlineLaneLayoutMap): void {
    const normalized = this.normalizeLayouts(layouts);
    const key = this.buildKey(workspaceId);
    this.cache.set(key, normalized);
    this.storage?.setItem(key, JSON.stringify(normalized));
  }

  saveLayout(workspaceId: string, laneId: string, layout: QuestlineLaneLayoutState): void {
    const layouts = this.loadWorkspaceLayouts(workspaceId);
    layouts[laneId] = this.normalizeLayout(layout);
    this.saveWorkspaceLayouts(workspaceId, layouts);
  }

  removeLayout(workspaceId: string, laneId: string): void {
    const layouts = this.loadWorkspaceLayouts(workspaceId);
    if (!(laneId in layouts)) {
      return;
    }

    delete layouts[laneId];
    this.saveWorkspaceLayouts(workspaceId, layouts);
  }

  clearWorkspaceLayouts(workspaceId: string): void {
    const key = this.buildKey(workspaceId);
    this.cache.delete(key);
    this.storage?.removeItem(key);
  }

  getDefaultLayout(): QuestlineLaneLayoutState {
    return { ...DEFAULT_LAYOUT_STATE };
  }

  private buildKey(workspaceId: string): string {
    return `mastercrafter.questlineLaneLayouts.${workspaceId}`;
  }

  private parseLayouts(raw: string): QuestlineLaneLayoutMap | null {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }

      return this.normalizeLayouts(parsed as Record<string, Partial<QuestlineLaneLayoutState>>);
    } catch {
      return null;
    }
  }

  private normalizeLayouts(layouts: Record<string, Partial<QuestlineLaneLayoutState>>): QuestlineLaneLayoutMap {
    const normalized: QuestlineLaneLayoutMap = {};

    for (const [laneId, layout] of Object.entries(layouts)) {
      normalized[laneId] = this.normalizeLayout(layout);
    }

    return normalized;
  }

  private cloneLayouts(layouts: QuestlineLaneLayoutMap): QuestlineLaneLayoutMap {
    const cloned: QuestlineLaneLayoutMap = {};
    for (const [laneId, layout] of Object.entries(layouts)) {
      cloned[laneId] = { ...layout };
    }

    return cloned;
  }

  private normalizeLayout(layout: Partial<QuestlineLaneLayoutState>): QuestlineLaneLayoutState {
    const rawWidthPx = typeof layout.widthPx === "number" ? layout.widthPx : DEFAULT_LAYOUT_STATE.widthPx;
    const rawOffsetXPx = typeof layout.offsetXPx === "number" ? layout.offsetXPx : DEFAULT_LAYOUT_STATE.offsetXPx;
    const widthPx = Number.isFinite(rawWidthPx) && rawWidthPx >= 0 ? rawWidthPx : DEFAULT_LAYOUT_STATE.widthPx;
    const offsetXPx = Number.isFinite(rawOffsetXPx) ? rawOffsetXPx : DEFAULT_LAYOUT_STATE.offsetXPx;

    return {
      widthPx,
      offsetXPx,
    };
  }
}
