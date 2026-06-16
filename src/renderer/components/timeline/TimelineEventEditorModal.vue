<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, watch } from "vue";
import { useMasterCrafter } from "@renderer/composables/useMasterCrafter";
import type { TimelineEventInputDto } from "@shared/contracts";
import { GLOBAL_TIMELINE_LABEL } from "@shared/constants";
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
  eventType: "Event",
  laneKind: "global" as TimelineEventInputDto["laneKind"],
  laneLabel: GLOBAL_TIMELINE_LABEL,
  year: 1,
  month: 1,
  day: 1,
  hour: 0,
  minute: 0,
  durationMinutes: 60,
  entityId: "",
  questNodeId: "",
  locationEntityId: "",
});

const snapshot = computed(() => state.value.snapshot);
const calendar = computed(() => snapshot.value?.calendar ?? null);
const selectedEvent = computed(() => snapshot.value?.timelineEvents.find((event) => event.id === state.value.selectedTimelineEventId) ?? null);
const entities = computed(() => snapshot.value?.entities ?? []);
const questNodes = computed(() => snapshot.value?.questNodes ?? []);
const selectedLinkedQuestNode = computed(() => {
  const event = selectedEvent.value;
  if (!event || !snapshot.value || !event.questNodeId) {
    return null;
  }

  return snapshot.value.questNodes.find((node) => node.id === event.questNodeId) ?? null;
});
const selectedLinkedQuestline = computed(() => {
  const node = selectedLinkedQuestNode.value;
  if (!node || !snapshot.value) {
    return null;
  }

  return snapshot.value.questlines.find((questline) => questline.id === node.questlineId) ?? null;
});
let unregisterHotkeys: (() => void) | null = null;
const cycleEntryLabel = computed(() => getCalendarCycleLabel(calendar.value, false));

watch(
  () => draft.laneKind,
  (laneKind, previousLaneKind) => {
    if (laneKind === "global") {
      draft.laneLabel = GLOBAL_TIMELINE_LABEL;
      return;
    }

    if (previousLaneKind === "global" && draft.laneLabel === GLOBAL_TIMELINE_LABEL) {
      draft.laneLabel = "Campaign";
    }
  },
  { immediate: true },
);

watch(
  selectedEvent,
  (event) => {
    if (!event) {
      draft.title = "";
      draft.description = "";
      draft.eventType = "Event";
      draft.laneKind = "global";
      draft.laneLabel = GLOBAL_TIMELINE_LABEL;
      draft.year = 1;
      draft.month = 1;
      draft.day = 1;
      draft.hour = 0;
      draft.minute = 0;
      draft.durationMinutes = 60;
      draft.entityId = "";
      draft.questNodeId = "";
      draft.locationEntityId = "";
      return;
    }

    draft.title = event.title;
    draft.description = event.description;
    draft.eventType = event.eventType;
    draft.laneKind = event.laneKind;
    draft.laneLabel = event.laneLabel;
    draft.year = event.stamp.year;
    draft.month = event.stamp.month;
    draft.day = event.stamp.day;
    draft.hour = event.stamp.hour;
    draft.minute = event.stamp.minute;
    draft.durationMinutes = event.durationMinutes;
    draft.entityId = event.entityId ?? "";
    draft.questNodeId = event.questNodeId ?? "";
    draft.laneLabel = event.laneKind === "global" ? GLOBAL_TIMELINE_LABEL : event.laneLabel;
    draft.locationEntityId = event.locationEntityId ?? "";
  },
  { immediate: true },
);

function questlineTitle(questNodeId: string | null): string {
  if (!questNodeId || !snapshot.value) {
    return "None";
  }

  const node = snapshot.value.questNodes.find((entry) => entry.id === questNodeId);
  if (!node) {
    return "Unknown quest node";
  }

  return snapshot.value.questlines.find((questline) => questline.id === node.questlineId)?.title ?? "Questline";
}

async function saveEvent(): Promise<void> {
  const workspace = state.value.snapshot?.workspace;
  if (!workspace) {
    return;
  }

  const saved = await store.saveTimelineEvent({
    workspaceId: workspace.id,
    id: selectedEvent.value?.id,
    entityId: draft.entityId || null,
    questNodeId: draft.questNodeId || null,
    title: draft.title.trim() || "Untitled Event",
    description: draft.description,
    eventType: draft.eventType.trim() || "Event",
    laneKind: draft.laneKind,
    laneLabel: draft.laneKind === "global" ? GLOBAL_TIMELINE_LABEL : draft.laneLabel.trim() || "Campaign",
    stamp: {
      year: draft.year,
      month: draft.month,
      day: draft.day,
      hour: draft.hour,
      minute: draft.minute,
    },
    durationMinutes: draft.durationMinutes,
    locationEntityId: draft.locationEntityId || null,
  });

  store.selectTimelineEvent(saved.id);
}

function closeModal(): void {
  emit("close");
}

