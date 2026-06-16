<script setup lang="ts">
import { computed } from "vue";
import type { CustomFieldDefinitionDto, EntityInputDto } from "@shared/contracts";

const props = defineProps<{
  draft: EntityInputDto;
  customFieldDefinitions: CustomFieldDefinitionDto[];
}>();

const tagsText = computed<string>({
  get: () => props.draft.tags.join(", "),
  set: (value: string) => {
    props.draft.tags = value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  },
});

function fieldInputId(field: CustomFieldDefinitionDto): string {
  return `npc-custom-field-${field.id}`;
}

function fieldValue(field: CustomFieldDefinitionDto): string {
  const value = props.draft.customFields[field.key];
  return value == null ? "" : String(value);
}

function setFieldValue(field: CustomFieldDefinitionDto, value: string | boolean): void {
  props.draft.customFields = {
    ...props.draft.customFields,
    [field.key]: field.kind === "boolean" ? Boolean(value) : value,
  };
}
</script>

<template>
  <section class="npc-form-section">
    <div class="section-header">
      <p class="section-title">NPC details</p>
      <span class="chip">Entity type: NPC</span>
    </div>

    <div class="npc-form-grid">
      <label class="wide">
        <span class="field-label">Title</span>
        <input v-model="draft.title" type="text" autofocus />
      </label>

      <label>
        <span class="field-label">Slug</span>
        <input v-model="draft.slug" type="text" />
      </label>

      <label>
        <span class="field-label">Subtitle</span>
        <input v-model="draft.subtitle" type="text" />
      </label>

      <label class="wide">
        <span class="field-label">Description</span>
        <textarea v-model="draft.description"></textarea>
      </label>

      <label class="wide">
        <span class="field-label">Markdown</span>
        <textarea v-model="draft.markdown"></textarea>
      </label>

      <label class="wide">
        <span class="field-label">Tags</span>
        <input v-model="tagsText" type="text" />
      </label>
    </div>

    <div class="field-group npc-custom-fields">
      <div class="section-header">
        <p class="section-title">Custom fields</p>
        <span class="chip">{{ customFieldDefinitions.length }} fields</span>
      </div>

      <div v-if="customFieldDefinitions.length" class="custom-fields">
        <div v-for="field in customFieldDefinitions" :key="field.id" class="custom-field-row">
          <span class="field-label">{{ field.label }}</span>
          <input
            v-if="field.kind === 'text' || field.kind === 'number' || field.kind === 'date' || field.kind === 'relation' || field.kind === 'image'"
            :id="fieldInputId(field)"
            :type="field.kind === 'number' ? 'number' : 'text'"
            :value="fieldValue(field)"
            @input="setFieldValue(field, ($event.target as HTMLInputElement).value)"
          />
          <textarea
            v-else-if="field.kind === 'textarea'"
            :id="fieldInputId(field)"
            :value="fieldValue(field)"
            @input="setFieldValue(field, ($event.target as HTMLTextAreaElement).value)"
          />
          <select
            v-else-if="field.kind === 'select'"
            :id="fieldInputId(field)"
            :value="fieldValue(field)"
            @change="setFieldValue(field, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">Unset</option>
            <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
          </select>
          <div v-else-if="field.kind === 'boolean'" class="boolean-row">
            <input
              :id="fieldInputId(field)"
              type="checkbox"
              :checked="fieldValue(field) === 'true'"
              :aria-label="field.label"
              @change="setFieldValue(field, ($event.target as HTMLInputElement).checked)"
            />
            <span>Enabled</span>
          </div>
        </div>
      </div>

      <p v-else class="muted">This workspace does not define extra NPC fields.</p>
    </div>
  </section>
</template>

<style scoped>
.npc-form-section {
  display: grid;
  gap: 0.75rem;
}

.npc-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
}

.npc-form-grid label {
  display: grid;
  gap: 0.08rem;
}

.wide {
  grid-column: 1 / -1;
}

.npc-custom-fields {
  display: grid;
  gap: 0.45rem;
}

.custom-fields {
  display: grid;
  gap: 0.55rem;
}

.custom-field-row {
  display: grid;
  gap: 0.08rem;
}

.boolean-row {
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  min-height: 2.1rem;
}

@media (max-width: 940px) {
  .npc-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
