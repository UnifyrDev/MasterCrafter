export type EntityKind =
  | "npc"
  | "landmark"
  | "shrine"
  | "store"
  | "event"
  | "item"
  | "note"
  | "quest"
  | "custom";

export type MapPlacementKind = "point" | "region" | "path";

export type RelationKind =
  | "parent"
  | "child"
  | "spouse"
  | "sibling"
  | "adopted_parent"
  | "adopted_child"
  | "guardian"
  | "step_parent"
  | "step_child"
  | "custom";

export type QuestRewardKind = "gold" | "xp" | "item" | "reputation" | "note" | "flag";

export type TimelineLaneKind = "global" | "entity" | "quest" | "location";

export type CalendarCycleLabel = "months" | "seasons";

export type NoteKind = "markdown" | "entity_description" | "quest_note";

export type EncounterCombatantSourceKind = "npc" | "player" | "custom";

export type EncounterCombatantTeam = "party" | "enemy" | "neutral";

export type EncounterSessionStatus = "active" | "paused" | "completed";

export type EncounterInitiativeMode = "with-bonus" | "without-bonus";

export interface WorkspaceSummaryDto {
  id: string;
  name: string;
  slug: string;
  description: string;
  folderPath: string;
  dbPath: string;
  assetPath: string;
  calendarName: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
}

export interface CalendarMonthDefinitionDto {
  name: string;
  days: number;
}

export interface CampaignCalendarDto {
  name: string;
  epochLabel: string;
  months: CalendarMonthDefinitionDto[];
  weekdays: string[];
  hoursPerDay: number;
  minutesPerHour: number;
  timezoneLabel: string;
  cycleLabel?: CalendarCycleLabel;
}

