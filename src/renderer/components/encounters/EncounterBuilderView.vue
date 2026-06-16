<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useMasterCrafter } from "@renderer/composables/useMasterCrafter";
import { encounterWorkspaceService } from "@renderer/services/EncounterWorkspaceService";
import {
  createCombatantDraft,
  createCombatantDraftFromNpc,
  createCombatantDraftFromPlayer,
  createEncounterDraft,
  formatCombatantTeamLabel,
  parseLevelInput,
  parseTagList,
  type EncounterCombatantDraftState,
  type EncounterDraftState,
} from "@renderer/components/encounters/encounterDrafts";
import { calculateEncounterDifficulty, formatEncounterDifficulty } from "@shared/encounterMath";
import type { EncounterThreatParticipant } from "@shared/encounterMath";
import type {
  EncounterCombatantInputDto,
  EncounterCombatantTeam,
  EncounterDto,
  EncounterInputDto,
  EncounterSessionDto,
} from "@shared/contracts";
import { slugify } from "@shared/utils";
import { hotkeyDispatcherService } from "@renderer/services/hotkeys";

const store = useMasterCrafter();
const state = store.state;
const workspaceState = encounterWorkspaceService.workspaceState;
const pickerFilter = ref("");
const draftSyncPaused = ref(false);
const statusMessage = ref("");

