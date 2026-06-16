<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useMasterCrafter } from "@renderer/composables/useMasterCrafter";
import { encounterWorkspaceService } from "@renderer/services/EncounterWorkspaceService";
import { createPlayerDraft, parseTagList, type EncounterPlayerDraftState } from "@renderer/components/encounters/encounterDrafts";
import { slugify } from "@shared/utils";
import { hotkeyDispatcherService } from "@renderer/services/hotkeys";

const store = useMasterCrafter();
const state = store.state;
const workspaceState = encounterWorkspaceService.workspaceState;
const filterText = ref("");

const snapshot = computed(() => state.value.snapshot);
const workspaceId = computed(() => snapshot.value?.workspace.id ?? null);
const playerEntries = computed(() => snapshot.value?.playerLibraryEntries ?? []);
const selectedEntry = computed(() => playerEntries.value.find((entry) => entry.id === workspaceState.selectedPlayerLibraryEntryId) ?? null);

const draft = reactive<EncounterPlayerDraftState>(createPlayerDraft());
const statusMessage = ref("Create a new player library entry or edit an existing one.");
let unregisterHotkeys: (() => void) | null = null;

const filteredEntries = computed(() => {
  const term = filterText.value.trim().toLowerCase();
  if (!term) {
    return playerEntries.value;
  }

  return playerEntries.value.filter((entry) => [entry.name, entry.level, entry.armorClass, entry.hitPoints, entry.notes, entry.tags.join(" ")].join(" ").toLowerCase().includes(term));
});

function syncDraft(): void {
  if (!selectedEntry.value) {
    Object.assign(draft, createPlayerDraft());
    statusMessage.value = "Create a new player library entry or edit an existing one.";
    return;
  }

  Object.assign(draft, createPlayerDraft(selectedEntry.value));
  statusMessage.value = `Editing ${selectedEntry.value.name}.`;
}

watch(selectedEntry, syncDraft, { immediate: true });

function selectEntry(entryId: string): void {
  encounterWorkspaceService.openPlayerLibrary(entryId);
}

function startNewEntry(): void {
  encounterWorkspaceService.openPlayerLibrary(null);
  syncDraft();
}

async function saveEntry(): Promise<void> {
  if (!workspaceId.value) {
    return;
  }

  const saved = await store.savePlayerLibraryEntry({
    workspaceId: workspaceId.value,
    id: draft.id ?? undefined,
    name: draft.name.trim() || "Untitled Player",
    slug: draft.slug.trim() || slugify(draft.name.trim() || "Untitled Player"),
    level: draft.level,
    armorClass: draft.armorClass,
    hitPoints: draft.hitPoints,
    initiativeBonus: draft.initiativeBonus,
    speed: draft.speed.trim(),
    notes: draft.notes.trim(),
    tags: parseTagList(draft.tagsText),
  });

  draft.id = saved.id;
  draft.slug = saved.slug;
  encounterWorkspaceService.selectPlayerLibraryEntry(saved.id);
  statusMessage.value = `Saved ${saved.name}.`;
}

async function deleteEntry(): Promise<void> {
  if (!workspaceId.value || !draft.id) {
    return;
  }

  await store.deletePlayerLibraryEntry(workspaceId.value, draft.id);
  encounterWorkspaceService.openPlayerLibrary(null);
  syncDraft();
}

function registerHotkeys(): void {
  unregisterHotkeys?.();
  unregisterHotkeys = hotkeyDispatcherService.registerScope({
    scopeId: "encounter-player-library",
    scopeType: "view",
    contextId: "encounters-player-library",
    handlers: {
      "encounters.createPlayerLibraryEntry": () => startNewEntry(),
      "encounters.savePlayerLibraryEntry": () => void saveEntry(),
      "encounters.deletePlayerLibraryEntry": () => void deleteEntry(),
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
  <div class="player-library-shell">
    <section class="player-library-panel glass-panel scroll-shell">
      <div class="panel-header">
        <div>
          <p class="section-title">Player Library</p>
          <strong>Combat sheets for the party</strong>
        </div>
        <button type="button" @click="startNewEntry()">New Player</button>
      </div>

      <label class="picker-search">
        <span class="muted">Filter players</span>
        <input v-model="filterText" type="search" placeholder="Search names, levels, or notes" />
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
          <span>Lvl {{ entry.level }} · AC {{ entry.armorClass }} · HP {{ entry.hitPoints }}</span>
        </button>

        <div v-if="!filteredEntries.length" class="muted">
          No player library entries yet.
        </div>
      </div>
    </section>

    <section class="player-library-panel glass-panel scroll-shell">
      <div class="panel-header">
        <div>
          <p class="section-title">Editor</p>
          <strong>{{ draft.id ? `Editing ${draft.name}` : "Create a new player" }}</strong>
        </div>
        <div class="editor-actions">
          <button type="button" @click="saveEntry()">Save Player</button>
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
          <span>Level</span>
          <input v-model.number="draft.level" type="number" min="1" step="1" />
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
          <span>Init Bonus</span>
          <input v-model.number="draft.initiativeBonus" type="number" step="1" />
        </label>
        <label class="wide">
          <span>Speed</span>
          <input v-model="draft.speed" type="text" />
        </label>
        <label class="wide">
          <span>Notes</span>
          <textarea v-model="draft.notes" rows="6" />
        </label>
        <label class="wide">
          <span>Tags</span>
          <input v-model="draft.tagsText" type="text" placeholder="frontline, healer, ranged" />
        </label>
      </div>

      <div class="editor-footer">
        <p class="section-title">Status</p>
        <span>{{ statusMessage }}</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.player-library-shell {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(220px, 0.9fr) minmax(0, 1.1fr);
  gap: 0.22rem;
}

.player-library-panel {
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

.editor-grid span,
.editor-footer span {
  color: var(--fg-muted);
  font-size: 0.72rem;
}

.editor-footer {
  display: grid;
  gap: 0.04rem;
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
  .player-library-shell {
    grid-template-columns: 1fr;
  }

  .editor-grid {
    grid-template-columns: 1fr;
  }
}
</style>
