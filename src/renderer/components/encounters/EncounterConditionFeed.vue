<script setup lang="ts">
import { Teleport, TransitionGroup } from "vue";
import type { EncounterConditionToastDto } from "@renderer/services/EncounterConditionService";

defineProps<{
  items: EncounterConditionToastDto[];
}>();
</script>

<template>
  <Teleport to="body">
    <div class="condition-toast-feed" aria-live="polite" aria-atomic="true">
      <TransitionGroup name="condition-toast" tag="div" class="condition-toast-stack">
        <article v-for="toast in items" :key="toast.id" class="condition-toast" :class="toast.tone">
          <div class="condition-toast-accent"></div>
          <div class="condition-toast-copy">
            <strong>{{ toast.title }}</strong>
            <span>{{ toast.message }}</span>
          </div>
        </article>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.condition-toast-feed {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 5000;
  width: min(24rem, calc(100vw - 2rem));
  pointer-events: none;
}

.condition-toast-stack {
  display: grid;
  gap: 0.45rem;
  justify-items: end;
}

.condition-toast {
  position: relative;
  display: grid;
  grid-template-columns: 0.26rem minmax(0, 1fr);
  gap: 0.35rem;
  align-items: start;
  width: 100%;
  padding: 0.7rem 0.8rem;
  border-radius: 0.9rem;
  border: 1px solid rgba(94, 138, 186, 0.28);
  background: linear-gradient(180deg, rgba(13, 20, 30, 0.96), rgba(8, 13, 20, 0.96));
  box-shadow:
    0 18px 42px rgba(0, 0, 0, 0.36),
    inset 0 1px 0 rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(16px);
  pointer-events: auto;
}

.condition-toast.warning {
  border-color: rgba(255, 191, 93, 0.28);
}

.condition-toast.success {
  border-color: rgba(111, 244, 201, 0.28);
}

.condition-toast.info {
  border-color: rgba(111, 183, 244, 0.28);
}

.condition-toast-accent {
  width: 0.26rem;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(111, 183, 244, 0.92), rgba(111, 244, 201, 0.82));
  min-height: 100%;
}

.condition-toast.warning .condition-toast-accent {
  background: linear-gradient(180deg, rgba(255, 193, 92, 0.96), rgba(255, 109, 122, 0.78));
}

.condition-toast.success .condition-toast-accent {
  background: linear-gradient(180deg, rgba(111, 244, 201, 0.96), rgba(64, 177, 255, 0.72));
}

.condition-toast-copy {
  display: grid;
  gap: 0.12rem;
}

.condition-toast-copy strong {
  font-size: 0.95rem;
  letter-spacing: 0.01em;
}

.condition-toast-copy span {
  color: var(--fg-muted);
  font-size: 0.8rem;
  line-height: 1.35;
}

.condition-toast-enter-active,
.condition-toast-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.condition-toast-enter-from,
.condition-toast-leave-to {
  opacity: 0;
  transform: translateY(0.35rem) scale(0.98);
}
</style>
