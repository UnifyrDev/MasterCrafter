<script setup lang="ts">
import { computed } from "vue";

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
</script>

<template>
  <div class="placement-text-dimensions">
    <label class="dimension-field">
      <span class="dimension-heading">
        <span class="field-label">Text Width</span>
        <span class="dimension-value">{{ widthValue }}pt</span>
      </span>
      <input v-model.number="width" type="range" :min="props.min" :max="props.max" :step="props.step" />
    </label>

    <label class="dimension-field">
      <span class="dimension-heading">
        <span class="field-label">Text Height</span>
        <span class="dimension-value">{{ heightValue }}pt</span>
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
  padding: 0.08rem 0.34rem;
  border-radius: 999px;
  border: 1px solid rgba(130, 160, 190, 0.18);
  background: rgba(14, 22, 33, 0.82);
  color: var(--fg);
  font-size: 0.64rem;
  line-height: 1.2;
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
