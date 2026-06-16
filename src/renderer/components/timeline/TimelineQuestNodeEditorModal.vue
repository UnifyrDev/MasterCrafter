<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, watch } from "vue";
import { useMasterCrafter } from "@renderer/composables/useMasterCrafter";
import type { CalendarStampDto } from "@shared/contracts";
import { formatStamp } from "@renderer/utils/timeline";
import { getCalendarCycleLabel } from "@renderer/utils/calendar";
import { confirmationDialogService } from "@renderer/services/ConfirmationDialogService";
import { hotkeyDispatcherService } from "@renderer/services/hotkeys";

const emit = defineEmits<{
  (event: "close"): void;
}>();

const store = useMasterCrafter();
const state = store.state;

const draft = reactive({
  title: "",
  description: "",
  questlineId: "",
  parentNodeId: null as string | null,
  orderIndex: 0,
  year: 1,
  month: 1,
  day: 1,
  hour: 0,
  minute: 0,
});

const snapshot = computed(() => state.value.snapshot);
const calendar = computed(() => snapshot.value?.calendar ?? null);
const selectedQuestNode = computed(() => snapshot.value?.questNodes.find((node) => node.id === state.value.selectedQuestNodeId) ?? null);
const selectedQuestline = computed(() => {
  const node = selectedQuestNode.value;
  if (!node || !snapshot.value) {
    return null;
  }

  return snapshot.value.questlines.find((questline) => questline.id === node.questlineId) ?? null;
});
const linkedEventCount = computed(() => {
  const node = selectedQuestNode.value;
  if (!node || !snapshot.value) {
    return 0;
  }

  return snapshot.value.timelineEvents.filter((event) => event.questNodeId === node.id).length;
});
const cycleEntryLabel = computed(() => getCalendarCycleLabel(calendar.value, false));
let unregisterHotkeys: (() => void) | null = null;
const parentNodeOptions = computed(() => {
  if (!snapshot.value || !draft.questlineId || !selectedQuestNode.value) {
    return [];
  }

  return [...snapshot.value.questNodes]
    .filter((node) => node.questlineId === draft.questlineId && node.id !== selectedQuestNode.value?.id)
    .sort((left, right) => {
      if (left.orderIndex !== right.orderIndex) {
        return left.orderIndex - right.orderIndex;
      }

      return left.title.localeCompare(right.title);
    });
});

watch(
  selectedQuestNode,
  (node) => {
    if (!node) {
      draft.title = "";
      draft.description = "";
      draft.questlineId = "";
      draft.parentNodeId = null;
      draft.orderIndex = 0;
      draft.year = 1;
      draft.month = 1;
      draft.day = 1;
      draft.hour = 0;
      draft.minute = 0;
      return;
    }

    draft.title = node.title;
    draft.description = node.description;
    draft.questlineId = node.questlineId;
    draft.parentNodeId = node.parentNodeId;
    draft.orderIndex = node.orderIndex;
    draft.year = node.stamp?.year ?? 1;
    draft.month = node.stamp?.month ?? 1;
    draft.day = node.stamp?.day ?? 1;
    draft.hour = node.stamp?.hour ?? 0;
    draft.minute = node.stamp?.minute ?? 0;
  },
  { immediate: true },
);

function closeModal(): void {
  emit("close");
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    closeModal();
  }
}

function registerHotkeys(): void {
  unregisterHotkeys?.();
  unregisterHotkeys = hotkeyDispatcherService.registerScope({
    scopeId: "timeline-questnode-modal",
    scopeType: "modal",
    contextId: "timeline-questnode-modal",
    handlers: {
      "timeline.saveQuestNode": () => void saveQuestNode(),
      "timeline.deleteQuestNode": () => void deleteQuestNode(),
    },
  });
}

async function saveQuestNode(): Promise<void> {
  const workspace = state.value.snapshot?.workspace;
  if (!workspace || !selectedQuestNode.value) {
    return;
  }

  const questlineId = draft.questlineId || selectedQuestNode.value.questlineId;
  await store.saveQuestNode({
    workspaceId: workspace.id,
    id: selectedQuestNode.value.id,
    questlineId,
    parentNodeId: draft.parentNodeId,
    title: draft.title.trim() || "Untitled Quest Node",
    description: draft.description,
    rewards: selectedQuestNode.value.rewards.map((reward) => ({ ...reward })),
    orderIndex: Number.isFinite(draft.orderIndex) ? Math.max(0, Math.floor(draft.orderIndex)) : 0,
    stamp: {
      year: draft.year,
      month: draft.month,
      day: draft.day,
      hour: draft.hour,
      minute: draft.minute,
    } satisfies CalendarStampDto,
  });
}

