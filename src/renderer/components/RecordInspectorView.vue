<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useMasterCrafter } from "@renderer/composables/useMasterCrafter";
import { createId, slugify } from "@shared/utils";
import { GLOBAL_TIMELINE_LABEL } from "@shared/constants";
import type { CalendarStampDto, EntityInputDto, MapPlacementDto, MapPlacementInputDto, QuestNodeInputDto, QuestRewardDto } from "@shared/contracts";
import { cloneNpcStatblock } from "@shared/npcStatblock";
import MapDetailsEditor from "@renderer/components/MapDetailsEditor.vue";
import TimelineEventEditorModal from "@renderer/components/timeline/TimelineEventEditorModal.vue";
import { confirmationDialogService } from "@renderer/services/ConfirmationDialogService";
import { npcEditorService } from "@renderer/services/NpcEditorService";

const store = useMasterCrafter();
const state = store.state;

const entityDraft = reactive<EntityInputDto>({
  workspaceId: "",
  id: undefined,
  typeKey: "npc",
  title: "",
  slug: "",
  subtitle: "",
  description: "",
  markdown: "",
  imageAssetId: null,
  tags: [],
  linkedMapId: null,
  linkedPlacementId: null,
  questlineId: null,
  familyTreeRootId: null,
  customFields: {},
  npcStatblock: null,
});

const entityTagsText = ref("");

const questlineDraft = reactive({
  id: "",
  anchorEntityId: null as string | null,
  title: "",
  description: "",
  status: "draft" as "draft" | "active" | "completed",
});

const questNodeDraft = reactive<QuestNodeInputDto>({
  workspaceId: "",
  questlineId: "",
  id: undefined,
  parentNodeId: null,
  title: "",
  description: "",
  rewards: [],
  orderIndex: 0,
});

const snapshot = computed(() => state.value.snapshot);
const selectedEntity = computed(() => snapshot.value?.entities.find((entity) => entity.id === state.value.selectedEntityId) ?? null);
const selectedPlacement = computed(() => snapshot.value?.placements.find((placement) => placement.id === state.value.selectedPlacementId) ?? null);
const selectedNote = computed(() => snapshot.value?.notes.find((note) => note.id === state.value.selectedNoteId) ?? null);
const selectedMap = computed(() => snapshot.value?.maps.find((map) => map.id === state.value.selectedMapId) ?? null);
const selectedQuestline = computed(() => snapshot.value?.questlines.find((questline) => questline.id === state.value.selectedQuestlineId) ?? null);
const selectedQuestNode = computed(() => snapshot.value?.questNodes.find((node) => node.id === state.value.selectedQuestNodeId) ?? null);
const selectedTimelineEvent = computed(() => snapshot.value?.timelineEvents.find((event) => event.id === state.value.selectedTimelineEventId) ?? null);
const selectedRelation = computed(() => snapshot.value?.relations.find((relation) => relation.id === state.value.selectedRelationId) ?? null);
const selectedItem = computed(() => snapshot.value?.items.find((item) => item.id === state.value.selectedItemId) ?? null);
const selectedTypeDefinition = computed(() => snapshot.value?.entityTypes.find((type) => type.id === state.value.selectedEntityTypeId) ?? null);
type BrowserTabKey = "npcs" | "maps" | "notes" | "quests" | "nodes" | "timeline" | "relations" | "items" | "types" | "markers" | "areas" | "paths";
type BrowserEntryKind = "entity" | "map" | "note" | "questline" | "questNode" | "timelineEvent" | "relation" | "item" | "entityType" | "placement";
interface BrowserEntry {
  id: string;
  title: string;
  subtitle: string;
  kind: BrowserEntryKind;
  mapId?: string;
  questlineId?: string;
  placementKind?: MapPlacementDto["kind"];
}
interface BrowserTab {
  key: BrowserTabKey;
  label: string;
  count: number;
}
const npcEntities = computed(() => {
  const entities = snapshot.value?.entities ?? [];
  return [...entities]
    .filter((entity) => entity.typeKey === "npc")
    .sort((left, right) => left.title.localeCompare(right.title));
});
const selectedMapPlacements = computed(() => {
  const placements = snapshot.value?.placements ?? [];
  const mapId = selectedMap.value?.id;
  const filtered = mapId ? placements.filter((placement) => placement.mapId === mapId) : placements;

  return [...filtered].sort((left, right) => {
    if (left.kind !== right.kind) {
      const order: Record<MapPlacementDto["kind"], number> = {
        point: 0,
        region: 1,
        path: 2,
      };

      return order[left.kind] - order[right.kind];
    }

    return left.label.localeCompare(right.label);
  });
});
const markerPlacements = computed(() => selectedMapPlacements.value.filter((placement) => placement.kind === "point"));
const areaPlacements = computed(() => selectedMapPlacements.value.filter((placement) => placement.kind === "region"));
const pathPlacements = computed(() => selectedMapPlacements.value.filter((placement) => placement.kind === "path"));
const browserTab = ref<BrowserTabKey>("npcs");
const isEventEditorOpen = ref(false);
const browserTabs = computed<BrowserTab[]>(() => [
  { key: "npcs", label: "NPCs", count: npcEntities.value.length },
  { key: "maps", label: "Maps", count: snapshot.value?.maps.length ?? 0 },
  { key: "notes", label: "Notes", count: snapshot.value?.notes.length ?? 0 },
  { key: "quests", label: "Quests", count: snapshot.value?.questlines.length ?? 0 },
  { key: "nodes", label: "Nodes", count: snapshot.value?.questNodes.length ?? 0 },
  { key: "timeline", label: "Timeline", count: snapshot.value?.timelineEvents.length ?? 0 },
  { key: "relations", label: "Relations", count: snapshot.value?.relations.length ?? 0 },
  { key: "items", label: "Items", count: snapshot.value?.items.length ?? 0 },
  { key: "types", label: "Types", count: snapshot.value?.entityTypes.length ?? 0 },
  { key: "markers", label: "Markers", count: markerPlacements.value.length },
  { key: "areas", label: "Areas", count: areaPlacements.value.length },
  { key: "paths", label: "Pen Lines", count: pathPlacements.value.length },
]);

watch(
  selectedTimelineEvent,
  (next) => {
    if (!next) {
      isEventEditorOpen.value = false;
    }
  },
);

function cloneCalendarStamp(stamp: CalendarStampDto): CalendarStampDto {
  return {
    year: stamp.year,
    month: stamp.month,
    day: stamp.day,
    hour: stamp.hour,
    minute: stamp.minute,
  };
}

