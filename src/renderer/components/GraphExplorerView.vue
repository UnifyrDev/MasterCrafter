<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useMasterCrafter } from "@renderer/composables/useMasterCrafter";
import { layoutCircularGraph, layoutQuestGraph, type GraphEdge, type GraphNode } from "@renderer/utils/graph";
import { hotkeyDispatcherService } from "@renderer/services/hotkeys";

const store = useMasterCrafter();
const state = store.state;
const mode = ref<"quests" | "relations">("quests");
let unregisterHotkeys: (() => void) | null = null;

const snapshot = computed(() => state.value.snapshot);
const questline = computed(() => snapshot.value?.questlines.find((entry) => entry.id === state.value.selectedQuestlineId) ?? snapshot.value?.questlines[0] ?? null);
const questGraphNodes = computed<GraphNode[]>(() => {
  const current = questline.value;
  if (!current || !snapshot.value) {
    return [];
  }

  return snapshot.value.questNodes
    .filter((node) => node.questlineId === current.id)
    .map((node) => ({
      id: node.id,
      label: node.title,
      type: "quest",
    }));
});
const questGraphEdges = computed<GraphEdge[]>(() => {
  const current = questline.value;
  if (!current || !snapshot.value) {
    return [];
  }

  return snapshot.value.questNodes
    .filter((node) => node.questlineId === current.id && node.parentNodeId)
    .map((node) => ({
      id: `${node.parentNodeId}-${node.id}`,
      source: node.parentNodeId as string,
      target: node.id,
      label: "follows",
    }));
});
const questLayout = computed(() => layoutQuestGraph(questGraphNodes.value, questGraphEdges.value));

const relationNodes = computed<GraphNode[]>(() =>
  (snapshot.value?.entities ?? [])
    .filter((entity) => entity.typeKey === "npc")
    .map((entity) => ({
      id: entity.id,
      label: entity.title,
      type: entity.typeKey,
    })),
);
const relationEdges = computed<GraphEdge[]>(() =>
  (snapshot.value?.relations ?? []).map((relation) => ({
    id: relation.id,
    source: relation.sourceEntityId,
    target: relation.targetEntityId,
    label: relation.label,
  })),
);
const relationLayout = computed(() => layoutCircularGraph(relationNodes.value));

watch(
  () => snapshot.value?.questlines.length,
  (count) => {
    if (count && !state.value.selectedQuestlineId && snapshot.value?.questlines[0]) {
      store.selectQuestline(snapshot.value.questlines[0].id);
    }
  },
  { immediate: true },
);

function selectMode(nextMode: "quests" | "relations"): void {
  mode.value = nextMode;
}

function resetQuestGraph(): void {
  mode.value = "quests";
  const targetQuestline = questline.value ?? snapshot.value?.questlines[0] ?? null;
  if (targetQuestline) {
    store.selectQuestline(targetQuestline.id);
  }
}

