<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { confirmationDialogService } from "@renderer/services/ConfirmationDialogService";
import { hotkeyDispatcherService } from "@renderer/services/hotkeys";

const dialogState = confirmationDialogService.dialogState;
const confirmButtonRef = ref<HTMLButtonElement | null>(null);
const cancelButtonRef = ref<HTMLButtonElement | null>(null);
const titleId = "confirmation-dialog-title";
const messageId = "confirmation-dialog-message";
const keydownListenerOptions: AddEventListenerOptions = { capture: true };
let previouslyFocusedElement: HTMLElement | null = null;
let unregisterModalScope: (() => void) | null = null;

const toneClass = computed(() => (dialogState.tone === "danger" ? "tone-danger" : "tone-neutral"));

function focusPrimaryAction(): void {
  confirmButtonRef.value?.focus();
}

function restorePreviousFocus(): void {
  if (!previouslyFocusedElement) {
    return;
  }

  const element = previouslyFocusedElement;
  previouslyFocusedElement = null;

  if (document.contains(element)) {
    element.focus();
  }
}

function handleConfirm(): void {
  confirmationDialogService.confirm();
}

function handleCancel(): void {
  confirmationDialogService.cancel();
}

function handleKeyDown(event: KeyboardEvent): void {
  if (!dialogState.open) {
    return;
  }

  event.stopImmediatePropagation();
  event.preventDefault();

  if (event.key === "Escape") {
    handleCancel();
    return;
  }

  if (event.key !== "Tab") {
    return;
  }

  const focusables = [cancelButtonRef.value, confirmButtonRef.value].filter((element): element is HTMLButtonElement => Boolean(element));
  if (!focusables.length) {
    return;
  }

  const currentIndex = focusables.findIndex((element) => element === document.activeElement);
  if (event.shiftKey) {
    const previousIndex = currentIndex <= 0 ? focusables.length - 1 : currentIndex - 1;
    focusables[previousIndex]?.focus();
    return;
  }

  const nextIndex = currentIndex >= focusables.length - 1 ? 0 : currentIndex + 1;
  focusables[nextIndex]?.focus();
}

function registerModalScope(): void {
  unregisterModalScope?.();
  unregisterModalScope = hotkeyDispatcherService.registerScope({
    scopeId: "confirmation-dialog",
    scopeType: "modal",
    contextId: "global",
    handlers: {},
  });
}

function unregisterModalScopeHandler(): void {
  unregisterModalScope?.();
  unregisterModalScope = null;
}

watch(
  () => dialogState.open,
  async (open) => {
    if (open) {
      previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      registerModalScope();
      await nextTick();
      focusPrimaryAction();
      return;
    }

    unregisterModalScopeHandler();
    restorePreviousFocus();
  },
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
    <Transition name="confirmation-dialog">
      <div v-if="dialogState.open" class="confirmation-backdrop" @click.self="handleCancel">
        <section
          class="confirmation-modal glass-panel"
          :class="toneClass"
          role="alertdialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :aria-describedby="messageId"
        >
          <div class="confirmation-hero">
            <div class="confirmation-badge" aria-hidden="true">
              <span>!</span>
            </div>

            <div class="confirmation-copy">
              <p class="section-title">{{ dialogState.tone === "danger" ? "Delete confirmation" : "Confirm action" }}</p>
              <h2 :id="titleId">{{ dialogState.title }}</h2>
              <p :id="messageId" class="muted confirmation-message">{{ dialogState.message }}</p>
            </div>
          </div>

          <p class="confirmation-note">This action cannot be undone.</p>

          <div class="confirmation-actions">
            <button ref="cancelButtonRef" type="button" class="secondary-action" @click="handleCancel()">{{ dialogState.cancelLabel }}</button>
            <button ref="confirmButtonRef" type="button" class="danger-action" @click="handleConfirm()">{{ dialogState.confirmLabel }}</button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirmation-backdrop {
  position: fixed;
  inset: 0;
  z-index: 260;
  display: grid;
  place-items: center;
  padding: 1rem;
  background:
    radial-gradient(circle at 50% 0%, rgba(255, 109, 122, 0.12), transparent 30%),
    rgba(4, 8, 13, 0.76);
  backdrop-filter: blur(14px);
}

.confirmation-modal {
  width: min(32rem, calc(100vw - 2rem));
  padding: 1.15rem;
  display: grid;
  gap: 0.85rem;
  overflow: hidden;
  position: relative;
}

.confirmation-modal::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.06), transparent 38%);
}

