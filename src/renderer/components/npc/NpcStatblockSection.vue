<script setup lang="ts">
import { computed, nextTick, type ComponentPublicInstance } from "vue";
import type { NpcStatblockDto, NpcStatblockFeatureDto } from "@shared/contracts";
import { createNpcStatblockFeature } from "@shared/npcStatblock";
import { applyMarkdownFormatting, type MarkdownFormattingKind } from "@renderer/utils/markdownFormatting";

const props = defineProps<{
  enabled: boolean;
  statblock: NpcStatblockDto;
}>();

const emit = defineEmits<{
  (event: "update:enabled", value: boolean): void;
}>();

const enabledModel = computed<boolean>({
  get: () => props.enabled,
  set: (value: boolean) => emit("update:enabled", value),
});

type FeatureSectionKey = keyof Pick<NpcStatblockDto, "traits" | "actions" | "reactions" | "legendaryActions">;

const featureTextareas = new WeakMap<NpcStatblockFeatureDto, HTMLTextAreaElement>();

const abilityEntries = [
  ["str", "Strength"],
  ["dex", "Dexterity"],
  ["con", "Constitution"],
  ["int", "Intelligence"],
  ["wis", "Wisdom"],
  ["cha", "Charisma"],
] as const;

function abilityModifier(score: number): string {
  const modifier = Math.floor((Number.isFinite(score) ? score : 0) / 2) - 5;
  return modifier >= 0 ? `+${modifier}` : String(modifier);
}

function addFeature(section: keyof Pick<NpcStatblockDto, "traits" | "actions" | "reactions" | "legendaryActions">): void {
  props.statblock[section] = [...props.statblock[section], createNpcStatblockFeature()];
}

function removeFeature(
  section: FeatureSectionKey,
  index: number,
): void {
  props.statblock[section] = props.statblock[section].filter((_, featureIndex) => featureIndex !== index);
}

function bindFeatureTextareaRef(feature: NpcStatblockFeatureDto): (element: Element | ComponentPublicInstance | null) => void {
  return (element: Element | ComponentPublicInstance | null) => {
    if (element instanceof HTMLTextAreaElement) {
      featureTextareas.set(feature, element);
      return;
    }

    featureTextareas.delete(feature);
  };
}

async function formatFeatureText(feature: NpcStatblockFeatureDto, kind: MarkdownFormattingKind): Promise<void> {
  const textarea = featureTextareas.get(feature);
  if (!textarea || !feature) {
    return;
  }

  const result = applyMarkdownFormatting(feature.text, {
    start: textarea.selectionStart ?? feature.text.length,
    end: textarea.selectionEnd ?? feature.text.length,
  }, kind);

  feature.text = result.value;
  await nextTick();
  textarea.focus();
  textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
}
</script>

