<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useMasterCrafter } from "@renderer/composables/useMasterCrafter";
import MapEditorView from "@renderer/components/MapEditorView.vue";
import MarkdownEditorView from "@renderer/components/MarkdownEditorView.vue";
import CalendarEditorView from "@renderer/components/CalendarEditorView.vue";
import TimelineEditorView from "@renderer/components/TimelineEditorView.vue";
import GraphExplorerView from "@renderer/components/GraphExplorerView.vue";
import EntityTypeBuilderView from "@renderer/components/EntityTypeBuilderView.vue";
import RecordInspectorView from "@renderer/components/RecordInspectorView.vue";
import EncounterWorkspaceView from "@renderer/components/encounters/EncounterWorkspaceView.vue";
import { encounterWorkspaceService } from "@renderer/services/EncounterWorkspaceService";
import { npcEditorService } from "@renderer/services/NpcEditorService";
import { hotkeyDispatcherService } from "@renderer/services/hotkeys";
import { getCalendarCycleLabel } from "@renderer/utils/calendar";

const store = useMasterCrafter();
const state = store.state;

const workspaceForm = reactive({
  name: "",
  description: "",
});
const searchInputRef = ref<HTMLInputElement | null>(null);
const SIDEBAR_WIDTH_KEY = "mastercrafter.sidebarWidth";
const INSPECTOR_WIDTH_KEY = "mastercrafter.inspectorWidth";
const DEFAULT_SIDEBAR_WIDTH = 192;
const DEFAULT_INSPECTOR_WIDTH = 208;
const MIN_SIDEBAR_WIDTH = 160;
const MIN_INSPECTOR_WIDTH = 176;
const WORKSPACE_MIN_WIDTH = 340;
const PANEL_LAYOUT_BUDGET = 24;
const sidebarWidth = ref(DEFAULT_SIDEBAR_WIDTH);
const inspectorWidth = ref(DEFAULT_INSPECTOR_WIDTH);
const sidebarResizeHandle = ref<HTMLElement | null>(null);
const inspectorResizeHandle = ref<HTMLElement | null>(null);
const sidebarResize = reactive({
  active: false,
  pointerId: null as number | null,
  startX: 0,
  startWidth: DEFAULT_SIDEBAR_WIDTH,
});
const inspectorResize = reactive({
  active: false,
  pointerId: null as number | null,
  startX: 0,
  startWidth: DEFAULT_INSPECTOR_WIDTH,
});

watch(
  () => state.value.snapshot?.workspace,
  (workspace) => {
    if (!workspace) {
      return;
    }

    workspaceForm.name = workspace.name;
    workspaceForm.description = workspace.description;
  },
  { immediate: true },
);

const activeWorkspace = computed(() => state.value.snapshot?.workspace ?? null);
const activeCalendar = computed(() => state.value.snapshot?.calendar ?? null);
const activeView = computed(() => state.value.activeView);
const campaignCollapsed = ref(false);
let unregisterHotkeys: (() => void) | null = null;

const navigationItems = computed(() => {
  const snapshot = state.value.snapshot;
  if (!snapshot) {
    return [];
  }

  switch (state.value.activeView) {
    case "map":
      return snapshot.maps.map((map) => ({ id: map.id, title: map.title, subtitle: map.description, kind: "map" as const }));
    case "notes":
      return snapshot.notes.map((note) => ({ id: note.id, title: note.title, subtitle: note.kind, kind: "note" as const }));
    case "timeline":
      return snapshot.timelineEvents.map((event) => ({ id: event.id, title: event.title, subtitle: `${event.eventType} - ${event.laneLabel}`, kind: "event" as const }));
    case "graph":
      return [
        ...snapshot.questlines.map((questline) => ({ id: questline.id, title: questline.title, subtitle: questline.status, kind: "questline" as const })),
        ...snapshot.relations.map((relation) => ({ id: relation.id, title: relation.label, subtitle: relation.relationKind, kind: "relation" as const })),
      ];
    case "types":
      return snapshot.entityTypes.map((type) => ({ id: type.id, title: type.displayName, subtitle: type.typeKey, kind: "type" as const }));
    case "encounters":
      return snapshot.encounters.map((encounter) => ({
        id: encounter.id,
        title: encounter.name,
        subtitle: encounter.description || `${snapshot.encounterCombatants.filter((combatant) => combatant.encounterId === encounter.id).length} combatants`,
        kind: "encounter" as const,
      }));
    default:
      return [];
  }
});

