import { computed, reactive, watch } from "vue";
import type {
  BacklinkDto,
  CampaignCalendarDto,
  CampaignSnapshotDto,
  CreateWorkspaceInputDto,
  EntityDto,
  EntityInputDto,
  EntityTypeDefinitionDto,
  EntityTypeDefinitionInputDto,
  ExportBundleInputDto,
  ImportBundleInputDto,
  ImportImageInputDto,
  ItemDto,
  ItemInputDto,
  EncounterCombatantDto,
  EncounterCombatantInputDto,
  EncounterDto,
  EncounterInputDto,
  EncounterNpcLibraryEntryDto,
  EncounterNpcLibraryInputDto,
  EncounterPlayerLibraryEntryDto,
  EncounterPlayerLibraryInputDto,
  EncounterSessionDto,
  EncounterSessionInputDto,
  MapDto,
  MapInputDto,
  MapPlacementDto,
  MapPlacementInputDto,
  NoteDto,
  NoteInputDto,
  QuestNodeDto,
  QuestNodeInputDto,
  QuestlineDto,
  QuestlineInputDto,
  RelationEdgeDto,
  RelationEdgeInputDto,
  SearchResultDto,
  StoreStockDto,
  StoreStockInputDto,
  TimelineEventDto,
  TimelineEventInputDto,
  UpdateCalendarInputDto,
  UpdateWorkspaceMetadataInputDto,
  WorkspaceSummaryDto,
} from "@shared/contracts";
import { createId, slugify } from "@shared/utils";

type WorkspaceView = "map" | "notes" | "timeline" | "calendar" | "graph" | "types" | "encounters";

interface MasterCrafterState {
  loading: boolean;
  error: string | null;
  workspaces: WorkspaceSummaryDto[];
  activeWorkspaceId: string | null;
  snapshot: CampaignSnapshotDto | null;
  activeView: WorkspaceView;
  selectedMapId: string | null;
  selectedPlacementId: string | null;
  selectedEntityId: string | null;
  selectedEntityTypeId: string | null;
  selectedNoteId: string | null;
  selectedQuestlineId: string | null;
  selectedQuestNodeId: string | null;
  selectedTimelineEventId: string | null;
  selectedRelationId: string | null;
  selectedItemId: string | null;
  selectedStoreEntityId: string | null;
  searchTerm: string;
  searchResults: SearchResultDto[];
  backlinks: BacklinkDto[];
}

const state = reactive<MasterCrafterState>({
  loading: false,
  error: null,
  workspaces: [],
  activeWorkspaceId: null,
  snapshot: null,
  activeView: "map",
  selectedMapId: null,
  selectedPlacementId: null,
  selectedEntityId: null,
  selectedEntityTypeId: null,
  selectedNoteId: null,
  selectedQuestlineId: null,
  selectedQuestNodeId: null,
  selectedTimelineEventId: null,
  selectedRelationId: null,
  selectedItemId: null,
  selectedStoreEntityId: null,
  searchTerm: "",
  searchResults: [],
  backlinks: [],
});

let searchTimer: number | null = null;

function activeWorkspace(): WorkspaceSummaryDto | null {
  return state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? null;
}

function activeSnapshot(): CampaignSnapshotDto | null {
  return state.snapshot;
}

function getSelectedEntity(): EntityDto | null {
  if (!state.snapshot || !state.selectedEntityId) {
    return null;
  }

  return state.snapshot.entities.find((entity) => entity.id === state.selectedEntityId) ?? null;
}

function getSelectedNote(): NoteDto | null {
  if (!state.snapshot || !state.selectedNoteId) {
    return null;
  }

  return state.snapshot.notes.find((note) => note.id === state.selectedNoteId) ?? null;
}

function getSelectedMap(): MapDto | null {
  if (!state.snapshot || !state.selectedMapId) {
    return null;
  }

  return state.snapshot.maps.find((map) => map.id === state.selectedMapId) ?? null;
}

