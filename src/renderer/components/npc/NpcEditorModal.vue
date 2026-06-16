<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useMasterCrafter } from "@renderer/composables/useMasterCrafter";
import { confirmationDialogService } from "@renderer/services/ConfirmationDialogService";
import { npcEditorService } from "@renderer/services/NpcEditorService";
import type { CustomFieldDefinitionDto, EntityDto, EntityInputDto, NpcStatblockDto } from "@shared/contracts";
import { createDefaultNpcStatblock, cloneNpcStatblock, normalizeNpcStatblock } from "@shared/npcStatblock";
import NpcGeneralFormSection from "@renderer/components/npc/NpcGeneralFormSection.vue";
import NpcStatblockSection from "@renderer/components/npc/NpcStatblockSection.vue";
import NpcStatblockPreview from "@renderer/components/npc/NpcStatblockPreview.vue";
import { hotkeyDispatcherService } from "@renderer/services/hotkeys";

const store = useMasterCrafter();
const state = store.state;
const editorState = npcEditorService.editorState;
const keydownListenerOptions: AddEventListenerOptions = { capture: true };

const draft = reactive<EntityInputDto>(createEmptyDraft());
const statblockEnabled = ref(false);
const statblockDraft = reactive<NpcStatblockDto>(createDefaultNpcStatblock());

const snapshot = computed(() => state.value.snapshot);
const workspace = computed(() => snapshot.value?.workspace ?? null);
const editingEntity = computed(() => {
  if (!snapshot.value || !editorState.entityId) {
    return null;
  }

  return snapshot.value.entities.find((entity) => entity.id === editorState.entityId) ?? null;
});
const npcTypeDefinition = computed(() => snapshot.value?.entityTypes.find((type) => type.typeKey === "npc") ?? null);
const npcFieldDefinitions = computed<CustomFieldDefinitionDto[]>(() => npcTypeDefinition.value?.fieldDefinitions ?? []);
const isEditMode = computed(() => editorState.mode === "edit");
const isReady = computed(() => editorState.mode === "create" || Boolean(editingEntity.value));
let unregisterModalScope: (() => void) | null = null;

function createEmptyDraft(workspaceId = ""): EntityInputDto {
  return {
    workspaceId,
    id: undefined,
    typeKey: "npc",
    title: "",
    slug: "",
    subtitle: "",
    description: "",
    markdown: "",
    imageAssetId: null,
    tags: [],
    linkedMapId: null,
    linkedPlacementId: null,
    questlineId: null,
    familyTreeRootId: null,
    customFields: {},
    npcStatblock: null,
  };
}

function seedCustomFields(definitions: CustomFieldDefinitionDto[], existing: Record<string, unknown> = {}): Record<string, unknown> {
  const seeded = definitions.reduce<Record<string, unknown>>((accumulator, definition) => {
    if (definition.defaultValue !== null && definition.defaultValue !== undefined) {
      accumulator[definition.key] = definition.defaultValue;
    }

    return accumulator;
  }, {});

  return {
    ...seeded,
    ...existing,
  };
}

function normalizeCustomFields(definitions: CustomFieldDefinitionDto[], values: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(values)) {
    const definition = definitions.find((entry) => entry.key === key);
    if (!definition) {
      normalized[key] = value;
      continue;
    }

    if (definition.kind === "number") {
      const parsed = Number(value);
      normalized[key] = Number.isFinite(parsed) ? parsed : 0;
      continue;
    }

    if (definition.kind === "boolean") {
      normalized[key] = value === true || value === "true";
      continue;
    }

    normalized[key] = value;
  }

  return normalized;
}

function resetDraft(): void {
  Object.assign(draft, createEmptyDraft(workspace.value?.id ?? ""));
  statblockEnabled.value = false;
  Object.assign(statblockDraft, createDefaultNpcStatblock());
}

function populateDraft(entity: EntityDto): void {
  Object.assign(draft, createEmptyDraft(entity.workspaceId));
  draft.id = entity.id;
  draft.typeKey = entity.typeKey;
  draft.title = entity.title;
  draft.slug = entity.slug;
  draft.subtitle = entity.subtitle;
  draft.description = entity.description;
  draft.markdown = entity.markdown;
  draft.imageAssetId = entity.imageAssetId;
  draft.tags = [...entity.tags];
  draft.linkedMapId = entity.linkedMapId;
  draft.linkedPlacementId = entity.linkedPlacementId;
  draft.questlineId = entity.questlineId;
  draft.familyTreeRootId = entity.familyTreeRootId;
  draft.customFields = seedCustomFields(npcFieldDefinitions.value, entity.customFields);
  draft.npcStatblock = cloneNpcStatblock(entity.npcStatblock);
  statblockEnabled.value = entity.npcStatblock !== null;
  Object.assign(statblockDraft, cloneNpcStatblock(entity.npcStatblock) ?? createDefaultNpcStatblock());
}