export interface CalendarStampDto {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export interface CustomFieldDefinitionDto {
  id: string;
  key: string;
  label: string;
  kind: "text" | "textarea" | "number" | "boolean" | "date" | "select" | "relation" | "image";
  required: boolean;
  options: string[];
  linkedTypeKey: string | null;
  defaultValue: string | number | boolean | null;
}

export interface NpcStatblockAbilityScoresDto {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface NpcStatblockFeatureDto {
  name: string;
  text: string;
}

export interface NpcStatblockDto {
  size: string;
  creatureType: string;
  alignment: string;
  armorClass: string;
  hitPoints: string;
  speed: string;
  abilities: NpcStatblockAbilityScoresDto;
  savingThrows: string;
  skills: string;
  damageVulnerabilities: string;
  damageResistances: string;
  damageImmunities: string;
  conditionImmunities: string;
  senses: string;
  languages: string;
  challenge: string;
  traits: NpcStatblockFeatureDto[];
  actions: NpcStatblockFeatureDto[];
  reactions: NpcStatblockFeatureDto[];
  legendaryActions: NpcStatblockFeatureDto[];
}

export interface EntityTypeDefinitionDto {
  id: string;
  workspaceId: string;
  typeKey: string;
  displayName: string;
  icon: string;
  color: string;
  description: string;
  builtin: boolean;
  fieldDefinitions: CustomFieldDefinitionDto[];
  createdAt: string;
  updatedAt: string;
}

export interface EntityDto {
  id: string;
  workspaceId: string;
  typeKey: string;
  title: string;
  slug: string;
  subtitle: string;
  description: string;
  markdown: string;
  imageAssetId: string | null;
  imageAssetPath: string | null;
  tags: string[];
  linkedMapId: string | null;
  linkedPlacementId: string | null;
  questlineId: string | null;
  familyTreeRootId: string | null;
  customFields: Record<string, unknown>;
  npcStatblock: NpcStatblockDto | null;
  createdAt: string;
  updatedAt: string;
}

export interface MapDto {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  assetId: string;
  assetName: string;
  assetPath: string;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
}

export interface MapGeometryPointDto {
  x: number;
  y: number;
}

export interface MapPlacementGeometryDto {
  kind: MapPlacementKind;
  point: MapGeometryPointDto | null;
  points: MapGeometryPointDto[];
  radius: number;
  width: number;
  height: number;
}

export interface MapPlacementDto {
  id: string;
  workspaceId: string;
  mapId: string;
  entityId: string | null;
  label: string;
  kind: MapPlacementKind;
  geometry: MapPlacementGeometryDto;
  textWidth: number;
  textHeight: number;
  textOffsetX: number;
  textOffsetY: number;
  notes: string;
  color: string;
  glowColor: string;
  shadowColor: string;
  scale: number;
  fontColor: string;
  zIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface NoteDto {
  id: string;
  workspaceId: string;
  title: string;
  slug: string;
  kind: NoteKind;
  body: string;
  tags: string[];
  linkedEntityIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface QuestRewardDto {
  kind: QuestRewardKind;
  value: string;
  amount: number;
  notes: string;
}

export interface QuestlineDto {
  id: string;
  workspaceId: string;
  anchorEntityId: string | null;
  title: string;
  description: string;
  status: "draft" | "active" | "completed";
  createdAt: string;
  updatedAt: string;
}

export interface QuestNodeDto {
  id: string;
  workspaceId: string;
  questlineId: string;
  parentNodeId: string | null;
  title: string;
  description: string;
  rewards: QuestRewardDto[];
  orderIndex: number;
  stamp: CalendarStampDto | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineEventDto {
  id: string;
  workspaceId: string;
  entityId: string | null;
  questNodeId: string | null;
  title: string;
  description: string;
  eventType: string;
  laneKind: TimelineLaneKind;
  laneLabel: string;
  stamp: CalendarStampDto;
  durationMinutes: number;
  locationEntityId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RelationEdgeDto {
  id: string;
  workspaceId: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationKind: RelationKind;
  label: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ItemDto {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  worth: number;
  rarity: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EncounterDto {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string;
  notes: string;
  mapId: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EncounterInputDto {
  workspaceId: string;
  id?: string;
  name: string;
  slug: string;
  description: string;
  notes: string;
  mapId: string | null;
  tags: string[];
}

export interface EncounterCombatantDto {
  id: string;
  workspaceId: string;
  encounterId: string;
  sourceKind: EncounterCombatantSourceKind;
  sourceId: string | null;
  team: EncounterCombatantTeam;
  name: string;
  quantity: number;
  initiativeBonus: number;
  armorClass: number;
  hitPoints: number;
  speed: string;
  level: number | null;
  challengeRating: string;
  notes: string;
  sortIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface EncounterCombatantInputDto {
  workspaceId: string;
  encounterId: string;
  id?: string;
  sourceKind: EncounterCombatantSourceKind;
  sourceId: string | null;
  team: EncounterCombatantTeam;
  name: string;
  quantity: number;
  initiativeBonus: number;
  armorClass: number;
  hitPoints: number;
  speed: string;
  level: number | null;
  challengeRating: string;
  notes: string;
  sortIndex: number;
}

export interface EncounterSessionCombatantDto {
  id: string;
  encounterCombatantId: string;
  sourceKind: EncounterCombatantSourceKind;
  sourceId: string | null;
  team: EncounterCombatantTeam;
  name: string;
  groupName: string;
  groupIndex: number;
  groupSize: number;
  initiativeBonus: number;
  initiativeMode: EncounterInitiativeMode | null;
  initiativeRoll: number | null;
  initiativeScore: number | null;
  armorClass: number;
  maxHitPoints: number;
  currentHitPoints: number;
  tempHitPoints: number;
  speed: string;
  level: number | null;
  challengeRating: string;
  notes: string;
  conditions: EncounterConditionStateDto[];
  isHidden: boolean;
  isDefeated: boolean;
  sortIndex: number;
}

export interface EncounterConditionStateDto {
  id: string;
  key: string;
  label: string;
  remainingTurns: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface EncounterSessionDto {
  id: string;
  workspaceId: string;
  encounterId: string;
  status: EncounterSessionStatus;
  roundNumber: number;
  currentTurnIndex: number;
  startedAt: string;
  lastAdvancedAt: string;
  endedAt: string | null;
  combatants: EncounterSessionCombatantDto[];
  createdAt: string;
  updatedAt: string;
}

export interface EncounterSessionInputDto {
  id?: string;
  workspaceId: string;
  encounterId: string;
  status: EncounterSessionStatus;
  roundNumber: number;
  currentTurnIndex: number;
  startedAt: string;
  lastAdvancedAt: string;
  endedAt: string | null;
  combatants: EncounterSessionCombatantDto[];
}

export interface EncounterNpcLibraryEntryDto {
  id: string;
  workspaceId: string;
  sourceEntityId: string | null;
  team: EncounterCombatantTeam;
  name: string;
  slug: string;
  challengeRating: string;
  armorClass: number;
  hitPoints: number;
  speed: string;
  initiativeBonus: number;
  notes: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EncounterNpcLibraryInputDto {
  workspaceId: string;
  id?: string;
  sourceEntityId: string | null;
  team: EncounterCombatantTeam;
  name: string;
  slug: string;
  challengeRating: string;
  armorClass: number;
  hitPoints: number;
  speed: string;
  initiativeBonus: number;
  notes: string;
  tags: string[];
}

export interface EncounterPlayerLibraryEntryDto {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  level: number;
  armorClass: number;
  hitPoints: number;
  initiativeBonus: number;
  speed: string;
  notes: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EncounterPlayerLibraryInputDto {
  workspaceId: string;
  id?: string;
  name: string;
  slug: string;
  level: number;
  armorClass: number;
  hitPoints: number;
  initiativeBonus: number;
  speed: string;
  notes: string;
  tags: string[];
}

export interface StoreStockDto {
  id: string;
  workspaceId: string;
  storeEntityId: string;
  itemId: string;
  quantity: number;
  priceOverride: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResultDto {
  recordType: string;
  recordId: string;
  workspaceId: string;
  title: string;
  snippet: string;
  tags: string[];
  typeKey: string;
}

export interface BacklinkDto {
  sourceType: string;
  sourceId: string;
  sourceTitle: string;
  sourceSnippet: string;
  targetKey: string;
  targetType: string;
}

export interface CampaignSnapshotDto {
  workspace: WorkspaceSummaryDto;
  calendar: CampaignCalendarDto;
  entityTypes: EntityTypeDefinitionDto[];
  entities: EntityDto[];
  maps: MapDto[];
  placements: MapPlacementDto[];
  notes: NoteDto[];
  questlines: QuestlineDto[];
  questNodes: QuestNodeDto[];
  timelineEvents: TimelineEventDto[];
  relations: RelationEdgeDto[];
  items: ItemDto[];
  encounters: EncounterDto[];
  encounterCombatants: EncounterCombatantDto[];
  encounterSessions: EncounterSessionDto[];
  npcLibraryEntries: EncounterNpcLibraryEntryDto[];
  playerLibraryEntries: EncounterPlayerLibraryEntryDto[];
  storeStocks: StoreStockDto[];
}

export interface CreateWorkspaceInputDto {
  name: string;
  description: string;
}

export interface RenameWorkspaceInputDto {
  workspaceId: string;
  name: string;
  description: string;
}

export interface UpdateWorkspaceMetadataInputDto {
  workspaceId: string;
  name: string;
  description: string;
}

export interface UpdateCalendarInputDto {
  workspaceId: string;
  calendar: CampaignCalendarDto;
}

export interface ImportImageInputDto {
  workspaceId: string;
  sourceFilePath: string;
  mapTitle: string;
  mapDescription: string;
  mapId?: string;
}

export interface ExportBundleInputDto {
  workspaceId: string;
  outputFilePath: string;
}

export interface ImportBundleInputDto {
  archiveFilePath: string;
}

export interface EntityTypeDefinitionInputDto {
  workspaceId: string;
  id?: string;
  typeKey: string;
  displayName: string;
  icon: string;
  color: string;
  description: string;
  builtin: boolean;
  fieldDefinitions: CustomFieldDefinitionDto[];
}

export interface EntityInputDto {
  workspaceId: string;
  id?: string;
  typeKey: string;
  title: string;
  slug: string;
  subtitle: string;
  description: string;
  markdown: string;
  imageAssetId: string | null;
  tags: string[];
  linkedMapId: string | null;
  linkedPlacementId: string | null;
  questlineId: string | null;
  familyTreeRootId: string | null;
  customFields: Record<string, unknown>;
  npcStatblock: NpcStatblockDto | null;
}

export interface MapInputDto {
  workspaceId: string;
  id?: string;
  title: string;
  description: string;
  assetId: string;
  assetName: string;
  width: number;
  height: number;
}

export interface MapPlacementInputDto {
  workspaceId: string;
  mapId: string;
  id?: string;
  entityId: string | null;
  label: string;
  kind: MapPlacementKind;
  geometry: MapPlacementGeometryDto;
  textWidth: number;
  textHeight: number;
  textOffsetX: number;
  textOffsetY: number;
  notes: string;
  color: string;
  glowColor: string;
  shadowColor: string;
  scale: number;
  fontColor: string;
  zIndex: number;
}

export interface NoteInputDto {
  workspaceId: string;
  id?: string;
  title: string;
  kind: NoteKind;
  body: string;
  tags: string[];
  linkedEntityIds: string[];
}

export interface QuestlineInputDto {
  workspaceId: string;
  id?: string;
  anchorEntityId: string | null;
  title: string;
  description: string;
  status: "draft" | "active" | "completed";
}

export interface QuestNodeInputDto {
  workspaceId: string;
  questlineId: string;
  id?: string;
  parentNodeId: string | null;
  title: string;
  description: string;
  rewards: QuestRewardDto[];
  orderIndex: number;
  stamp?: CalendarStampDto | null;
}

export interface TimelineEventInputDto {
  workspaceId: string;
  id?: string;
  entityId: string | null;
  questNodeId: string | null;
  title: string;
  description: string;
  eventType: string;
  laneKind: TimelineLaneKind;
  laneLabel: string;
  stamp: CalendarStampDto;
  durationMinutes: number;
  locationEntityId: string | null;
}

export interface RelationEdgeInputDto {
  workspaceId: string;
  id?: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationKind: RelationKind;
  label: string;
  notes: string;
}

export interface ItemInputDto {
  workspaceId: string;
  id?: string;
  title: string;
  description: string;
  worth: number;
  rarity: string;
  tags: string[];
}

export interface StoreStockInputDto {
  workspaceId: string;
  id?: string;
  storeEntityId: string;
  itemId: string;
  quantity: number;
  priceOverride: number | null;
  notes: string;
}

export interface SearchQueryInputDto {
  workspaceId: string;
  term: string;
  limit: number;
}

export interface MasterCrafterRegistryApi {
  listWorkspaces(): Promise<WorkspaceSummaryDto[]>;
  createWorkspace(input: CreateWorkspaceInputDto): Promise<WorkspaceSummaryDto>;
  renameWorkspace(input: RenameWorkspaceInputDto): Promise<WorkspaceSummaryDto>;
  deleteWorkspace(workspaceId: string): Promise<void>;
  openWorkspace(workspaceId: string): Promise<CampaignSnapshotDto>;
  importBundle(input: ImportBundleInputDto): Promise<WorkspaceSummaryDto>;
  exportBundle(input: ExportBundleInputDto): Promise<void>;
}

export interface MasterCrafterWorkspaceApi {
  snapshot(workspaceId: string): Promise<CampaignSnapshotDto>;
  updateMetadata(input: UpdateWorkspaceMetadataInputDto): Promise<WorkspaceSummaryDto>;
  updateCalendar(input: UpdateCalendarInputDto): Promise<CampaignSnapshotDto>;
}

export interface MasterCrafterEntityTypeApi {
  list(workspaceId: string): Promise<EntityTypeDefinitionDto[]>;
  save(input: EntityTypeDefinitionInputDto): Promise<EntityTypeDefinitionDto>;
  delete(workspaceId: string, typeId: string): Promise<void>;
}

export interface MasterCrafterEntityApi {
  list(workspaceId: string): Promise<EntityDto[]>;
  save(input: EntityInputDto): Promise<EntityDto>;
  delete(workspaceId: string, entityId: string): Promise<void>;
}

export interface MasterCrafterMapApi {
  list(workspaceId: string): Promise<MapDto[]>;
  save(input: MapInputDto): Promise<MapDto>;
  delete(workspaceId: string, mapId: string): Promise<void>;
  importImage(input: ImportImageInputDto): Promise<MapDto>;
}

export interface MasterCrafterPlacementApi {
  list(workspaceId: string, mapId: string): Promise<MapPlacementDto[]>;
  save(input: MapPlacementInputDto): Promise<MapPlacementDto>;
  delete(workspaceId: string, mapId: string, placementId: string): Promise<void>;
}

export interface MasterCrafterNoteApi {
  list(workspaceId: string): Promise<NoteDto[]>;
  save(input: NoteInputDto): Promise<NoteDto>;
  delete(workspaceId: string, noteId: string): Promise<void>;
}

export interface MasterCrafterQuestApi {
  listQuestlines(workspaceId: string): Promise<QuestlineDto[]>;
  saveQuestline(input: QuestlineInputDto): Promise<QuestlineDto>;
  deleteQuestline(workspaceId: string, questlineId: string): Promise<void>;
  listNodes(workspaceId: string, questlineId: string): Promise<QuestNodeDto[]>;
  saveNode(input: QuestNodeInputDto): Promise<QuestNodeDto>;
  deleteNode(workspaceId: string, questlineId: string, nodeId: string): Promise<void>;
}

export interface MasterCrafterTimelineApi {
  list(workspaceId: string): Promise<TimelineEventDto[]>;
  save(input: TimelineEventInputDto): Promise<TimelineEventDto>;
  delete(workspaceId: string, eventId: string): Promise<void>;
}

export interface MasterCrafterRelationApi {
  list(workspaceId: string): Promise<RelationEdgeDto[]>;
  save(input: RelationEdgeInputDto): Promise<RelationEdgeDto>;
  delete(workspaceId: string, relationId: string): Promise<void>;
}

export interface MasterCrafterItemApi {
  list(workspaceId: string): Promise<ItemDto[]>;
  save(input: ItemInputDto): Promise<ItemDto>;
  delete(workspaceId: string, itemId: string): Promise<void>;
}

export interface MasterCrafterEncounterApi {
  list(workspaceId: string): Promise<EncounterDto[]>;
  save(input: EncounterInputDto): Promise<EncounterDto>;
  delete(workspaceId: string, encounterId: string): Promise<void>;
  listCombatants(workspaceId: string, encounterId: string): Promise<EncounterCombatantDto[]>;
  saveCombatant(input: EncounterCombatantInputDto): Promise<EncounterCombatantDto>;
  deleteCombatant(workspaceId: string, encounterId: string, combatantId: string): Promise<void>;
  listSessions(workspaceId: string, encounterId?: string): Promise<EncounterSessionDto[]>;
  startSession(workspaceId: string, encounterId: string): Promise<EncounterSessionDto>;
  saveSession(input: EncounterSessionInputDto): Promise<EncounterSessionDto>;
  deleteSession(workspaceId: string, sessionId: string): Promise<void>;
}

export interface MasterCrafterEncounterNpcLibraryApi {
  list(workspaceId: string): Promise<EncounterNpcLibraryEntryDto[]>;
  save(input: EncounterNpcLibraryInputDto): Promise<EncounterNpcLibraryEntryDto>;
  delete(workspaceId: string, npcLibraryEntryId: string): Promise<void>;
}

export interface MasterCrafterEncounterPlayerLibraryApi {
  list(workspaceId: string): Promise<EncounterPlayerLibraryEntryDto[]>;
  save(input: EncounterPlayerLibraryInputDto): Promise<EncounterPlayerLibraryEntryDto>;
  delete(workspaceId: string, playerLibraryEntryId: string): Promise<void>;
}

export interface MasterCrafterStoreApi {
  listStock(workspaceId: string, storeEntityId: string): Promise<StoreStockDto[]>;
  saveStock(input: StoreStockInputDto): Promise<StoreStockDto>;
  deleteStock(workspaceId: string, storeEntityId: string, itemId: string): Promise<void>;
}

export interface MasterCrafterSearchApi {
  query(input: SearchQueryInputDto): Promise<SearchResultDto[]>;
}

export interface MasterCrafterAssetApi {
  readImageDataUrl(absolutePath: string): Promise<string | null>;
}

export interface MasterCrafterContentApi {
  backlinks(workspaceId: string, targetKey: string): Promise<BacklinkDto[]>;
}

export interface MasterCrafterHotkeyApi {
  onToggleSettingsRequested(listener: () => void): () => void;
}

export interface FileDialogOpenOptionsDto {
  title: string;
  filters: Array<{
    name: string;
    extensions: string[];
  }>;
  properties: Array<"openFile" | "openDirectory" | "multiSelections">;
}

export interface FileDialogSaveOptionsDto {
  title: string;
  defaultPath: string;
  filters: Array<{
    name: string;
    extensions: string[];
  }>;
}

export interface MasterCrafterDialogApi {
  openFile(options: FileDialogOpenOptionsDto): Promise<string[]>;
  saveFile(options: FileDialogSaveOptionsDto): Promise<string | null>;
}

export interface MasterCrafterApi {
  registry: MasterCrafterRegistryApi;
  workspace: MasterCrafterWorkspaceApi;
  entityTypes: MasterCrafterEntityTypeApi;
  entities: MasterCrafterEntityApi;
  encounters: MasterCrafterEncounterApi;
  npcLibrary: MasterCrafterEncounterNpcLibraryApi;
  playerLibrary: MasterCrafterEncounterPlayerLibraryApi;
  maps: MasterCrafterMapApi;
  placements: MasterCrafterPlacementApi;
  notes: MasterCrafterNoteApi;
  quests: MasterCrafterQuestApi;
  timeline: MasterCrafterTimelineApi;
  relations: MasterCrafterRelationApi;
  items: MasterCrafterItemApi;
  stores: MasterCrafterStoreApi;
  search: MasterCrafterSearchApi;
  assets: MasterCrafterAssetApi;
  content: MasterCrafterContentApi;
  hotkeys: MasterCrafterHotkeyApi;
  dialog: MasterCrafterDialogApi;
}

declare global {
  interface Window {
    masterCrafter: MasterCrafterApi;
  }
}