function clampSidebarWidth(nextWidth: number): number {
  const inspectorSpace = state.value.activeView === "encounters" || window.innerWidth <= 1500 ? 0 : inspectorWidth.value;
  const maxWidth = Math.max(MIN_SIDEBAR_WIDTH, window.innerWidth - inspectorSpace - WORKSPACE_MIN_WIDTH - PANEL_LAYOUT_BUDGET);
  return Math.min(Math.max(nextWidth, MIN_SIDEBAR_WIDTH), maxWidth);
}

function clampInspectorWidth(nextWidth: number): number {
  const maxWidth = Math.max(MIN_INSPECTOR_WIDTH, window.innerWidth - sidebarWidth.value - WORKSPACE_MIN_WIDTH - PANEL_LAYOUT_BUDGET);
  return Math.min(Math.max(nextWidth, MIN_INSPECTOR_WIDTH), maxWidth);
}

function restoreSidebarWidth(): void {
  const stored = Number.parseInt(window.localStorage.getItem(SIDEBAR_WIDTH_KEY) ?? "", 10);
  sidebarWidth.value = Number.isFinite(stored) ? clampSidebarWidth(stored) : DEFAULT_SIDEBAR_WIDTH;
}

function restoreInspectorWidth(): void {
  const stored = Number.parseInt(window.localStorage.getItem(INSPECTOR_WIDTH_KEY) ?? "", 10);
  inspectorWidth.value = Number.isFinite(stored) ? clampInspectorWidth(stored) : DEFAULT_INSPECTOR_WIDTH;
}

function persistSidebarWidth(): void {
  window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth.value));
}

function persistInspectorWidth(): void {
  window.localStorage.setItem(INSPECTOR_WIDTH_KEY, String(inspectorWidth.value));
}

function handleWindowResize(): void {
  sidebarWidth.value = clampSidebarWidth(sidebarWidth.value);
  if (window.innerWidth > 1500) {
    inspectorWidth.value = clampInspectorWidth(inspectorWidth.value);
    sidebarWidth.value = clampSidebarWidth(sidebarWidth.value);
  }
}

function startSidebarResize(event: PointerEvent): void {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  sidebarResize.active = true;
  sidebarResize.pointerId = event.pointerId;
  sidebarResize.startX = event.clientX;
  sidebarResize.startWidth = sidebarWidth.value;

  const handle = sidebarResizeHandle.value;
  if (handle && !handle.hasPointerCapture(event.pointerId)) {
    handle.setPointerCapture(event.pointerId);
  }

  window.addEventListener("pointermove", updateSidebarResize);
  window.addEventListener("pointerup", stopSidebarResize);
  window.addEventListener("pointercancel", stopSidebarResize);
}

function updateSidebarResize(event: PointerEvent): void {
  if (!sidebarResize.active || sidebarResize.pointerId !== event.pointerId) {
    return;
  }

  sidebarWidth.value = clampSidebarWidth(sidebarResize.startWidth + (event.clientX - sidebarResize.startX));
}

function stopSidebarResize(event?: PointerEvent): void {
  if (!sidebarResize.active) {
    return;
  }

  if (event && sidebarResize.pointerId !== event.pointerId) {
    return;
  }

  const handle = sidebarResizeHandle.value;
  if (event && handle && handle.hasPointerCapture(event.pointerId)) {
    handle.releasePointerCapture(event.pointerId);
  }

  sidebarResize.active = false;
  sidebarResize.pointerId = null;

  window.removeEventListener("pointermove", updateSidebarResize);
  window.removeEventListener("pointerup", stopSidebarResize);
  window.removeEventListener("pointercancel", stopSidebarResize);
  persistSidebarWidth();
}

