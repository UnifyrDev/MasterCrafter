import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@shared/constants";
import type { MasterCrafterApi } from "@shared/contracts";

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

export function createMasterCrafterApi(): MasterCrafterApi {
  return {
    app: {
      getInfo: () => invoke(IPC_CHANNELS.app.info),
    },
    registry: {
      listWorkspaces: () => invoke(IPC_CHANNELS.registry.list),
      createWorkspace: (input) => invoke(IPC_CHANNELS.registry.create, input),
      renameWorkspace: (input) => invoke(IPC_CHANNELS.registry.rename, input),
      deleteWorkspace: (workspaceId) => invoke(IPC_CHANNELS.registry.delete, workspaceId),
      openWorkspace: (workspaceId) => invoke(IPC_CHANNELS.registry.open, workspaceId),
      importBundle: (input) => invoke(IPC_CHANNELS.registry.importBundle, input),
      exportBundle: (input) => invoke(IPC_CHANNELS.registry.exportBundle, input),
    },
    workspace: {
      snapshot: (workspaceId) => invoke(IPC_CHANNELS.workspace.snapshot, workspaceId),
      updateMetadata: (input) => invoke(IPC_CHANNELS.workspace.updateMetadata, input),
      updateCalendar: (input) => invoke(IPC_CHANNELS.workspace.updateCalendar, input),
    },
    entityTypes: {
      list: (workspaceId) => invoke(IPC_CHANNELS.entityTypes.list, workspaceId),
      save: (input) => invoke(IPC_CHANNELS.entityTypes.save, input),
      delete: (workspaceId, typeId) => invoke(IPC_CHANNELS.entityTypes.delete, workspaceId, typeId),
    },
    entities: {
      list: (workspaceId) => invoke(IPC_CHANNELS.entities.list, workspaceId),
      save: (input) => invoke(IPC_CHANNELS.entities.save, input),
      delete: (workspaceId, entityId) => invoke(IPC_CHANNELS.entities.delete, workspaceId, entityId),
    },
    encounters: {
      list: (workspaceId) => invoke(IPC_CHANNELS.encounters.list, workspaceId),
      save: (input) => invoke(IPC_CHANNELS.encounters.save, input),
      delete: (workspaceId, encounterId) => invoke(IPC_CHANNELS.encounters.delete, workspaceId, encounterId),
      listCombatants: (workspaceId, encounterId) => invoke(IPC_CHANNELS.encounters.listCombatants, workspaceId, encounterId),
      saveCombatant: (input) => invoke(IPC_CHANNELS.encounters.saveCombatant, input),
      deleteCombatant: (workspaceId, encounterId, combatantId) => invoke(IPC_CHANNELS.encounters.deleteCombatant, workspaceId, encounterId, combatantId),
      listSessions: (workspaceId, encounterId) => invoke(IPC_CHANNELS.encounters.listSessions, workspaceId, encounterId),
      startSession: (workspaceId, encounterId) => invoke(IPC_CHANNELS.encounters.startSession, workspaceId, encounterId),
      saveSession: (input) => invoke(IPC_CHANNELS.encounters.saveSession, input),
      deleteSession: (workspaceId, sessionId) => invoke(IPC_CHANNELS.encounters.deleteSession, workspaceId, sessionId),
    },
    npcLibrary: {
      list: (workspaceId) => invoke(IPC_CHANNELS.npcLibrary.list, workspaceId),
      save: (input) => invoke(IPC_CHANNELS.npcLibrary.save, input),
      delete: (workspaceId, npcLibraryEntryId) => invoke(IPC_CHANNELS.npcLibrary.delete, workspaceId, npcLibraryEntryId),
    },
    playerLibrary: {
      list: (workspaceId) => invoke(IPC_CHANNELS.playerLibrary.list, workspaceId),
      save: (input) => invoke(IPC_CHANNELS.playerLibrary.save, input),
      delete: (workspaceId, playerLibraryEntryId) => invoke(IPC_CHANNELS.playerLibrary.delete, workspaceId, playerLibraryEntryId),
    },
    maps: {
      list: (workspaceId) => invoke(IPC_CHANNELS.maps.list, workspaceId),
      save: (input) => invoke(IPC_CHANNELS.maps.save, input),
      delete: (workspaceId, mapId) => invoke(IPC_CHANNELS.maps.delete, workspaceId, mapId),
      importImage: (input) => invoke(IPC_CHANNELS.maps.importImage, input),
    },
    placements: {
      list: (workspaceId, mapId) => invoke(IPC_CHANNELS.placements.list, workspaceId, mapId),
      save: (input) => invoke(IPC_CHANNELS.placements.save, input),
      delete: (workspaceId, mapId, placementId) => invoke(IPC_CHANNELS.placements.delete, workspaceId, mapId, placementId),
    },
    notes: {
      list: (workspaceId) => invoke(IPC_CHANNELS.notes.list, workspaceId),
      save: (input) => invoke(IPC_CHANNELS.notes.save, input),
      delete: (workspaceId, noteId) => invoke(IPC_CHANNELS.notes.delete, workspaceId, noteId),
    },
    quests: {
      listQuestlines: (workspaceId) => invoke(IPC_CHANNELS.questlines.list, workspaceId),
      saveQuestline: (input) => invoke(IPC_CHANNELS.questlines.save, input),
      deleteQuestline: (workspaceId, questlineId) => invoke(IPC_CHANNELS.questlines.delete, workspaceId, questlineId),
      listNodes: (workspaceId, questlineId) => invoke(IPC_CHANNELS.questNodes.list, workspaceId, questlineId),
      saveNode: (input) => invoke(IPC_CHANNELS.questNodes.save, input),
      deleteNode: (workspaceId, questlineId, nodeId) => invoke(IPC_CHANNELS.questNodes.delete, workspaceId, questlineId, nodeId),
    },
    timeline: {
      list: (workspaceId) => invoke(IPC_CHANNELS.timeline.list, workspaceId),
      save: (input) => invoke(IPC_CHANNELS.timeline.save, input),
      delete: (workspaceId, eventId) => invoke(IPC_CHANNELS.timeline.delete, workspaceId, eventId),
    },
    relations: {
      list: (workspaceId) => invoke(IPC_CHANNELS.relations.list, workspaceId),
      save: (input) => invoke(IPC_CHANNELS.relations.save, input),
      delete: (workspaceId, relationId) => invoke(IPC_CHANNELS.relations.delete, workspaceId, relationId),
    },
    items: {
      list: (workspaceId) => invoke(IPC_CHANNELS.items.list, workspaceId),
      save: (input) => invoke(IPC_CHANNELS.items.save, input),
      delete: (workspaceId, itemId) => invoke(IPC_CHANNELS.items.delete, workspaceId, itemId),
    },
    stores: {
      listStock: (workspaceId, storeEntityId) => invoke(IPC_CHANNELS.stores.listStock, workspaceId, storeEntityId),
      saveStock: (input) => invoke(IPC_CHANNELS.stores.saveStock, input),
      deleteStock: (workspaceId, storeEntityId, itemId) => invoke(IPC_CHANNELS.stores.deleteStock, workspaceId, storeEntityId, itemId),
    },
    search: {
      query: (input) => invoke(IPC_CHANNELS.search.query, input),
    },
    assets: {
      readImageDataUrl: (absolutePath) => invoke(IPC_CHANNELS.assets.readImageDataUrl, absolutePath),
      importFile: (workspaceId, sourceFilePath, kind) => invoke(IPC_CHANNELS.assets.importFile, workspaceId, sourceFilePath, kind),
    },
    content: {
      backlinks: (workspaceId, targetKey) => invoke(IPC_CHANNELS.content.backlinks, workspaceId, targetKey),
    },
    hotkeys: {
      onToggleSettingsRequested: (listener) => {
        const handler = () => listener();
        ipcRenderer.on(IPC_CHANNELS.hotkeys.toggleSettings, handler);
        return () => {
          ipcRenderer.removeListener(IPC_CHANNELS.hotkeys.toggleSettings, handler);
        };
      },
    },
    dialog: {
      openFile: (options) => invoke(IPC_CHANNELS.dialog.openFile, options),
      saveFile: (options) => invoke(IPC_CHANNELS.dialog.saveFile, options),
    },
  };
}