<template>
  <section class="npc-statblock-section">
    <div class="section-header">
      <div>
        <p class="section-title">Statblock</p>
        <p class="muted">Optional Monster Manual style layout with live preview.</p>
      </div>

      <label class="statblock-toggle">
        <input v-model="enabledModel" type="checkbox" />
        <span>Attach statblock</span>
      </label>
    </div>

    <div v-if="enabled" class="npc-statblock-fields">
      <div class="npc-statblock-grid">
        <label>
          <span class="field-label">Size</span>
          <input v-model="statblock.size" type="text" />
        </label>
        <label>
          <span class="field-label">Creature Type</span>
          <input v-model="statblock.creatureType" type="text" />
        </label>
        <label class="wide">
          <span class="field-label">Alignment</span>
          <input v-model="statblock.alignment" type="text" />
        </label>
      </div>

      <div class="npc-statblock-grid core-stats">
        <label>
          <span class="field-label">Armor Class</span>
          <input v-model="statblock.armorClass" type="text" />
        </label>
        <label>
          <span class="field-label">Hit Points</span>
          <input v-model="statblock.hitPoints" type="text" />
        </label>
        <label class="wide">
          <span class="field-label">Speed</span>
          <input v-model="statblock.speed" type="text" />
        </label>
      </div>

      <div class="npc-statblock-grid abilities-grid">
        <label v-for="([key, label]) in abilityEntries" :key="key">
          <span class="field-label">{{ label }}</span>
          <input v-model.number="statblock.abilities[key]" min="0" type="number" />
          <span class="ability-modifier">{{ abilityModifier(statblock.abilities[key]) }}</span>
        </label>
      </div>

      <div class="npc-statblock-grid detail-grid">
        <label class="wide">
          <span class="field-label">Saving Throws</span>
          <input v-model="statblock.savingThrows" type="text" />
        </label>
        <label class="wide">
          <span class="field-label">Skills</span>
          <input v-model="statblock.skills" type="text" />
        </label>
        <label class="wide">
          <span class="field-label">Damage Vulnerabilities</span>
          <input v-model="statblock.damageVulnerabilities" type="text" />
        </label>
        <label class="wide">
          <span class="field-label">Damage Resistances</span>
          <input v-model="statblock.damageResistances" type="text" />
        </label>
        <label class="wide">
          <span class="field-label">Damage Immunities</span>
          <input v-model="statblock.damageImmunities" type="text" />
        </label>
        <label class="wide">
          <span class="field-label">Condition Immunities</span>
          <input v-model="statblock.conditionImmunities" type="text" />
        </label>
        <label class="wide">
          <span class="field-label">Senses</span>
          <input v-model="statblock.senses" type="text" />
        </label>
        <label class="wide">
          <span class="field-label">Languages</span>
          <input v-model="statblock.languages" type="text" />
        </label>
        <label class="wide">
          <span class="field-label">Challenge</span>
          <input v-model="statblock.challenge" type="text" />
        </label>
      </div>

      <div class="npc-statblock-lists">
        <section class="npc-feature-section">
          <div class="section-header">
            <p class="section-title">Traits</p>
            <button type="button" @click="addFeature('traits')">Add Trait</button>
          </div>
          <div class="npc-feature-list">
            <div v-for="(feature, index) in statblock.traits" :key="`trait-${index}`" class="npc-feature-row">
              <label>
                <span class="field-label">Name</span>
                <input v-model="feature.name" type="text" />
              </label>
              <div class="feature-text-editor">
                <div class="feature-text-header">
                  <span class="field-label">Text</span>
                  <div class="feature-format-actions">
                    <button type="button" aria-label="Bold" @click="formatFeatureText(feature, 'bold')"><strong>B</strong></button>
                    <button type="button" aria-label="Italic" @click="formatFeatureText(feature, 'italic')"><em>I</em></button>
                    <button type="button" aria-label="Code" @click="formatFeatureText(feature, 'code')">Code</button>
                    <button type="button" aria-label="List" @click="formatFeatureText(feature, 'bullet')">List</button>
                  </div>
                </div>
                <textarea
                  :ref="bindFeatureTextareaRef(feature)"
                  v-model="feature.text"
                  class="feature-textarea"
                  placeholder="Use Markdown like **bold**, *italic*, `code`, or - list items."
                ></textarea>
                <p class="markdown-hint">Markdown supported: **bold**, *italic*, `code`, and lists.</p>
              </div>
              <button type="button" class="danger" @click="removeFeature('traits', index)">Remove</button>
            </div>
            <p v-if="!statblock.traits.length" class="muted">No traits added yet.</p>
          </div>
        </section>

        <section class="npc-feature-section">
          <div class="section-header">
            <p class="section-title">Actions</p>
            <button type="button" @click="addFeature('actions')">Add Action</button>
          </div>
          <div class="npc-feature-list">
            <div v-for="(feature, index) in statblock.actions" :key="`action-${index}`" class="npc-feature-row">
              <label>
                <span class="field-label">Name</span>
                <input v-model="feature.name" type="text" />
              </label>
              <div class="feature-text-editor">
                <div class="feature-text-header">
                  <span class="field-label">Text</span>
                  <div class="feature-format-actions">
                    <button type="button" aria-label="Bold" @click="formatFeatureText(feature, 'bold')"><strong>B</strong></button>
                    <button type="button" aria-label="Italic" @click="formatFeatureText(feature, 'italic')"><em>I</em></button>
                    <button type="button" aria-label="Code" @click="formatFeatureText(feature, 'code')">Code</button>
                    <button type="button" aria-label="List" @click="formatFeatureText(feature, 'bullet')">List</button>
                  </div>
                </div>
                <textarea
                  :ref="bindFeatureTextareaRef(feature)"
                  v-model="feature.text"
                  class="feature-textarea"
                  placeholder="Use Markdown like **bold**, *italic*, `code`, or - list items."
                ></textarea>
                <p class="markdown-hint">Markdown supported: **bold**, *italic*, `code`, and lists.</p>
              </div>
              <button type="button" class="danger" @click="removeFeature('actions', index)">Remove</button>
            </div>
            <p v-if="!statblock.actions.length" class="muted">No actions added yet.</p>
          </div>
        </section>

        <section class="npc-feature-section">
          <div class="section-header">
            <p class="section-title">Reactions</p>
            <button type="button" @click="addFeature('reactions')">Add Reaction</button>
          </div>
          <div class="npc-feature-list">
            <div v-for="(feature, index) in statblock.reactions" :key="`reaction-${index}`" class="npc-feature-row">
              <label>
                <span class="field-label">Name</span>
                <input v-model="feature.name" type="text" />
              </label>
              <div class="feature-text-editor">
                <div class="feature-text-header">
                  <span class="field-label">Text</span>
                  <div class="feature-format-actions">
                    <button type="button" aria-label="Bold" @click="formatFeatureText(feature, 'bold')"><strong>B</strong></button>
                    <button type="button" aria-label="Italic" @click="formatFeatureText(feature, 'italic')"><em>I</em></button>
                    <button type="button" aria-label="Code" @click="formatFeatureText(feature, 'code')">Code</button>
                    <button type="button" aria-label="List" @click="formatFeatureText(feature, 'bullet')">List</button>
                  </div>
                </div>
                <textarea
                  :ref="bindFeatureTextareaRef(feature)"
                  v-model="feature.text"
                  class="feature-textarea"
                  placeholder="Use Markdown like **bold**, *italic*, `code`, or - list items."
                ></textarea>
                <p class="markdown-hint">Markdown supported: **bold**, *italic*, `code`, and lists.</p>
              </div>
              <button type="button" class="danger" @click="removeFeature('reactions', index)">Remove</button>
            </div>
            <p v-if="!statblock.reactions.length" class="muted">No reactions added yet.</p>
          </div>
        </section>

        <section class="npc-feature-section">
          <div class="section-header">
            <p class="section-title">Legendary Actions</p>
            <button type="button" @click="addFeature('legendaryActions')">Add Legendary Action</button>
          </div>
          <div class="npc-feature-list">
            <div v-for="(feature, index) in statblock.legendaryActions" :key="`legendary-${index}`" class="npc-feature-row">
              <label>
                <span class="field-label">Name</span>
                <input v-model="feature.name" type="text" />
              </label>
              <div class="feature-text-editor">
                <div class="feature-text-header">
                  <span class="field-label">Text</span>
                  <div class="feature-format-actions">
                    <button type="button" aria-label="Bold" @click="formatFeatureText(feature, 'bold')"><strong>B</strong></button>
                    <button type="button" aria-label="Italic" @click="formatFeatureText(feature, 'italic')"><em>I</em></button>
                    <button type="button" aria-label="Code" @click="formatFeatureText(feature, 'code')">Code</button>
                    <button type="button" aria-label="List" @click="formatFeatureText(feature, 'bullet')">List</button>
                  </div>
                </div>
                <textarea
                  :ref="bindFeatureTextareaRef(feature)"
                  v-model="feature.text"
                  class="feature-textarea"
                  placeholder="Use Markdown like **bold**, *italic*, `code`, or - list items."
                ></textarea>
                <p class="markdown-hint">Markdown supported: **bold**, *italic*, `code`, and lists.</p>
              </div>
              <button type="button" class="danger" @click="removeFeature('legendaryActions', index)">Remove</button>
            </div>
            <p v-if="!statblock.legendaryActions.length" class="muted">No legendary actions added yet.</p>
          </div>
        </section>
      </div>
    </div>

    <div v-else class="npc-statblock-disabled">
      <strong>Statblock disabled</strong>
      <p class="muted">Enable the toggle to attach a Monster Manual style statblock to this NPC.</p>
    </div>
  </section>