function startInspectorResize(event: PointerEvent): void {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  inspectorResize.active = true;
  inspectorResize.pointerId = event.pointerId;
  inspectorResize.startX = event.clientX;
  inspectorResize.startWidth = inspectorWidth.value;

  const handle = inspectorResizeHandle.value;
  if (handle && !handle.hasPointerCapture(event.pointerId)) {
    handle.setPointerCapture(event.pointerId);
  }

  window.addEventListener("pointermove", updateInspectorResize);
  window.addEventListener("pointerup", stopInspectorResize);
  window.addEventListener("pointercancel", stopInspectorResize);
}

function updateInspectorResize(event: PointerEvent): void {
  if (!inspectorResize.active || inspectorResize.pointerId !== event.pointerId) {
    return;
  }

  inspectorWidth.value = clampInspectorWidth(inspectorResize.startWidth - (event.clientX - inspectorResize.startX));
}

function stopInspectorResize(event?: PointerEvent): void {
  if (!inspectorResize.active) {
    return;
  }

  if (event && inspectorResize.pointerId !== event.pointerId) {
    return;
  }

  const handle = inspectorResizeHandle.value;
  if (event && handle && handle.hasPointerCapture(event.pointerId)) {
    handle.releasePointerCapture(event.pointerId);
  }

  inspectorResize.active = false;
  inspectorResize.pointerId = null;

  window.removeEventListener("pointermove", updateInspectorResize);
  window.removeEventListener("pointerup", stopInspectorResize);
  window.removeEventListener("pointercancel", stopInspectorResize);
  persistInspectorWidth();
}

watch(sidebarWidth, () => {
  persistSidebarWidth();
});

watch(inspectorWidth, () => {
  persistInspectorWidth();
});

onMounted(() => {
  restoreSidebarWidth();
  restoreInspectorWidth();
  window.addEventListener("resize", handleWindowResize);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleWindowResize);
  stopSidebarResize();
  stopInspectorResize();
});

function openSearchResult(result: { recordType: string; recordId: string }): void {
  switch (result.recordType) {
    case "entity":
      store.selectEntity(result.recordId);
      break;
    case "encounter":
      store.selectView("encounters");
      encounterWorkspaceService.selectEncounter(result.recordId);
      encounterWorkspaceService.openBuilder(result.recordId);
      break;
    case "encounterCombatant": {
      const combatant = state.value.snapshot?.encounterCombatants.find((entry) => entry.id === result.recordId);
      if (combatant) {
        store.selectView("encounters");
        encounterWorkspaceService.selectEncounter(combatant.encounterId);
        encounterWorkspaceService.openBuilder(combatant.encounterId);
      }
      break;
    }
    case "encounterSession": {
      const session = state.value.snapshot?.encounterSessions.find((entry) => entry.id === result.recordId);
      if (session) {
        store.selectView("encounters");
        encounterWorkspaceService.selectEncounter(session.encounterId);
        encounterWorkspaceService.openPlay(session.encounterId, session.id);
      }
      break;
    }
    case "npcLibraryEntry":
      store.selectView("encounters");
      encounterWorkspaceService.openNpcLibrary(result.recordId);
      break;
    case "playerLibraryEntry":
      store.selectView("encounters");
      encounterWorkspaceService.openPlayerLibrary(result.recordId);
      break;
    case "map":
      store.selectView("map");
      store.selectMap(result.recordId);
      break;
    case "placement": {
      const placement = state.value.snapshot?.placements.find((entry) => entry.id === result.recordId);
      if (placement) {
        store.selectView("map");
        store.selectMap(placement.mapId);
        store.selectPlacement(placement.id);
      }
      break;
    }
    case "note":
      store.selectNote(result.recordId);
      break;
    case "questline":
      store.selectQuestline(result.recordId);
      break;
    case "questNode":
      store.selectQuestNode(result.recordId);
      break;
    case "timelineEvent":
      store.selectTimelineEvent(result.recordId);
      break;
    case "relation":
      store.selectRelation(result.recordId);
      break;
    case "item":
      store.selectItem(result.recordId);
      break;
    default:
      break;
  }
}