function closeModal(): void {
  npcEditorService.close();
}

function toggleStatblockEnabled(): void {
  statblockEnabled.value = !statblockEnabled.value;
}

function registerModalScope(): void {
  unregisterModalScope?.();
  unregisterModalScope = hotkeyDispatcherService.registerScope({
    scopeId: "npc-editor-modal",
    scopeType: "modal",
    contextId: "global",
    handlers: {},
  });
}

function unregisterModalScopeHandler(): void {
  unregisterModalScope?.();
  unregisterModalScope = null;
}

function handleKeyDown(event: KeyboardEvent): void {
  if (!editorState.open || confirmationDialogService.dialogState.open) {
    return;
  }

  if (event.key !== "Escape") {
    return;
  }

  event.stopImmediatePropagation();
  event.preventDefault();
  closeModal();
}

async function saveNpc(): Promise<void> {
  const activeWorkspace = workspace.value;
  if (!activeWorkspace) {
    return;
  }

  if (isEditMode.value && !editingEntity.value) {
    return;
  }

  const saved = await store.saveEntity({
    ...draft,
    workspaceId: activeWorkspace.id,
    typeKey: "npc",
    title: draft.title.trim() || "Untitled NPC",
    slug: draft.slug.trim() || "",
    subtitle: draft.subtitle.trim(),
    description: draft.description.trim(),
    markdown: draft.markdown.trim(),
    tags: draft.tags.map((tag) => tag.trim()).filter(Boolean),
    customFields: normalizeCustomFields(npcFieldDefinitions.value, draft.customFields),
    npcStatblock: statblockEnabled.value ? normalizeNpcStatblock(statblockDraft) : null,
  });

  store.selectEntity(saved.id);
  closeModal();
}

async function deleteNpc(): Promise<void> {
  const activeWorkspace = workspace.value;
  const entity = editingEntity.value;
  if (!activeWorkspace || !entity) {
    return;
  }

  const confirmed = await confirmationDialogService.requestConfirmation({
    title: `Delete ${entity.title}?`,
    message: `This will permanently remove the NPC ${entity.title}.`,
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    tone: "danger",
  });

  if (!confirmed) {
    return;
  }

  try {
    await store.deleteEntity(activeWorkspace.id, entity.id);
    closeModal();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : `Unable to delete ${entity.title}.`);
  }
}

watch(
  () => [editorState.open, editorState.mode, editorState.entityId, workspace.value?.id],
  () => {
    if (!editorState.open) {
      resetDraft();
      return;
    }

    if (editorState.mode === "edit" && editingEntity.value) {
      populateDraft(editingEntity.value);
      return;
    }

    if (editorState.mode === "create") {
      resetDraft();
      if (workspace.value) {
        draft.workspaceId = workspace.value.id;
        draft.customFields = seedCustomFields(npcFieldDefinitions.value);
      }
    }
  },
  { immediate: true },
);

watch(
  editingEntity,
  (entity) => {
    if (editorState.open && editorState.mode === "edit" && !entity) {
      closeModal();
    }
  },
);

watch(
  () => editorState.open,
  (open) => {
    if (open) {
      registerModalScope();
      return;
    }

    unregisterModalScopeHandler();
  },
  { immediate: true },
);