function resolveBrowserQuestNodeStamp(questlineId: string): CalendarStampDto {
  const selectedStamp = selectedTimelineEvent.value?.stamp ?? selectedQuestNode.value?.stamp ?? null;
  if (selectedStamp) {
    return cloneCalendarStamp(selectedStamp);
  }

  const questlineNodes = [...(snapshot.value?.questNodes ?? [])]
    .filter((node) => node.questlineId === questlineId && node.stamp !== null)
    .sort((left, right) => {
      const leftStamp = left.stamp!;
      const rightStamp = right.stamp!;

      if (leftStamp.year !== rightStamp.year) {
        return leftStamp.year - rightStamp.year;
      }

      if (leftStamp.month !== rightStamp.month) {
        return leftStamp.month - rightStamp.month;
      }

      if (leftStamp.day !== rightStamp.day) {
        return leftStamp.day - rightStamp.day;
      }

      if (leftStamp.hour !== rightStamp.hour) {
        return leftStamp.hour - rightStamp.hour;
      }

      return leftStamp.minute - rightStamp.minute;
    });

  const questlineNodeStamp = questlineNodes[questlineNodes.length - 1]?.stamp;
  if (questlineNodeStamp) {
    return cloneCalendarStamp(questlineNodeStamp);
  }

  const firstTimelineStamp = snapshot.value?.timelineEvents[0]?.stamp ?? null;
  if (firstTimelineStamp) {
    return cloneCalendarStamp(firstTimelineStamp);
  }

  return {
    year: 1,
    month: 1,
    day: 1,
    hour: 0,
    minute: 0,
  };
}
const browserTabEntries = computed<BrowserEntry[]>(() => {
  const entries = snapshot.value;
  if (!entries) {
    return [];
  }

  switch (browserTab.value) {
    case "npcs":
      return npcEntities.value.map((entity) => ({
        id: entity.id,
        title: entity.title,
        subtitle: entity.subtitle || entity.typeKey,
        kind: "entity",
      }));
    case "maps":
      return [...entries.maps]
        .sort((left, right) => left.title.localeCompare(right.title))
        .map((map) => ({
          id: map.id,
          title: map.title,
          subtitle: map.description || map.assetName || "Map",
          kind: "map",
        }));
    case "notes":
      return [...entries.notes]
        .sort((left, right) => left.title.localeCompare(right.title))
        .map((note) => ({
          id: note.id,
          title: note.title,
          subtitle: note.kind,
          kind: "note",
        }));
    case "quests":
      return [...entries.questlines]
        .sort((left, right) => left.title.localeCompare(right.title))
        .map((questline) => ({
          id: questline.id,
          title: questline.title,
          subtitle: questline.status,
          kind: "questline",
        }));
    case "nodes":
      return [...entries.questNodes]
        .sort((left, right) => {
          if (left.questlineId !== right.questlineId) {
            const leftQuestline = entries.questlines.find((questline) => questline.id === left.questlineId)?.title ?? "";
            const rightQuestline = entries.questlines.find((questline) => questline.id === right.questlineId)?.title ?? "";
            return leftQuestline.localeCompare(rightQuestline);
          }

          if (left.orderIndex !== right.orderIndex) {
            return left.orderIndex - right.orderIndex;
          }

          return left.title.localeCompare(right.title);
        })
        .map((node) => {
          const questlineTitle = entries.questlines.find((questline) => questline.id === node.questlineId)?.title ?? "Questline";
          return {
            id: node.id,
            title: node.title,
            subtitle: `${questlineTitle} · ${node.rewards.length} rewards`,
            kind: "questNode",
            questlineId: node.questlineId,
          };
        });
    case "timeline":
      return [...entries.timelineEvents].map((event) => ({
        id: event.id,
        title: event.title,
        subtitle: `${event.eventType} · ${event.laneLabel}`,
        kind: "timelineEvent",
      }));
    case "relations":
      return [...entries.relations]
        .sort((left, right) => left.label.localeCompare(right.label))
        .map((relation) => ({
          id: relation.id,
          title: relation.label,
          subtitle: relation.relationKind,
          kind: "relation",
        }));
    case "items":
      return [...entries.items]
        .sort((left, right) => left.title.localeCompare(right.title))
        .map((item) => ({
          id: item.id,
          title: item.title,
          subtitle: `${item.rarity} · ${item.worth} gp`,
          kind: "item",
        }));
    case "types":
      return [...entries.entityTypes]
        .sort((left, right) => left.displayName.localeCompare(right.displayName))
        .map((type) => ({
          id: type.id,
          title: type.displayName,
          subtitle: type.typeKey,
          kind: "entityType",
        }));
    case "markers":
      return markerPlacements.value.map((placement) => ({
        id: placement.id,
        title: placement.label,
        subtitle: placementSubtitle(placement),
        kind: "placement",
        mapId: placement.mapId,
        placementKind: placement.kind,
      }));
    case "areas":
      return areaPlacements.value.map((placement) => ({
        id: placement.id,
        title: placement.label,
        subtitle: placementSubtitle(placement),
        kind: "placement",
        mapId: placement.mapId,
        placementKind: placement.kind,
      }));
    case "paths":
      return pathPlacements.value.map((placement) => ({
        id: placement.id,
        title: placement.label,
        subtitle: placementSubtitle(placement),
        kind: "placement",
        mapId: placement.mapId,
        placementKind: placement.kind,
      }));
    default:
      return [];
  }
});
const browserActiveTab = computed(() => browserTabs.value.find((tab) => tab.key === browserTab.value) ?? browserTabs.value[0] ?? null);
const browserCreateLabel = computed(() => {
  switch (browserTab.value) {
    case "npcs":
      return "Create NPC";
    case "maps":
      return "Import Images";
    case "notes":
      return "Create Note";
    case "quests":
      return "Create Questline";
    case "nodes":
      return "Create Quest Node";
    case "timeline":
      return "Create Event";
    case "relations":
      return "Create Relation";
    case "items":
      return "Create Item";
    case "types":
      return "Create Type";
    case "markers":
      return "Create Marker";
    case "areas":
      return "Create Area";
    case "paths":
      return "Create Pen Line";
    default:
      return "Create Record";
  }
});
const browserCreateHelperText = computed(() => {
  switch (browserTab.value) {
    case "npcs":
      return "Opens the NPC editor modal so you can create or edit an NPC.";
    case "maps":
      return "Import one or more map images into the workspace.";
    case "notes":
      return "Creates a new markdown note and opens the notes editor.";
    case "quests":
      return "Creates a new questline and opens the graph view.";
    case "nodes":
      return "Adds a quest node to the active questline, or creates one first.";
    case "timeline":
      return "Creates a new timeline event and opens the timeline editor.";
    case "relations":
      return "Creates a relation between the first two NPCs.";
    case "items":
      return "Creates a new item in the browser.";
    case "types":
      return "Creates a new custom entity type.";
    case "markers":
      return "Creates a new marker on the active map.";
    case "areas":
      return "Creates a new area on the active map.";
    case "paths":
      return "Creates a new pen line on the active map.";
    default:
      return "";
  }
});
const browserCreateDisabledReason = computed(() => {
  switch (browserTab.value) {
    case "relations":
      return npcEntities.value.length < 2 ? "Add at least two NPCs first." : null;
    case "markers":
    case "areas":
    case "paths":
      return (selectedMap.value ?? snapshot.value?.maps[0] ?? null) ? null : "Create or import a map first.";
    default:
      return null;
  }
});
const browserEmptyMessage = computed(() => {
  switch (browserTab.value) {
    case "npcs":
      return "No NPCs yet.";
    case "maps":
      return "No maps yet.";
    case "notes":
      return "No notes yet.";
    case "quests":
      return "No questlines yet.";
    case "nodes":
      return "No quest nodes yet.";
    case "timeline":
      return "No timeline events yet.";
    case "relations":
      return "No relations yet.";
    case "items":
      return "No items yet.";
    case "types":
      return "No entity types yet.";
    case "markers":
      return "No markers on this map.";
    case "areas":
      return "No areas on this map.";
    case "paths":
      return "No pen lines on this map.";
    default:
      return "Nothing to browse yet.";
  }
});
const activePlacementBrowserKind = computed<MapPlacementDto["kind"] | null>(() => {
  switch (browserTab.value) {
    case "markers":
      return "point";
    case "areas":
      return "region";
    case "paths":
      return "path";
    default:
      return null;
  }
});
const browserSelectionTitle = computed(() => {
  switch (browserTab.value) {
    case "npcs":
      return selectedEntity.value?.title ?? browserActiveTab.value?.label ?? "Nothing selected";
    case "maps":
      return selectedMap.value?.title ?? browserActiveTab.value?.label ?? "Nothing selected";
    case "notes":
      return selectedNote.value?.title ?? browserActiveTab.value?.label ?? "Nothing selected";
    case "quests":
      return selectedQuestline.value?.title ?? browserActiveTab.value?.label ?? "Nothing selected";
    case "nodes":
      return selectedQuestNode.value?.title ?? browserActiveTab.value?.label ?? "Nothing selected";
    case "timeline":
      return selectedTimelineEvent.value?.title ?? browserActiveTab.value?.label ?? "Nothing selected";
    case "relations":
      return selectedRelation.value?.label ?? browserActiveTab.value?.label ?? "Nothing selected";
    case "items":
      return selectedItem.value?.title ?? browserActiveTab.value?.label ?? "Nothing selected";
    case "types":
      return selectedTypeDefinition.value?.displayName ?? browserActiveTab.value?.label ?? "Nothing selected";
    case "markers":
    case "areas":
    case "paths":
      return selectedPlacement.value?.kind === activePlacementBrowserKind.value ? selectedPlacement.value.label : browserActiveTab.value?.label ?? "Nothing selected";
    default:
      return "Nothing selected";
  }
});
const questNodeParentOptions = computed(() => {
  if (!snapshot.value || !questNodeDraft.questlineId) {
    return [];
  }

  return [...snapshot.value.questNodes]
    .filter((node) => node.questlineId === questNodeDraft.questlineId && node.id !== selectedQuestNode.value?.id)
    .sort((left, right) => {
      if (left.orderIndex !== right.orderIndex) {
        return left.orderIndex - right.orderIndex;
      }

      return left.title.localeCompare(right.title);
    });
});
const entityCollapsed = ref(false);

