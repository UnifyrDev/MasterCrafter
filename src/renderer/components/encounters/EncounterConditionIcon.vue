<script setup lang="ts">
import { computed } from "vue";
import { encounterConditionIconDefinitions, type EncounterConditionIconDefinition } from "./encounterConditionIcons";

const props = withDefaults(
  defineProps<{
    conditionKey: string;
    size?: number;
  }>(),
  {
    size: 18,
  },
);

const icon = computed<EncounterConditionIconDefinition>(() => {
  const key = props.conditionKey.trim().toLowerCase();
  return encounterConditionIconDefinitions[key] ?? encounterConditionIconDefinitions.default;
});
</script>

<template>
  <svg
    class="condition-icon"
    :viewBox="icon.viewBox"
    :width="size"
    :height="size"
    aria-hidden="true"
    focusable="false"
    xmlns="http://www.w3.org/2000/svg"
  >
    <template v-for="(shape, index) in icon.shapes" :key="index">
      <path
        v-if="shape.kind === 'path'"
        v-bind="shape.attrs"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.8"
      />
      <circle
        v-else-if="shape.kind === 'circle'"
        v-bind="shape.attrs"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.8"
      />
      <ellipse
        v-else-if="shape.kind === 'ellipse'"
        v-bind="shape.attrs"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.8"
      />
      <line
        v-else-if="shape.kind === 'line'"
        v-bind="shape.attrs"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.8"
      />
      <rect
        v-else-if="shape.kind === 'rect'"
        v-bind="shape.attrs"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.8"
      />
      <polygon
        v-else-if="shape.kind === 'polygon'"
        v-bind="shape.attrs"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.8"
      />
      <polyline
        v-else-if="shape.kind === 'polyline'"
        v-bind="shape.attrs"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.8"
      />
    </template>
  </svg>
</template>

<style scoped>
.condition-icon {
  display: block;
  flex: 0 0 auto;
}
</style>