function registerHotkeys(): void {
  unregisterHotkeys?.();
  unregisterHotkeys = hotkeyDispatcherService.registerScope({
    scopeId: "graph-explorer",
    scopeType: "view",
    contextId: "graphs",
    handlers: {
      "graphs.graphHome": () => resetQuestGraph(),
      "graphs.selectQuestsMode": () => selectMode("quests"),
      "graphs.selectRelationsMode": () => selectMode("relations"),
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
  <section class="graph-layout">
    <div class="graph-sidebar glass-panel scroll-shell">
      <div class="mode-switch">
        <button type="button" :class="{ active: mode === 'quests' }" @click="selectMode('quests')">Quest Graph</button>
        <button type="button" :class="{ active: mode === 'relations' }" @click="selectMode('relations')">NPC Graph</button>
      </div>

      <div v-if="mode === 'quests'" class="graph-list">
        <p class="section-title">Questlines</p>
        <button
          v-for="entry in snapshot?.questlines ?? []"
          :key="entry.id"
          type="button"
          class="graph-row"
          :class="{ active: entry.id === state.selectedQuestlineId }"
          @click="store.selectQuestline(entry.id)"
        >
          <strong>{{ entry.title }}</strong>
          <span>{{ entry.status }}</span>
        </button>
      </div>

      <div v-else class="graph-list">
        <p class="section-title">Relations</p>
        <button
          v-for="relation in snapshot?.relations ?? []"
          :key="relation.id"
          type="button"
          class="graph-row"
          :class="{ active: relation.id === state.selectedRelationId }"
          @click="store.selectRelation(relation.id)"
        >
          <strong>{{ relation.label }}</strong>
          <span>{{ relation.relationKind }}</span>
        </button>
      </div>
    </div>

    <div class="graph-canvas glass-panel scroll-shell">
      <svg v-if="mode === 'quests'" viewBox="-120 -220 1000 520" class="graph-svg">
        <line
          v-for="edge in questGraphEdges"
          :key="edge.id"
          :x1="questLayout.find((node) => node.id === edge.source)?.x ?? 0"
          :y1="questLayout.find((node) => node.id === edge.source)?.y ?? 0"
          :x2="questLayout.find((node) => node.id === edge.target)?.x ?? 0"
          :y2="questLayout.find((node) => node.id === edge.target)?.y ?? 0"
          stroke="rgba(119, 200, 255, 0.4)"
          stroke-width="2"
        />
        <g v-for="node in questLayout" :key="node.id" class="graph-node" @click="store.selectQuestNode(node.id)">
          <circle :cx="node.x" :cy="node.y" r="42" :fill="node.id === state.selectedQuestNodeId ? 'rgba(111,244,201,0.24)' : 'rgba(10,16,24,0.9)'" stroke="rgba(119, 200, 255, 0.5)" stroke-width="2" />
          <text :x="node.x" :y="node.y" text-anchor="middle" dominant-baseline="middle">{{ node.label }}</text>
        </g>
      </svg>

      <svg v-else viewBox="-320 -320 640 640" class="graph-svg">
        <line
          v-for="edge in relationEdges"
          :key="edge.id"
          :x1="relationLayout.find((node) => node.id === edge.source)?.x ?? 0"
          :y1="relationLayout.find((node) => node.id === edge.source)?.y ?? 0"
          :x2="relationLayout.find((node) => node.id === edge.target)?.x ?? 0"
          :y2="relationLayout.find((node) => node.id === edge.target)?.y ?? 0"
          stroke="rgba(111, 244, 201, 0.35)"
          stroke-width="2"
        />
        <g v-for="node in relationLayout" :key="node.id" class="graph-node" @click="store.selectEntity(node.id)">
          <circle :cx="node.x" :cy="node.y" r="36" :fill="node.id === state.selectedEntityId ? 'rgba(111,244,201,0.24)' : 'rgba(10,16,24,0.9)'" stroke="rgba(111,244,201,0.45)" stroke-width="2" />
          <text :x="node.x" :y="node.y" text-anchor="middle" dominant-baseline="middle">{{ node.label }}</text>
        </g>
      </svg>
    </div>
  </section>
</template>

<style scoped>
.graph-layout {
  height: 100%;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 1rem;
}

.graph-sidebar,
.graph-canvas {
  padding: 1rem;
}

.mode-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.mode-switch button.active {
  background: rgba(111, 244, 201, 0.16);
}

.graph-list {
  display: grid;
  gap: 0.5rem;
}

.graph-row {
  text-align: left;
  display: grid;
  gap: 0.2rem;
}

.graph-row span {
  color: var(--fg-muted);
}

.graph-row.active {
  background: rgba(111, 244, 201, 0.16);
}

.graph-svg {
  width: 100%;
  height: 100%;
  min-height: 64vh;
}

.graph-node {
  cursor: pointer;
}

.graph-node text {
  fill: var(--fg);
  font-size: 0.8rem;
  pointer-events: none;
}

@media (max-width: 1280px) {
  .graph-layout {
    grid-template-columns: 1fr;
  }
}
</style>
