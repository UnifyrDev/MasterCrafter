<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useMasterCrafter } from "@renderer/composables/useMasterCrafter";
import { encounterWorkspaceService } from "@renderer/services/EncounterWorkspaceService";
import { createNpcDraft, formatCombatantTeamLabel, parseTagList, type EncounterNpcDraftState } from "@renderer/components/encounters/encounterDrafts";
import type { EncounterCombatantTeam } from "@shared/contracts";
import { slugify } from "@shared/utils";
import { hotkeyDispatcherService } from "@renderer/services/hotkeys";

const store = useMasterCrafter();
const state = store.state;
const workspaceState = encounterWorkspaceService.workspaceState;
const filterText = ref("");

const snapshot = computed(() => state.value.snapshot);
const workspaceId = computed(() => snapshot.value?.workspace.id ?? null);
const npcEntries = computed(() => snapshot.value?.npcLibraryEntries ?? []);
const selectedEntry = computed(() => npcEntries.value.find((entry) => entry.id === workspaceState.selectedNpcLibraryEntryId) ?? null);

const draft = reactive<EncounterNpcDraftState>(createNpcDraft());
const statusMessage = ref("Create a new NPC library entry or edit an existing one.");
const autosaveState = ref("Autosave idle.");
const draftSyncPaused = ref(false);
const savingDraft = ref(false);
const autosaveTimer = ref<number | null>(null);
let unregisterHotkeys: (() => void) | null = null;

const filteredEntries = computed(() => {
  const term = filterText.value.trim().toLowerCase();
  if (!term) {
    return npcEntries.value;
  }

  return npcEntries.value.filter((entry) => [entry.name, entry.challengeRating, entry.notes, entry.tags.join(" "), formatCombatantTeamLabel(entry.team)].join(" ").toLowerCase().includes(term));
});

function syncDraft(): void {
  draftSyncPaused.value = true;
  if (!selectedEntry.value) {
    Object.assign(draft, createNpcDraft());
    statusMessage.value = "Create a new NPC library entry or edit an existing one.";
    autosaveState.value = "Autosave idle.";
    window.setTimeout(() => {
      draftSyncPaused.value = false;
    }, 0);
    return;
  }

  Object.assign(draft, createNpcDraft(selectedEntry.value));
  statusMessage.value = `Editing ${selectedEntry.value.name}.`;
  autosaveState.value = "Autosave active.";
  window.setTimeout(() => {
    draftSyncPaused.value = false;
  }, 0);
}

watch(selectedEntry, syncDraft, { immediate: true });

watch(
  draft,
  () => {
    if (draftSyncPaused.value || savingDraft.value || !workspaceId.value) {
      return;
    }

    autosaveState.value = "Saving changes...";
    if (autosaveTimer.value !== null) {
      window.clearTimeout(autosaveTimer.value);
    }

    autosaveTimer.value = window.setTimeout(() => {
      autosaveTimer.value = null;
      void flushAutosave();
    }, 250);
  },
  { deep: true },
);

function clearAutosaveTimer(): void {
  if (autosaveTimer.value !== null) {
    window.clearTimeout(autosaveTimer.value);
    autosaveTimer.value = null;
  }
}

function selectEntry(entryId: string): void {
  encounterWorkspaceService.openNpcLibrary(entryId);
}

function startNewEntry(): void {
  encounterWorkspaceService.openNpcLibrary(null);
  syncDraft();
}

async function saveEntry(): Promise<void> {
  await flushAutosave();
}

async function deleteEntry(): Promise<void> {
  if (!workspaceId.value || !draft.id) {
    return;
  }

  clearAutosaveTimer();
  await store.deleteNpcLibraryEntry(workspaceId.value, draft.id);
  encounterWorkspaceService.openNpcLibrary(null);
  syncDraft();
}

