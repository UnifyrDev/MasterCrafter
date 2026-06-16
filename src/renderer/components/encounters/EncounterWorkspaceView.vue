<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import { useMasterCrafter } from "@renderer/composables/useMasterCrafter";
import { encounterWorkspaceService } from "@renderer/services/EncounterWorkspaceService";
import EncounterLibraryView from "@renderer/components/encounters/EncounterLibraryView.vue";
import EncounterBuilderView from "@renderer/components/encounters/EncounterBuilderView.vue";
import EncounterPlayTrackerView from "@renderer/components/encounters/EncounterPlayTrackerView.vue";
import EncounterNpcLibraryView from "@renderer/components/encounters/EncounterNpcLibraryView.vue";
import EncounterPlayerLibraryView from "@renderer/components/encounters/EncounterPlayerLibraryView.vue";
import { hotkeyDispatcherService } from "@renderer/services/hotkeys";

const store = useMasterCrafter();
const state = store.state;
const workspaceState = encounterWorkspaceService.workspaceState;

const snapshot = computed(() => state.value.snapshot);
const encounters = computed(() => snapshot.value?.encounters ?? []);
const npcEntries = computed(() => snapshot.value?.npcLibraryEntries ?? []);
const playerEntries = computed(() => snapshot.value?.playerLibraryEntries ?? []);

const activeEncounter = computed(() => encounters.value.find((entry) => entry.id === workspaceState.selectedEncounterId) ?? null);
let unregisterHotkeys: (() => void) | null = null;

function openLibrary(): void {
  encounterWorkspaceService.openLibrary();
}

function openBuilder(): void {
  encounterWorkspaceService.openBuilder(activeEncounter.value?.id ?? null);
}

function openPlay(): void {
  encounterWorkspaceService.openPlay(activeEncounter.value?.id ?? null, workspaceState.selectedSessionId);
}

function openNpcLibrary(): void {
  encounterWorkspaceService.openNpcLibrary(workspaceState.selectedNpcLibraryEntryId ?? null);
}

function openPlayerLibrary(): void {
  encounterWorkspaceService.openPlayerLibrary(workspaceState.selectedPlayerLibraryEntryId ?? null);
}

function registerHotkeys(): void {
  unregisterHotkeys?.();
  unregisterHotkeys = hotkeyDispatcherService.registerScope({
    scopeId: "encounters-workspace",
    scopeType: "view",
    contextId: "encounters-workspace",
    handlers: {
      "encounters.openLibrary": () => openLibrary(),
      "encounters.openBuilder": () => openBuilder(),
      "encounters.openPlay": () => openPlay(),
      "encounters.openNpcLibrary": () => openNpcLibrary(),
      "encounters.openPlayerLibrary": () => openPlayerLibrary(),
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
  <section class="encounter-workspace glass-panel scroll-shell">
    <header class="encounter-workspace-header">
      <div class="encounter-workspace-title">
        <p class="section-title">Encounters</p>
        <strong>Campaign combat workspace</strong>
        <span>Build reusable encounter templates, maintain NPC and player libraries, and run persisted combat sessions.</span>
      </div>

      <div class="tab-list encounter-tabs">
        <button type="button" :class="{ active: workspaceState.screen === 'library' }" @click="openLibrary()">Library</button>
        <button type="button" :class="{ active: workspaceState.screen === 'builder' }" @click="openBuilder()">Builder</button>
        <button type="button" :class="{ active: workspaceState.screen === 'play' }" @click="openPlay()">Play</button>
        <button type="button" :class="{ active: workspaceState.screen === 'npc-library' }" @click="openNpcLibrary()">NPC Library</button>
        <button type="button" :class="{ active: workspaceState.screen === 'player-library' }" @click="openPlayerLibrary()">Player Library</button>
      </div>
    </header>

    <div class="encounter-workspace-summary">
      <span class="chip">{{ encounters.length }} encounters</span>
      <span class="chip">{{ npcEntries.length }} NPCs</span>
      <span class="chip">{{ playerEntries.length }} players</span>
      <span class="chip" v-if="activeEncounter">{{ activeEncounter.name }}</span>
      <span class="chip" v-else>Nothing selected</span>
    </div>

    <div class="encounter-workspace-body">
      <EncounterLibraryView v-if="workspaceState.screen === 'library'" />
      <EncounterBuilderView v-else-if="workspaceState.screen === 'builder'" />
      <EncounterPlayTrackerView v-else-if="workspaceState.screen === 'play'" />
      <EncounterNpcLibraryView v-else-if="workspaceState.screen === 'npc-library'" />
      <EncounterPlayerLibraryView v-else />
    </div>
  </section>
</template>

<style scoped>
.encounter-workspace {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 0.22rem;
  padding: 0.24rem;
  overflow: hidden;
}

.encounter-workspace-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 0.16rem;
  flex-wrap: wrap;
}

.encounter-workspace-title {
  display: grid;
  gap: 0.08rem;
  max-width: 42rem;
}

.encounter-workspace-title strong {
  font-size: 1.05rem;
  letter-spacing: 0.01em;
}

.encounter-workspace-title span {
  color: var(--fg-muted);
  line-height: 1.45;
}

.encounter-tabs {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.encounter-workspace-summary {
  display: flex;
  gap: 0.08rem;
  flex-wrap: wrap;
}

.encounter-workspace-body {
  min-height: 0;
  overflow: hidden;
}
</style>