const snapshot = computed(() => state.value.snapshot);
const workspaceId = computed(() => snapshot.value?.workspace.id ?? null);
const encounters = computed(() => snapshot.value?.encounters ?? []);
const maps = computed(() => snapshot.value?.maps ?? []);
const npcEntries = computed(() => snapshot.value?.npcLibraryEntries ?? []);
const playerEntries = computed(() => snapshot.value?.playerLibraryEntries ?? []);
const selectedEncounter = computed(() => encounters.value.find((entry) => entry.id === workspaceState.selectedEncounterId) ?? null);
let unregisterHotkeys: (() => void) | null = null;
const selectedEncounterCombatants = computed(() => {
  if (!selectedEncounter.value || !snapshot.value) {
    return [];
  }

  return snapshot.value.encounterCombatants.filter((entry) => entry.encounterId === selectedEncounter.value?.id);
});
const selectedEncounterSessions = computed(() => {
  if (!selectedEncounter.value || !snapshot.value) {
    return [];
  }

  return [...snapshot.value.encounterSessions.filter((entry) => entry.encounterId === selectedEncounter.value?.id)].sort(
    (left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.createdAt.localeCompare(left.createdAt),
  );
});

const encounterForm = reactive<EncounterDraftState>(createEncounterDraft());
const rosterDrafts = ref<EncounterCombatantDraftState[]>([]);

const threatParticipants = computed<EncounterThreatParticipant[]>(() =>
  rosterDrafts.value.map((draft) => ({
    team: draft.team,
    quantity: Math.max(1, Math.floor(Number(draft.quantity) || 1)),
    level: parseLevelInput(draft.levelText),
    challengeRating: draft.challengeRating,
  })),
);

const difficultySummary = computed(() => calculateEncounterDifficulty(threatParticipants.value));

const filteredEncounters = computed(() => {
  const term = pickerFilter.value.trim().toLowerCase();
  if (!term) {
    return encounters.value;
  }

  return encounters.value.filter((entry) => [entry.name, entry.description, entry.notes, entry.tags.join(" ")].join(" ").toLowerCase().includes(term));
});

const filteredNpcs = computed(() => {
  const term = pickerFilter.value.trim().toLowerCase();
  if (!term) {
    return npcEntries.value;
  }

  return npcEntries.value.filter((entry) => [entry.name, entry.challengeRating, entry.notes, entry.tags.join(" "), formatCombatantTeamLabel(entry.team)].join(" ").toLowerCase().includes(term));
});

const filteredPlayers = computed(() => {
  const term = pickerFilter.value.trim().toLowerCase();
  if (!term) {
    return playerEntries.value;
  }

  return playerEntries.value.filter((entry) => [entry.name, entry.level, entry.notes, entry.tags.join(" ")].join(" ").toLowerCase().includes(term));
});

function syncDraftFromSelection(): void {
  if (draftSyncPaused.value) {
    return;
  }

  if (!selectedEncounter.value) {
    Object.assign(encounterForm, createEncounterDraft());
    rosterDrafts.value = [];
    statusMessage.value = "Create a new encounter or choose an existing template.";
    return;
  }

  Object.assign(encounterForm, createEncounterDraft(selectedEncounter.value));
  rosterDrafts.value = selectedEncounterCombatants.value.map((combatant) => createCombatantDraft(combatant));
  statusMessage.value = `Editing ${selectedEncounter.value.name}.`;
}

watch([selectedEncounter, selectedEncounterCombatants], syncDraftFromSelection, { immediate: true });

function openEncounter(encounterId: string): void {
  encounterWorkspaceService.selectEncounter(encounterId);
  encounterWorkspaceService.openBuilder(encounterId);
}

function startNewEncounter(): void {
  encounterWorkspaceService.selectEncounter(null);
  encounterWorkspaceService.openBuilder(null);
  syncDraftFromSelection();
}

function addCustomCombatant(): void {
  rosterDrafts.value = [...rosterDrafts.value, createCombatantDraft()];
  encounterWorkspaceService.selectCombatant(null);
}

function addNpcToRoster(entryId: string, team?: EncounterCombatantTeam): void {
  const entry = npcEntries.value.find((npc) => npc.id === entryId);
  if (!entry) {
    return;
  }

  rosterDrafts.value = [...rosterDrafts.value, createCombatantDraftFromNpc(entry, team ?? entry.team)];
  encounterWorkspaceService.selectCombatant(null);
}

function addPlayerToRoster(entryId: string): void {
  const entry = playerEntries.value.find((player) => player.id === entryId);
  if (!entry) {
    return;
  }

  rosterDrafts.value = [...rosterDrafts.value, createCombatantDraftFromPlayer(entry)];
  encounterWorkspaceService.selectCombatant(null);
}

function buildEncounterInput(): EncounterInputDto {
  return {
    workspaceId: workspaceId.value ?? "",
    id: encounterForm.id ?? undefined,
    name: encounterForm.name.trim() || "Untitled Encounter",
    slug: encounterForm.slug.trim() || slugify(encounterForm.name || "Untitled Encounter"),
    description: encounterForm.description.trim(),
    notes: encounterForm.notes.trim(),
    mapId: encounterForm.mapId,
    tags: parseTagList(encounterForm.tagsText),
  };
}

function buildCombatantInput(encounterId: string, draft: EncounterCombatantDraftState, sortIndex: number): EncounterCombatantInputDto {
  return {
    workspaceId: workspaceId.value ?? "",
    encounterId,
    id: draft.id ?? undefined,
    sourceKind: draft.sourceKind,
    sourceId: draft.sourceId,
    team: draft.team,
    name: draft.name.trim() || "Untitled Combatant",
    quantity: Math.max(1, Math.floor(Number(draft.quantity) || 1)),
    initiativeBonus: Math.floor(Number(draft.initiativeBonus) || 0),
    armorClass: Math.max(0, Math.floor(Number(draft.armorClass) || 0)),
    hitPoints: Math.max(0, Math.floor(Number(draft.hitPoints) || 0)),
    speed: draft.speed.trim(),
    level: parseLevelInput(draft.levelText),
    challengeRating: draft.challengeRating.trim() || "0",
    notes: draft.notes.trim(),
    sortIndex,
  };
}

function resolveSourceLabel(draft: EncounterCombatantDraftState): string {
  if (draft.sourceKind === "npc") {
    const entry = npcEntries.value.find((npc) => npc.id === draft.sourceId);
    return entry ? `NPC · ${entry.name}` : "NPC library";
  }

  if (draft.sourceKind === "player") {
    const entry = playerEntries.value.find((player) => player.id === draft.sourceId);
    return entry ? `Player · ${entry.name}` : "Player library";
  }

  return "Custom combatant";
}

function summaryLabel(draft: EncounterCombatantDraftState): string {
  const levelText = parseLevelInput(draft.levelText);
  const levelLabel = levelText === null ? "Lvl ?" : `Lvl ${levelText}`;
  return `${levelLabel} · AC ${draft.armorClass} · HP ${draft.hitPoints}`;
}

function removeDraft(index: number): void {
  const draft = rosterDrafts.value[index];
  if (!draft) {
    return;
  }

  rosterDrafts.value.splice(index, 1);

  if (draft.id && workspaceId.value && encounterForm.id) {
    draftSyncPaused.value = true;
    void store.deleteCombatant(workspaceId.value, encounterForm.id, draft.id)
      .then(() => {
        statusMessage.value = "Combatant removed.";
      })
      .finally(() => {
        draftSyncPaused.value = false;
        syncDraftFromSelection();
      });
    return;
  }

  statusMessage.value = "Combatant removed.";
}

async function saveAll(): Promise<string | null> {
  if (!workspaceId.value) {
    return null;
  }

  draftSyncPaused.value = true;

  try {
    const savedEncounter = await store.saveEncounter(buildEncounterInput());
    encounterWorkspaceService.selectEncounter(savedEncounter.id);
    encounterForm.id = savedEncounter.id;
    encounterForm.slug = savedEncounter.slug;

    for (const [index, draft] of rosterDrafts.value.entries()) {
      const savedCombatant = await store.saveCombatant(buildCombatantInput(savedEncounter.id, draft, index));
      draft.id = savedCombatant.id;
    }

    statusMessage.value = `Saved ${savedEncounter.name}.`;
    return savedEncounter.id;
  } finally {
    draftSyncPaused.value = false;
    syncDraftFromSelection();
  }
}

async function saveAndPlay(): Promise<void> {
  const encounterId = await saveAll();
  if (!workspaceId.value || !encounterId) {
    return;
  }

  const session = await store.startEncounterSession(workspaceId.value, encounterId);
  encounterWorkspaceService.openPlay(encounterId, session.id);
}

async function deleteEncounter(): Promise<void> {
  if (!workspaceId.value || !encounterForm.id) {
    return;
  }

  await store.deleteEncounter(workspaceId.value, encounterForm.id);
  encounterWorkspaceService.openBuilder(null);
  syncDraftFromSelection();
}

function loadSession(session: EncounterSessionDto): void {
  if (!selectedEncounter.value) {
    return;
  }

  encounterWorkspaceService.openPlay(selectedEncounter.value.id, session.id);
}

function openEncounterPicker(encounter: EncounterDto): void {
  openEncounter(encounter.id);
}

function startEncounterFromSelection(): void {
  void saveAndPlay();
}

function addHotkeyNpcToRoster(team?: EncounterCombatantTeam): void {
  const entry = filteredNpcs.value[0];
  if (!entry) {
    return;
  }

  addNpcToRoster(entry.id, team ?? entry.team);
}

function addHotkeyPlayerToRoster(): void {
  const entry = filteredPlayers.value[0];
  if (!entry) {
    return;
  }

  addPlayerToRoster(entry.id);
}

function registerHotkeys(): void {
  unregisterHotkeys?.();
  unregisterHotkeys = hotkeyDispatcherService.registerScope({
    scopeId: "encounter-builder",
    scopeType: "view",
    contextId: "encounters-builder",
    handlers: {
      "encounters.startNewEncounter": () => startNewEncounter(),
      "encounters.saveAll": () => void saveAll(),
      "encounters.saveAndPlay": () => void saveAndPlay(),
      "encounters.deleteEncounterBuilder": () => void deleteEncounter(),
      "encounters.addCustomCombatant": () => addCustomCombatant(),
      "encounters.addNpcToRoster": () => addHotkeyNpcToRoster(),
      "encounters.addPlayerToRoster": () => addHotkeyPlayerToRoster(),
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
  <div class="builder-shell">
    <section class="builder-pane builder-picker-pane glass-panel scroll-shell">
      <div class="pane-header">
        <div>
          <p class="section-title">Pickers</p>
          <strong>Select templates and roster sources</strong>
        </div>
        <button type="button" @click="startNewEncounter()">New Encounter</button>
      </div>

      <label class="picker-search">
        <span class="muted">Filter pickers</span>
        <input v-model="pickerFilter" type="search" placeholder="Search encounters, NPCs, players" />
      </label>

      <section class="picker-block">
        <div class="picker-block-header">
          <strong>Encounters</strong>
          <span class="muted">{{ filteredEncounters.length }} templates</span>
        </div>
        <div class="picker-list">
          <button
            v-for="encounter in filteredEncounters"
            :key="encounter.id"
            type="button"
            class="picker-row"
            :class="{ active: encounterForm.id === encounter.id }"
            @click="openEncounterPicker(encounter)"
          >
            <strong>{{ encounter.name }}</strong>
            <span>{{ encounter.description || "No description" }}</span>
          </button>
          <p v-if="!filteredEncounters.length" class="muted">No encounters found.</p>
        </div>
      </section>

      <section class="picker-block">
        <div class="picker-block-header">
          <strong>NPC Library</strong>
          <span class="muted">{{ filteredNpcs.length }} entries</span>
        </div>
        <div class="picker-list">
          <article
            v-for="entry in filteredNpcs"
            :key="entry.id"
            class="picker-row library-row picker-row-card"
          >
            <div class="picker-row-copy">
              <strong>{{ entry.name }}</strong>
              <span>{{ formatCombatantTeamLabel(entry.team) }} · {{ entry.challengeRating }} · AC {{ entry.armorClass }} · HP {{ entry.hitPoints }}</span>
            </div>
            <div class="picker-row-actions">
              <button type="button" @click="addNpcToRoster(entry.id, entry.team)">Add</button>
              <button type="button" @click="addNpcToRoster(entry.id, 'party')">Friendly</button>
              <button type="button" @click="addNpcToRoster(entry.id, 'enemy')">Enemy</button>
            </div>
          </article>
          <p v-if="!filteredNpcs.length" class="muted">No NPCs available.</p>
        </div>
      </section>

      <section class="picker-block">
        <div class="picker-block-header">
          <strong>Player Library</strong>
          <span class="muted">{{ filteredPlayers.length }} entries</span>
        </div>
        <div class="picker-list">
          <button
            v-for="entry in filteredPlayers"
            :key="entry.id"
            type="button"
            class="picker-row library-row"
            @click="addPlayerToRoster(entry.id)"
          >
            <strong>{{ entry.name }}</strong>
            <span>Lvl {{ entry.level }} · AC {{ entry.armorClass }} · HP {{ entry.hitPoints }}</span>
          </button>
          <p v-if="!filteredPlayers.length" class="muted">No players available.</p>
        </div>
      </section>
    </section>

    <section class="builder-pane builder-center-pane glass-panel scroll-shell">
      <div class="pane-header">
        <div>
          <p class="section-title">Encounter Draft</p>
          <strong>{{ encounterForm.id ? `Editing ${encounterForm.name}` : "Create a new encounter" }}</strong>
        </div>
        <div class="builder-header-actions">
          <button type="button" @click="saveAll()">Save Encounter</button>
          <button type="button" @click="startEncounterFromSelection()">Play</button>
        </div>
      </div>

      <div class="builder-form-grid">
        <label>
          <span>Name</span>
          <input v-model="encounterForm.name" type="text" placeholder="Encounter name" />
        </label>
        <label>
          <span>Slug</span>
          <input v-model="encounterForm.slug" type="text" placeholder="encounter-slug" />
        </label>
        <label class="wide">
          <span>Description</span>
          <textarea v-model="encounterForm.description" rows="3" placeholder="What makes this encounter memorable?" />
        </label>
        <label class="wide">
          <span>Notes</span>
          <textarea v-model="encounterForm.notes" rows="4" placeholder="Tactics, openings, or scene notes." />
        </label>
        <label>
          <span>Map</span>
          <select v-model="encounterForm.mapId">
            <option :value="null">No map</option>
            <option v-for="map in maps" :key="map.id" :value="map.id">{{ map.title }}</option>
          </select>
        </label>
        <label class="wide">
          <span>Tags</span>
          <input v-model="encounterForm.tagsText" type="text" placeholder="boss, ambush, cave" />
        </label>
      </div>

      <div class="roster-header">
        <div>
          <p class="section-title">Roster</p>
          <strong>{{ rosterDrafts.length }} combatants</strong>
        </div>
        <div class="roster-actions">
          <button type="button" @click="addCustomCombatant()">Add Custom</button>
          <button type="button" class="danger" :disabled="!encounterForm.id" @click="deleteEncounter()">Delete Encounter</button>
        </div>
      </div>

      <div class="roster-list">
        <article v-for="(draft, index) in rosterDrafts" :key="draft.id ?? `${draft.sourceKind}-${index}`" class="roster-row">
          <div class="roster-row-main">
            <div class="roster-row-topline">
              <strong>{{ draft.name }}</strong>
              <span class="chip">{{ resolveSourceLabel(draft) }}</span>
              <span class="chip">{{ summaryLabel(draft) }}</span>
            </div>

            <div class="roster-grid">
              <label>
                <span>Name</span>
                <input v-model="draft.name" type="text" />
              </label>
              <label>
                <span>Team</span>
                <select v-model="draft.team">
                  <option value="party">Friendly</option>
                  <option value="enemy">Unfriendly</option>
                  <option value="neutral">Neutral</option>
                </select>
              </label>
              <label>
                <span>Qty</span>
                <input v-model.number="draft.quantity" type="number" min="1" step="1" />
              </label>
              <label>
                <span>Init</span>
                <input v-model.number="draft.initiativeBonus" type="number" step="1" />
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
                <span>Level</span>
                <input v-model="draft.levelText" type="text" placeholder="1" />
              </label>
              <label>
                <span>CR</span>
                <input v-model="draft.challengeRating" type="text" placeholder="1/2" />
              </label>
              <label>
                <span>Sort</span>
                <input v-model.number="draft.sortIndex" type="number" step="1" />
              </label>
              <label class="wide">
                <span>Notes</span>
                <textarea v-model="draft.notes" rows="2" />
              </label>
            </div>
          </div>

          <div class="roster-row-actions">
            <button type="button" class="danger" @click="removeDraft(index)">Remove</button>
          </div>
        </article>

        <div v-if="!rosterDrafts.length" class="empty-roster muted">
          Add NPCs, players, or a custom combatant to build the encounter roster.
        </div>
      </div>
    </section>

    <section class="builder-pane builder-right-pane glass-panel scroll-shell">
      <div class="pane-header">
        <div>
          <p class="section-title">Math & Tracker</p>
          <strong>{{ formatEncounterDifficulty(difficultySummary.difficulty) }}</strong>
        </div>
        <button type="button" @click="saveAndPlay()">Save and Play</button>
      </div>

      <div class="summary-stack">
        <div class="summary-card">
          <span>Party size</span>
          <strong>{{ difficultySummary.partySize }}</strong>
        </div>
        <div class="summary-card">
          <span>Party budget</span>
          <strong>{{ difficultySummary.partyBudget }}</strong>
        </div>
        <div class="summary-card">
          <span>Enemy units</span>
          <strong>{{ difficultySummary.enemyUnits }}</strong>
        </div>
        <div class="summary-card">
          <span>Enemy threat</span>
          <strong>{{ difficultySummary.enemyAdjustedThreat }}</strong>
        </div>
      </div>

      <div class="tracker-card">
        <p class="section-title">Sessions</p>
        <div class="session-list">
          <article v-for="session in selectedEncounterSessions" :key="session.id" class="session-row">
            <div>
              <strong>Round {{ session.roundNumber }}</strong>
              <span>{{ session.status }} · Turn {{ session.currentTurnIndex + 1 }}</span>
            </div>
            <button type="button" @click="loadSession(session)">Resume</button>
          </article>

          <div v-if="!selectedEncounterSessions.length" class="muted">
            No persisted sessions yet. Save the encounter and start play to create one.
          </div>
        </div>
      </div>

      <div class="tracker-card">
        <p class="section-title">Status</p>
        <div class="status-copy">
          <strong>{{ statusMessage || "Ready." }}</strong>
          <span>Roster changes stay local until you save the encounter.</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.builder-shell {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(220px, 0.9fr) minmax(0, 1.45fr) minmax(260px, 0.8fr);
  gap: 0.22rem;
}

.builder-pane {
  min-height: 0;
  padding: 0.24rem;
  display: grid;
  align-content: start;
  gap: 0.18rem;
}

.builder-picker-pane,
.builder-right-pane {
  overflow: auto;
}

.pane-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 0.16rem;
  flex-wrap: wrap;
}

.pane-header strong {
  display: block;
  margin-top: 0.04rem;
}

.builder-header-actions,
.roster-actions {
  display: flex;
  gap: 0.08rem;
  flex-wrap: wrap;
}

.picker-search,
.picker-block,
.tracker-card {
  display: grid;
  gap: 0.08rem;
}

.picker-block-header,
.roster-header {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 0.12rem;
  flex-wrap: wrap;
}

.picker-list {
  display: grid;
  gap: 0.08rem;
}

.picker-row {
  display: grid;
  gap: 0.04rem;
  text-align: left;
  padding: 0.22rem 0.26rem;
}

.picker-row-card {
  gap: 0.12rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--bg-border);
}

.picker-row-copy {
  display: grid;
  gap: 0.04rem;
}

.picker-row span {
  color: var(--fg-muted);
  font-size: 0.72rem;
}

.picker-row.active {
  border-color: rgba(111, 244, 201, 0.28);
  background: rgba(111, 244, 201, 0.08);
}

.library-row {
  background: rgba(10, 16, 24, 0.34);
}

.picker-row-actions {
  display: flex;
  gap: 0.08rem;
  flex-wrap: wrap;
}

.builder-center-pane {
  overflow: auto;
}

.builder-form-grid,
.roster-grid {
  display: grid;
  gap: 0.1rem;
}

.builder-form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.builder-form-grid label,
.roster-grid label {
  display: grid;
  gap: 0.04rem;
}

.builder-form-grid label.wide,
.roster-grid label.wide {
  grid-column: 1 / -1;
}

.builder-form-grid span,
.roster-grid span {
  color: var(--fg-muted);
  font-size: 0.72rem;
}

.roster-list {
  display: grid;
  gap: 0.12rem;
}

.roster-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.16rem;
  padding: 0.18rem;
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, rgba(17, 26, 37, 0.78), rgba(10, 16, 24, 0.7));
  border: 1px solid var(--bg-border);
}

.roster-row-main {
  display: grid;
  gap: 0.14rem;
}

.roster-row-topline {
  display: flex;
  gap: 0.08rem;
  align-items: center;
  flex-wrap: wrap;
}

.roster-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.roster-row-actions {
  display: flex;
  align-items: start;
}

.danger {
  border-color: rgba(255, 109, 122, 0.24);
  color: #ffd6db;
}

.summary-stack {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.08rem;
}

.summary-card,
.tracker-card {
  padding: 0.18rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--bg-border);
  background: rgba(10, 16, 24, 0.42);
}