watch(
  selectedEntity,
  (entity) => {
    entityCollapsed.value = false;
    if (!entity) {
      entityDraft.workspaceId = snapshot.value?.workspace.id ?? "";
      entityDraft.id = undefined;
      entityDraft.typeKey = "npc";
      entityDraft.title = "";
      entityDraft.slug = "";
      entityDraft.subtitle = "";
      entityDraft.description = "";
      entityDraft.markdown = "";
      entityDraft.imageAssetId = null;
      entityDraft.tags = [];
      entityDraft.linkedMapId = null;
      entityDraft.linkedPlacementId = null;
      entityDraft.questlineId = null;
      entityDraft.familyTreeRootId = null;
      entityDraft.customFields = {};
      entityDraft.npcStatblock = null;
      entityTagsText.value = "";
      return;
    }

    entityDraft.workspaceId = entity.workspaceId;
    entityDraft.id = entity.id;
    entityDraft.typeKey = entity.typeKey;
    entityDraft.title = entity.title;
    entityDraft.slug = entity.slug;
    entityDraft.subtitle = entity.subtitle;
    entityDraft.description = entity.description;
    entityDraft.markdown = entity.markdown;
    entityDraft.imageAssetId = entity.imageAssetId;
    entityDraft.tags = [...entity.tags];
    entityDraft.linkedMapId = entity.linkedMapId;
    entityDraft.linkedPlacementId = entity.linkedPlacementId;
    entityDraft.questlineId = entity.questlineId;
    entityDraft.familyTreeRootId = entity.familyTreeRootId;
    entityDraft.customFields = { ...entity.customFields };
    entityDraft.npcStatblock = cloneNpcStatblock(entity.npcStatblock);
    entityTagsText.value = entity.tags.join(", ");
  },
  { immediate: true },
);

watch(
  selectedQuestline,
  (questline) => {
    if (!questline) {
      questlineDraft.id = "";
      questlineDraft.anchorEntityId = null;
      questlineDraft.title = "";
      questlineDraft.description = "";
      questlineDraft.status = "draft";
      return;
    }

    questlineDraft.id = questline.id;
    questlineDraft.anchorEntityId = questline.anchorEntityId;
    questlineDraft.title = questline.title;
    questlineDraft.description = questline.description;
    questlineDraft.status = questline.status;
  },
  { immediate: true },
);

watch(
  selectedQuestNode,
  (node) => {
    questNodeDraft.workspaceId = snapshot.value?.workspace.id ?? "";
    questNodeDraft.questlineId = selectedQuestline.value?.id ?? snapshot.value?.questlines[0]?.id ?? "";

    if (!node) {
      questNodeDraft.id = undefined;
      questNodeDraft.parentNodeId = null;
      questNodeDraft.title = "";
      questNodeDraft.description = "";
      questNodeDraft.rewards = [];
      questNodeDraft.orderIndex = 0;
      return;
    }

    questNodeDraft.workspaceId = node.workspaceId;
    questNodeDraft.questlineId = node.questlineId;
    questNodeDraft.id = node.id;
    questNodeDraft.parentNodeId = node.parentNodeId;
    questNodeDraft.title = node.title;
    questNodeDraft.description = node.description;
    questNodeDraft.rewards = node.rewards.map((reward) => ({ ...reward }));
    questNodeDraft.orderIndex = node.orderIndex;
  },
  { immediate: true },
);

function entityFieldValue(key: string): string {
  const value = entityDraft.customFields[key];
  return value == null ? "" : String(value);
}

function placementSubtitle(placement: MapPlacementDto): string {
  const linkedEntity = placement.entityId ? snapshot.value?.entities.find((entity) => entity.id === placement.entityId) : null;
  const linkedLabel = linkedEntity?.title ?? "Unlinked";
  const extra =
    placement.kind === "point"
      ? "Single point"
      : placement.kind === "region"
        ? `${placement.geometry.points.length} vertices`
        : `${placement.geometry.points.length} nodes`;

  return `${linkedLabel} · ${extra}`;
}

function openEntity(entityId: string): void {
  store.selectEntity(entityId);
}

function openPlacement(placement: MapPlacementDto): void {
  store.selectMap(placement.mapId);
  store.selectPlacement(placement.id);
}

function createPlacementGeometry(kind: MapPlacementDto["kind"]): MapPlacementInputDto["geometry"] {
  switch (kind) {
    case "region":
      return {
        kind,
        point: { x: 0.5, y: 0.5 },
        points: [
          { x: 0.46, y: 0.46 },
          { x: 0.54, y: 0.46 },
          { x: 0.54, y: 0.54 },
          { x: 0.46, y: 0.54 },
        ],
        radius: 24,
        width: 48,
        height: 48,
      };
    case "path":
      return {
        kind,
        point: { x: 0.5, y: 0.5 },
        points: [
          { x: 0.46, y: 0.5 },
          { x: 0.54, y: 0.5 },
        ],
        radius: 24,
        width: 48,
        height: 48,
      };
    case "point":
    default:
      return {
        kind: "point",
        point: { x: 0.5, y: 0.5 },
        points: [],
        radius: 24,
        width: 48,
        height: 48,
      };
  }
}

function browserTabForEntry(entry: BrowserEntry): BrowserTabKey {
  switch (entry.kind) {
    case "entity":
      return "npcs";
    case "map":
      return "maps";
    case "note":
      return "notes";
    case "questline":
      return "quests";
    case "questNode":
      return "nodes";
    case "timelineEvent":
      return "timeline";
    case "relation":
      return "relations";
    case "item":
      return "items";
    case "entityType":
      return "types";
    case "placement":
      if (entry.placementKind === "region") {
        return "areas";
      }
      if (entry.placementKind === "path") {
        return "paths";
      }
      return "markers";
    default:
      return "npcs";
  }
}

function openBrowserEntry(entry: BrowserEntry): void {
  switch (entry.kind) {
    case "entity":
      openEntity(entry.id);
      break;
    case "map":
      store.selectMap(entry.id);
      break;
    case "note":
      store.selectNote(entry.id);
      break;
    case "questline":
      store.selectQuestline(entry.id);
      break;
    case "questNode":
      if (entry.questlineId) {
        store.selectQuestline(entry.questlineId);
      }
      store.selectQuestNode(entry.id);
      break;
    case "timelineEvent":
      store.selectTimelineEvent(entry.id);
      isEventEditorOpen.value = true;
      break;
    case "relation":
      store.selectRelation(entry.id);
      break;
    case "item":
      store.selectItem(entry.id);
      break;
    case "entityType":
      store.selectEntityType(entry.id);
      break;
    case "placement":
      if (entry.mapId) {
        store.selectMap(entry.mapId);
      }
      store.selectPlacement(entry.id);
      break;
    default:
      break;
  }

  selectBrowserTab(browserTabForEntry(entry));
}