function reconcileSelection(snapshot: CampaignSnapshotDto): void {
  if (state.selectedEntityId && !snapshot.entities.some((entity) => entity.id === state.selectedEntityId)) {
    state.selectedEntityId = null;
  }

  if (state.selectedNoteId && !snapshot.notes.some((note) => note.id === state.selectedNoteId)) {
    state.selectedNoteId = null;
  }

  if (state.selectedQuestlineId && !snapshot.questlines.some((questline) => questline.id === state.selectedQuestlineId)) {
    state.selectedQuestlineId = null;
  }

  if (state.selectedQuestNodeId && !snapshot.questNodes.some((node) => node.id === state.selectedQuestNodeId)) {
    state.selectedQuestNodeId = null;
  }

  if (state.selectedTimelineEventId && !snapshot.timelineEvents.some((event) => event.id === state.selectedTimelineEventId)) {
    state.selectedTimelineEventId = null;
  }

  if (state.selectedRelationId && !snapshot.relations.some((relation) => relation.id === state.selectedRelationId)) {
    state.selectedRelationId = null;
  }

  if (state.selectedItemId && !snapshot.items.some((item) => item.id === state.selectedItemId)) {
    state.selectedItemId = null;
  }

  if (state.selectedEntityTypeId && !snapshot.entityTypes.some((entityType) => entityType.id === state.selectedEntityTypeId)) {
    state.selectedEntityTypeId = null;
  }
}

function syncQuestSelectionFromTimelineEvent(eventId: string): void {
  const snapshot = state.snapshot;
  if (!snapshot) {
    return;
  }

  const event = snapshot.timelineEvents.find((entry) => entry.id === eventId);
  if (!event?.questNodeId) {
    return;
  }

  const questNode = snapshot.questNodes.find((entry) => entry.id === event.questNodeId);
  if (!questNode) {
    return;
  }

  state.selectedQuestNodeId = questNode.id;
  state.selectedQuestlineId = questNode.questlineId;
}

function ensureSelectionFromSnapshot(snapshot: CampaignSnapshotDto): void {
  if (!state.selectedMapId && snapshot.maps.length > 0) {
    state.selectedMapId = snapshot.maps[0].id;
    state.activeView = "map";
  }

  if (state.selectedPlacementId && state.selectedMapId) {
    const validPlacement = snapshot.placements.find((placement) => placement.id === state.selectedPlacementId && placement.mapId === state.selectedMapId);
    if (!validPlacement) {
      state.selectedPlacementId = null;
    }
  }

  if (!state.selectedEntityId && snapshot.entities.length > 0) {
    state.selectedEntityId = snapshot.entities[0].id;
  }

  if (!state.selectedNoteId && snapshot.notes.length > 0) {
    state.selectedNoteId = snapshot.notes[0].id;
    if (!snapshot.maps.length) {
      state.activeView = "notes";
    }
  }

  if (!state.selectedQuestlineId && snapshot.questlines.length > 0) {
    state.selectedQuestlineId = snapshot.questlines[0].id;
  }

  if (!state.selectedQuestNodeId && snapshot.questNodes.length > 0) {
    state.selectedQuestNodeId = snapshot.questNodes[0].id;
  }

  if (!state.selectedTimelineEventId && snapshot.timelineEvents.length > 0) {
    state.selectedTimelineEventId = snapshot.timelineEvents[0].id;
  }

  if (!state.selectedRelationId && snapshot.relations.length > 0) {
    state.selectedRelationId = snapshot.relations[0].id;
  }

  if (!state.selectedItemId && snapshot.items.length > 0) {
    state.selectedItemId = snapshot.items[0].id;
  }

  if (!state.selectedEntityTypeId && snapshot.entityTypes.length > 0) {
    state.selectedEntityTypeId = snapshot.entityTypes[0].id;
  }
}

