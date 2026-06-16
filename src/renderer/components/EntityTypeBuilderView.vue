<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, watch } from "vue";
import { useMasterCrafter } from "@renderer/composables/useMasterCrafter";
import { createId } from "@shared/utils";
import type { CustomFieldDefinitionDto, EntityTypeDefinitionInputDto } from "@shared/contracts";
import { confirmationDialogService } from "@renderer/services/ConfirmationDialogService";
import { hotkeyDispatcherService } from "@renderer/services/hotkeys";

const store = useMasterCrafter();
const state = store.state;

const draft = reactive<EntityTypeDefinitionInputDto>({
  workspaceId: "",
  id: undefined,
  typeKey: "",
  displayName: "",
  icon: "sparkles",
  color: "#77c8ff",
  description: "",
  builtin: false,
  fieldDefinitions: [],
});

const snapshot = computed(() => state.value.snapshot);
const selectedType = computed(() => snapshot.value?.entityTypes.find((entry) => entry.id === state.value.selectedEntityTypeId) ?? snapshot.value?.entityTypes[0] ?? null);
let unregisterHotkeys: (() => void) | null = null;

watch(
  selectedType,
  (type) => {
    if (!type) {
      draft.workspaceId = snapshot.value?.workspace.id ?? "";
      draft.id = undefined;
      draft.typeKey = "";
      draft.displayName = "";
      draft.icon = "sparkles";
      draft.color = "#77c8ff";
      draft.description = "";
      draft.builtin = false;
      draft.fieldDefinitions = [];
      return;
    }

    draft.workspaceId = type.workspaceId;
    draft.id = type.id;
    draft.typeKey = type.typeKey;
    draft.displayName = type.displayName;
    draft.icon = type.icon;
    draft.color = type.color;
    draft.description = type.description;
    draft.builtin = type.builtin;
    draft.fieldDefinitions = type.fieldDefinitions.map((field) => ({ ...field }));
  },
  { immediate: true },
);

function addField(): void {
  draft.fieldDefinitions = [
    ...draft.fieldDefinitions,
    {
      id: createId(),
      key: `field_${draft.fieldDefinitions.length + 1}`,
      label: "Field",
      kind: "text",
      required: false,
      options: [],
      linkedTypeKey: null,
      defaultValue: null,
    },
  ];
}

function removeField(fieldId: string): void {
  draft.fieldDefinitions = draft.fieldDefinitions.filter((field) => field.id !== fieldId);
}

function removeLastField(): void {
  const field = draft.fieldDefinitions[draft.fieldDefinitions.length - 1];
  if (!field) {
    return;
  }

  removeField(field.id);
}

async function saveType(): Promise<void> {
  const workspace = snapshot.value?.workspace;
  if (!workspace) {
    return;
  }

  const saved = await store.saveEntityType({
    workspaceId: workspace.id,
    id: draft.id,
    typeKey: draft.typeKey.trim(),
    displayName: draft.displayName.trim(),
    icon: draft.icon.trim() || "sparkles",
    color: draft.color.trim() || "#77c8ff",
    description: draft.description.trim(),
    builtin: draft.builtin,
    fieldDefinitions: draft.fieldDefinitions,
  });

  store.selectEntityType(saved.id);
}

async function createType(): Promise<void> {
  const workspace = snapshot.value?.workspace;
  if (!workspace) {
    return;
  }

  const created = await store.saveEntityType({
    workspaceId: workspace.id,
    typeKey: `custom_${Date.now()}`,
    displayName: "New Type",
    icon: "sparkles",
    color: "#77c8ff",
    description: "",
    builtin: false,
    fieldDefinitions: [],
  });

  store.selectEntityType(created.id);
}

async function deleteType(): Promise<void> {
  const type = selectedType.value;
  const workspace = snapshot.value?.workspace;
  if (!type || !workspace || type.builtin) {
    return;
  }

  const confirmed = await confirmationDialogService.requestConfirmation({
    title: `Delete ${type.displayName}?`,
    message: `This will permanently remove the ${type.displayName} entity type from the workspace.`,
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    tone: "danger",
  });

  if (!confirmed) {
    return;
  }

  await window.masterCrafter.entityTypes.delete(workspace.id, type.id);
  await store.refreshSnapshot();
}

function updateField(fieldId: string, patch: Partial<CustomFieldDefinitionDto>): void {
  draft.fieldDefinitions = draft.fieldDefinitions.map((field) => (field.id === fieldId ? { ...field, ...patch } : field));
}

