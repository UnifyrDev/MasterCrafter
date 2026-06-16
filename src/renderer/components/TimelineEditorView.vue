<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { CalendarStampDto } from "@shared/contracts";
import { GLOBAL_TIMELINE_LABEL } from "@shared/constants";
import { useMasterCrafter } from "@renderer/composables/useMasterCrafter";
import { confirmationDialogService } from "@renderer/services/ConfirmationDialogService";
import { hotkeyDispatcherService } from "@renderer/services/hotkeys";
import TimelineEventBoard from "@renderer/components/timeline/TimelineEventBoard.vue";
import TimelineEventEditorModal from "@renderer/components/timeline/TimelineEventEditorModal.vue";
import TimelineQuestNodeEditorModal from "@renderer/components/timeline/TimelineQuestNodeEditorModal.vue";

const store = useMasterCrafter();
const state = store.state;

const snapshot = computed(() => state.value.snapshot);
const workspaceId = computed(() => snapshot.value?.workspace?.id ?? null);
const selectedEvent = computed(() => snapshot.value?.timelineEvents.find((event) => event.id === state.value.selectedTimelineEventId) ?? null);
const selectedQuestNode = computed(() => snapshot.value?.questNodes.find((node) => node.id === state.value.selectedQuestNodeId) ?? null);
const questNodes = computed(() => snapshot.value?.questNodes ?? []);
const isEventEditorOpen = ref(false);
const isQuestNodeEditorOpen = ref(false);
let unregisterHotkeys: (() => void) | null = null;

watch(
  selectedEvent,
  (next) => {
    if (!next) {
      isEventEditorOpen.value = false;
    }
  },
);

watch(
  selectedQuestNode,
  (next) => {
    if (!next) {
      isQuestNodeEditorOpen.value = false;
    }
  },
);

async function createEvent(): Promise<void> {
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
}

async function createQuestline(): Promise<void> {
  const workspace = snapshot.value?.workspace;
  if (!workspace) {
    return;
  }

  const saved = await store.saveQuestline({
    workspaceId: workspace.id,
    anchorEntityId: null,
    title: "Untitled Questline",
    description: "",
    status: "draft",
  });

  store.focusQuestline(saved.id);
  store.focusQuestNode(null);
}

async function createQuestNodeFromSelection(): Promise<void> {
  const workspace = snapshot.value?.workspace;
  if (!workspace) {
    return;
  }

  const questline = snapshot.value?.questlines.find((entry) => entry.id === state.value.selectedQuestlineId) ?? snapshot.value?.questlines[0] ?? null;
  if (!questline) {
    return;
  }

  const stamp = selectedEvent.value?.stamp ?? {
    year: 1,
    month: 1,
    day: 1,
    hour: 0,
    minute: 0,
  };

  await createQuestNodeAtMoment({
    questlineId: questline.id,
    stamp,
  });
}

async function createQuestNodeAtMoment(payload: { questlineId: string; stamp: CalendarStampDto }): Promise<void> {
  const workspace = snapshot.value?.workspace;
  if (!workspace) {
    return;
  }

  const questline = snapshot.value?.questlines.find((entry) => entry.id === payload.questlineId) ?? null;
  if (!questline) {
    return;
  }

  const siblingCount = snapshot.value?.questNodes.filter((node) => node.questlineId === payload.questlineId).length ?? 0;
  const saved = await store.saveQuestNode({
    workspaceId: workspace.id,
    questlineId: payload.questlineId,
    parentNodeId: null,
    title: "Untitled Quest Node",
    description: "",
    rewards: [],
    orderIndex: siblingCount,
    stamp: payload.stamp,
  });

  store.focusQuestline(questline.id);
  store.focusQuestNode(saved.id);
  isQuestNodeEditorOpen.value = true;
}

function openEventEditor(eventId: string): void {
  isQuestNodeEditorOpen.value = false;
  store.selectTimelineEvent(eventId);
  isEventEditorOpen.value = true;
}

function openQuestNodeEditor(questNodeId: string): void {
  isEventEditorOpen.value = false;
  store.focusQuestNode(questNodeId);
  isQuestNodeEditorOpen.value = true;
}