</template>

<style scoped>
.npc-statblock-section {
  display: grid;
  gap: 0.75rem;
}

.statblock-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  padding: 0.28rem 0.5rem;
  border-radius: 999px;
  background: rgba(111, 244, 201, 0.08);
  border: 1px solid rgba(111, 244, 201, 0.18);
}

.npc-statblock-fields {
  display: grid;
  gap: 0.72rem;
}

.npc-statblock-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.56rem;
}

.npc-statblock-grid label {
  display: grid;
  gap: 0.08rem;
}

.wide {
  grid-column: 1 / -1;
}

.abilities-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.abilities-grid label {
  position: relative;
  padding-bottom: 0.1rem;
}

.ability-modifier {
  position: absolute;
  right: 0.55rem;
  top: 1.45rem;
  color: var(--fg-muted);
  font-size: 0.75rem;
}

.npc-statblock-lists {
  display: grid;
  gap: 0.65rem;
}

.npc-feature-section {
  display: grid;
  gap: 0.35rem;
}

.npc-feature-list {
  display: grid;
  gap: 0.5rem;
}

.npc-feature-row {
  display: grid;
  gap: 0.48rem;
  padding: 0.6rem;
  border-radius: 10px;
  border: 1px solid rgba(144, 163, 191, 0.16);
  background: rgba(10, 16, 24, 0.28);
}

.npc-feature-row label {
  display: grid;
  gap: 0.08rem;
}

.feature-text-editor {
  display: grid;
  gap: 0.28rem;
}

.feature-text-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.feature-format-actions {
  display: flex;
  gap: 0.14rem;
  flex-wrap: wrap;
}

.feature-format-actions button {
  padding: 0.24rem 0.52rem;
  font-size: 0.74rem;
}

.feature-textarea {
  min-height: 6rem;
  font-family: var(--font-mono);
}

.markdown-hint {
  margin: 0;
  color: var(--fg-muted);
  font-size: 0.72rem;
}

.npc-statblock-disabled {
  display: grid;
  gap: 0.1rem;
  padding: 0.7rem 0.8rem;
  border-radius: 10px;
  border: 1px dashed rgba(144, 163, 191, 0.24);
  background: rgba(10, 16, 24, 0.22);
}

@media (max-width: 940px) {
  .npc-statblock-grid,
  .abilities-grid {
    grid-template-columns: 1fr;
  }
}
</style>