function openEncountersWorkspace(): void {
  store.selectView("encounters");
  encounterWorkspaceService.openLibrary();
}

function openEncounterEdit(encounterId: string): void {
  store.selectView("encounters");
  encounterWorkspaceService.selectEncounter(encounterId);
  encounterWorkspaceService.openBuilder(encounterId);
}

async function openEncounterPlay(encounterId: string): Promise<void> {
  const workspace = state.value.snapshot?.workspace;
  if (!workspace) {
    return;
  }

  store.selectView("encounters");
  encounterWorkspaceService.selectEncounter(encounterId);
  const session = await store.startEncounterSession(workspace.id, encounterId);
  encounterWorkspaceService.openPlay(encounterId, session.id);
}

async function saveWorkspaceMetadata(): Promise<void> {
  const workspace = state.value.snapshot?.workspace;
  if (!workspace) {
    return;
  }

  await store.saveWorkspaceMetadata({
    workspaceId: workspace.id,
    name: workspaceForm.name.trim(),
    description: workspaceForm.description.trim(),
  });
}

async function exportBundle(): Promise<void> {
  const workspace = state.value.snapshot?.workspace;
  if (!workspace) {
    return;
  }

  const paths = await window.masterCrafter.dialog.saveFile({
    title: "Export Campaign Bundle",
    defaultPath: `${workspace.slug}.mcpack`,
    filters: [{ name: "MasterCrafter Campaign Bundle", extensions: ["mcpack"] }],
  });

  if (!paths) {
    return;
  }

  await store.exportBundle({
    workspaceId: workspace.id,
    outputFilePath: paths,
  });
}

function openLauncher(): void {
  store.closeWorkspace();
}

function toggleCampaignSection(): void {
  campaignCollapsed.value = !campaignCollapsed.value;
}

function focusSearch(): void {
  searchInputRef.value?.focus();
  searchInputRef.value?.select();
}

function openNpcEditor(): void {
  npcEditorService.openCreate();
}

function registerHotkeys(): void {
  unregisterHotkeys?.();
  unregisterHotkeys = hotkeyDispatcherService.registerScope({
    scopeId: "campaign-shell",
    scopeType: "shell",
    contextId: "shell",
    handlers: {
      "shell.viewMaps": () => store.selectView("map"),
      "shell.viewNotes": () => store.selectView("notes"),
      "shell.viewTimeline": () => store.selectView("timeline"),
      "shell.viewEncounters": () => openEncountersWorkspace(),
      "shell.viewCalendar": () => store.selectView("calendar"),
      "shell.viewGraphs": () => store.selectView("graph"),
      "shell.viewTypes": () => store.selectView("types"),
      "shell.openLauncher": () => openLauncher(),
      "shell.focusSearch": () => focusSearch(),
      "shell.saveWorkspaceMetadata": () => void saveWorkspaceMetadata(),
      "shell.exportBundle": () => void exportBundle(),
      "modals.openNpcEditor": () => openNpcEditor(),
    },
  });
}

onMounted(() => {
  registerHotkeys();
});

onBeforeUnmount(() => {
  unregisterHotkeys?.();
  unregisterHotkeys = null;
});
</script>

