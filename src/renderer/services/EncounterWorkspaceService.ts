import { reactive } from "vue";

export type EncounterWorkspaceScreen = "library" | "builder" | "play" | "npc-library" | "player-library";

export interface EncounterWorkspaceState {
  screen: EncounterWorkspaceScreen;
  selectedEncounterId: string | null;
  selectedSessionId: string | null;
  selectedCombatantId: string | null;
  selectedNpcLibraryEntryId: string | null;
  selectedPlayerLibraryEntryId: string | null;
}

const DEFAULT_STATE: EncounterWorkspaceState = {
  screen: "library",
  selectedEncounterId: null,
  selectedSessionId: null,
  selectedCombatantId: null,
  selectedNpcLibraryEntryId: null,
  selectedPlayerLibraryEntryId: null,
};

export class EncounterWorkspaceService {
  private static instance: EncounterWorkspaceService | null = null;
  private readonly state = reactive<EncounterWorkspaceState>({ ...DEFAULT_STATE });

  private constructor() {}

  static getInstance(): EncounterWorkspaceService {
    if (!EncounterWorkspaceService.instance) {
      EncounterWorkspaceService.instance = new EncounterWorkspaceService();
    }

    return EncounterWorkspaceService.instance;
  }

  get workspaceState(): EncounterWorkspaceState {
    return this.state;
  }

  openLibrary(): void {
    this.state.screen = "library";
    this.state.selectedEncounterId = null;
    this.state.selectedSessionId = null;
    this.state.selectedCombatantId = null;
    this.state.selectedNpcLibraryEntryId = null;
    this.state.selectedPlayerLibraryEntryId = null;
  }

  openBuilder(encounterId: string | null = null): void {
    this.state.screen = "builder";
    this.state.selectedEncounterId = encounterId;
    this.state.selectedSessionId = null;
    this.state.selectedCombatantId = null;
    this.state.selectedNpcLibraryEntryId = null;
    this.state.selectedPlayerLibraryEntryId = null;
  }

  openPlay(encounterId: string | null = null, sessionId: string | null = null): void {
    this.state.screen = "play";
    this.state.selectedEncounterId = encounterId;
    this.state.selectedSessionId = sessionId;
    this.state.selectedCombatantId = null;
    this.state.selectedNpcLibraryEntryId = null;
    this.state.selectedPlayerLibraryEntryId = null;
  }

  openNpcLibrary(entryId: string | null = null): void {
    this.state.screen = "npc-library";
    this.state.selectedNpcLibraryEntryId = entryId;
    this.state.selectedEncounterId = null;
    this.state.selectedSessionId = null;
    this.state.selectedCombatantId = null;
    this.state.selectedPlayerLibraryEntryId = null;
  }

  openPlayerLibrary(entryId: string | null = null): void {
    this.state.screen = "player-library";
    this.state.selectedPlayerLibraryEntryId = entryId;
    this.state.selectedEncounterId = null;
    this.state.selectedSessionId = null;
    this.state.selectedCombatantId = null;
    this.state.selectedNpcLibraryEntryId = null;
  }

  selectEncounter(encounterId: string | null): void {
    this.state.selectedEncounterId = encounterId;
  }

  selectSession(sessionId: string | null): void {
    this.state.selectedSessionId = sessionId;
  }

  selectCombatant(combatantId: string | null): void {
    this.state.selectedCombatantId = combatantId;
  }

  selectNpcLibraryEntry(entryId: string | null): void {
    this.state.selectedNpcLibraryEntryId = entryId;
  }

  selectPlayerLibraryEntry(entryId: string | null): void {
    this.state.selectedPlayerLibraryEntryId = entryId;
  }

  reset(): void {
    Object.assign(this.state, DEFAULT_STATE);
  }
}

export const encounterWorkspaceService = EncounterWorkspaceService.getInstance();