async function deleteQuestNode(): Promise<void> {
  const workspace = state.value.snapshot?.workspace;
  if (!workspace || !selectedQuestNode.value) {
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
    await store.deleteQuestNode(workspace.id, selectedQuestNode.value.questlineId, selectedQuestNode.value.id);
    store.focusQuestNode(null);
    closeModal();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : `Unable to delete ${questNodeTitle}.`);
  }
}

onMounted(() => {
  registerHotkeys();
  window.addEventListener("keydown", handleKeyDown);
});

onBeforeUnmount(() => {
  unregisterHotkeys?.();
  unregisterHotkeys = null;
  window.removeEventListener("keydown", handleKeyDown);
});
</script>

<template>
  <Teleport to="body">
    <div class="questnode-modal-backdrop" @click.self="closeModal()">
      <section v-if="selectedQuestNode" class="questnode-modal glass-panel scroll-shell" role="dialog" aria-modal="true" :aria-label="`Edit ${selectedQuestNode.title}`">
        <div class="modal-header">
          <div>
            <p class="section-title">Quest node editor</p>
            <h2>{{ selectedQuestNode.title }}</h2>
            <p class="muted">{{ formatStamp(selectedQuestNode.stamp ?? { year: draft.year, month: draft.month, day: draft.day, hour: draft.hour, minute: draft.minute }, calendar) }}</p>
          </div>
          <div class="header-buttons">
            <button type="button" class="danger" @click="deleteQuestNode()">Delete</button>
            <button type="button" @click="closeModal()">Close</button>
            <button type="button" @click="saveQuestNode()">Save Quest Node</button>
          </div>
        </div>

        <div class="linked-summary">
          <span v-if="selectedQuestline" class="chip">Questline: {{ selectedQuestline.title }}</span>
          <span class="chip">{{ linkedEventCount }} linked events</span>
        </div>

        <div class="questnode-grid">
          <label>
            <span class="field-label">Title</span>
            <input v-model="draft.title" type="text" />
          </label>
          <label>
            <span class="field-label">Questline</span>
            <select v-model="draft.questlineId">
              <option v-for="questline in snapshot?.questlines ?? []" :key="questline.id" :value="questline.id">
                {{ questline.title }}
              </option>
            </select>
          </label>
          <label>
            <span class="field-label">Parent Node</span>
            <select v-model="draft.parentNodeId">
              <option :value="null">None</option>
              <option v-for="node in parentNodeOptions" :key="node.id" :value="node.id">{{ node.title }}</option>
            </select>
          </label>
          <label>
            <span class="field-label">Order</span>
            <input v-model.number="draft.orderIndex" type="number" min="0" />
          </label>
          <label>
            <span class="field-label">Year</span>
            <input v-model.number="draft.year" type="number" min="1" />
          </label>
          <label>
            <span class="field-label">{{ cycleEntryLabel }}</span>
            <select v-model.number="draft.month">
              <option v-for="(month, index) in calendar?.months ?? []" :key="month.name" :value="index + 1">
                {{ month.name }}
              </option>
            </select>
          </label>
          <label>
            <span class="field-label">Day</span>
            <input v-model.number="draft.day" type="number" min="1" />
          </label>
          <label>
            <span class="field-label">Hour</span>
            <input v-model.number="draft.hour" type="number" min="0" max="23" />
          </label>
          <label>
            <span class="field-label">Minute</span>
            <input v-model.number="draft.minute" type="number" min="0" max="59" />
          </label>
          <label class="wide">
            <span class="field-label">Description</span>
            <textarea v-model="draft.description"></textarea>
          </label>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.questnode-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(4, 8, 13, 0.72);
  backdrop-filter: blur(12px);
}

.questnode-modal {
  width: min(54rem, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  display: grid;
  gap: 0.78rem;
  padding: 1rem;
  overflow: auto;
  background:
    radial-gradient(circle at 100% 0%, rgba(244, 202, 58, 0.11), transparent 32%),
    radial-gradient(circle at 0% 0%, rgba(119, 200, 255, 0.12), transparent 34%),
    linear-gradient(180deg, rgba(17, 26, 37, 0.98), rgba(12, 18, 28, 0.98));
}

.modal-header {
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  align-items: end;
}

.modal-header h2 {
  margin: 0;
}

.header-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  justify-content: flex-end;
}

.linked-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.questnode-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.82rem;
}

.questnode-grid label {
  display: grid;
  gap: 0.08rem;
}

.field-label {
  display: block;
  margin-bottom: 0;
  color: var(--fg-muted);
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.wide {
  grid-column: 1 / -1;
}

@media (max-width: 900px) {
  .questnode-modal-backdrop {
    padding: 0.5rem;
  }

  .questnode-modal {
    width: calc(100vw - 1rem);
    max-height: calc(100vh - 1rem);
  }

  .questnode-grid {
    grid-template-columns: 1fr;
  }
}
</style>