onMounted(() => {
  window.addEventListener("keydown", handleKeyDown, keydownListenerOptions);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeyDown, keydownListenerOptions);
  unregisterModalScopeHandler();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="npc-editor">
      <div v-if="editorState.open" class="npc-editor-backdrop">
        <section
          v-if="isReady"
          class="npc-editor-modal glass-panel scroll-shell"
          role="dialog"
          aria-modal="true"
          :aria-label="isEditMode ? `Edit ${editingEntity?.title}` : 'Create NPC'"
        >
          <div class="npc-editor-header">
            <div class="npc-editor-title">
              <p class="section-title">NPC editor</p>
              <h2>{{ isEditMode ? editingEntity?.title : "Create NPC" }}</h2>
              <p class="muted">
                {{ isEditMode ? "Update the selected NPC and its optional statblock." : "Draft a new NPC with an optional statblock." }}
              </p>
            </div>

            <div class="npc-editor-actions">
              <span class="chip">{{ isEditMode ? "Editing" : "Creating" }}</span>
              <button type="button" class="statblock-toggle-button" :aria-pressed="statblockEnabled" @click="toggleStatblockEnabled">
                {{ statblockEnabled ? "Disable Statblock" : "Enable Statblock" }}
              </button>
              <button v-if="isEditMode" type="button" class="danger" @click="deleteNpc">Delete</button>
              <button type="button" @click="closeModal">Close</button>
              <button type="button" @click="saveNpc">Save NPC</button>
            </div>
          </div>

          <div class="npc-editor-layout">
            <div class="npc-editor-form-column scroll-shell">
              <NpcGeneralFormSection :draft="draft" :custom-field-definitions="npcFieldDefinitions" />
              <NpcStatblockSection v-model:enabled="statblockEnabled" :statblock="statblockDraft" />
            </div>

            <div class="npc-editor-preview-column scroll-shell">
              <NpcStatblockPreview
                :entity-name="draft.title"
                :enabled="statblockEnabled"
                :statblock="statblockDraft"
              />
            </div>
          </div>
        </section>

        <section v-else class="npc-editor-modal npc-editor-empty glass-panel">
          <p class="section-title">NPC editor</p>
          <h2>NPC not available</h2>
          <p class="muted">The selected NPC could not be loaded.</p>
          <div class="npc-editor-empty-actions">
            <button type="button" @click="closeModal">Close</button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.npc-editor-backdrop {
  position: fixed;
  inset: 0;
  z-index: 240;
  display: grid;
  place-items: center;
  padding: 0.75rem;
  background:
    radial-gradient(circle at 10% 0%, rgba(111, 244, 201, 0.12), transparent 30%),
    radial-gradient(circle at 100% 0%, rgba(119, 200, 255, 0.14), transparent 32%),
    rgba(4, 8, 13, 0.76);
  backdrop-filter: blur(14px);
}

.npc-editor-modal {
  width: min(92rem, calc(100vw - 1.5rem));
  height: calc(100vh - 1.5rem);
  max-height: calc(100vh - 1.5rem);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0.85rem;
  padding: 1rem;
  overflow: hidden;
}

.npc-editor-empty {
  width: min(32rem, calc(100vw - 1.5rem));
  justify-items: start;
}

.npc-editor-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 0.8rem;
}

.npc-editor-title {
  min-width: 0;
}

.npc-editor-title h2 {
  margin: 0.08rem 0 0.24rem;
}

.npc-editor-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.38rem;
  justify-content: flex-end;
}

.statblock-toggle-button {
  border: 1px solid rgba(119, 200, 255, 0.3);
  background: rgba(119, 200, 255, 0.12);
  color: var(--fg);
}

.statblock-toggle-button[aria-pressed="true"] {
  border-color: rgba(111, 244, 201, 0.3);
  background: rgba(111, 244, 201, 0.15);
}

.npc-editor-layout {
  min-height: 0;
  min-width: 0;
  height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(27rem, 0.85fr);
  gap: 0.8rem;
}

.npc-editor-form-column,
.npc-editor-preview-column {
  min-height: 0;
  min-width: 0;
  padding: 0.15rem;
}

.npc-editor-form-column {
  display: grid;
  gap: 0.75rem;
  align-content: start;
}

.npc-editor-preview-column {
  display: grid;
  align-content: start;
}

.npc-editor-empty-actions {
  display: flex;
  gap: 0.45rem;
}

.npc-editor-enter-active,
.npc-editor-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.npc-editor-enter-from,
.npc-editor-leave-to {
  opacity: 0;
}

.npc-editor-enter-from .npc-editor-modal,
.npc-editor-leave-to .npc-editor-modal {
  transform: translateY(8px) scale(0.985);
}

@media (max-width: 1200px) {
  .npc-editor-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .npc-editor-backdrop {
    padding: 0.45rem;
  }

  .npc-editor-modal {
    width: calc(100vw - 0.9rem);
    height: calc(100vh - 0.9rem);
    max-height: calc(100vh - 0.9rem);
    padding: 0.8rem;
  }

  .npc-editor-header {
    align-items: start;
    flex-direction: column;
  }

  .npc-editor-actions {
    width: 100%;
    justify-content: stretch;
  }

  .npc-editor-actions button {
    width: 100%;
  }
}
</style>
