import { reactive } from "vue";

export type NpcEditorMode = "create" | "edit";

export interface NpcEditorState {
  open: boolean;
  mode: NpcEditorMode;
  entityId: string | null;
}

const DEFAULT_STATE: NpcEditorState = {
  open: false,
  mode: "create",
  entityId: null,
};

export class NpcEditorService {
  private static instance: NpcEditorService | null = null;
  private readonly state = reactive<NpcEditorState>({ ...DEFAULT_STATE });

  private constructor() {}

  static getInstance(): NpcEditorService {
    if (!NpcEditorService.instance) {
      NpcEditorService.instance = new NpcEditorService();
    }

    return NpcEditorService.instance;
  }

  get editorState(): NpcEditorState {
    return this.state;
  }

  openCreate(): void {
    Object.assign(this.state, {
      open: true,
      mode: "create",
      entityId: null,
    });
  }

  openEdit(entityId: string): void {
    Object.assign(this.state, {
      open: true,
      mode: "edit",
      entityId,
    });
  }

  close(): void {
    Object.assign(this.state, DEFAULT_STATE);
  }
}

export const npcEditorService = NpcEditorService.getInstance();