.confirmation-modal.tone-danger {
  border-color: rgba(255, 109, 122, 0.24);
  box-shadow:
    0 24px 70px rgba(0, 0, 0, 0.46),
    0 0 0 1px rgba(255, 109, 122, 0.08),
    0 0 52px rgba(255, 109, 122, 0.08);
  background:
    radial-gradient(circle at 100% 0%, rgba(255, 109, 122, 0.14), transparent 30%),
    radial-gradient(circle at 0% 0%, rgba(119, 200, 255, 0.12), transparent 36%),
    linear-gradient(180deg, rgba(20, 28, 40, 0.98), rgba(10, 16, 24, 0.98));
}

.confirmation-modal.tone-neutral {
  border-color: rgba(119, 200, 255, 0.22);
  box-shadow:
    0 24px 70px rgba(0, 0, 0, 0.46),
    0 0 0 1px rgba(119, 200, 255, 0.08),
    0 0 52px rgba(119, 200, 255, 0.08);
}

.confirmation-hero {
  display: flex;
  align-items: flex-start;
  gap: 0.9rem;
}

.confirmation-badge {
  width: 2.5rem;
  height: 2.5rem;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 999px;
  border: 1px solid rgba(255, 109, 122, 0.28);
  background: radial-gradient(circle at 50% 30%, rgba(255, 109, 122, 0.34), rgba(255, 109, 122, 0.08));
  color: #ffd4d8;
  font-weight: 700;
  font-size: 1.2rem;
  box-shadow: inset 0 0 18px rgba(255, 109, 122, 0.2);
}

.tone-neutral .confirmation-badge {
  border-color: rgba(119, 200, 255, 0.24);
  background: radial-gradient(circle at 50% 30%, rgba(119, 200, 255, 0.28), rgba(119, 200, 255, 0.08));
  color: #e5f4ff;
}

.confirmation-copy {
  min-width: 0;
}

.confirmation-copy h2 {
  margin: 0.1rem 0 0.35rem;
}

.confirmation-message {
  margin: 0;
  white-space: pre-line;
}

.confirmation-note {
  margin: 0;
  color: var(--warning);
  font-size: 0.82rem;
}

.confirmation-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.secondary-action {
  background: rgba(119, 200, 255, 0.1);
}

.danger-action {
  background: rgba(255, 109, 122, 0.18);
  border: 1px solid rgba(255, 109, 122, 0.24);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02);
}

.danger-action:hover {
  background: rgba(255, 109, 122, 0.28);
}

.tone-neutral .danger-action {
  background: rgba(119, 200, 255, 0.18);
  border-color: rgba(119, 200, 255, 0.24);
}

.tone-neutral .danger-action:hover {
  background: rgba(119, 200, 255, 0.28);
}

.confirmation-dialog-enter-active,
.confirmation-dialog-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.confirmation-dialog-enter-from,
.confirmation-dialog-leave-to {
  opacity: 0;
}

.confirmation-dialog-enter-from .confirmation-modal,
.confirmation-dialog-leave-to .confirmation-modal {
  transform: translateY(8px) scale(0.98);
}

@media (max-width: 700px) {
  .confirmation-backdrop {
    padding: 0.75rem;
  }

  .confirmation-modal {
    width: calc(100vw - 1.5rem);
    padding: 1rem;
  }

  .confirmation-actions {
    justify-content: stretch;
  }

  .confirmation-actions button {
    width: 100%;
  }
}
</style>