async function flushAutosave(): Promise<boolean> {
  if (!workspaceId.value || draftSyncPaused.value || savingDraft.value) {
    return false;
  }

  clearAutosaveTimer();
  savingDraft.value = true;
  try {
    const saved = await store.saveNpcLibraryEntry({
      workspaceId: workspaceId.value,
      id: draft.id ?? undefined,
      sourceEntityId: draft.sourceEntityId?.trim() ? draft.sourceEntityId.trim() : null,
      team: draft.team as EncounterCombatantTeam,
      name: draft.name.trim() || "Untitled NPC",
      slug: draft.slug.trim() || slugify(draft.name.trim() || "Untitled NPC"),
      challengeRating: draft.challengeRating.trim() || "0",
      armorClass: draft.armorClass,
      hitPoints: draft.hitPoints,
      speed: draft.speed.trim(),
      initiativeBonus: draft.initiativeBonus,
      notes: draft.notes.trim(),
      tags: parseTagList(draft.tagsText),
    });

    draft.id = saved.id;
    draft.slug = saved.slug;
    if (selectedEntry.value?.id !== saved.id) {
      encounterWorkspaceService.selectNpcLibraryEntry(saved.id);
    }
    statusMessage.value = `Saved ${saved.name}.`;
    autosaveState.value = "Autosave active.";
    return true;
  } catch (error) {
    autosaveState.value = error instanceof Error ? `Autosave failed: ${error.message}` : "Autosave failed.";
    return false;
  } finally {
    savingDraft.value = false;
  }
}

function registerHotkeys(): void {
  unregisterHotkeys?.();
  unregisterHotkeys = hotkeyDispatcherService.registerScope({
    scopeId: "encounter-npc-library",
    scopeType: "view",
    contextId: "encounters-npc-library",
    handlers: {
      "encounters.createNpcLibraryEntry": () => startNewEntry(),
      "encounters.saveNpcLibraryEntry": () => void saveEntry(),
      "encounters.deleteNpcLibraryEntry": () => void deleteEntry(),
    },
  });
}

onBeforeUnmount(() => {
  unregisterHotkeys?.();
  unregisterHotkeys = null;
  clearAutosaveTimer();
  void flushAutosave();
});

onMounted(() => {
  registerHotkeys();
});
</script>