function isBrowserEntryActive(entry: BrowserEntry): boolean {
  switch (entry.kind) {
    case "entity":
      return state.value.selectedEntityId === entry.id;
    case "map":
      return state.value.selectedMapId === entry.id;
    case "note":
      return state.value.selectedNoteId === entry.id;
    case "questline":
      return state.value.selectedQuestlineId === entry.id;
    case "questNode":
      return state.value.selectedQuestNodeId === entry.id;
    case "timelineEvent":
      return state.value.selectedTimelineEventId === entry.id;
    case "relation":
      return state.value.selectedRelationId === entry.id;
    case "item":
      return state.value.selectedItemId === entry.id;
    case "entityType":
      return state.value.selectedEntityTypeId === entry.id;
    case "placement":
      return state.value.selectedPlacementId === entry.id;
    default:
      return false;
  }
}

function selectBrowserTab(tab: BrowserTabKey): void {
  browserTab.value = tab;
}

async function createBrowserEntity(): Promise<void> {
  const workspace = snapshot.value?.workspace;
  if (!workspace) {
    return;
  }

  npcEditorService.openCreate();
}

async function createBrowserMap(): Promise<void> {
  const workspace = snapshot.value?.workspace;
  if (!workspace) {
    return;
  }

  const paths = await window.masterCrafter.dialog.openFile({
    title: "Import Map Images",
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg"] }],
    properties: ["openFile", "multiSelections"],
  });

  if (!paths.length) {
    return;
  }

  for (const sourceFilePath of paths) {
    const fallbackTitle = sourceFilePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? "Map";
    await store.importMapImage({
      workspaceId: workspace.id,
      sourceFilePath,
      mapTitle: fallbackTitle,
      mapDescription: "",
    });
  }

  store.selectView("map");
}

async function createBrowserNote(): Promise<void> {
  const workspace = snapshot.value?.workspace;
  if (!workspace) {
    return;
  }

  await store.saveNote({
    workspaceId: workspace.id,
    title: "Untitled Note",
    kind: "markdown",
    body: "",
    tags: [],
    linkedEntityIds: [],
  });
  store.selectView("notes");
}

async function createBrowserQuestline(): Promise<void> {
  const workspace = snapshot.value?.workspace;
  if (!workspace) {
    return;
  }

  await store.saveQuestline({
    workspaceId: workspace.id,
    anchorEntityId: null,
    title: "Untitled Questline",
    description: "",
    status: "draft",
  });
  store.selectView("graph");
}

async function createBrowserQuestNode(): Promise<void> {
  const workspace = snapshot.value?.workspace;
  if (!workspace) {
    return;
  }

  let questline = selectedQuestline.value ?? snapshot.value?.questlines[0] ?? null;
  if (!questline) {
    questline = await store.saveQuestline({
      workspaceId: workspace.id,
      anchorEntityId: null,
      title: "Untitled Questline",
      description: "",
      status: "draft",
    });
  }

  const siblingCount = snapshot.value?.questNodes.filter((node) => node.questlineId === questline.id).length ?? 0;
  const saved = await store.saveQuestNode({
    workspaceId: workspace.id,
    questlineId: questline.id,
    parentNodeId: selectedQuestNode.value?.questlineId === questline.id ? selectedQuestNode.value.id : null,
    title: "Untitled Quest Node",
    description: "",
    rewards: [],
    orderIndex: siblingCount,
    stamp: resolveBrowserQuestNodeStamp(questline.id),
  });
  store.focusQuestNode(saved.id);
}

async function createBrowserTimelineEvent(): Promise<void> {
  const workspace = snapshot.value?.workspace;
  if (!workspace) {
    return;
  }

  const saved = await store.saveTimelineEvent({
    workspaceId: workspace.id,
    title: "Untitled Event",
    description: "",
    eventType: "Event",
    laneKind: "global",
    laneLabel: GLOBAL_TIMELINE_LABEL,
    stamp: {
      year: 1,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
    },
    durationMinutes: 60,
    entityId: null,
    questNodeId: null,
    locationEntityId: null,
  });
  store.selectTimelineEvent(saved.id);
  isEventEditorOpen.value = true;
  store.selectView("timeline");
}

async function createBrowserRelation(): Promise<void> {
  const workspace = snapshot.value?.workspace;
  if (!workspace) {
    return;
  }

  const source = npcEntities.value[0] ?? null;
  const target = npcEntities.value[1] ?? null;
  if (!source || !target) {
    window.alert("Add at least two NPCs first.");
    return;
  }

  await store.saveRelation({
    workspaceId: workspace.id,
    sourceEntityId: source.id,
    targetEntityId: target.id,
    relationKind: "custom",
    label: `${source.title} ↔ ${target.title}`,
    notes: "",
  });
  store.selectView("graph");
}

async function createBrowserItem(): Promise<void> {
  const workspace = snapshot.value?.workspace;
  if (!workspace) {
    return;
  }

  await store.saveItem({
    workspaceId: workspace.id,
    title: "Untitled Item",
    description: "",
    worth: 0,
    rarity: "common",
    tags: [],
  });
}

async function createBrowserType(): Promise<void> {
  const workspace = snapshot.value?.workspace;
  if (!workspace) {
    return;
  }

  await store.saveEntityType({
    workspaceId: workspace.id,
    typeKey: `custom_${createId().replace(/-/g, "").slice(0, 8)}`,
    displayName: "New Type",
    icon: "sparkles",
    color: "#77c8ff",
    description: "",
    builtin: false,
    fieldDefinitions: [],
  });
  store.selectView("types");
}

async function createBrowserPlacement(kind: MapPlacementDto["kind"]): Promise<void> {
  const workspace = snapshot.value?.workspace;
  const map = selectedMap.value ?? snapshot.value?.maps[0] ?? null;
  if (!workspace || !map) {
    window.alert("Create or import a map first.");
    return;
  }

  await store.savePlacement({
    workspaceId: workspace.id,
    mapId: map.id,
    entityId: null,
    label: kind === "point" ? "Marker" : kind === "region" ? "Area" : "Pen Line",
    kind,
    geometry: createPlacementGeometry(kind),
    textWidth: kind === "region" ? 48 : 48,
    textHeight: kind === "region" ? 48 : 48,
    textOffsetX: 0,
    textOffsetY: 0,
    notes: "",
    color: "#77c8ff",
    glowColor: "#77c8ff",
    shadowColor: "#000000",
    scale: 1,
    fontColor: "#ffffff",
    zIndex: (snapshot.value?.placements.filter((placement) => placement.mapId === map.id).length ?? 0) + 1,
  });
  store.selectMap(map.id);
  store.selectView("map");
}

async function createBrowserRecord(): Promise<void> {
  switch (browserTab.value) {
    case "npcs":
      await createBrowserEntity();
      break;
    case "maps":
      await createBrowserMap();
      break;
    case "notes":
      await createBrowserNote();
      break;
    case "quests":
      await createBrowserQuestline();
      break;
    case "nodes":
      await createBrowserQuestNode();
      break;
    case "timeline":
      await createBrowserTimelineEvent();
      break;
    case "relations":
      await createBrowserRelation();
      break;
    case "items":
      await createBrowserItem();
      break;
    case "types":
      await createBrowserType();
      break;
    case "markers":
    case "areas":
    case "paths":
      await createBrowserPlacement(activePlacementBrowserKind.value ?? "point");
      break;
    default:
      break;
  }
}

function setEntityFieldValue(key: string, value: string): void {
  entityDraft.customFields = {
    ...entityDraft.customFields,
    [key]: value,
  };
}

async function saveEntity(): Promise<void> {
  if (!snapshot.value) {
    return;
  }

  const definitions = selectedTypeDefinition.value?.fieldDefinitions ?? [];
  const normalizedCustomFields = Object.entries(entityDraft.customFields).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
    const definition = definitions.find((entry) => entry.key === key);
    if (!definition) {
      accumulator[key] = value;
      return accumulator;
    }

    if (definition.kind === "number") {
      const parsed = Number(value);
      accumulator[key] = Number.isFinite(parsed) ? parsed : 0;
      return accumulator;
    }

    if (definition.kind === "boolean") {
      accumulator[key] = value === true || value === "true";
      return accumulator;
    }

    accumulator[key] = value;
    return accumulator;
  }, {});

  const saved = await store.saveEntity({
    ...entityDraft,
    title: entityDraft.title.trim() || "Untitled Entity",
    slug: entityDraft.slug.trim() || slugify(entityDraft.title || "untitled-entity"),
    tags: entityTagsText.value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    customFields: normalizedCustomFields,
  });

  store.selectEntity(saved.id);
}

