import fs from "node:fs/promises";
import path from "node:path";
import { AppPathsService } from "@infra/runtime/AppPathsService";
import { ConfigService } from "@infra/config/ConfigService";
import { WorkspaceRegistryService } from "@infra/workspaces/WorkspaceRegistryService";
import { AssetVaultService } from "@infra/assets/AssetVaultService";
import { CampaignBundleService } from "@infra/export/CampaignBundleService";
import { CampaignDatabase } from "@infra/database/CampaignDatabase";
import { CampaignRepository } from "@infra/database/CampaignRepository";
import { WorkspaceSession } from "@infra/workspaces/WorkspaceSession";
import { DEFAULT_CALENDAR } from "@infra/database/defaultData";
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
  SearchQueryInputDto,
  SearchResultDto,
  StoreStockDto,
  StoreStockInputDto,
  TimelineEventDto,
  TimelineEventInputDto,
  UpdateCalendarInputDto,
  UpdateWorkspaceMetadataInputDto,
  WorkspaceAssetDto,
  WorkspaceSummaryDto,
} from "@shared/contracts";
import { createId, nowIso, slugify } from "@shared/utils";

export class CampaignService {
  private static instance: CampaignService | null = null;
  private activeSession: WorkspaceSession | null = null;

  private constructor(
    private readonly paths = AppPathsService.getInstance(),
    private readonly registry = WorkspaceRegistryService.getInstance(),
    private readonly config = ConfigService.getInstance(),
    private readonly vault = AssetVaultService.getInstance(),
    private readonly bundles = CampaignBundleService.getInstance(),
  ) {}

  static getInstance(): CampaignService {
    if (!CampaignService.instance) {
      CampaignService.instance = new CampaignService();
    }

    return CampaignService.instance;
  }

  async initialize(): Promise<StartupBootstrapResult> {
    await this.paths.ensureBaseStructure();
    await this.config.load();
    await this.registry.load();

    const createdWorkspace = await this.bootstrapInitialWorkspace();
    const repairedWorkspaceIds = createdWorkspace ? [] : await this.bootstrapMissingWorkspaceDatabases();

    return {
      createdWorkspace,
      repairedWorkspaceIds,
    };
  }

  async listWorkspaces(): Promise<WorkspaceSummaryDto[]> {
    return this.registry.list();
  }

  async createWorkspace(input: CreateWorkspaceInputDto): Promise<WorkspaceSummaryDto> {
    const workspaceId = createId();
    const createdAt = nowIso();
    const location = this.paths.buildWorkspaceLocation(workspaceId, input.name);

    await fs.mkdir(location.folderPath, { recursive: true });
    await fs.mkdir(location.assetPath, { recursive: true });

    const summary: WorkspaceSummaryDto = {
      id: workspaceId,
      name: input.name,
      slug: slugify(input.name),
      description: input.description,
      folderPath: location.folderPath,
      dbPath: location.dbPath,
      assetPath: location.assetPath,
      calendarName: DEFAULT_CALENDAR.name,
      createdAt,
      updatedAt: createdAt,
      lastOpenedAt: createdAt,
    };

    const session = await this.openWorkspaceSession(summary);

    this.activeSession?.close();
    this.activeSession = session;
    await this.registry.upsert(summary);
    await this.registry.markOpened(workspaceId, createdAt);
    await this.config.setLastWorkspaceId(workspaceId);

    return summary;
  }

  async renameWorkspace(input: UpdateWorkspaceMetadataInputDto): Promise<WorkspaceSummaryDto> {
    const workspace = await this.ensureWorkspaceSession(input.workspaceId);
    const updatedSummary = workspace.repository.updateWorkspaceMetadata(input);
    const registryEntry = {
      ...workspace.summary,
      name: input.name,
      slug: slugify(input.name),
      description: input.description,
      updatedAt: nowIso(),
      calendarName: updatedSummary.calendarName,
    };

    await this.registry.upsert(registryEntry);
    return registryEntry;
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    if (this.activeSession?.summary.id === workspaceId) {
      this.activeSession.close();
      this.activeSession = null;
    }

    const workspace = await this.registry.get(workspaceId);
    if (!workspace) {
      return;
    }

    await this.registry.remove(workspaceId);
    await fs.rm(workspace.folderPath, { recursive: true, force: true });

    const config = this.config.get();
    if (config.lastWorkspaceId === workspaceId) {
      await this.config.setLastWorkspaceId(null);
    }
  }