async function refreshBacklinks(): Promise<void> {
  const workspace = activeWorkspace();
  const snapshot = activeSnapshot();
  if (!workspace || !snapshot) {
    state.backlinks = [];
    return;
  }

  const entity = getSelectedEntity();
  if (entity) {
    state.backlinks = await window.masterCrafter.content.backlinks(workspace.id, entity.slug);
    return;
  }

  const note = getSelectedNote();
  if (note) {
    state.backlinks = await window.masterCrafter.content.backlinks(workspace.id, note.slug);
    return;
  }

  const map = getSelectedMap();
  if (map) {
    state.backlinks = await window.masterCrafter.content.backlinks(workspace.id, slugify(map.title));
    return;
  }

  state.backlinks = [];
}

async function refreshSearch(): Promise<void> {
  const workspace = activeWorkspace();
  if (!workspace || !state.searchTerm.trim()) {
    state.searchResults = [];
    return;
  }

  state.searchResults = await window.masterCrafter.search.query({
    workspaceId: workspace.id,
    term: state.searchTerm,
    limit: 24,
  });
}

async function loadWorkspaces(): Promise<void> {
  state.workspaces = await window.masterCrafter.registry.listWorkspaces();
}

function closeWorkspace(): void {
  state.activeWorkspaceId = null;
  state.snapshot = null;
  state.selectedMapId = null;
  state.selectedPlacementId = null;
  state.selectedEntityId = null;
  state.selectedEntityTypeId = null;
  state.selectedNoteId = null;
  state.selectedQuestlineId = null;
  state.selectedQuestNodeId = null;
  state.selectedTimelineEventId = null;
  state.selectedRelationId = null;
  state.selectedItemId = null;
  state.selectedStoreEntityId = null;
  state.searchResults = [];
  state.backlinks = [];
}

async function openWorkspace(workspaceId: string): Promise<void> {
  state.loading = true;
  state.error = null;

  try {
    const snapshot = await window.masterCrafter.registry.openWorkspace(workspaceId);
    state.activeWorkspaceId = workspaceId;
    state.snapshot = snapshot;
    ensureSelectionFromSnapshot(snapshot);
    state.workspaces = await window.masterCrafter.registry.listWorkspaces();
    await refreshBacklinks();
    await refreshSearch();
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Unable to open workspace.";
  } finally {
    state.loading = false;
  }
}

async function createWorkspace(input: CreateWorkspaceInputDto): Promise<void> {
  state.loading = true;
  state.error = null;

  try {
    await window.masterCrafter.registry.createWorkspace(input);
    state.workspaces = await window.masterCrafter.registry.listWorkspaces();
    closeWorkspace();
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Unable to create workspace.";
  } finally {
    state.loading = false;
  }
}

async function importBundle(input: ImportBundleInputDto): Promise<void> {
  state.loading = true;
  state.error = null;

  try {
    await window.masterCrafter.registry.importBundle(input);
    state.workspaces = await window.masterCrafter.registry.listWorkspaces();
    closeWorkspace();
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Unable to import campaign bundle.";
  } finally {
    state.loading = false;
  }
}

async function exportBundle(input: ExportBundleInputDto): Promise<void> {
  await window.masterCrafter.registry.exportBundle(input);
}

async function saveWorkspaceMetadata(input: UpdateWorkspaceMetadataInputDto): Promise<void> {
  const updated = await window.masterCrafter.workspace.updateMetadata(input);
  state.workspaces = state.workspaces.map((workspace) => (workspace.id === updated.id ? { ...workspace, ...updated } : workspace));
  if (state.snapshot && state.activeWorkspaceId === updated.id) {
    state.snapshot.workspace = { ...state.snapshot.workspace, ...updated };
  }
}

async function saveCalendar(calendar: CampaignCalendarDto): Promise<void> {
  const workspace = activeWorkspace();
  if (!workspace) {
    return;
  }

  const snapshot = await window.masterCrafter.workspace.updateCalendar({
    workspaceId: workspace.id,
    calendar,
  });

  state.snapshot = snapshot;
  await refreshBacklinks();
}

async function refreshSnapshot(): Promise<void> {
  const workspace = activeWorkspace();
  if (!workspace) {
    return;
  }

  const snapshot = await window.masterCrafter.workspace.snapshot(workspace.id);
  state.snapshot = snapshot;
  reconcileSelection(snapshot);
  ensureSelectionFromSnapshot(snapshot);
  await refreshBacklinks();
}

