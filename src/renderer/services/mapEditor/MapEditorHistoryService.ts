export interface MapEditorHistoryEntry {
  description: string;
  undo: () => void | Promise<void>;
}

const DEFAULT_MAX_ENTRIES = 100;

export class MapEditorHistoryService {
  private static instance: MapEditorHistoryService | null = null;
  private readonly stacks = new Map<string, MapEditorHistoryEntry[]>();
  private readonly maxEntries: number;

  private constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  static getInstance(): MapEditorHistoryService {
    if (!MapEditorHistoryService.instance) {
      MapEditorHistoryService.instance = new MapEditorHistoryService();
    }

    return MapEditorHistoryService.instance;
  }

  createScopeKey(workspaceId: string, mapId: string): string {
    return `mastercrafter.mapEditor.${workspaceId}.${mapId}`;
  }

  push(scopeKey: string, entry: MapEditorHistoryEntry): void {
    if (!scopeKey) {
      return;
    }

    const stack = this.stacks.get(scopeKey) ?? [];
    stack.push({
      description: entry.description,
      undo: entry.undo,
    });

    if (stack.length > this.maxEntries) {
      stack.splice(0, stack.length - this.maxEntries);
    }

    this.stacks.set(scopeKey, stack);
  }

  async undo(scopeKey: string): Promise<boolean> {
    const stack = this.stacks.get(scopeKey);
    if (!stack?.length) {
      return false;
    }

    const entry = stack[stack.length - 1];
    try {
      await entry.undo();
      stack.pop();
      if (!stack.length) {
        this.stacks.delete(scopeKey);
      }
      return true;
    } catch (error) {
      console.error(`Failed to undo map editor action: ${entry.description}.`, error);
      return false;
    }
  }

  clearScope(scopeKey: string): void {
    this.stacks.delete(scopeKey);
  }

  clearAll(): void {
    this.stacks.clear();
  }

  getDepth(scopeKey: string): number {
    return this.stacks.get(scopeKey)?.length ?? 0;
  }
}

export const mapEditorHistoryService = MapEditorHistoryService.getInstance();