async function deleteEvent(): Promise<void> {
  const workspace = state.value.snapshot?.workspace;
  if (!workspace || !selectedEvent.value) {
    return;
  }

  const eventTitle = selectedEvent.value.title;
  const confirmed = await confirmationDialogService.requestConfirmation({
    title: `Delete ${eventTitle}?`,
    message: `This will permanently remove the timeline event ${eventTitle}.`,
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    tone: "danger",
  });

  if (!confirmed) {
    return;
  }

  try {
    await store.deleteTimelineEvent(workspace.id, selectedEvent.value.id);
    closeModal();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : `Unable to delete ${eventTitle}.`);
  }
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
    scopeId: "timeline-event-modal",
    scopeType: "modal",
    contextId: "timeline-event-modal",
    handlers: {
      "timeline.saveEvent": () => void saveEvent(),
      "timeline.deleteEvent": () => void deleteEvent(),
    },
  });
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
    <div class="timeline-modal-backdrop" @click.self="closeModal()">
      <section v-if="selectedEvent" class="timeline-modal glass-panel scroll-shell" role="dialog" aria-modal="true" :aria-label="`Edit ${selectedEvent.title}`">
        <div class="modal-header">
          <div>
            <p class="section-title">Timeline event editor</p>
            <h2>{{ selectedEvent.title }}</h2>
            <p class="muted">{{ formatStamp(selectedEvent.stamp, calendar) }}</p>
          </div>
          <div class="header-buttons">
            <button type="button" class="danger" @click="deleteEvent()">Delete</button>
            <button type="button" @click="closeModal()">Close</button>
            <button type="button" @click="saveEvent()">Save Event</button>
          </div>
        </div>

        <div v-if="selectedLinkedQuestline || selectedLinkedQuestNode" class="linked-summary">
          <span v-if="selectedLinkedQuestline" class="chip">Questline: {{ selectedLinkedQuestline.title }}</span>
          <span v-if="selectedLinkedQuestNode" class="chip">Node: {{ selectedLinkedQuestNode.title }}</span>
          <span v-if="selectedEvent.questNodeId" class="chip">Linked</span>
        </div>

        <div class="timeline-grid">
          <label>
            <span class="field-label">Title</span>
            <input v-model="draft.title" type="text" />
          </label>
          <label>
            <span class="field-label">Event Type</span>
            <input v-model="draft.eventType" type="text" placeholder="Party, fight, trap, puzzle..." />
          </label>
          <label>
            <span class="field-label">Lane Kind</span>
            <select v-model="draft.laneKind">
              <option value="global">Global</option>
              <option value="entity">Entity</option>
              <option value="quest">Quest</option>
              <option value="location">Location</option>
            </select>
          </label>
          <label>
            <span class="field-label">Lane Label</span>
            <input v-model="draft.laneLabel" type="text" :disabled="draft.laneKind === 'global'" />
          </label>
          <label>
            <span class="field-label">Year</span>
            <input v-model.number="draft.year" type="number" min="1" />
          </label>
          <label>
            <span class="field-label">{{ cycleEntryLabel }}</span>
            <select v-model.number="draft.month">
              <option v-for="(month, index) in calendar?.months ?? []" :key="month.name" :value="index + 1">{{ month.name }}</option>
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
          <label>
            <span class="field-label">Duration Minutes</span>
            <input v-model.number="draft.durationMinutes" type="number" min="1" />
          </label>
          <label>
            <span class="field-label">Entity</span>
            <select v-model="draft.entityId">
              <option value="">None</option>
              <option v-for="entity in entities" :key="entity.id" :value="entity.id">{{ entity.title }}</option>
            </select>
          </label>
          <label>
            <span class="field-label">Quest Node</span>
            <select v-model="draft.questNodeId">
              <option value="">None</option>
              <option v-for="node in questNodes" :key="node.id" :value="node.id">{{ questlineTitle(node.id) }} - {{ node.title }}</option>
            </select>
          </label>
          <label class="wide">
            <span class="field-label">Description</span>
            <textarea v-model="draft.description"></textarea>
          </label>
          <label class="wide">
            <span class="field-label">Location Entity</span>
            <select v-model="draft.locationEntityId">
              <option value="">None</option>
              <option v-for="entity in entities" :key="entity.id" :value="entity.id">{{ entity.title }}</option>
            </select>
          </label>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.timeline-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(4, 8, 13, 0.72);
  backdrop-filter: blur(12px);
}

.timeline-modal {
  width: min(56rem, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  display: grid;
  gap: 0.78rem;
  padding: 1rem;
  overflow: auto;
  background:
    radial-gradient(circle at 100% 0%, rgba(111, 244, 201, 0.09), transparent 32%),
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

.timeline-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.82rem;
}

.timeline-grid label {
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
  .timeline-modal-backdrop {
    padding: 0.5rem;
  }

  .timeline-modal {
    width: calc(100vw - 1rem);
    max-height: calc(100vh - 1rem);
  }

  .timeline-grid {
    grid-template-columns: 1fr;
  }
}
</style>