async function saveEntity(input: EntityInputDto): Promise<EntityDto> {
  const saved = await window.masterCrafter.entities.save({
    ...input,
    slug: input.slug || slugify(input.title),
  });
  await refreshSnapshot();
  state.selectedEntityId = saved.id;
  await refreshBacklinks();
  return saved;
}

async function deleteEntity(workspaceId: string, entityId: string): Promise<void> {
  await window.masterCrafter.entities.delete(workspaceId, entityId);
  if (state.selectedEntityId === entityId) {
    state.selectedEntityId = null;
  }

  await refreshSnapshot();
}

async function saveEntityType(input: EntityTypeDefinitionInputDto): Promise<EntityTypeDefinitionDto> {
  const saved = await window.masterCrafter.entityTypes.save(input);
  await refreshSnapshot();
  state.selectedEntityTypeId = saved.id;
  return saved;
}

async function saveMap(input: MapInputDto): Promise<MapDto> {
  const saved = await window.masterCrafter.maps.save(input);
  await refreshSnapshot();
  state.selectedMapId = saved.id;
  return saved;
}

async function importMapImage(input: ImportImageInputDto): Promise<MapDto> {
  const saved = await window.masterCrafter.maps.importImage(input);
  await refreshSnapshot();
  state.selectedMapId = saved.id;
  return saved;
}

async function deleteMap(workspaceId: string, mapId: string): Promise<void> {
  await window.masterCrafter.maps.delete(workspaceId, mapId);
  if (state.selectedMapId === mapId) {
    state.selectedMapId = null;
    state.selectedPlacementId = null;
  }

  await refreshSnapshot();
}

async function savePlacement(input: MapPlacementInputDto): Promise<MapPlacementDto> {
  const saved = await window.masterCrafter.placements.save(input);
  state.selectedMapId = saved.mapId;
  state.selectedPlacementId = saved.id;
  state.activeView = "map";
  await refreshSnapshot();
  state.selectedMapId = saved.mapId;
  state.selectedPlacementId = saved.id;
  return saved;
}

async function deletePlacement(workspaceId: string, mapId: string, placementId: string): Promise<void> {
  await window.masterCrafter.placements.delete(workspaceId, mapId, placementId);
  await refreshSnapshot();
}

async function saveNote(input: NoteInputDto): Promise<NoteDto> {
  const saved = await window.masterCrafter.notes.save(input);
  await refreshSnapshot();
  state.selectedNoteId = saved.id;
  await refreshBacklinks();
  return saved;
}

async function saveQuestline(input: QuestlineInputDto): Promise<QuestlineDto> {
  const saved = await window.masterCrafter.quests.saveQuestline(input);
  await refreshSnapshot();
  state.selectedQuestlineId = saved.id;
  return saved;
}

async function deleteQuestline(workspaceId: string, questlineId: string): Promise<void> {
  await window.masterCrafter.quests.deleteQuestline(workspaceId, questlineId);

  if (state.selectedQuestlineId === questlineId) {
    state.selectedQuestlineId = null;
  }

  const selectedQuestNode = state.snapshot?.questNodes.find((node) => node.id === state.selectedQuestNodeId) ?? null;
  if (selectedQuestNode?.questlineId === questlineId) {
    state.selectedQuestNodeId = null;
  }

  await refreshSnapshot();
}

async function saveQuestNode(input: QuestNodeInputDto): Promise<QuestNodeDto> {
  const saved = await window.masterCrafter.quests.saveNode(input);
  await refreshSnapshot();
  state.selectedQuestNodeId = saved.id;
  return saved;
}

async function deleteQuestNode(workspaceId: string, questlineId: string, nodeId: string): Promise<void> {
  await window.masterCrafter.quests.deleteNode(workspaceId, questlineId, nodeId);
  await refreshSnapshot();
}

async function saveTimelineEvent(input: TimelineEventInputDto): Promise<TimelineEventDto> {
  const saved = await window.masterCrafter.timeline.save(input);
  await refreshSnapshot();
  state.selectedTimelineEventId = saved.id;
  return saved;
}

