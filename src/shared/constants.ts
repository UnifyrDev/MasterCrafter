export const APP_NAME = "MasterCrafter";
export const APP_SLUG = "mastercrafter";
export const DATABASE_FILE_NAME = "campaign.db";
export const WORKSPACE_REGISTRY_FILE = "workspaces.json";
export const ASSET_VAULT_DIR = "assets";
export const CAMPAIGN_BUNDLE_EXTENSION = ".mcpack";
export const GLOBAL_TIMELINE_LABEL = "Global Timeline";

export const IPC_CHANNELS = {
  app: {
    info: "app:info",
  },
  registry: {
    list: "registry:list",
    create: "registry:create",
    rename: "registry:rename",
    delete: "registry:delete",
    open: "registry:open",
    importBundle: "registry:import-bundle",
    exportBundle: "registry:export-bundle",
  },
  workspace: {
    snapshot: "workspace:snapshot",
    updateMetadata: "workspace:update-metadata",
    updateCalendar: "workspace:update-calendar",
  },
  entityTypes: {
    list: "entity-types:list",
    save: "entity-types:save",
    delete: "entity-types:delete",
  },
  entities: {
    list: "entities:list",
    save: "entities:save",
    delete: "entities:delete",
  },
  maps: {
    list: "maps:list",
    save: "maps:save",
    delete: "maps:delete",
    importImage: "maps:import-image",
  },
  placements: {
    list: "placements:list",
    save: "placements:save",
    delete: "placements:delete",
  },
  notes: {
    list: "notes:list",
    save: "notes:save",
    delete: "notes:delete",
  },
  questlines: {
    list: "questlines:list",
    save: "questlines:save",
    delete: "questlines:delete",
  },
  questNodes: {
    list: "quest-nodes:list",
    save: "quest-nodes:save",
    delete: "quest-nodes:delete",
  },
  timeline: {
    list: "timeline:list",
    save: "timeline:save",
    delete: "timeline:delete",
  },
  relations: {
    list: "relations:list",
    save: "relations:save",
    delete: "relations:delete",
  },
  items: {
    list: "items:list",
    save: "items:save",
    delete: "items:delete",
  },
  encounters: {
    list: "encounters:list",
    save: "encounters:save",
    delete: "encounters:delete",
    listCombatants: "encounters:list-combatants",
    saveCombatant: "encounters:save-combatant",
    deleteCombatant: "encounters:delete-combatant",
    listSessions: "encounters:list-sessions",
    startSession: "encounters:start-session",
    saveSession: "encounters:save-session",
    deleteSession: "encounters:delete-session",
  },
  npcLibrary: {
    list: "npc-library:list",
    save: "npc-library:save",
    delete: "npc-library:delete",
  },
  playerLibrary: {
    list: "player-library:list",
    save: "player-library:save",
    delete: "player-library:delete",
  },
  stores: {
    listStock: "stores:list-stock",
    saveStock: "stores:save-stock",
    deleteStock: "stores:delete-stock",
  },
  search: {
    query: "search:query",
  },
  assets: {
    readImageDataUrl: "assets:read-image-data-url",
    importFile: "assets:import-file",
  },
  content: {
    backlinks: "content:backlinks",
  },
  hotkeys: {
    toggleSettings: "hotkeys:toggle-settings",
  },
  dialog: {
    openFile: "dialog:open-file",
    saveFile: "dialog:save-file",
  },
} as const;