async function deleteEntity(): Promise<void> {
  if (!snapshot.value || !selectedEntity.value) {
    return;
  }

  const entityId = selectedEntity.value.id;
  const entityTitle = selectedEntity.value.title;

  const confirmed = await confirmationDialogService.requestConfirmation({
    title: `Delete ${entityTitle}?`,
    message: `This will permanently remove ${entityTitle} from the workspace.`,
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    tone: "danger",
  });

  if (!confirmed) {
    return;
  }

  try {
    await store.deleteEntity(snapshot.value.workspace.id, entityId);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : `Unable to delete ${entityTitle}.`);
  }
}

async function saveQuestline(): Promise<void> {
  if (!snapshot.value || !selectedQuestline.value) {
    return;
  }

  await store.saveQuestline({
    workspaceId: snapshot.value.workspace.id,
    id: questlineDraft.id,
    anchorEntityId: questlineDraft.anchorEntityId,
    title: questlineDraft.title.trim() || "Untitled Questline",
    description: questlineDraft.description,
    status: questlineDraft.status,
  });
}

async function deleteQuestline(): Promise<void> {
  if (!snapshot.value || !selectedQuestline.value) {
    return;
  }

  const questlineTitle = selectedQuestline.value.title;
  const confirmed = await confirmationDialogService.requestConfirmation({
    title: `Delete ${questlineTitle}?`,
    message: `This will permanently remove the questline ${questlineTitle} and its quest nodes.`,
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    tone: "danger",
  });

  if (!confirmed) {
    return;
  }

  try {
    await store.deleteQuestline(snapshot.value.workspace.id, selectedQuestline.value.id);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : `Unable to delete ${questlineTitle}.`);
  }
}

function addQuestNodeReward(): void {
  questNodeDraft.rewards = [
    ...questNodeDraft.rewards,
    {
      kind: "gold",
      value: "",
      amount: 1,
      notes: "",
    },
  ];
}

function removeQuestNodeReward(index: number): void {
  questNodeDraft.rewards = questNodeDraft.rewards.filter((_, rewardIndex) => rewardIndex !== index);
}

function normalizeQuestNodeRewards(): QuestRewardDto[] {
  return questNodeDraft.rewards.map((reward) => ({
    kind: reward.kind,
    value: reward.value.trim(),
    amount: Number.isFinite(reward.amount) ? Math.max(0, Math.floor(reward.amount)) : 0,
    notes: reward.notes.trim(),
  }));
}

async function saveQuestNode(): Promise<void> {
  if (!snapshot.value || !selectedQuestNode.value) {
    return;
  }

  const questlineId = questNodeDraft.questlineId || selectedQuestNode.value.questlineId;
  if (!questlineId) {
    window.alert("Select a questline before saving this quest node.");
    return;
  }

  await store.saveQuestNode({
    workspaceId: snapshot.value.workspace.id,
    id: questNodeDraft.id,
    questlineId,
    parentNodeId: questNodeDraft.parentNodeId,
    title: questNodeDraft.title.trim() || "Untitled Quest Node",
    description: questNodeDraft.description,
    rewards: normalizeQuestNodeRewards(),
    orderIndex: Number.isFinite(questNodeDraft.orderIndex) ? questNodeDraft.orderIndex : 0,
  });
}

async function deleteQuestNode(): Promise<void> {
  if (!snapshot.value || !selectedQuestNode.value) {
    return;
  }

  const questNodeTitle = selectedQuestNode.value.title;
  const confirmed = await confirmationDialogService.requestConfirmation({
    title: `Delete ${questNodeTitle}?`,
    message: `This will permanently remove the quest node ${questNodeTitle}.`,
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    tone: "danger",
  });

  if (!confirmed) {
    return;
  }

  try {
    await store.deleteQuestNode(snapshot.value.workspace.id, selectedQuestNode.value.questlineId, selectedQuestNode.value.id);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : `Unable to delete ${questNodeTitle}.`);
  }
}

async function saveTimelineEvent(): Promise<void> {
  if (!snapshot.value || !selectedTimelineEvent.value) {
    return;
  }

  await store.saveTimelineEvent({
    workspaceId: snapshot.value.workspace.id,
    id: selectedTimelineEvent.value.id,
    entityId: selectedTimelineEvent.value.entityId,
    questNodeId: selectedTimelineEvent.value.questNodeId,
    title: selectedTimelineEvent.value.title,
    description: selectedTimelineEvent.value.description,
    eventType: selectedTimelineEvent.value.eventType,
    laneKind: selectedTimelineEvent.value.laneKind,
    laneLabel: selectedTimelineEvent.value.laneLabel,
    stamp: selectedTimelineEvent.value.stamp,
    durationMinutes: selectedTimelineEvent.value.durationMinutes,
    locationEntityId: selectedTimelineEvent.value.locationEntityId,
  });
}
</script>