<template>
  <div
    class="shell-grid"
    :class="{ 'encounter-mode': activeView === 'encounters' }"
    :style="{ '--sidebar-width': `${sidebarWidth}px`, '--inspector-width': `${inspectorWidth}px` }"
  >
    <aside class="sidebar glass-panel">
      <div class="sidebar-scroll scroll-shell">
        <div class="sidebar-block">
          <div class="hotkey-hint" title="Ctrl + Alt + H opens hotkeys">Ctrl + Alt + H for hotkeys</div>
          <div class="section-header">
            <p class="section-title">Campaign</p>
            <button
              type="button"
              class="icon-toggle"
              :title="campaignCollapsed ? 'Expand Campaign' : 'Collapse Campaign'"
              @click="toggleCampaignSection()"
            >
              {{ campaignCollapsed ? ">" : "v" }}
            </button>
          </div>
          <Transition name="fold">
            <button
              v-if="campaignCollapsed"
              type="button"
              class="workspace-meta compact-card campaign-summary-card"
              @click="toggleCampaignSection()"
            >
              <strong>{{ activeWorkspace?.name || "No workspace" }}</strong>
              <span>Click to expand campaign context</span>
            </button>
            <div v-else-if="activeWorkspace" class="workspace-meta compact-card campaign-expanded">
              <strong>{{ activeWorkspace.name }}</strong>
              <span>{{ activeWorkspace.description }}</span>
            </div>
          </Transition>
        </div>

        <div class="sidebar-block">
          <label class="search-box">
            <span class="section-title">Search</span>
            <input ref="searchInputRef" v-model="state.searchTerm" type="search" placeholder="Search entities, notes, encounters, quests..." />
          </label>
          <div v-if="state.searchResults.length" class="result-list">
            <button
              v-for="result in state.searchResults"
              :key="`${result.recordType}-${result.recordId}`"
              type="button"
              class="result-row"
              @click="openSearchResult(result)"
            >
              <strong>{{ result.title }}</strong>
              <span>{{ result.snippet || result.typeKey }}</span>
            </button>
          </div>
        </div>

        <div class="sidebar-block">
          <p class="section-title">Views</p>
          <div class="tab-list">
            <button type="button" :class="{ active: activeView === 'map' }" @click="store.selectView('map')">Maps</button>
            <button type="button" :class="{ active: activeView === 'notes' }" @click="store.selectView('notes')">Notes</button>
            <button type="button" :class="{ active: activeView === 'timeline' }" @click="store.selectView('timeline')">Timeline</button>
            <button type="button" :class="{ active: activeView === 'encounters' }" @click="openEncountersWorkspace()">Encounters</button>
            <button type="button" :class="{ active: activeView === 'calendar' }" @click="store.selectView('calendar')">Calendar</button>
            <button type="button" :class="{ active: activeView === 'graph' }" @click="store.selectView('graph')">Graphs</button>
            <button type="button" :class="{ active: activeView === 'types' }" @click="store.selectView('types')">Types</button>
          </div>
        </div>

        <div class="sidebar-block">
          <p class="section-title">Current List</p>
          <div class="result-list">
            <template v-for="item in navigationItems" :key="item.id">
              <div v-if="item.kind === 'encounter'" class="encounter-nav-row">
                <button type="button" class="encounter-nav-main" @click="openEncounterEdit(item.id)">
                  <strong>{{ item.title }}</strong>
                  <span>{{ item.subtitle }}</span>
                </button>
                <div class="encounter-nav-actions">
                  <button type="button" @click="openEncounterEdit(item.id)">Edit</button>
                  <button type="button" @click="openEncounterPlay(item.id)">Play</button>
                </div>
              </div>
              <button
                v-else
                type="button"
                class="result-row"
                @click="item.kind === 'map' ? store.selectMap(item.id) : item.kind === 'note' ? store.selectNote(item.id) : item.kind === 'event' ? store.selectTimelineEvent(item.id) : item.kind === 'questline' ? store.selectQuestline(item.id) : store.selectRelation(item.id)"
              >
                <strong>{{ item.title }}</strong>
                <span>{{ item.subtitle }}</span>
              </button>
            </template>
            <p v-if="!navigationItems.length" class="muted">
              {{ activeView === 'calendar' ? 'Edit months and settings in the calendar board.' : 'Nothing to list for this view yet.' }}
            </p>
          </div>
        </div>
      </div>
    </aside>

    <div ref="sidebarResizeHandle" class="sidebar-resizer" :class="{ active: sidebarResize.active }" @pointerdown="startSidebarResize"></div>

    <main class="workspace glass-panel">
      <header class="workspace-header">
        <div class="title-group">
          <p class="section-title">Workspace</p>
          <div class="metadata-row">
            <input v-model="workspaceForm.name" type="text" class="workspace-name" />
            <input v-model="workspaceForm.description" type="text" class="workspace-description" />
          </div>
        </div>

        <div class="header-actions">
          <button type="button" @click="saveWorkspaceMetadata()">Save Metadata</button>
          <button type="button" @click="exportBundle()">Export Bundle</button>
          <button type="button" @click="openLauncher()">Workspaces</button>
        </div>
      </header>

      <div class="workspace-subheader" v-if="activeCalendar">
        <span class="chip">{{ activeCalendar.name }}</span>
        <span class="chip">{{ activeCalendar.epochLabel }}</span>
        <span class="chip">{{ activeCalendar.months.length }} {{ getCalendarCycleLabel(activeCalendar) }}</span>
      </div>

      <section class="workspace-body">
        <MapEditorView v-if="activeView === 'map'" />
        <MarkdownEditorView v-else-if="activeView === 'notes'" />
        <CalendarEditorView v-else-if="activeView === 'calendar'" />
        <TimelineEditorView v-else-if="activeView === 'timeline'" />
        <EncounterWorkspaceView v-else-if="activeView === 'encounters'" />
        <GraphExplorerView v-else-if="activeView === 'graph'" />
        <EntityTypeBuilderView v-else />
      </section>
    </main>

    <div
      v-if="activeView !== 'encounters'"
      ref="inspectorResizeHandle"
      class="inspector-resizer"
      :class="{ active: inspectorResize.active }"
      @pointerdown="startInspectorResize"
    ></div>

    <aside v-if="activeView !== 'encounters'" class="inspector glass-panel scroll-shell">
      <RecordInspectorView />
    </aside>
  </div>