async function deleteTimelineEvent(workspaceId: string, eventId: string): Promise<void> {
  await window.masterCrafter.timeline.delete(workspaceId, eventId);
  await refreshSnapshot();
}

async function saveRelation(input: RelationEdgeInputDto): Promise<RelationEdgeDto> {
  const saved = await window.masterCrafter.relations.save(input);
  await refreshSnapshot();
  state.selectedRelationId = saved.id;
  return saved;
}

async function saveItem(input: ItemInputDto): Promise<ItemDto> {
  const saved = await window.masterCrafter.items.save(input);
  await refreshSnapshot();
  state.selectedItemId = saved.id;
  return saved;
}

async function saveEncounter(input: EncounterInputDto): Promise<EncounterDto> {
  const saved = await window.masterCrafter.encounters.save({
    ...input,
    slug: input.slug || slugify(input.name),
  });
  await refreshSnapshot();
  return saved;
}

async function deleteEncounter(workspaceId: string, encounterId: string): Promise<void> {
  await window.masterCrafter.encounters.delete(workspaceId, encounterId);
  await refreshSnapshot();
}

async function saveCombatant(input: EncounterCombatantInputDto): Promise<EncounterCombatantDto> {
  const saved = await window.masterCrafter.encounters.saveCombatant(input);
  await refreshSnapshot();
  return saved;
}

async function deleteCombatant(workspaceId: string, encounterId: string, combatantId: string): Promise<void> {
  await window.masterCrafter.encounters.deleteCombatant(workspaceId, encounterId, combatantId);
  await refreshSnapshot();
}

async function startEncounterSession(workspaceId: string, encounterId: string): Promise<EncounterSessionDto> {
  const saved = await window.masterCrafter.encounters.startSession(workspaceId, encounterId);
  await refreshSnapshot();
  return saved;
}

async function saveEncounterSession(
  input: EncounterSessionInputDto,
  options: { refreshSnapshot?: boolean } = {},
): Promise<EncounterSessionDto> {
  const saved = await window.masterCrafter.encounters.saveSession(input);

  if (options.refreshSnapshot === false) {
    const snapshot = state.snapshot;
    if (snapshot && state.activeWorkspaceId === saved.workspaceId) {
      const existingSession = snapshot.encounterSessions.find((entry: EncounterSessionDto) => entry.id === saved.id);
      if (existingSession) {
        Object.assign(existingSession, saved);
      } else {
        snapshot.encounterSessions.push(saved);
      }
    }

    return saved;
  }

  await refreshSnapshot();
  return saved;
}

async function deleteEncounterSession(workspaceId: string, sessionId: string): Promise<void> {
  await window.masterCrafter.encounters.deleteSession(workspaceId, sessionId);
  await refreshSnapshot();
}

async function saveNpcLibraryEntry(input: EncounterNpcLibraryInputDto): Promise<EncounterNpcLibraryEntryDto> {
  const saved = await window.masterCrafter.npcLibrary.save({
    ...input,
    slug: input.slug || slugify(input.name),
  });
  await refreshSnapshot();
  return saved;
}

async function deleteNpcLibraryEntry(workspaceId: string, npcLibraryEntryId: string): Promise<void> {
  await window.masterCrafter.npcLibrary.delete(workspaceId, npcLibraryEntryId);
  await refreshSnapshot();
}

async function savePlayerLibraryEntry(input: EncounterPlayerLibraryInputDto): Promise<EncounterPlayerLibraryEntryDto> {
  const saved = await window.masterCrafter.playerLibrary.save({
    ...input,
    slug: input.slug || slugify(input.name),
  });
  await refreshSnapshot();
  return saved;
}

async function deletePlayerLibraryEntry(workspaceId: string, playerLibraryEntryId: string): Promise<void> {
  await window.masterCrafter.playerLibrary.delete(workspaceId, playerLibraryEntryId);
  await refreshSnapshot();
}