<template>
  <!-- <section class="inspector-stack">
    <div class="inspector-card">
      <p class="section-title">Inspector</p>
      <h2>{{ selectedEntity?.title || selectedPlacement?.label || selectedNote?.title || selectedMap?.title || selectedQuestline?.title || selectedTimelineEvent?.title || selectedRelation?.label || selectedItem?.title || selectedTypeDefinition?.displayName || "Nothing selected" }}</h2>
      <p class="muted">Edit the currently selected record or review backlinks and linked entities here.</p>
    </div>

    <div class="inspector-card browse-card">
      <div class="inspector-header">
        <strong>Browse</strong>
        <span>{{ npcEntities.length }} NPCs · {{ selectedMapPlacements.length }} placements</span>
      </div>

      <div class="browse-section">
        <p class="section-title">NPCs</p>
        <div class="browse-list">
          <button
            v-for="entity in npcEntities"
            :key="entity.id"
            type="button"
            class="browse-row"
            :class="{ active: entity.id === state.selectedEntityId }"
            @click="openEntity(entity.id)"
          >
            <strong>{{ entity.title }}</strong>
            <span>{{ entity.subtitle || entity.typeKey }}</span>
          </button>
          <p v-if="!npcEntities.length" class="muted">No NPCs yet.</p>
        </div>
      </div>

      <div class="browse-section">
        <p class="section-title">Markers</p>
        <div class="browse-list">
          <button
            v-for="placement in markerPlacements"
            :key="placement.id"
            type="button"
            class="browse-row"
            :class="{ active: placement.id === state.selectedPlacementId }"
            @click="openPlacement(placement)"
          >
            <strong>{{ placement.label }}</strong>
            <span>{{ placementSubtitle(placement) }}</span>
          </button>
          <p v-if="!markerPlacements.length" class="muted">No markers on this map.</p>
        </div>
      </div>

      <div class="browse-section">
        <p class="section-title">Areas</p>
        <div class="browse-list">
          <button
            v-for="placement in areaPlacements"
            :key="placement.id"
            type="button"
            class="browse-row"
            :class="{ active: placement.id === state.selectedPlacementId }"
            @click="openPlacement(placement)"
          >
            <strong>{{ placement.label }}</strong>
            <span>{{ placementSubtitle(placement) }}</span>
          </button>
          <p v-if="!areaPlacements.length" class="muted">No areas on this map.</p>
        </div>
      </div>

      <div class="browse-section">
        <p class="section-title">Pen Lines</p>
        <div class="browse-list">
          <button
            v-for="placement in pathPlacements"
            :key="placement.id"
            type="button"
            class="browse-row"
            :class="{ active: placement.id === state.selectedPlacementId }"
            @click="openPlacement(placement)"
          >
            <strong>{{ placement.label }}</strong>
            <span>{{ placementSubtitle(placement) }}</span>
          </button>
          <p v-if="!pathPlacements.length" class="muted">No pen lines on this map.</p>
        </div>
      </div>
    </div>

    <div v-if="selectedPlacement" class="inspector-card">
      <div class="inspector-header">
        <strong>Marker</strong>
        <div class="actions">
          <button type="button" @click="selectMapFromPlacement()">Go To Map</button>
          <button type="button" class="danger" @click="deletePlacement()">Delete</button>
        </div>
      </div>
      <label>
        <span class="field-label">Label</span>
        <input v-model="placementDraft.label" type="text" />
      </label>
      <label>
        <span class="field-label">Kind</span>
        <select v-model="placementDraft.kind">
          <option value="point">Point</option>
          <option value="region">Region</option>
          <option value="path">Path</option>
        </select>
      </label>
      <label>
        <span class="field-label">Entity</span>
        <select v-model="placementDraft.entityId">
          <option :value="null">Unlinked</option>
          <option v-for="entity in snapshot?.entities ?? []" :key="entity.id" :value="entity.id">{{ entity.title }}</option>
        </select>
      </label>
      <label>
        <span class="field-label">Color</span>
        <input v-model="placementDraft.color" type="color" />
      </label>
      <label>
        <span class="field-label">Notes</span>
        <textarea v-model="placementDraft.notes"></textarea>
      </label>
      <button type="button" @click="savePlacement()">Save Marker</button>
    </div>

    <div v-else-if="selectedEntity" class="inspector-card">
      <div class="inspector-header">
        <strong>Entity</strong>
        <div class="actions">
          <button type="button" class="icon-toggle" :title="entityCollapsed ? 'Expand Entity' : 'Collapse Entity'" @click="entityCollapsed = !entityCollapsed">
            {{ entityCollapsed ? ">" : "v" }}
          </button>
          <button type="button" class="danger" @click="deleteEntity()">Delete</button>
          <button type="button" @click="saveEntity()">Save</button>
        </div>
      </div>
      <Transition name="fold">
        <div v-if="!entityCollapsed" class="entity-body">
          <label>
            <span class="field-label">Type</span>
            <select v-model="entityDraft.typeKey">
              <option v-for="type in snapshot?.entityTypes ?? []" :key="type.id" :value="type.typeKey">{{ type.displayName }}</option>
            </select>
          </label>
          <label>
            <span class="field-label">Title</span>
            <input v-model="entityDraft.title" type="text" />
          </label>
          <label>
            <span class="field-label">Slug</span>
            <input v-model="entityDraft.slug" type="text" />
          </label>
          <label>
            <span class="field-label">Subtitle</span>
            <input v-model="entityDraft.subtitle" type="text" />
          </label>
          <label>
            <span class="field-label">Description</span>
            <textarea v-model="entityDraft.description"></textarea>
          </label>
          <label>
            <span class="field-label">Markdown</span>
            <textarea v-model="entityDraft.markdown"></textarea>
          </label>
          <label>
            <span class="field-label">Tags</span>
            <input v-model="entityTagsText" type="text" />
          </label>
          <div class="field-group">
            <p class="section-title">Custom Fields</p>
            <div v-if="selectedTypeDefinition?.fieldDefinitions.length" class="custom-fields">
              <label v-for="field in selectedTypeDefinition.fieldDefinitions" :key="field.id">
                <span class="field-label">{{ field.label }}</span>
                <input
                  v-if="field.kind === 'text' || field.kind === 'number' || field.kind === 'date' || field.kind === 'relation' || field.kind === 'image'"
                  :type="field.kind === 'number' ? 'number' : 'text'"
                  :value="entityFieldValue(field.key)"
                  @input="setEntityFieldValue(field.key, ($event.target as HTMLInputElement).value)"
                />
                <textarea
                  v-else-if="field.kind === 'textarea'"
                  :value="entityFieldValue(field.key)"
                  @input="setEntityFieldValue(field.key, ($event.target as HTMLTextAreaElement).value)"
                />
                <select
                  v-else-if="field.kind === 'select'"
                  :value="entityFieldValue(field.key)"
                  @change="setEntityFieldValue(field.key, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">Select value</option>
                  <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
                </select>
                <label v-else-if="field.kind === 'boolean'" class="boolean-row">
                  <input
                    type="checkbox"
                    :checked="entityFieldValue(field.key) === 'true'"
                    @change="setEntityFieldValue(field.key, ($event.target as HTMLInputElement).checked ? 'true' : 'false')"
                  />
                  <span>Enabled</span>
                </label>
              </label>
            </div>
          </div>
          <button type="button" @click="saveEntity()">Save Entity</button>
        </div>
        <button v-else type="button" class="entity-summary-card" @click="entityCollapsed = false">Click to expand entity fields</button>
      </Transition>
    </div>

    <div v-else-if="selectedNote" class="inspector-card">
      <p class="section-title">Backlinks</p>
      <div class="backlink-list">
        <button v-for="link in state.backlinks" :key="`${link.sourceType}-${link.sourceId}`" type="button" class="backlink-row">
          <strong>{{ link.sourceTitle }}</strong>
          <span>{{ link.sourceSnippet }}</span>
        </button>
      </div>
      <p class="muted">Notes are edited in the center pane. Use backlinks to jump to linked content.</p>
    </div>

    <div v-else-if="selectedMap" class="inspector-card">
      <div class="inspector-header">
        <strong>Map</strong>
        <span>{{ selectedMap.width }} × {{ selectedMap.height }}</span>
      </div>
      <p class="muted">{{ selectedMap.description || "No map description yet." }}</p>
      <p class="muted">Placements: {{ snapshot?.placements.filter((placement) => placement.mapId === selectedMap?.id).length ?? 0 }}</p>
      <p class="muted">Image: {{ selectedMap.assetName }}</p>
      <p class="muted">{{ selectedMap.assetPath }}</p>
    </div>

    <div v-else-if="selectedQuestline" class="inspector-card">
      <div class="inspector-header">
        <strong>Questline</strong>
        <button type="button" @click="saveQuestline()">Save</button>
      </div>
      <label>
        <span class="field-label">Title</span>
        <input v-model="questlineDraft.title" type="text" />
      </label>
      <label>
        <span class="field-label">Status</span>
        <select v-model="questlineDraft.status">
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        </select>
      </label>
      <label>
        <span class="field-label">Anchor Entity</span>
        <select v-model="questlineDraft.anchorEntityId">
          <option :value="null">None</option>
          <option v-for="entity in snapshot?.entities ?? []" :key="entity.id" :value="entity.id">{{ entity.title }}</option>
        </select>
      </label>
      <label>
        <span class="field-label">Description</span>
        <textarea v-model="questlineDraft.description"></textarea>
      </label>
      <p class="muted">{{ selectedQuestline.description }}</p>
      <p class="chip">{{ selectedQuestline.status }}</p>
    </div>

    <div v-else-if="selectedTimelineEvent" class="inspector-card">
      <div class="inspector-header">
        <strong>Timeline Event</strong>
      </div>
      <p class="muted">{{ selectedTimelineEvent.eventType }}</p>
      <p class="muted">
        {{ selectedTimelineEvent.stamp.year }}-{{ selectedTimelineEvent.stamp.month }}-{{ selectedTimelineEvent.stamp.day }}
        {{ selectedTimelineEvent.stamp.hour }}:{{ String(selectedTimelineEvent.stamp.minute).padStart(2, "0") }}
      </p>
      <p class="muted">{{ selectedTimelineEvent.description }}</p>
    </div>

    <div v-else-if="selectedRelation" class="inspector-card">
      <strong>Relation</strong>
      <p class="muted">{{ selectedRelation.relationKind }}</p>
      <p class="muted">{{ selectedRelation.notes }}</p>
    </div>

    <div v-else-if="selectedItem" class="inspector-card">
      <strong>Item</strong>
      <p class="muted">{{ selectedItem.rarity }} · {{ selectedItem.worth }} gp</p>
      <p class="muted">{{ selectedItem.description }}</p>
    </div>

    <div v-else-if="selectedTypeDefinition" class="inspector-card">
      <strong>Type Definition</strong>
      <p class="muted">{{ selectedTypeDefinition.description }}</p>
    </div>

    <div v-else class="inspector-card">
      <p class="muted">Select a map marker, entity, note, questline, or event to inspect and edit it here.</p>
    </div>
  </section> -->
  <section class="inspector-stack">
    <div class="inspector-card inspector-summary">
      <p class="section-title">Inspector</p>
      <h2>{{ browserSelectionTitle }}</h2>
      <p class="muted">Browse records by type, then edit the active record below.</p>
    </div>

    <div class="inspector-card browse-card">
      <div class="inspector-header">
        <strong>Browser</strong>
        <span>{{ browserActiveTab?.count ?? 0 }} records</span>
      </div>

      <div class="browser-tabs" role="tablist" aria-label="Browser tabs">
        <button
          v-for="tab in browserTabs"
          :key="tab.key"
          type="button"
          class="browser-tab"
          :class="{ active: tab.key === browserTab }"
          role="tab"
          :aria-selected="tab.key === browserTab"
          :tabindex="tab.key === browserTab ? 0 : -1"
          @click="selectBrowserTab(tab.key)"
        >
          <span>{{ tab.label }}</span>
          <span>{{ tab.count }}</span>
        </button>
      </div>

      <div class="browse-list browser-list">
        <button
          v-for="entry in browserTabEntries"
          :key="entry.id"
          type="button"
          class="browse-row"
          :class="{ active: isBrowserEntryActive(entry) }"
          @click="openBrowserEntry(entry)"
        >
          <strong>{{ entry.title }}</strong>
          <span>{{ entry.subtitle }}</span>
        </button>
        <p v-if="!browserTabEntries.length" class="muted browser-empty">{{ browserEmptyMessage }}</p>
      </div>

      <div class="browser-create">
        <button
          type="button"
          class="browser-create-button"
          :disabled="!!browserCreateDisabledReason"
          :title="browserCreateDisabledReason || browserCreateHelperText || browserCreateLabel"
          @click="createBrowserRecord()"
        >
          <span class="browser-create-symbol">+</span>
          <span>{{ browserCreateLabel }}</span>
        </button>
        <p class="muted browser-create-hint">{{ browserCreateDisabledReason || browserCreateHelperText }}</p>
      </div>
    </div>

    <div v-if="browserTab === 'npcs'" class="inspector-card">
      <template v-if="selectedEntity">
        <div class="inspector-header">
          <strong>NPC</strong>
          <div class="actions">
            <button type="button" @click="npcEditorService.openEdit(selectedEntity.id)">Edit NPC</button>
          </div>
        </div>

        <div class="npc-summary-card">
          <div class="npc-summary-hero">
            <div class="npc-summary-copy">
              <h3>{{ selectedEntity.title }}</h3>
              <p class="muted">{{ selectedEntity.subtitle || "NPC" }}</p>
            </div>

            <div class="npc-summary-chips">
              <span class="chip">{{ selectedEntity.tags.length }} tags</span>
              <span class="chip">{{ selectedEntity.npcStatblock ? "Statblock attached" : "No statblock" }}</span>
            </div>
          </div>

          <p class="npc-summary-description">{{ selectedEntity.description || "No description provided." }}</p>

          <div v-if="selectedEntity.npcStatblock" class="npc-summary-block">
            <span class="chip">AC {{ selectedEntity.npcStatblock.armorClass || "Unset" }}</span>
            <span class="chip">HP {{ selectedEntity.npcStatblock.hitPoints || "Unset" }}</span>
            <span class="chip">Speed {{ selectedEntity.npcStatblock.speed || "Unset" }}</span>
          </div>

          <div v-if="selectedEntity.tags.length" class="npc-summary-tags">
            <span v-for="tag in selectedEntity.tags" :key="tag" class="chip">{{ tag }}</span>
          </div>
        </div>
      </template>
      <p v-else class="muted">Select an NPC to inspect it.</p>
    </div>

    <div v-else-if="browserTab === 'maps'" class="inspector-card">
      <MapDetailsEditor />
    </div>

    <div v-else-if="browserTab === 'notes'" class="inspector-card">
      <template v-if="selectedNote">
        <p class="section-title">Backlinks</p>
        <div class="backlink-list">
          <button v-for="link in state.backlinks" :key="`${link.sourceType}-${link.sourceId}`" type="button" class="backlink-row">
            <strong>{{ link.sourceTitle }}</strong>
            <span>{{ link.sourceSnippet }}</span>
          </button>
        </div>
        <p class="muted">Notes are edited in the center pane. Use backlinks to jump to linked content.</p>
      </template>
      <p v-else class="muted">Select a note to inspect backlinks.</p>
    </div>

    <div v-else-if="browserTab === 'quests'" class="inspector-card">
      <div v-if="selectedQuestline">
        <div class="inspector-header">
          <strong>Questline</strong>
          <div class="actions">
            <button type="button" class="danger" @click="deleteQuestline()">Delete</button>
            <button type="button" @click="saveQuestline()">Save</button>
          </div>
        </div>
        <label>
          <span class="field-label">Title</span>
          <input v-model="questlineDraft.title" type="text" />
        </label>
        <label>
          <span class="field-label">Status</span>
          <select v-model="questlineDraft.status">
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
        </label>
        <label>
          <span class="field-label">Anchor Entity</span>
          <select v-model="questlineDraft.anchorEntityId">
            <option :value="null">None</option>
            <option v-for="entity in snapshot?.entities ?? []" :key="entity.id" :value="entity.id">{{ entity.title }}</option>
          </select>
        </label>
        <label>
          <span class="field-label">Description</span>
          <textarea v-model="questlineDraft.description"></textarea>
        </label>
        <p class="muted">{{ selectedQuestline!.description }}</p>
        <p class="chip">{{ selectedQuestline!.status }}</p>
      </div>
      <p v-else class="muted">Select a questline to edit it.</p>
    </div>

    <div v-else-if="browserTab === 'nodes'" class="inspector-card">
      <div v-if="selectedQuestNode">
        <div class="inspector-header">
          <strong>Quest Node</strong>
          <div class="actions">
            <button type="button" class="danger" @click="deleteQuestNode()">Delete</button>
            <button type="button" @click="saveQuestNode()">Save</button>
          </div>
        </div>
        <label>
          <span class="field-label">Questline</span>
          <select v-model="questNodeDraft.questlineId">
            <option v-for="questline in snapshot?.questlines ?? []" :key="questline.id" :value="questline.id">{{ questline.title }}</option>
          </select>
        </label>
        <label>
          <span class="field-label">Parent Node</span>
          <select v-model="questNodeDraft.parentNodeId">
            <option :value="null">None</option>
            <option v-for="node in questNodeParentOptions" :key="node.id" :value="node.id">{{ node.title }}</option>
          </select>
        </label>
        <label>
          <span class="field-label">Title</span>
          <input v-model="questNodeDraft.title" type="text" />
        </label>
        <label>
          <span class="field-label">Order</span>
          <input v-model.number="questNodeDraft.orderIndex" type="number" min="0" />
        </label>
        <label>
          <span class="field-label">Description</span>
          <textarea v-model="questNodeDraft.description"></textarea>
        </label>
        <div class="field-group">
          <div class="inspector-header">
            <strong>Rewards</strong>
            <button type="button" @click="addQuestNodeReward()">Add Reward</button>
          </div>
          <div class="quest-node-rewards">
            <div v-for="(reward, index) in questNodeDraft.rewards" :key="`${reward.kind}-${index}`" class="quest-node-reward-row">
              <select v-model="reward.kind">
                <option value="gold">Gold</option>
                <option value="xp">XP</option>
                <option value="item">Item</option>
                <option value="reputation">Reputation</option>
                <option value="note">Note</option>
                <option value="flag">Flag</option>
              </select>
              <input v-model="reward.value" type="text" placeholder="Value" />
              <input v-model.number="reward.amount" type="number" min="0" placeholder="Amount" />
              <input v-model="reward.notes" type="text" placeholder="Notes" />
              <button type="button" class="danger" @click="removeQuestNodeReward(index)">Remove</button>
            </div>
            <p v-if="!questNodeDraft.rewards.length" class="muted">No rewards yet.</p>
          </div>
        </div>
        <button type="button" @click="saveQuestNode()">Save Quest Node</button>
      </div>
      <p v-else class="muted">Select a quest node to edit it.</p>
    </div>

    <div v-else-if="browserTab === 'timeline'" class="inspector-card">
      <div v-if="selectedTimelineEvent">
        <div class="inspector-header">
          <strong>Timeline Event</strong>
        </div>
        <p class="muted">{{ selectedTimelineEvent!.eventType }}</p>
        <p class="muted">
          {{ selectedTimelineEvent!.stamp.year }}-{{ selectedTimelineEvent!.stamp.month }}-{{ selectedTimelineEvent!.stamp.day }}
          {{ selectedTimelineEvent!.stamp.hour }}:{{ String(selectedTimelineEvent!.stamp.minute).padStart(2, "0") }}
        </p>
        <p class="muted">{{ selectedTimelineEvent!.description }}</p>
      </div>
      <p v-else class="muted">Select a timeline event to inspect it.</p>
    </div>

    <div v-else-if="browserTab === 'relations'" class="inspector-card">
      <div v-if="selectedRelation">
        <strong>Relation</strong>
        <p class="muted">{{ selectedRelation!.relationKind }}</p>
        <p class="muted">{{ selectedRelation!.notes }}</p>
      </div>
      <p v-else class="muted">Select a relation to inspect it.</p>
    </div>

    <div v-else-if="browserTab === 'items'" class="inspector-card">
      <div v-if="selectedItem">
        <strong>Item</strong>
        <p class="muted">{{ selectedItem!.rarity }} - {{ selectedItem!.worth }} gp</p>
        <p class="muted">{{ selectedItem!.description }}</p>
      </div>
      <p v-else class="muted">Select an item to inspect it.</p>
    </div>

    <div v-else-if="browserTab === 'types'" class="inspector-card">
      <div v-if="selectedTypeDefinition">
        <strong>Type Definition</strong>
        <p class="muted">{{ selectedTypeDefinition!.description }}</p>
      </div>
      <p v-else class="muted">Select an entity type to inspect it.</p>
    </div>

    <div v-else class="inspector-card">
      <p class="muted">Select a record type above to inspect and edit it here.</p>
    </div>
  </section>

  <TimelineEventEditorModal v-if="isEventEditorOpen && selectedTimelineEvent" @close="isEventEditorOpen = false" />