</template>

<style scoped>
.shell-grid {
  width: 100%;
  height: 100vh;
  display: grid;
  grid-template-columns: var(--sidebar-width, 192px) 6px minmax(0, 1fr) 6px var(--inspector-width, 208px);
  gap: 0.22rem;
  padding: 0.22rem;
  overflow: hidden;
}

.shell-grid.encounter-mode {
  grid-template-columns: var(--sidebar-width, 192px) 6px minmax(0, 1fr);
}

.sidebar,
.workspace,
.inspector {
  min-width: 0;
}

.sidebar {
  padding: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.sidebar-scroll {
  flex: 1;
  min-height: 0;
  display: grid;
  align-content: start;
  gap: 0.12rem;
  padding: 0.14rem;
  overflow: auto;
}

.sidebar-block {
  display: grid;
  gap: 0.08rem;
}

.sidebar-resizer,
.inspector-resizer {
  position: relative;
  align-self: stretch;
  cursor: col-resize;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(144, 163, 191, 0.06), rgba(144, 163, 191, 0.02));
  transition: background 0.15s ease, box-shadow 0.15s ease;
  touch-action: none;
  user-select: none;
}

.sidebar-resizer::after,
.inspector-resizer::after {
  content: "";
  position: absolute;
  top: 18%;
  bottom: 18%;
  left: 50%;
  width: 1px;
  transform: translateX(-50%);
  background: rgba(144, 163, 191, 0.28);
}

.sidebar-resizer:hover,
.sidebar-resizer.active,
.inspector-resizer:hover,
.inspector-resizer.active {
  background: rgba(111, 244, 201, 0.08);
  box-shadow: inset 0 0 0 1px rgba(111, 244, 201, 0.18);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.2rem;
}

