<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useMasterCrafter } from "@renderer/composables/useMasterCrafter";
import { encounterWorkspaceService } from "@renderer/services/EncounterWorkspaceService";
import { calculateEncounterDifficulty, formatEncounterDifficulty } from "@shared/encounterMath";
import type { EncounterThreatParticipant } from "@shared/encounterMath";
import { hotkeyDispatcherService } from "@renderer/services/hotkeys";

const store = useMasterCrafter();
const state = store.state;
const workspaceState = encounterWorkspaceService.workspaceState;
const filterText = ref("");

const snapshot = computed(() => state.value.snapshot);
const workspaceId = computed(() => snapshot.value?.workspace.id ?? null);
const hotkeyTargetEncounter = computed(() => encounterCards.value.find((card) => card.encounter.id === workspaceState.selectedEncounterId) ?? encounterCards.value[0] ?? null);
let unregisterHotkeys: (() => void) | null = null;

const encounterCards = computed(() => {
  const snapshotValue = snapshot.value;
  if (!snapshotValue) {
    return [];
  }

  const term = filterText.value.trim().toLowerCase();

  return snapshotValue.encounters
    .map((encounter) => {
      const combatants = snapshotValue.encounterCombatants.filter((entry) => entry.encounterId === encounter.id);
      const participants: EncounterThreatParticipant[] = combatants.map((combatant) => ({
        team: combatant.team,
        quantity: combatant.quantity,
        level: combatant.level,
        challengeRating: combatant.challengeRating,
      }));
      const difficulty = calculateEncounterDifficulty(participants);
      return {
        encounter,
        combatantCount: combatants.length,
        participants,
        difficulty,
      };
    })
    .filter(({ encounter }) => {
      if (!term) {
        return true;
      }

      return [encounter.name, encounter.description, encounter.notes, encounter.tags.join(" ")].join(" ").toLowerCase().includes(term);
    });
});

function createEncounter(): void {
  encounterWorkspaceService.openBuilder(null);
}

function editEncounter(encounterId: string): void {
  encounterWorkspaceService.selectEncounter(encounterId);
  encounterWorkspaceService.openBuilder(encounterId);
}

async function playEncounter(encounterId: string): Promise<void> {
  if (!workspaceId.value) {
    return;
  }

  encounterWorkspaceService.selectEncounter(encounterId);
  const session = await store.startEncounterSession(workspaceId.value, encounterId);
  encounterWorkspaceService.openPlay(encounterId, session.id);
}

async function deleteEncounter(encounterId: string): Promise<void> {
  if (!workspaceId.value) {
    return;
  }

  await store.deleteEncounter(workspaceId.value, encounterId);
  if (workspaceState.selectedEncounterId === encounterId) {
    encounterWorkspaceService.openLibrary();
  }
}

function editHotkeyEncounter(): void {
  const target = hotkeyTargetEncounter.value?.encounter.id;
  if (!target) {
    return;
  }

  editEncounter(target);
}

function playHotkeyEncounter(): void {
  const target = hotkeyTargetEncounter.value?.encounter.id;
  if (!target) {
    return;
  }

  void playEncounter(target);
}

function deleteHotkeyEncounter(): void {
  const target = hotkeyTargetEncounter.value?.encounter.id;
  if (!target) {
    return;
  }

  void deleteEncounter(target);
}