</template>

<style scoped>
.inspector-stack {
  display: grid;
  gap: 0.22rem;
}

.inspector-card {
  padding: 0.32rem;
  border-radius: 8px;
  background: rgba(10, 16, 24, 0.4);
  border: 1px solid var(--bg-border);
  display: grid;
  gap: 0.2rem;
}

.inspector-summary {
  gap: 0.14rem;
}

.browse-card {
  gap: 0.18rem;
}

.browser-tabs {
  display: flex;
  flex-wrap: nowrap;
  gap: 0.06rem;
  overflow-x: auto;
  padding-bottom: 0.06rem;
  border-bottom: 1px solid rgba(144, 163, 191, 0.16);
}

.browser-tab {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 0.16rem;
  padding: 0.2rem 0.38rem 0.24rem;
  border-radius: 8px 8px 0 0;
  background: rgba(10, 16, 24, 0.42);
  border: 1px solid rgba(144, 163, 191, 0.18);
  border-bottom-color: transparent;
  color: var(--fg-muted);
  font-size: 0.66rem;
  line-height: 1;
  white-space: nowrap;
}

.browser-tab span:last-child {
  min-width: 1.1rem;
  padding: 0.04rem 0.18rem;
  border-radius: 999px;
  background: rgba(144, 163, 191, 0.12);
  color: var(--fg);
  text-align: center;
}

