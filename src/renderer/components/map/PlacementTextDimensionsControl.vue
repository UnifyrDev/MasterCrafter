<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

const width = defineModel<number>("width", { required: true });
const height = defineModel<number>("height", { required: true });

const props = withDefaults(
  defineProps<{
    min?: number;
    max?: number;
    step?: number;
  }>(),
  {
    min: 2,
    max: 900,
    step: 1,
  },
);

const widthValue = computed(() => Math.round(Number(width.value ?? props.min)));
const heightValue = computed(() => Math.round(Number(height.value ?? props.min)));
const widthEditing = ref(false);
const heightEditing = ref(false);
const widthDraft = ref(String(widthValue.value));
const heightDraft = ref(String(heightValue.value));
const widthInputRef = ref<HTMLInputElement | null>(null);
const heightInputRef = ref<HTMLInputElement | null>(null);

watch(widthValue, (next) => {
  if (!widthEditing.value) {
    widthDraft.value = String(next);
  }
});

watch(heightValue, (next) => {
  if (!heightEditing.value) {
    heightDraft.value = String(next);
  }
});

function clampDimension(value: number): number {
  return Math.min(props.max, Math.max(props.min, Math.round(value)));
}

function parseDraft(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return clampDimension(parsed);
}

async function beginEditing(field: "width" | "height"): Promise<void> {
  if (field === "width") {
    widthDraft.value = String(widthValue.value);
    widthEditing.value = true;
    await nextTick();
    widthInputRef.value?.focus();
    widthInputRef.value?.select();
    return;
  }

  heightDraft.value = String(heightValue.value);
  heightEditing.value = true;
  await nextTick();
  heightInputRef.value?.focus();
  heightInputRef.value?.select();
}

function cancelEditing(field: "width" | "height"): void {
  if (field === "width") {
    widthEditing.value = false;
    widthDraft.value = String(widthValue.value);
    return;
  }

  heightEditing.value = false;
  heightDraft.value = String(heightValue.value);
}

function commitEditing(field: "width" | "height"): void {
  if (field === "width") {
    width.value = parseDraft(widthDraft.value, widthValue.value);
    widthEditing.value = false;
    widthDraft.value = String(widthValue.value);
    return;
  }

  height.value = parseDraft(heightDraft.value, heightValue.value);
  heightEditing.value = false;
  heightDraft.value = String(heightValue.value);
}

function handleKeydown(field: "width" | "height", event: KeyboardEvent): void {
  if (event.key === "Enter") {
    event.preventDefault();
    commitEditing(field);
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    cancelEditing(field);
  }
}
</script>

<template>
  <div class="placement-text-dimensions">
    <label class="dimension-field">
      <span class="dimension-heading">
        <span class="field-label">Text Width</span>
        <button
          v-if="!widthEditing"
          type="button"
          class="dimension-value dimension-value-button"
          @click="beginEditing('width')"
        >
          {{ widthValue }}pt
        </button>
        <input
          v-else
          ref="widthInputRef"
          v-model="widthDraft"
          class="dimension-value dimension-value-input"
          type="number"
          inputmode="numeric"
          :min="props.min"
          :max="props.max"
          :step="1"
          @blur="commitEditing('width')"
          @keydown="handleKeydown('width', $event)"
        />
      </span>
      <input v-model.number="width" type="range" :min="props.min" :max="props.max" :step="props.step" />
    </label>

    <label class="dimension-field">
      <span class="dimension-heading">
        <span class="field-label">Text Height</span>
        <button
          v-if="!heightEditing"
          type="button"
          class="dimension-value dimension-value-button"
          @click="beginEditing('height')"
        >
          {{ heightValue }}pt
        </button>
        <input
          v-else
          ref="heightInputRef"
          v-model="heightDraft"
          class="dimension-value dimension-value-input"
          type="number"
          inputmode="numeric"
          :min="props.min"
          :max="props.max"
          :step="1"
          @blur="commitEditing('height')"
          @keydown="handleKeydown('height', $event)"
        />
      </span>
      <input v-model.number="height" type="range" :min="props.min" :max="props.max" :step="props.step" />
    </label>
  </div>
</template>

<style scoped>
.placement-text-dimensions {
  display: grid;
  gap: 0.14rem;
}

.dimension-field {
  display: grid;
  gap: 0.08rem;
}

.dimension-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}

.field-label {
  margin-bottom: 0;
  font-size: 0.64rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--fg-muted);
}

.dimension-value {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  width: 4.2rem;
  padding: 0.08rem 0.34rem;
  border-radius: 999px;
  border: 1px solid rgba(130, 160, 190, 0.18);
  background: rgba(14, 22, 33, 0.82);
  color: var(--fg);
  font-size: 0.64rem;
  line-height: 1.2;
  box-sizing: border-box;
}

.dimension-value-button {
  cursor: text;
}

.dimension-value-input {
  font: inherit;
  color: var(--fg);
  text-align: right;
  appearance: textfield;
}

.dimension-value-input::-webkit-outer-spin-button,
.dimension-value-input::-webkit-inner-spin-button {
  margin: 0;
  appearance: none;
}

input[type="range"] {
  width: 100%;
  margin: 0;
  appearance: none;
  background: transparent;
  accent-color: var(--placement-glow, #77c8ff);
}

input[type="range"]:focus-visible {
  outline: none;
}

input[type="range"]::-webkit-slider-runnable-track {
  height: 0.34rem;
  border-radius: 999px;
  border: 1px solid rgba(130, 160, 190, 0.16);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--placement-glow, #77c8ff) 44%, rgba(14, 22, 33, 0.96)),
    rgba(14, 22, 33, 0.96)
  );
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
}

input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 0.92rem;
  height: 0.92rem;
  margin-top: calc((0.34rem - 0.92rem) / 2);
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--placement-glow, #77c8ff) 72%, white);
  background: color-mix(in srgb, var(--placement-glow, #77c8ff) 32%, rgba(255, 255, 255, 0.96));
  box-shadow:
    0 0 0 4px color-mix(in srgb, var(--placement-glow, #77c8ff) 14%, transparent),
    0 6px 12px rgba(0, 0, 0, 0.32);
}

input[type="range"]::-moz-range-track {
  height: 0.34rem;
  border-radius: 999px;
  border: 1px solid rgba(130, 160, 190, 0.16);
  background: rgba(14, 22, 33, 0.96);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
}

input[type="range"]::-moz-range-progress {
  height: 0.34rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--placement-glow, #77c8ff) 44%, rgba(14, 22, 33, 0.96));
}

input[type="range"]::-moz-range-thumb {
  width: 0.92rem;
  height: 0.92rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--placement-glow, #77c8ff) 72%, white);
  background: color-mix(in srgb, var(--placement-glow, #77c8ff) 32%, rgba(255, 255, 255, 0.96));
  box-shadow:
    0 0 0 4px color-mix(in srgb, var(--placement-glow, #77c8ff) 14%, transparent),
    0 6px 12px rgba(0, 0, 0, 0.32);
}

input[type="range"]:focus-visible::-webkit-slider-thumb,
input[type="range"]:focus-visible::-moz-range-thumb {
  box-shadow:
    0 0 0 6px color-mix(in srgb, var(--placement-glow, #77c8ff) 20%, transparent),
    0 6px 12px rgba(0, 0, 0, 0.32);
}
</style>