.summary-card {
  display: grid;
  gap: 0.04rem;
}

.summary-card span {
  color: var(--fg-muted);
  font-size: 0.72rem;
}

.summary-card strong {
  font-size: 1rem;
}

.session-list {
  display: grid;
  gap: 0.08rem;
}

.session-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.12rem;
  padding: 0.16rem 0.12rem;
  border-radius: var(--radius-sm);
  background: rgba(119, 200, 255, 0.04);
  border: 1px solid rgba(144, 163, 191, 0.12);
}

.session-row div {
  display: grid;
  gap: 0.02rem;
}

.session-row span {
  color: var(--fg-muted);
  font-size: 0.72rem;
}

.status-copy {
  display: grid;
  gap: 0.04rem;
}

.status-copy span {
  color: var(--fg-muted);
}

.empty-roster {
  padding: 0.22rem 0;
}

@media (max-width: 1220px) {
  .builder-shell {
    grid-template-columns: 1fr;
  }

  .builder-picker-pane,
  .builder-center-pane,
  .builder-right-pane {
    max-height: none;
  }
}

@media (max-width: 760px) {
  .builder-form-grid,
  .roster-grid,
  .summary-stack {
    grid-template-columns: 1fr;
  }

  .roster-row {
    grid-template-columns: 1fr;
  }
}
</style>