function registerHotkeys(): void {
  unregisterHotkeys?.();
  unregisterHotkeys = hotkeyDispatcherService.registerScope({
    scopeId: "encounter-library",
    scopeType: "view",
    contextId: "encounters-library",
    handlers: {
      "encounters.createEncounter": () => createEncounter(),
      "encounters.editEncounter": () => editHotkeyEncounter(),
      "encounters.playEncounter": () => playHotkeyEncounter(),
      "encounters.deleteEncounter": () => deleteHotkeyEncounter(),
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
  <div class="encounter-library-screen">
    <div class="encounter-library-toolbar glass-panel">
      <div class="toolbar-copy">
        <strong>Encounter Library</strong>
        <span>Templates live here. Edit opens the builder and Play resumes the latest saved session.</span>
      </div>

      <div class="toolbar-actions">
        <input v-model="filterText" type="search" placeholder="Filter encounters" />
        <button type="button" @click="createEncounter()">New Encounter</button>
      </div>
    </div>

    <div class="encounter-card-list scroll-shell">
      <article
        v-for="card in encounterCards"
        :key="card.encounter.id"
        class="encounter-card"
        :class="{ selected: workspaceState.selectedEncounterId === card.encounter.id }"
      >
        <button type="button" class="encounter-main" @click="encounterWorkspaceService.selectEncounter(card.encounter.id)">
          <div class="encounter-main-copy">
            <strong>{{ card.encounter.name }}</strong>
            <span>{{ card.encounter.description || "No description yet." }}</span>
          </div>

          <div class="encounter-badges">
            <span class="chip">{{ card.combatantCount }} combatants</span>
            <span class="chip">{{ formatEncounterDifficulty(card.difficulty.difficulty) }}</span>
            <span class="chip">{{ card.difficulty.partySize }} party</span>
            <span class="chip">{{ card.difficulty.enemyUnits }} enemies</span>
          </div>
        </button>

        <div class="encounter-actions">
          <button type="button" @click="editEncounter(card.encounter.id)">Edit</button>
          <button type="button" @click="playEncounter(card.encounter.id)">Play</button>
          <button type="button" class="danger" @click="deleteEncounter(card.encounter.id)">Delete</button>
        </div>
      </article>

      <div v-if="!encounterCards.length" class="empty-state glass-panel">
        <strong>No encounters yet.</strong>
        <span>Create the first encounter to start building combat rosters.</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.encounter-library-screen {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0.22rem;
}

.encounter-library-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 0.16rem;
  flex-wrap: wrap;
  padding: 0.22rem;
}

.toolbar-copy {
  display: grid;
  gap: 0.04rem;
  max-width: 34rem;
}

.toolbar-copy strong {
  font-size: 0.98rem;
}

.toolbar-copy span {
  color: var(--fg-muted);
}

.toolbar-actions {
  display: flex;
  gap: 0.12rem;
  align-items: center;
  flex-wrap: wrap;
}

.toolbar-actions input {
  min-width: 13rem;
}

.encounter-card-list {
  min-height: 0;
  overflow: auto;
  display: grid;
  gap: 0.14rem;
  align-content: start;
  grid-auto-rows: min-content;
}

.encounter-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.18rem;
  align-items: start;
  padding: 0.18rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--bg-border);
  background: linear-gradient(180deg, rgba(17, 26, 37, 0.76), rgba(11, 17, 24, 0.7));
  box-shadow: var(--shadow);
}

.encounter-card.selected {
  border-color: rgba(111, 244, 201, 0.32);
  box-shadow: 0 0 0 1px rgba(111, 244, 201, 0.12), var(--shadow);
}

.encounter-main {
  display: grid;
  gap: 0.1rem;
  text-align: left;
  padding: 0.24rem;
  background: transparent;
  border: 0;
}

.encounter-main:hover {
  background: rgba(119, 200, 255, 0.05);
}

.encounter-main-copy {
  display: grid;
  gap: 0.06rem;
}

.encounter-main-copy span {
  color: var(--fg-muted);
}

.encounter-badges {
  display: flex;
  gap: 0.08rem;
  flex-wrap: wrap;
}

.encounter-actions {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.08rem;
  padding-left: 0.12rem;
}

.encounter-actions button {
  min-width: 4.8rem;
}

.encounter-actions .danger {
  border-color: rgba(255, 109, 122, 0.24);
  color: #ffd6db;
}

.empty-state {
  display: grid;
  gap: 0.08rem;
  justify-items: start;
  padding: 0.5rem;
  color: var(--fg-muted);
}

@media (max-width: 980px) {
  .encounter-card {
    grid-template-columns: minmax(0, 1fr);
  }

  .encounter-actions {
    flex-direction: row;
    flex-wrap: wrap;
    padding-left: 0;
  }
}
</style>
