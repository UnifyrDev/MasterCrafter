<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useMasterCrafter } from "@renderer/composables/useMasterCrafter";
import { useAssetImageSource } from "@renderer/composables/useAssetImageSource";
import { mapEditorHistoryService } from "@renderer/services/mapEditor";
import type { MapDto, MapInputDto } from "@shared/contracts";

const store = useMasterCrafter();
const state = store.state;

const mapDraft = reactive({
  title: "",
  description: "",
});
const savingMap = ref(false);
const replacingImage = ref(false);

const snapshot = computed(() => state.value.snapshot);
const workspace = computed(() => snapshot.value?.workspace ?? null);
const selectedMap = computed(() => snapshot.value?.maps.find((map) => map.id === state.value.selectedMapId) ?? null);
const placementCount = computed(() => snapshot.value?.placements.filter((placement) => placement.mapId === selectedMap.value?.id).length ?? 0);
const mapAssetPath = computed(() => selectedMap.value?.assetPath ?? null);
const { source: previewSource } = useAssetImageSource(mapAssetPath);

watch(
  selectedMap,
  (map) => {
    if (!map) {
      mapDraft.title = "";
      mapDraft.description = "";
      return;
    }

    mapDraft.title = map.title;
    mapDraft.description = map.description;
  },
  { immediate: true },
);

function buildHistoryScopeKey(mapId: string | null | undefined): string | null {
  const workspaceId = workspace.value?.id ?? null;
  if (!workspaceId || !mapId) {
    return null;
  }

  return mapEditorHistoryService.createScopeKey(workspaceId, mapId);
}

function recordMapHistory(mapId: string | null | undefined, description: string, undo: () => Promise<void> | void): void {
  const scopeKey = buildHistoryScopeKey(mapId);
  if (!scopeKey) {
    return;
  }

  mapEditorHistoryService.push(scopeKey, {
    description,
    undo,
  });
}

function mapSnapshotToInput(map: MapDto): MapInputDto {
  return {
    workspaceId: map.workspaceId,
    id: map.id,
    title: map.title,
    description: map.description,
    assetId: map.assetId,
    assetName: map.assetName,
    width: map.width,
    height: map.height,
  };
}

function recordMapRestore(previousMap: MapDto): void {
  recordMapHistory(previousMap.id, `Restore map "${previousMap.title}"`, async () => {
    await store.saveMap(mapSnapshotToInput(previousMap));
  });
}

async function saveMapDetails(): Promise<void> {
  const map = selectedMap.value;
  const currentWorkspace = workspace.value;
  if (!map || !currentWorkspace || savingMap.value) {
    return;
  }

  savingMap.value = true;
  try {
    const previousMap = { ...map };
    await store.saveMap({
      workspaceId: currentWorkspace.id,
      id: map.id,
      title: mapDraft.title.trim() || map.title,
      description: mapDraft.description.trim(),
      assetId: map.assetId,
      assetName: map.assetName,
      width: map.width,
      height: map.height,
    });
    recordMapRestore(previousMap);
  } catch (error) {
    console.error("Failed to save map details.", error);
  } finally {
    savingMap.value = false;
  }
}

async function replaceMapImage(): Promise<void> {
  const map = selectedMap.value;
  const currentWorkspace = workspace.value;
  if (!map || !currentWorkspace || replacingImage.value) {
    return;
  }

  const paths = await window.masterCrafter.dialog.openFile({
    title: "Replace Map Image",
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg"] }],
    properties: ["openFile"],
  });

  if (!paths.length) {
    return;
  }

  replacingImage.value = true;
  try {
    const previousMap = { ...map };
    await store.importMapImage({
      workspaceId: currentWorkspace.id,
      sourceFilePath: paths[0],
      mapTitle: mapDraft.title.trim() || map.title,
      mapDescription: mapDraft.description.trim(),
      mapId: map.id,
    });
    recordMapRestore(previousMap);
  } catch (error) {
    console.error("Failed to replace the map image.", error);
  } finally {
    replacingImage.value = false;
  }
}
</script>

<template>
  <div class="map-details-editor">
    <template v-if="selectedMap">
      <div class="map-preview">
        <img v-if="previewSource" :src="previewSource" :alt="selectedMap.title" />
        <div v-else class="map-preview-empty">
          <strong>No preview available</strong>
          <span>{{ selectedMap.assetName }}</span>
        </div>
      </div>

      <div class="map-summary">
        <strong>{{ selectedMap.title }}</strong>
        <span>{{ selectedMap.width }} x {{ selectedMap.height }}</span>
      </div>

      <label>
        <span class="field-label">Title</span>
        <input v-model="mapDraft.title" type="text" placeholder="Map title" />
      </label>

      <label>
        <span class="field-label">Description</span>
        <textarea v-model="mapDraft.description" rows="4" placeholder="Map description"></textarea>
      </label>

      <div class="map-actions">
        <button type="button" :disabled="savingMap" @click="saveMapDetails()">Save Details</button>
        <button type="button" :disabled="replacingImage" @click="replaceMapImage()">Replace Image</button>
      </div>

      <div class="map-metadata">
        <p class="muted">Placements: {{ placementCount }}</p>
        <p class="muted">Image: {{ selectedMap.assetName }}</p>
        <p class="muted map-path">{{ selectedMap.assetPath }}</p>
      </div>
    </template>

    <p v-else class="muted">Select a map to edit its details.</p>
  </div>
</template>

<style scoped>
.map-details-editor {
  display: grid;
  gap: 0.22rem;
}

.map-preview {
  padding: 0.22rem;
  border-radius: 9px;
  border: 1px solid var(--bg-border);
  background: rgba(10, 16, 24, 0.42);
  overflow: hidden;
}

.map-preview img {
  display: block;
  width: 100%;
  max-height: 5.75rem;
  object-fit: cover;
  border-radius: 7px;
  background: rgba(5, 10, 16, 0.96);
}

.map-preview-empty {
  display: grid;
  gap: 0.06rem;
  min-height: 5.75rem;
  align-content: center;
  justify-items: start;
  padding: 0.25rem 0.28rem;
  color: var(--fg-muted);
  border-radius: 7px;
  background: rgba(5, 10, 16, 0.7);
}

.map-summary {
  display: grid;
  gap: 0.04rem;
}

.map-summary strong {
  font-size: 0.9rem;
}

.map-summary span {
  color: var(--fg-muted);
  font-size: 0.68rem;
}

.map-details-editor label {
  display: grid;
  gap: 0.06rem;
}

.field-label {
  margin-bottom: 0;
  display: block;
  font-size: 0.64rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--fg-muted);
}

.map-details-editor textarea {
  min-height: 4rem;
}

.map-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.14rem;
}

.map-actions button {
  flex: 1 1 0;
  min-width: 0;
}

.map-metadata {
  display: grid;
  gap: 0.05rem;
}

.map-metadata .muted {
  margin: 0;
  font-size: 0.68rem;
  line-height: 1.35;
}

.map-path {
  word-break: break-word;
}
</style>