  async openWorkspace(workspaceId: string): Promise<CampaignSnapshotDto> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    const openedAt = nowIso();
    await this.registry.markOpened(workspaceId, openedAt);
    await this.config.setLastWorkspaceId(workspaceId);
    return session.repository.snapshot();
  }

  async importBundle(input: ImportBundleInputDto): Promise<WorkspaceSummaryDto> {
    const { summary } = await this.bundles.importBundle(input.archiveFilePath);
    await this.registry.upsert(summary);
    await this.registry.markOpened(summary.id, nowIso());
    await this.config.setLastWorkspaceId(summary.id);

    if (this.activeSession) {
      this.activeSession.close();
      this.activeSession = null;
    }

    this.activeSession = await this.openWorkspaceSession(summary);
    return summary;
  }

  async exportBundle(input: ExportBundleInputDto): Promise<void> {
    const session = await this.ensureWorkspaceSession(input.workspaceId);
    await this.bundles.exportWorkspace(session.repository.snapshot(), input.outputFilePath);
  }

  async snapshot(workspaceId: string): Promise<CampaignSnapshotDto> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    return session.repository.snapshot();
  }

  async updateCalendar(input: UpdateCalendarInputDto): Promise<CampaignSnapshotDto> {
    const session = await this.ensureWorkspaceSession(input.workspaceId);
    session.repository.updateCalendar(input);
    const snapshot = session.repository.snapshot();
    const registryEntry = {
      ...session.summary,
      calendarName: input.calendar.name,
      updatedAt: nowIso(),
    };

    await this.registry.upsert(registryEntry);
    return snapshot;
  }

  async listEntityTypes(workspaceId: string): Promise<EntityTypeDefinitionDto[]> {
    return (await this.ensureWorkspaceSession(workspaceId)).repository.listEntityTypes();
  }

  async saveEntityType(input: EntityTypeDefinitionInputDto): Promise<EntityTypeDefinitionDto> {
    const session = await this.ensureWorkspaceSession(input.workspaceId);
    return session.repository.saveEntityType(input);
  }

  async deleteEntityType(workspaceId: string, typeId: string): Promise<void> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    session.repository.deleteEntityType(typeId);
  }

  async listEntities(workspaceId: string): Promise<EntityDto[]> {
    return (await this.ensureWorkspaceSession(workspaceId)).repository.listEntities();
  }

  async saveEntity(input: EntityInputDto): Promise<EntityDto> {
    const session = await this.ensureWorkspaceSession(input.workspaceId);
    return session.repository.saveEntity(input);
  }

  async deleteEntity(workspaceId: string, entityId: string): Promise<void> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    session.repository.deleteEntity(entityId);
  }

  async listMaps(workspaceId: string): Promise<MapDto[]> {
    return (await this.ensureWorkspaceSession(workspaceId)).repository.listMaps();
  }

  async saveMap(input: MapInputDto): Promise<MapDto> {
    const session = await this.ensureWorkspaceSession(input.workspaceId);
    return session.repository.saveMap(input);
  }

  async importImage(input: ImportImageInputDto): Promise<MapDto> {
    const session = await this.ensureWorkspaceSession(input.workspaceId);
    const asset = await this.vault.importAsset({
      workspaceId: input.workspaceId,
      assetRoot: session.summary.assetPath,
      sourceFilePath: input.sourceFilePath,
      kind: "map-image",
    });

    session.repository.saveAssetRecord(asset);
    return session.repository.importImage(input, asset);
  }

  async importAsset(workspaceId: string, sourceFilePath: string, kind: string): Promise<WorkspaceAssetDto> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    const asset = await this.vault.importAsset({
      workspaceId,
      assetRoot: session.summary.assetPath,
      sourceFilePath,
      kind,
    });

    session.repository.saveAssetRecord(asset);
    return asset;
  }

  async deleteMap(workspaceId: string, mapId: string): Promise<void> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    session.repository.deleteMap(mapId);
  }

  async listPlacements(workspaceId: string, mapId: string): Promise<MapPlacementDto[]> {
    return (await this.ensureWorkspaceSession(workspaceId)).repository.listPlacements(mapId);
  }

  async savePlacement(input: MapPlacementInputDto): Promise<MapPlacementDto> {
    const session = await this.ensureWorkspaceSession(input.workspaceId);
    return session.repository.savePlacement(input);
  }

  async deletePlacement(workspaceId: string, mapId: string, placementId: string): Promise<void> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    session.repository.deletePlacement(mapId, placementId);
  }

  async listNotes(workspaceId: string): Promise<NoteDto[]> {
    return (await this.ensureWorkspaceSession(workspaceId)).repository.listNotes();
  }

  async saveNote(input: NoteInputDto): Promise<NoteDto> {
    const session = await this.ensureWorkspaceSession(input.workspaceId);
    return session.repository.saveNote(input);
  }

  async deleteNote(workspaceId: string, noteId: string): Promise<void> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    session.repository.deleteNote(noteId);
  }

  async listQuestlines(workspaceId: string): Promise<QuestlineDto[]> {
    return (await this.ensureWorkspaceSession(workspaceId)).repository.listQuestlines();
  }

  async saveQuestline(input: QuestlineInputDto): Promise<QuestlineDto> {
    const session = await this.ensureWorkspaceSession(input.workspaceId);
    return session.repository.saveQuestline(input);
  }

  async deleteQuestline(workspaceId: string, questlineId: string): Promise<void> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    session.repository.deleteQuestline(questlineId);
  }

  async listQuestNodes(workspaceId: string, questlineId: string): Promise<QuestNodeDto[]> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    return session.repository.listQuestNodesByQuestline(questlineId);
  }

  async saveQuestNode(input: QuestNodeInputDto): Promise<QuestNodeDto> {
    const session = await this.ensureWorkspaceSession(input.workspaceId);
    return session.repository.saveQuestNode(input);
  }

  async deleteQuestNode(workspaceId: string, questlineId: string, nodeId: string): Promise<void> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    session.repository.deleteQuestNode(questlineId, nodeId);
  }

  async listTimelineEvents(workspaceId: string): Promise<TimelineEventDto[]> {
    return (await this.ensureWorkspaceSession(workspaceId)).repository.listTimelineEvents();
  }

  async saveTimelineEvent(input: TimelineEventInputDto): Promise<TimelineEventDto> {
    const session = await this.ensureWorkspaceSession(input.workspaceId);
    return session.repository.saveTimelineEvent(input);
  }

  async deleteTimelineEvent(workspaceId: string, eventId: string): Promise<void> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    session.repository.deleteTimelineEvent(eventId);
  }

  async listRelations(workspaceId: string): Promise<RelationEdgeDto[]> {
    return (await this.ensureWorkspaceSession(workspaceId)).repository.listRelations();
  }

  async saveRelation(input: RelationEdgeInputDto): Promise<RelationEdgeDto> {
    const session = await this.ensureWorkspaceSession(input.workspaceId);
    return session.repository.saveRelation(input);
  }

  async deleteRelation(workspaceId: string, relationId: string): Promise<void> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    session.repository.deleteRelation(relationId);
  }

  async listItems(workspaceId: string): Promise<ItemDto[]> {
    return (await this.ensureWorkspaceSession(workspaceId)).repository.listItems();
  }

  async saveItem(input: ItemInputDto): Promise<ItemDto> {
    const session = await this.ensureWorkspaceSession(input.workspaceId);
    return session.repository.saveItem(input);
  }

  async deleteItem(workspaceId: string, itemId: string): Promise<void> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    session.repository.deleteItem(itemId);
  }

  async listEncounters(workspaceId: string): Promise<EncounterDto[]> {
    return (await this.ensureWorkspaceSession(workspaceId)).repository.listEncounters();
  }

  async saveEncounter(input: EncounterInputDto): Promise<EncounterDto> {
    const session = await this.ensureWorkspaceSession(input.workspaceId);
    return session.repository.saveEncounter(input);
  }

  async deleteEncounter(workspaceId: string, encounterId: string): Promise<void> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    session.repository.deleteEncounter(encounterId);
  }

  async listCombatants(workspaceId: string, encounterId: string): Promise<EncounterCombatantDto[]> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    return session.repository.listCombatants(encounterId);
  }

  async saveCombatant(input: EncounterCombatantInputDto): Promise<EncounterCombatantDto> {
    const session = await this.ensureWorkspaceSession(input.workspaceId);
    return session.repository.saveCombatant(input);
  }

  async deleteCombatant(workspaceId: string, encounterId: string, combatantId: string): Promise<void> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    session.repository.deleteCombatant(encounterId, combatantId);
  }

  async listEncounterSessions(workspaceId: string, encounterId?: string): Promise<EncounterSessionDto[]> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    return session.repository.listEncounterSessions(encounterId);
  }

  async startEncounterSession(workspaceId: string, encounterId: string): Promise<EncounterSessionDto> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    return session.repository.startEncounterSession(encounterId);
  }

  async saveEncounterSession(input: EncounterSessionInputDto): Promise<EncounterSessionDto> {
    const session = await this.ensureWorkspaceSession(input.workspaceId);
    return session.repository.saveEncounterSession(input);
  }

  async deleteEncounterSession(workspaceId: string, sessionId: string): Promise<void> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    session.repository.deleteEncounterSession(sessionId);
  }

  async listNpcLibraryEntries(workspaceId: string): Promise<EncounterNpcLibraryEntryDto[]> {
    return (await this.ensureWorkspaceSession(workspaceId)).repository.listNpcLibraryEntries();
  }

  async saveNpcLibraryEntry(input: EncounterNpcLibraryInputDto): Promise<EncounterNpcLibraryEntryDto> {
    const session = await this.ensureWorkspaceSession(input.workspaceId);
    return session.repository.saveNpcLibraryEntry(input);
  }

  async deleteNpcLibraryEntry(workspaceId: string, npcLibraryEntryId: string): Promise<void> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    session.repository.deleteNpcLibraryEntry(npcLibraryEntryId);
  }

  async listPlayerLibraryEntries(workspaceId: string): Promise<EncounterPlayerLibraryEntryDto[]> {
    return (await this.ensureWorkspaceSession(workspaceId)).repository.listPlayerLibraryEntries();
  }

  async savePlayerLibraryEntry(input: EncounterPlayerLibraryInputDto): Promise<EncounterPlayerLibraryEntryDto> {
    const session = await this.ensureWorkspaceSession(input.workspaceId);
    return session.repository.savePlayerLibraryEntry(input);
  }

  async deletePlayerLibraryEntry(workspaceId: string, playerLibraryEntryId: string): Promise<void> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    session.repository.deletePlayerLibraryEntry(playerLibraryEntryId);
  }

  async listStoreStock(workspaceId: string, storeEntityId: string): Promise<StoreStockDto[]> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    return session.repository.listStock(storeEntityId);
  }

  async saveStoreStock(input: StoreStockInputDto): Promise<StoreStockDto> {
    const session = await this.ensureWorkspaceSession(input.workspaceId);
    return session.repository.saveStock(input);
  }

  async deleteStoreStock(workspaceId: string, storeEntityId: string, itemId: string): Promise<void> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    session.repository.deleteStock(storeEntityId, itemId);
  }

  async search(input: SearchQueryInputDto): Promise<SearchResultDto[]> {
    const session = await this.ensureWorkspaceSession(input.workspaceId);
    return session.repository.search(input);
  }

  async backlinks(workspaceId: string, targetKey: string): Promise<BacklinkDto[]> {
    const session = await this.ensureWorkspaceSession(workspaceId);
    return session.repository.backlinks(targetKey);
  }

  private async bootstrapInitialWorkspace(): Promise<WorkspaceSummaryDto | null> {
    const workspaces = await this.registry.list();
    if (workspaces.length > 0) {
      return null;
    }

    return this.createWorkspace({
      name: "New Campaign",
      description: "An empty campaign workspace created automatically on first launch.",
    });
  }

  private async bootstrapMissingWorkspaceDatabases(): Promise<string[]> {
    const repairedWorkspaceIds: string[] = [];

    for (const workspace of await this.registry.list()) {
      if (await this.fileExists(workspace.dbPath)) {
        await fs.mkdir(workspace.assetPath, { recursive: true });
        continue;
      }

      const session = await this.openWorkspaceSession(workspace);
      session.close();
      repairedWorkspaceIds.push(workspace.id);
    }

    return repairedWorkspaceIds;
  }

  private async openWorkspaceSession(workspace: WorkspaceSummaryDto): Promise<WorkspaceSession> {
    await fs.mkdir(path.dirname(workspace.dbPath), { recursive: true });
    await fs.mkdir(workspace.assetPath, { recursive: true });

    const databaseExists = await this.fileExists(workspace.dbPath);
    const database = await CampaignDatabase.open(workspace.dbPath);
    const repository = new CampaignRepository(database.connection, workspace);

    if (!databaseExists) {
      repository.initializeWorkspace(workspace.name, workspace.description, DEFAULT_CALENDAR);
    }

    return new WorkspaceSession(workspace, database, repository);
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async ensureWorkspaceSession(workspaceId: string): Promise<WorkspaceSession> {
    if (this.activeSession?.summary.id === workspaceId) {
      return this.activeSession;
    }

    const workspace = await this.registry.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} does not exist.`);
    }

    if (this.activeSession) {
      this.activeSession.close();
      this.activeSession = null;
    }

    this.activeSession = await this.openWorkspaceSession(workspace);
    return this.activeSession;
  }
}

interface StartupBootstrapResult {
  createdWorkspace: WorkspaceSummaryDto | null;
  repairedWorkspaceIds: string[];
}