.browser-tab.active {
  background: rgba(111, 244, 201, 0.14);
  border-color: rgba(111, 244, 201, 0.28);
  border-bottom-color: rgba(10, 16, 24, 0.42);
  color: var(--fg);
}

.browse-section {
  display: grid;
  gap: 0.14rem;
}

.browse-list {
  display: grid;
  gap: 0.08rem;
  padding: 0.08rem;
  border-radius: 0 0 8px 8px;
  background: rgba(10, 16, 24, 0.3);
  border: 1px solid rgba(144, 163, 191, 0.16);
  border-top: 0;
}

.browse-row {
  display: grid;
  gap: 0.03rem;
  text-align: left;
  padding: 0.22rem 0.26rem;
  border-radius: 7px;
  background: rgba(10, 16, 24, 0.48);
  border: 1px solid rgba(144, 163, 191, 0.16);
}

.browse-row span {
  color: var(--fg-muted);
  font-size: 0.68rem;
  line-height: 1.25;
}

.browse-row.active {
  background: rgba(111, 244, 201, 0.16);
  border-color: rgba(111, 244, 201, 0.28);
}

.browser-empty {
  padding: 0.08rem 0.04rem 0;
}

.browser-create {
  display: grid;
  gap: 0.08rem;
  padding-top: 0.04rem;
}

.browser-create-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.28rem;
  width: 100%;
  padding: 0.2rem 0.4rem;
  border-radius: 7px;
  font-size: 0.7rem;
}

.browser-create-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.browser-create-symbol {
  width: 1rem;
  height: 1rem;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(111, 244, 201, 0.14);
  color: var(--fg);
  font-size: 0.75rem;
  line-height: 1;
}

.browser-create-hint {
  font-size: 0.68rem;
  line-height: 1.25;
  min-height: 0.9rem;
}

.inspector-header {
  display: flex;
  justify-content: space-between;
  gap: 0.18rem;
  align-items: center;
}

.actions {
  display: flex;
  gap: 0.12rem;
}

.npc-summary-card {
  display: grid;
  gap: 0.5rem;
  padding: 0.34rem 0.04rem 0;
}

.npc-summary-hero {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.npc-summary-copy {
  display: grid;
  gap: 0.05rem;
  min-width: 0;
}

.npc-summary-copy h3 {
  margin: 0;
}

.npc-summary-chips,
.npc-summary-block,
.npc-summary-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.12rem;
}

.npc-summary-description {
  margin: 0;
  color: var(--fg-muted);
}

.npc-summary-block {
  padding-top: 0.05rem;
}

.icon-toggle {
  width: 20px;
  height: 20px;
  padding: 0;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 0.76rem;
  background: rgba(10, 16, 24, 0.56);
  border: 1px solid rgba(144, 163, 191, 0.22);
  color: var(--fg-muted);
}

.field-label {
  display: block;
  margin-bottom: 0.1rem;
  color: var(--fg-muted);
  font-size: 0.64rem;
}

.custom-fields {
  display: grid;
  gap: 0.18rem;
}

.boolean-row {
  display: flex;
  align-items: center;
  gap: 0.18rem;
}

.backlink-list {
  display: grid;
  gap: 0.14rem;
}

.backlink-row {
  text-align: left;
  display: grid;
  gap: 0.05rem;
}

.backlink-row span {
  color: var(--fg-muted);
  font-size: 0.76rem;
}

.entity-body {
  display: grid;
  gap: 0.16rem;
}

.entity-summary-card {
  text-align: left;
  padding: 0.26rem 0.34rem;
  border-radius: 7px;
  background: rgba(10, 16, 24, 0.48);
  border: 1px solid rgba(144, 163, 191, 0.18);
  color: var(--fg-muted);
}

.quest-node-rewards {
  display: grid;
  gap: 0.12rem;
}

.quest-node-reward-row {
  display: grid;
  gap: 0.08rem;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr) minmax(0, 0.55fr) minmax(0, 1fr) auto;
  align-items: start;
}

.quest-node-reward-row input,
.quest-node-reward-row select {
  min-width: 0;
}
</style>