<template>
  <div class="npc-library-shell">
    <section class="npc-library-panel glass-panel scroll-shell">
      <div class="panel-header">
        <div>
          <p class="section-title">NPC Library</p>
          <strong>Reusable enemies and allies</strong>
        </div>
        <button type="button" @click="startNewEntry()">New NPC</button>
      </div>

      <label class="picker-search">
        <span class="muted">Filter NPCs</span>
        <input v-model="filterText" type="search" placeholder="Search names, CR, or notes" />
      </label>

      <div class="entry-list">
        <button
          v-for="entry in filteredEntries"
          :key="entry.id"
          type="button"
          class="entry-row"
          :class="{ active: selectedEntry?.id === entry.id }"
          @click="selectEntry(entry.id)"
        >
          <strong>{{ entry.name }}</strong>
          <span>{{ formatCombatantTeamLabel(entry.team) }} · {{ entry.challengeRating }} · AC {{ entry.armorClass }} · HP {{ entry.hitPoints }}</span>
        </button>

        <div v-if="!filteredEntries.length" class="muted">
          No NPC library entries yet.
        </div>
      </div>
    </section>

    <section class="npc-library-panel glass-panel scroll-shell">
      <div class="panel-header">
        <div>
          <p class="section-title">Editor</p>
          <strong>{{ draft.id ? `Editing ${draft.name}` : "Create a new NPC" }}</strong>
        </div>
        <div class="editor-actions">
          <button type="button" @click="saveEntry()">Save now</button>
          <button type="button" class="danger" :disabled="!draft.id" @click="deleteEntry()">Delete</button>
        </div>
      </div>

      <div class="editor-grid">
        <label>
          <span>Name</span>
          <input v-model="draft.name" type="text" />
        </label>
        <label>
          <span>Slug</span>
          <input v-model="draft.slug" type="text" />
        </label>
        <label>
          <span>Source Entity Id</span>
          <input v-model="draft.sourceEntityId" type="text" placeholder="Optional legacy entity id" />
        </label>
        <label class="wide">
          <span>Disposition</span>
          <div class="disposition-toggle">
            <button type="button" :class="{ active: draft.team === 'party' }" @click="draft.team = 'party'">Friendly</button>
            <button type="button" :class="{ active: draft.team === 'enemy' }" @click="draft.team = 'enemy'">Unfriendly</button>
            <button type="button" :class="{ active: draft.team === 'neutral' }" @click="draft.team = 'neutral'">Neutral</button>
          </div>
        </label>
        <label>
          <span>Challenge Rating</span>
          <input v-model="draft.challengeRating" type="text" placeholder="1/2" />
        </label>
        <label>
          <span>AC</span>
          <input v-model.number="draft.armorClass" type="number" min="0" step="1" />
        </label>
        <label>
          <span>HP</span>
          <input v-model.number="draft.hitPoints" type="number" min="0" step="1" />
        </label>
        <label>
          <span>Speed</span>
          <input v-model="draft.speed" type="text" />
        </label>
        <label>
          <span>Init Bonus</span>
          <input v-model.number="draft.initiativeBonus" type="number" step="1" />
        </label>
        <label class="wide">
          <span>Notes</span>
          <textarea v-model="draft.notes" rows="6" />
        </label>
        <label class="wide">
          <span>Tags</span>
          <input v-model="draft.tagsText" type="text" placeholder="goblin, boss, undead" />
        </label>
      </div>

      <div class="editor-footer">
        <p class="section-title">Status</p>
        <span>{{ statusMessage }}</span>
        <span class="autosave-indicator">{{ autosaveState }}</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.npc-library-shell {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(220px, 0.9fr) minmax(0, 1.1fr);
  gap: 0.22rem;
}

.npc-library-panel {
  min-height: 0;
  padding: 0.24rem;
  display: grid;
  gap: 0.16rem;
  align-content: start;
  overflow: auto;
}

.panel-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 0.12rem;
  flex-wrap: wrap;
}

.panel-header strong {
  display: block;
  margin-top: 0.04rem;
}

.picker-search,
.editor-grid {
  display: grid;
  gap: 0.08rem;
}

.entry-list {
  display: grid;
  gap: 0.08rem;
}

.entry-row {
  display: grid;
  gap: 0.04rem;
  text-align: left;
  padding: 0.22rem 0.24rem;
}

.entry-row span {
  color: var(--fg-muted);
  font-size: 0.72rem;
}

.entry-row.active {
  background: rgba(111, 244, 201, 0.08);
  border-color: rgba(111, 244, 201, 0.26);
}

.editor-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.editor-grid label {
  display: grid;
  gap: 0.04rem;
}

.editor-grid label.wide {
  grid-column: 1 / -1;
}

.disposition-toggle {
  display: flex;
  gap: 0.08rem;
  flex-wrap: wrap;
}

.disposition-toggle button.active {
  border-color: rgba(111, 244, 201, 0.32);
  background: rgba(111, 244, 201, 0.12);
}

.editor-grid span,
.editor-footer span {
  color: var(--fg-muted);
  font-size: 0.72rem;
}

.editor-footer {
  display: grid;
  gap: 0.04rem;
}

.autosave-indicator {
  color: var(--accent);
  font-size: 0.72rem;
}

.editor-actions {
  display: flex;
  gap: 0.08rem;
  flex-wrap: wrap;
}

.danger {
  border-color: rgba(255, 109, 122, 0.24);
  color: #ffd6db;
}

@media (max-width: 980px) {
  .npc-library-shell {
    grid-template-columns: 1fr;
  }

  .editor-grid {
    grid-template-columns: 1fr;
  }
}
</style>