function focusQuestline(questlineId: string): void {
  store.focusQuestline(questlineId);
  store.focusQuestNode(null);
}

function closeEventEditor(): void {
  isEventEditorOpen.value = false;
}

async function deleteTimelineEvent(eventId: string): Promise<void> {
  const event = snapshot.value?.timelineEvents.find((entry) => entry.id === eventId) ?? null;
  const workspace = snapshot.value?.workspace;
  if (!event || !workspace) {
    return;
  }

  const confirmed = await confirmationDialogService.requestConfirmation({
    title: `Delete ${event.title}?`,
    message: `This will permanently remove the timeline event ${event.title}.`,
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    tone: "danger",
  });

  if (!confirmed) {
    return;
  }

  try {
    await store.deleteTimelineEvent(workspace.id, event.id);
    isEventEditorOpen.value = false;
  } catch (error) {
    window.alert(error instanceof Error ? error.message : `Unable to delete ${event.title}.`);
  }
}

async function deleteQuestNode(questNodeId: string): Promise<void> {
  const node = snapshot.value?.questNodes.find((entry) => entry.id === questNodeId) ?? null;
  const workspace = snapshot.value?.workspace;
  if (!node || !workspace) {
    return;
  }

  const confirmed = await confirmationDialogService.requestConfirmation({
    title: `Delete ${node.title}?`,
    message: `This will permanently remove the quest node ${node.title} from the questline.`,
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    tone: "danger",
  });

  if (!confirmed) {
    return;
  }

  try {
    await store.deleteQuestNode(workspace.id, node.questlineId, node.id);
    store.focusQuestNode(null);
    isQuestNodeEditorOpen.value = false;
  } catch (error) {
    window.alert(error instanceof Error ? error.message : `Unable to delete ${node.title}.`);
  }
}

function closeQuestNodeEditor(): void {
  isQuestNodeEditorOpen.value = false;
}

function registerHotkeys(): void {
  unregisterHotkeys?.();
  unregisterHotkeys = hotkeyDispatcherService.registerScope({
    scopeId: "timeline-editor",
    scopeType: "view",
    contextId: "timeline-board",
    handlers: {
      "timeline.createEvent": () => createEvent(),
      "timeline.createQuestline": () => createQuestline(),
      "timeline.createQuestNode": () => createQuestNodeFromSelection(),
      "modals.openTimelineEventEditor": () => {
        if (selectedEvent.value) {
          openEventEditor(selectedEvent.value.id);
        }
      },
      "modals.openQuestNodeEditor": () => {
        if (selectedQuestNode.value) {
          openQuestNodeEditor(selectedQuestNode.value.id);
        }
      },
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
  <section class="timeline-layout">
    <div class="timeline-workspace glass-panel">
      <TimelineEventBoard
        :workspace-id="workspaceId"
        :events="snapshot?.timelineEvents ?? []"
        :questlines="snapshot?.questlines ?? []"
        :quest-nodes="questNodes"
        :calendar="snapshot?.calendar ?? null"
        :selected-event-id="state.selectedTimelineEventId"
        :selected-questline-id="state.selectedQuestlineId"
        :selected-quest-node-id="state.selectedQuestNodeId"
        @open-event="openEventEditor"
        @open-questnode="openQuestNodeEditor"
        @create-event="createEvent()"
        @create-questline="createQuestline()"
        @create-questnode="createQuestNodeAtMoment"
        @select-questline="focusQuestline"
        @select-questnode="store.focusQuestNode"
        @delete-event="deleteTimelineEvent"
        @delete-questnode="deleteQuestNode"
      />
    </div>

    <TimelineEventEditorModal v-if="isEventEditorOpen && selectedEvent" @close="closeEventEditor()" />
    <TimelineQuestNodeEditorModal v-if="isQuestNodeEditorOpen && selectedQuestNode" @close="closeQuestNodeEditor()" />
  </section>
</template>

<style scoped>
.timeline-layout {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.timeline-workspace {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  gap: 0;
  padding: 0.92rem;
  height: 100%;
  overflow: hidden;
}

@media (max-width: 900px) {
  .timeline-workspace {
    padding: 0.7rem;
  }
}
</style>
