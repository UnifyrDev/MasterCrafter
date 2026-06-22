import { dialog, ipcMain } from "electron";
import { IPC_CHANNELS } from "@shared/constants";
import type { CampaignService } from "@main/services/CampaignService";
import { AssetPreviewService } from "@main/services/AssetPreviewService";
import { AppInfoService } from "@main/services/AppInfoService";

export class IpcController {
  private readonly assetPreviewService = AssetPreviewService.getInstance();
  private readonly appInfoService = AppInfoService.getInstance();

  constructor(private readonly campaignService: CampaignService) {}

  register(): void {
    ipcMain.handle(IPC_CHANNELS.app.info, () => this.appInfoService.getInfo());

    ipcMain.handle(IPC_CHANNELS.registry.list, () => this.campaignService.listWorkspaces());
    ipcMain.handle(IPC_CHANNELS.registry.create, (_, input) => this.campaignService.createWorkspace(input));
    ipcMain.handle(IPC_CHANNELS.registry.rename, (_, input) => this.campaignService.renameWorkspace(input));
    ipcMain.handle(IPC_CHANNELS.registry.delete, (_, workspaceId: string) => this.campaignService.deleteWorkspace(workspaceId));
    ipcMain.handle(IPC_CHANNELS.registry.open, (_, workspaceId: string) => this.campaignService.openWorkspace(workspaceId));
    ipcMain.handle(IPC_CHANNELS.registry.importBundle, (_, input) => this.campaignService.importBundle(input));
    ipcMain.handle(IPC_CHANNELS.registry.exportBundle, (_, input) => this.campaignService.exportBundle(input));

    ipcMain.handle(IPC_CHANNELS.workspace.snapshot, (_, workspaceId: string) => this.campaignService.snapshot(workspaceId));
    ipcMain.handle(IPC_CHANNELS.workspace.updateMetadata, (_, input) => this.campaignService.renameWorkspace(input));
    ipcMain.handle(IPC_CHANNELS.workspace.updateCalendar, (_, input) => this.campaignService.updateCalendar(input));

    ipcMain.handle(IPC_CHANNELS.entityTypes.list, (_, workspaceId: string) => this.campaignService.listEntityTypes(workspaceId));
    ipcMain.handle(IPC_CHANNELS.entityTypes.save, (_, input) => this.campaignService.saveEntityType(input));
    ipcMain.handle(IPC_CHANNELS.entityTypes.delete, (_, workspaceId: string, typeId: string) => this.campaignService.deleteEntityType(workspaceId, typeId));

    ipcMain.handle(IPC_CHANNELS.entities.list, (_, workspaceId: string) => this.campaignService.listEntities(workspaceId));
    ipcMain.handle(IPC_CHANNELS.entities.save, (_, input) => this.campaignService.saveEntity(input));
    ipcMain.handle(IPC_CHANNELS.entities.delete, (_, workspaceId: string, entityId: string) => this.campaignService.deleteEntity(workspaceId, entityId));

    ipcMain.handle(IPC_CHANNELS.maps.list, (_, workspaceId: string) => this.campaignService.listMaps(workspaceId));
    ipcMain.handle(IPC_CHANNELS.maps.save, (_, input) => this.campaignService.saveMap(input));
    ipcMain.handle(IPC_CHANNELS.maps.delete, (_, workspaceId: string, mapId: string) => this.campaignService.deleteMap(workspaceId, mapId));
    ipcMain.handle(IPC_CHANNELS.maps.importImage, (_, input) => this.campaignService.importImage(input));

    ipcMain.handle(IPC_CHANNELS.placements.list, (_, workspaceId: string, mapId: string) => this.campaignService.listPlacements(workspaceId, mapId));
    ipcMain.handle(IPC_CHANNELS.placements.save, (_, input) => this.campaignService.savePlacement(input));
    ipcMain.handle(IPC_CHANNELS.placements.delete, (_, workspaceId: string, mapId: string, placementId: string) => this.campaignService.deletePlacement(workspaceId, mapId, placementId));

    ipcMain.handle(IPC_CHANNELS.notes.list, (_, workspaceId: string) => this.campaignService.listNotes(workspaceId));
    ipcMain.handle(IPC_CHANNELS.notes.save, (_, input) => this.campaignService.saveNote(input));
    ipcMain.handle(IPC_CHANNELS.notes.delete, (_, workspaceId: string, noteId: string) => this.campaignService.deleteNote(workspaceId, noteId));

    ipcMain.handle(IPC_CHANNELS.questlines.list, (_, workspaceId: string) => this.campaignService.listQuestlines(workspaceId));
    ipcMain.handle(IPC_CHANNELS.questlines.save, (_, input) => this.campaignService.saveQuestline(input));
    ipcMain.handle(IPC_CHANNELS.questlines.delete, (_, workspaceId: string, questlineId: string) => this.campaignService.deleteQuestline(workspaceId, questlineId));

    ipcMain.handle(IPC_CHANNELS.questNodes.list, (_, workspaceId: string, questlineId: string) => this.campaignService.listQuestNodes(workspaceId, questlineId));
    ipcMain.handle(IPC_CHANNELS.questNodes.save, (_, input) => this.campaignService.saveQuestNode(input));
    ipcMain.handle(IPC_CHANNELS.questNodes.delete, (_, workspaceId: string, questlineId: string, nodeId: string) => this.campaignService.deleteQuestNode(workspaceId, questlineId, nodeId));

    ipcMain.handle(IPC_CHANNELS.timeline.list, (_, workspaceId: string) => this.campaignService.listTimelineEvents(workspaceId));
    ipcMain.handle(IPC_CHANNELS.timeline.save, (_, input) => this.campaignService.saveTimelineEvent(input));
    ipcMain.handle(IPC_CHANNELS.timeline.delete, (_, workspaceId: string, eventId: string) => this.campaignService.deleteTimelineEvent(workspaceId, eventId));

    ipcMain.handle(IPC_CHANNELS.relations.list, (_, workspaceId: string) => this.campaignService.listRelations(workspaceId));
    ipcMain.handle(IPC_CHANNELS.relations.save, (_, input) => this.campaignService.saveRelation(input));
    ipcMain.handle(IPC_CHANNELS.relations.delete, (_, workspaceId: string, relationId: string) => this.campaignService.deleteRelation(workspaceId, relationId));

    ipcMain.handle(IPC_CHANNELS.items.list, (_, workspaceId: string) => this.campaignService.listItems(workspaceId));
    ipcMain.handle(IPC_CHANNELS.items.save, (_, input) => this.campaignService.saveItem(input));
    ipcMain.handle(IPC_CHANNELS.items.delete, (_, workspaceId: string, itemId: string) => this.campaignService.deleteItem(workspaceId, itemId));

    ipcMain.handle(IPC_CHANNELS.encounters.list, (_, workspaceId: string) => this.campaignService.listEncounters(workspaceId));
    ipcMain.handle(IPC_CHANNELS.encounters.save, (_, input) => this.campaignService.saveEncounter(input));
    ipcMain.handle(IPC_CHANNELS.encounters.delete, (_, workspaceId: string, encounterId: string) => this.campaignService.deleteEncounter(workspaceId, encounterId));
    ipcMain.handle(IPC_CHANNELS.encounters.listCombatants, (_, workspaceId: string, encounterId: string) => this.campaignService.listCombatants(workspaceId, encounterId));
    ipcMain.handle(IPC_CHANNELS.encounters.saveCombatant, (_, input) => this.campaignService.saveCombatant(input));
    ipcMain.handle(IPC_CHANNELS.encounters.deleteCombatant, (_, workspaceId: string, encounterId: string, combatantId: string) => this.campaignService.deleteCombatant(workspaceId, encounterId, combatantId));
    ipcMain.handle(IPC_CHANNELS.encounters.listSessions, (_, workspaceId: string, encounterId?: string) => this.campaignService.listEncounterSessions(workspaceId, encounterId));
    ipcMain.handle(IPC_CHANNELS.encounters.startSession, (_, workspaceId: string, encounterId: string) => this.campaignService.startEncounterSession(workspaceId, encounterId));
    ipcMain.handle(IPC_CHANNELS.encounters.saveSession, (_, input) => this.campaignService.saveEncounterSession(input));
    ipcMain.handle(IPC_CHANNELS.encounters.deleteSession, (_, workspaceId: string, sessionId: string) => this.campaignService.deleteEncounterSession(workspaceId, sessionId));

    ipcMain.handle(IPC_CHANNELS.npcLibrary.list, (_, workspaceId: string) => this.campaignService.listNpcLibraryEntries(workspaceId));
    ipcMain.handle(IPC_CHANNELS.npcLibrary.save, (_, input) => this.campaignService.saveNpcLibraryEntry(input));
    ipcMain.handle(IPC_CHANNELS.npcLibrary.delete, (_, workspaceId: string, npcLibraryEntryId: string) => this.campaignService.deleteNpcLibraryEntry(workspaceId, npcLibraryEntryId));

    ipcMain.handle(IPC_CHANNELS.playerLibrary.list, (_, workspaceId: string) => this.campaignService.listPlayerLibraryEntries(workspaceId));
    ipcMain.handle(IPC_CHANNELS.playerLibrary.save, (_, input) => this.campaignService.savePlayerLibraryEntry(input));
    ipcMain.handle(IPC_CHANNELS.playerLibrary.delete, (_, workspaceId: string, playerLibraryEntryId: string) => this.campaignService.deletePlayerLibraryEntry(workspaceId, playerLibraryEntryId));

    ipcMain.handle(IPC_CHANNELS.stores.listStock, (_, workspaceId: string, storeEntityId: string) => this.campaignService.listStoreStock(workspaceId, storeEntityId));
    ipcMain.handle(IPC_CHANNELS.stores.saveStock, (_, input) => this.campaignService.saveStoreStock(input));
    ipcMain.handle(IPC_CHANNELS.stores.deleteStock, (_, workspaceId: string, storeEntityId: string, itemId: string) => this.campaignService.deleteStoreStock(workspaceId, storeEntityId, itemId));

    ipcMain.handle(IPC_CHANNELS.search.query, (_, input) => this.campaignService.search(input));
    ipcMain.handle(IPC_CHANNELS.assets.readImageDataUrl, (_, absolutePath: string) => this.assetPreviewService.readImageDataUrl(absolutePath));
    ipcMain.handle(IPC_CHANNELS.assets.importFile, (_, workspaceId: string, sourceFilePath: string, kind: string) => this.campaignService.importAsset(workspaceId, sourceFilePath, kind));
    ipcMain.handle(IPC_CHANNELS.content.backlinks, (_, workspaceId: string, targetKey: string) => this.campaignService.backlinks(workspaceId, targetKey));
    ipcMain.handle(IPC_CHANNELS.dialog.openFile, async (_, options) => {
      const result = await dialog.showOpenDialog({
        title: options.title,
        properties: options.properties,
        filters: options.filters,
      });

      return result.canceled ? [] : result.filePaths;
    });
    ipcMain.handle(IPC_CHANNELS.dialog.saveFile, async (_, options) => {
      const result = await dialog.showSaveDialog({
        title: options.title,
        defaultPath: options.defaultPath,
        filters: options.filters,
      });

      return result.canceled ? null : result.filePath ?? null;
    });
  }
}