function registerHotkeys(): void {
  unregisterHotkeys?.();
  unregisterHotkeys = hotkeyDispatcherService.registerScope({
    scopeId: "entity-type-builder",
    scopeType: "view",
    contextId: "types",
    handlers: {
      "types.createType": () => void createType(),
      "types.saveType": () => void saveType(),
      "types.deleteType": () => void deleteType(),
      "types.addField": () => addField(),
      "types.removeField": () => removeLastField(),
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
  <section class="types-layout">
    <div class="types-list glass-panel scroll-shell">
      <p class="section-title">Entity Types</p>
      <button type="button" class="create-type" @click="createType()">New Type</button>
      <div class="type-stack">
        <button
          v-for="type in snapshot?.entityTypes ?? []"
          :key="type.id"
          type="button"
          class="type-row"
          :class="{ active: type.id === state.selectedEntityTypeId }"
          @click="store.selectEntityType(type.id)"
        >
          <strong>{{ type.displayName }}</strong>
          <span>{{ type.typeKey }}</span>
        </button>
      </div>
    </div>

    <div class="type-editor glass-panel scroll-shell">
      <div class="editor-header">
        <div>
          <p class="section-title">Schema</p>
          <h2>{{ selectedType?.displayName || "Entity Type" }}</h2>
        </div>
        <div class="header-actions">
          <button type="button" :disabled="!snapshot" @click="saveType()">Save</button>
          <button type="button" :disabled="!selectedType || selectedType.builtin" @click="deleteType()">Delete</button>
        </div>
      </div>

      <div class="type-grid">
        <label>
          <span class="field-label">Type Key</span>
          <input v-model="draft.typeKey" type="text" />
        </label>
        <label>
          <span class="field-label">Display Name</span>
          <input v-model="draft.displayName" type="text" />
        </label>
        <label>
          <span class="field-label">Icon</span>
          <input v-model="draft.icon" type="text" />
        </label>
        <label>
          <span class="field-label">Color</span>
          <input v-model="draft.color" type="color" />
        </label>
        <label class="wide">
          <span class="field-label">Description</span>
          <textarea v-model="draft.description"></textarea>
        </label>
      </div>

      <div class="field-builder">
        <div class="field-builder-header">
          <p class="section-title">Fields</p>
          <button type="button" @click="addField()">Add Field</button>
        </div>

        <div class="field-list">
          <article v-for="field in draft.fieldDefinitions" :key="field.id" class="field-card">
            <div class="field-card-header">
              <strong>{{ field.label || field.key }}</strong>
              <button type="button" class="danger" @click="removeField(field.id)">Remove</button>
            </div>
            <div class="field-card-grid">
              <label>
                <span class="field-label">Key</span>
                <input :value="field.key" type="text" @input="updateField(field.id, { key: ($event.target as HTMLInputElement).value })" />
              </label>
              <label>
                <span class="field-label">Label</span>
                <input :value="field.label" type="text" @input="updateField(field.id, { label: ($event.target as HTMLInputElement).value })" />
              </label>
              <label>
                <span class="field-label">Kind</span>
                <select :value="field.kind" @change="updateField(field.id, { kind: ($event.target as HTMLSelectElement).value as CustomFieldDefinitionDto['kind'] })">
                  <option value="text">Text</option>
                  <option value="textarea">Textarea</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                  <option value="date">Date</option>
                  <option value="select">Select</option>
                  <option value="relation">Relation</option>
                  <option value="image">Image</option>
                </select>
              </label>
              <label>
                <span class="field-label">Linked Type</span>
                <input :value="field.linkedTypeKey ?? ''" type="text" @input="updateField(field.id, { linkedTypeKey: ($event.target as HTMLInputElement).value || null })" />
              </label>
              <label>
                <span class="field-label">Default</span>
                <input :value="field.defaultValue ?? ''" type="text" @input="updateField(field.id, { defaultValue: ($event.target as HTMLInputElement).value || null })" />
              </label>
              <label>
                <span class="field-label">Options</span>
                <input :value="field.options.join(', ')" type="text" @input="updateField(field.id, { options: ($event.target as HTMLInputElement).value.split(',').map((item) => item.trim()).filter(Boolean) })" />
              </label>
              <label>
                <span class="field-label">Required</span>
                <input :checked="field.required" type="checkbox" @change="updateField(field.id, { required: ($event.target as HTMLInputElement).checked })" />
              </label>
            </div>
          </article>

          <p v-if="!draft.fieldDefinitions.length" class="muted">No custom fields yet. Add one to start defining the schema.</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.types-layout {
  height: 100%;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 1rem;
}

.types-list,
.type-editor {
  padding: 1rem;
  min-width: 0;
}

.type-stack {
  display: grid;
  gap: 0.5rem;
}

.type-row {
  text-align: left;
  display: grid;
  gap: 0.2rem;
}

.type-row span {
  color: var(--fg-muted);
}

.type-row.active {
  background: rgba(111, 244, 201, 0.16);
}

.editor-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.editor-header h2 {
  margin: 0.25rem 0 0;
}

.type-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
  margin-top: 1rem;
}

.wide {
  grid-column: 1 / -1;
}

.field-label {
  display: block;
  margin-bottom: 0.35rem;
  color: var(--fg-muted);
  font-size: 0.82rem;
}

.field-builder {
  margin-top: 1.25rem;
  display: grid;
  gap: 0.75rem;
}

.field-builder-header,
.field-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}

.field-list {
  display: grid;
  gap: 0.75rem;
}

.field-card {
  padding: 0.9rem;
  border-radius: 14px;
  background: rgba(10, 16, 24, 0.4);
  border: 1px solid var(--bg-border);
}

.field-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
  margin-top: 0.8rem;
}

.danger {
  background: rgba(255, 109, 122, 0.12);
}

@media (max-width: 1280px) {
  .types-layout {
    grid-template-columns: 1fr;
  }
}
</style>