.sidebar .section-title {
  margin-bottom: 0.2rem;
}

.hotkey-hint {
  align-self: flex-start;
  padding: 0.14rem 0.42rem;
  border-radius: 999px;
  border: 1px solid rgba(111, 244, 201, 0.18);
  background: rgba(111, 244, 201, 0.06);
  color: var(--fg-muted);
  font-size: 0.7rem;
  line-height: 1.2;
  letter-spacing: 0.05em;
}

.workspace-meta {
  display: grid;
  gap: 0.12rem;
}

.workspace-meta span {
  color: var(--fg-muted);
  font-size: 0.78rem;
  line-height: 1.35;
}

.compact-card {
  padding: 0.2rem 0.24rem;
  border-radius: 7px;
  background: rgba(10, 16, 24, 0.42);
  border: 1px solid var(--bg-border);
}

.campaign-summary-card {
  text-align: left;
}

.campaign-expanded {
  min-height: 0;
}

.icon-toggle {
  width: 18px;
  height: 18px;
  padding: 0;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 0.72rem;
  background: rgba(10, 16, 24, 0.56);
  border: 1px solid rgba(144, 163, 191, 0.22);
  color: var(--fg-muted);
}

.tab-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.08rem;
}

.tab-list button.active {
  background: rgba(111, 244, 201, 0.16);
}

.tab-list button {
  border-radius: 999px;
  padding: 0.18rem 0.28rem;
  font-size: 0.72rem;
}

.result-list {
  display: grid;
  gap: 0.08rem;
}

.result-row {
  display: grid;
  gap: 0.04rem;
  text-align: left;
  padding: 0.22rem 0.28rem;
}

.result-row span {
  color: var(--fg-muted);
  font-size: 0.7rem;
}

.encounter-nav-row {
  display: grid;
  gap: 0.08rem;
  padding: 0.16rem 0;
}

.encounter-nav-main {
  display: grid;
  gap: 0.04rem;
  text-align: left;
  padding: 0.22rem 0.28rem;
}

.encounter-nav-main span {
  color: var(--fg-muted);
  font-size: 0.7rem;
}

.encounter-nav-actions {
  display: flex;
  gap: 0.08rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.encounter-nav-actions button {
  padding-inline: 0.32rem;
}

.workspace {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  padding: 0.24rem;
  gap: 0.22rem;
  overflow: hidden;
}

.workspace-header {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 0.18rem;
}

.metadata-row {
  display: grid;
  grid-template-columns: 148px minmax(0, 1fr);
  gap: 0.1rem;
}

.workspace-name,
.workspace-description {
  min-width: 0;
}

.header-actions {
  display: flex;
  gap: 0.1rem;
  flex-wrap: wrap;
}

.workspace-subheader {
  display: flex;
  gap: 0.08rem;
  flex-wrap: wrap;
}

.workspace-body {
  min-height: 0;
  overflow: hidden;
}

.inspector {
  padding: 0;
}

.fold-enter-active,
.fold-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease,
    max-height 160ms ease;
  overflow: hidden;
}

.fold-enter-from,
.fold-leave-to {
  opacity: 0;
  transform: translateY(-4px);
  max-height: 0;
}

.fold-enter-to,
.fold-leave-from {
  opacity: 1;
  transform: translateY(0);
  max-height: 96px;
}

@media (max-width: 1500px) {
  .shell-grid {
    grid-template-columns: var(--sidebar-width, 186px) 6px minmax(0, 1fr);
  }

  .inspector,
  .inspector-resizer {
    display: none;
  }

  .sidebar-resizer {
    display: block;
  }
}

@media (max-width: 1080px) {
  .shell-grid {
    grid-template-columns: 1fr;
    height: auto;
    overflow: auto;
  }

  .sidebar {
    order: 2;
  }

  .workspace {
    order: 1;
  }

  .sidebar-resizer {
    display: none;
  }

  .inspector-resizer {
    display: none;
  }
}
</style>