async function saveStoreStock(input: StoreStockInputDto): Promise<StoreStockDto> {
  const saved = await window.masterCrafter.stores.saveStock(input);
  await refreshSnapshot();
  state.selectedStoreEntityId = saved.storeEntityId;
  return saved;
}

function selectView(view: WorkspaceView): void {
  state.activeView = view;
}

function selectMap(mapId: string): void {
  state.selectedMapId = mapId;
  state.activeView = "map";
  state.selectedPlacementId = null;
  void refreshBacklinks();
}

function selectPlacement(placementId: string): void {
  state.selectedPlacementId = placementId;
  const snapshot = state.snapshot;
  const placement = snapshot?.placements.find((entry) => entry.id === placementId);
  if (placement) {
    state.selectedMapId = placement.mapId;
  }
  state.activeView = "map";
}

function selectEntity(entityId: string): void {
  state.selectedEntityId = entityId;
  void refreshBacklinks();
}

function selectNote(noteId: string): void {
  state.selectedNoteId = noteId;
  state.activeView = "notes";
  void refreshBacklinks();
}

function selectQuestline(questlineId: string): void {
  focusQuestline(questlineId);
  state.activeView = "graph";
}

function focusQuestline(questlineId: string | null): void {
  state.selectedQuestlineId = questlineId;
}

function selectQuestNode(nodeId: string): void {
  focusQuestNode(nodeId);
  state.activeView = "graph";
}

function focusQuestNode(nodeId: string | null): void {
  state.selectedQuestNodeId = nodeId;
  if (!nodeId) {
    return;
  }

  const snapshot = state.snapshot;
  const node = snapshot?.questNodes.find((entry) => entry.id === nodeId);
  if (node) {
    state.selectedQuestlineId = node.questlineId;
  }
}

function selectTimelineEvent(eventId: string): void {
  syncQuestSelectionFromTimelineEvent(eventId);
  state.selectedTimelineEventId = eventId;
  state.activeView = "timeline";
}

function selectRelation(relationId: string): void {
  state.selectedRelationId = relationId;
  state.activeView = "graph";
}

function selectItem(itemId: string): void {
  state.selectedItemId = itemId;
}

function selectEntityType(typeId: string): void {
  state.selectedEntityTypeId = typeId;
  state.activeView = "types";
}

watch(
  () => state.searchTerm,
  () => {
    if (searchTimer !== null) {
      window.clearTimeout(searchTimer);
    }

    searchTimer = window.setTimeout(() => {
      void refreshSearch();
    }, 180);
  },
);

export function useMasterCrafter() {
  return {
    state: computed(() => state),
    workspaces: computed(() => state.workspaces),
    activeWorkspace,
    activeSnapshot,
    getSelectedEntity,
    getSelectedNote,
    getSelectedMap,
    loadWorkspaces,
    closeWorkspace,
    openWorkspace,
    createWorkspace,
    importBundle,
    exportBundle,
    saveWorkspaceMetadata,
    saveCalendar,
    refreshSnapshot,
    saveEntity,
    deleteEntity,
    saveEntityType,
    saveMap,
    importMapImage,
    deleteMap,
    savePlacement,
    deletePlacement,
    saveNote,
    saveQuestline,
    deleteQuestline,
    saveQuestNode,
    deleteQuestNode,
    saveTimelineEvent,
    deleteTimelineEvent,
    saveRelation,
    saveItem,
    saveEncounter,
    deleteEncounter,
    saveCombatant,
    deleteCombatant,
    startEncounterSession,
    saveEncounterSession,
    deleteEncounterSession,
    saveNpcLibraryEntry,
    deleteNpcLibraryEntry,
    savePlayerLibraryEntry,
    deletePlayerLibraryEntry,
    saveStoreStock,
    selectView,
    selectMap,
    selectPlacement,
    selectEntity,
    selectNote,
    selectQuestline,
    focusQuestline,
    selectQuestNode,
    focusQuestNode,
    selectTimelineEvent,
    selectRelation,
    selectItem,
    selectEntityType,
    refreshBacklinks,
  };
}
