<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { hotkeyDefinitionCatalogService } from "@renderer/services/hotkeys/HotkeyCatalogService";
import { hotkeyDispatcherService } from "@renderer/services/hotkeys/HotkeyDispatcherService";
import { hotkeyNormalizationService } from "@renderer/services/hotkeys/HotkeyNormalizationService";
import { hotkeyProfileService } from "@renderer/services/hotkeys/HotkeyProfileService";
import { hotkeySettingsService } from "@renderer/services/hotkeys/HotkeySettingsService";

const settingsState = hotkeySettingsService.settingsState;
const searchTerm = ref("");
const captureActionId = ref<string | null>(null);
const captureMessage = ref<string | null>(null);
const modalRef = ref<HTMLElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);
const previouslyFocusedElement = ref<HTMLElement | null>(null);
const keydownListenerOptions: AddEventListenerOptions = { capture: true };

let unregisterModalScope: (() => void) | null = null;

const sections = hotkeyDefinitionCatalogService.getSections();

const visibleSections = computed(() => {
  const term = searchTerm.value.trim().toLowerCase();
  if (!term) {
    return sections;
  }

  return sections
    .map((section) => {
      const groups = section.groups
        .map((group) => {
          const actions = group.actions.filter((action) => {
            const currentBinding = hotkeyProfileService.getBinding(action.id);
            const defaultBinding = action.defaultBinding;
            const text = [
              section.label,
              section.description,
              group.label,
              action.label,
              action.description,
              currentBinding ? hotkeyProfileService.formatBinding(currentBinding) : "",
              defaultBinding ? hotkeyProfileService.formatBinding(defaultBinding) : "",
            ]
              .join(" ")
              .toLowerCase();

            return text.includes(term);
          });

          return {
            ...group,
            actions,
          };
        })
        .filter((group) => group.actions.length > 0);

      return {
        ...section,
        groups,
      };
    })
    .filter((section) => section.groups.length > 0);
});

function registerModalScope(): void {
  unregisterModalScope?.();
  unregisterModalScope = hotkeyDispatcherService.registerScope({
    scopeId: "hotkey-settings-modal",
    scopeType: "modal",
    contextId: "global",
    handlers: {},
  });
}

function unregisterModalScopeHandler(): void {
  unregisterModalScope?.();
  unregisterModalScope = null;
}

function closeModal(): void {
  hotkeySettingsService.close();
}

function restoreFocus(): void {
  const element = previouslyFocusedElement.value;
  previouslyFocusedElement.value = null;

  if (element && document.contains(element)) {
    element.focus();
  }
}

function beginCapture(actionId: string): void {
  if (!hotkeyProfileService.canEdit(actionId)) {
    return;
  }

  captureActionId.value = actionId;
  captureMessage.value = null;
}

function cancelCapture(): void {
  captureActionId.value = null;
  captureMessage.value = null;
}

function clearBinding(actionId: string): void {
  if (!hotkeyProfileService.canEdit(actionId)) {
    return;
  }

  hotkeyProfileService.setBinding(actionId, null);
  cancelCapture();
}

function resetSection(sectionId: string): void {
  hotkeyProfileService.resetSection(sectionId);
}

function resetAll(): void {
  hotkeyProfileService.resetAll();
}

function describeConflicts(actionId: string): string {
  const conflicts = hotkeyProfileService.getConflicts(actionId);
  if (!conflicts.length) {
    return "";
  }

  const labels = conflicts.slice(0, 2).map((conflict) => conflict.label);
  const suffix = conflicts.length > 2 ? ` +${conflicts.length - 2} more` : "";
  return `Conflicts with ${labels.join(", ")}${suffix}`;
}

function handleCaptureKeyDown(event: KeyboardEvent): void {
  if (!captureActionId.value) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();

  if (event.repeat) {
    return;
  }

  if (event.key === "Escape") {
    cancelCapture();
    return;
  }

  if (event.key === "Backspace" || event.key === "Delete") {
    clearBinding(captureActionId.value);
    return;
  }

  const binding = hotkeyNormalizationService.normalizeEvent(event);
  if (!binding) {
    return;
  }

  if (hotkeyNormalizationService.isFixedOpenerBinding(binding)) {
    captureMessage.value = "Ctrl + Alt + H is reserved for hotkey settings.";
    return;
  }

  const actionId = captureActionId.value;
  const accepted = hotkeyProfileService.setBinding(actionId, binding);
  if (!accepted) {
    captureMessage.value = "That shortcut is reserved or locked.";
    return;
  }

  captureActionId.value = null;
  captureMessage.value = null;
}

function handleWindowKeyDown(event: KeyboardEvent): void {
  if (!settingsState.open) {
    return;
  }

  if (captureActionId.value) {
    handleCaptureKeyDown(event);
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeModal();
    return;
  }

  if (event.key !== "Tab" || !modalRef.value) {
    return;
  }

  const focusables = Array.from(
    modalRef.value.querySelectorAll<HTMLElement>(
      "button, input, select, textarea, [href], [tabindex]:not([tabindex='-1'])",
    ),
  ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");

  if (!focusables.length) {
    return;
  }

  event.preventDefault();
  const currentIndex = focusables.findIndex((element) => element === document.activeElement);
  const nextIndex = event.shiftKey
    ? currentIndex <= 0
      ? focusables.length - 1
      : currentIndex - 1
    : currentIndex >= focusables.length - 1
      ? 0
      : currentIndex + 1;

  focusables[nextIndex]?.focus();
}

watch(
  () => settingsState.open,
  async (open) => {
    if (open) {
      previouslyFocusedElement.value = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      registerModalScope();
      window.addEventListener("keydown", handleWindowKeyDown, keydownListenerOptions);
      await nextTick();
      searchInputRef.value?.focus();
      return;
    }

    window.removeEventListener("keydown", handleWindowKeyDown, keydownListenerOptions);
    unregisterModalScopeHandler();
    cancelCapture();
    restoreFocus();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleWindowKeyDown, keydownListenerOptions);
  unregisterModalScopeHandler();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="hotkey-settings">
      <div v-if="settingsState.open" class="hotkey-settings-backdrop" @click.self="closeModal()">
        <section ref="modalRef" class="hotkey-settings-modal glass-panel" role="dialog" aria-modal="true" aria-label="Hotkey settings">
          <header class="hotkey-settings-header">
            <div class="hotkey-settings-title">
              <p class="section-title">Hotkeys</p>
              <h2>Scoped shortcuts</h2>
              <p class="muted">Ctrl + Alt + H opens this panel. Rebinding is scope-aware, so the same shortcut can exist in different contexts.</p>
            </div>

            <div class="hotkey-settings-actions">
              <button type="button" class="secondary" @click="resetAll()">Reset all</button>
              <button type="button" class="secondary" @click="closeModal()">Close</button>
            </div>
          </header>

          <div class="hotkey-settings-toolbar">
            <label class="search-box hotkey-search">
              <span class="section-title">Search</span>
              <input ref="searchInputRef" v-model="searchTerm" type="search" placeholder="Search hotkeys, bindings, sections..." />
            </label>

            <div class="hotkey-settings-status">
              <span v-if="captureActionId" class="chip capture-chip">Press a combo. Backspace clears, Esc cancels.</span>
              <span v-else class="chip">Scope conflicts only appear inside the same context.</span>
            </div>
          </div>

          <div class="hotkey-section-list scroll-shell">
            <section v-for="section in visibleSections" :key="section.id" class="hotkey-section-card">
              <header class="hotkey-section-header">
                <div>
                  <p class="section-title">{{ section.label }}</p>
                  <p class="muted">{{ section.description }}</p>
                </div>
                <button type="button" class="secondary" @click="resetSection(section.id)">Reset section</button>
              </header>

              <div class="hotkey-group-list">
                <div v-for="group in section.groups" :key="`${section.id}-${group.id}`" class="hotkey-group-card">
                  <header class="hotkey-group-header">
                    <div>
                      <strong>{{ group.label }}</strong>
                      <span class="muted">Context: {{ group.contextId }}</span>
                    </div>
                  </header>

                  <div class="hotkey-row-list">
                    <article
                      v-for="action in group.actions"
                      :key="action.id"
                      class="hotkey-row"
                      :class="{
                        locked: !hotkeyProfileService.canEdit(action.id),
                        capturing: captureActionId === action.id,
                        conflict: hotkeyProfileService.getConflicts(action.id).length > 0,
                      }"
                    >
                      <div class="hotkey-row-main">
                        <div class="hotkey-row-title">
                          <strong>{{ action.label }}</strong>
                          <span>{{ action.description }}</span>
                        </div>

                        <div class="hotkey-row-meta">
                          <span class="chip">{{ hotkeyProfileService.formatBinding(hotkeyProfileService.getBinding(action.id)) }}</span>
                          <span class="chip subtle">Default: {{ hotkeyProfileService.formatBinding(action.defaultBinding) }}</span>
                          <span v-if="!hotkeyProfileService.canEdit(action.id)" class="chip fixed-chip">Fixed</span>
                        </div>
                      </div>

                      <div v-if="captureActionId === action.id" class="hotkey-row-capture">
                        <p class="muted">{{ captureMessage || "Listening for the next combo." }}</p>
                        <button type="button" class="secondary" @click="cancelCapture()">Cancel</button>
                      </div>

                      <div v-else class="hotkey-row-actions">
                        <button v-if="hotkeyProfileService.canEdit(action.id)" type="button" @click="beginCapture(action.id)">Rebind</button>
                        <button v-if="hotkeyProfileService.canEdit(action.id)" type="button" class="secondary" @click="clearBinding(action.id)" :disabled="hotkeyProfileService.getBinding(action.id) === null">Clear</button>
                      </div>

                      <p v-if="describeConflicts(action.id)" class="hotkey-conflict">{{ describeConflicts(action.id) }}</p>
                    </article>
                  </div>
                </div>
              </div>
            </section>

            <p v-if="!visibleSections.length" class="muted hotkey-empty-state">
              No hotkeys match the current search.
            </p>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.hotkey-settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: radial-gradient(circle at top, rgba(15, 25, 36, 0.5), rgba(8, 12, 18, 0.86));
  backdrop-filter: blur(14px);
}

.hotkey-settings-modal {
  width: min(1220px, 100%);
  max-height: min(92vh, 1040px);
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 1rem;
  overflow: hidden;
  border: 1px solid rgba(113, 136, 166, 0.28);
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.5);
}

.hotkey-settings-header,
.hotkey-settings-toolbar,
.hotkey-section-header,
.hotkey-group-header,
.hotkey-row,
.hotkey-row-main,
.hotkey-row-meta,
.hotkey-row-actions {
  display: flex;
  align-items: center;
}

.hotkey-settings-header {
  justify-content: space-between;
  gap: 1rem;
}

.hotkey-settings-title h2 {
  margin: 0.12rem 0 0;
  font-size: 1.45rem;
}

.hotkey-settings-title .muted {
  max-width: 68ch;
}

.hotkey-settings-actions,
.hotkey-row-actions {
  gap: 0.5rem;
}

.hotkey-settings-toolbar {
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.hotkey-search {
  flex: 1 1 360px;
  max-width: 560px;
}

.hotkey-settings-status {
  display: flex;
  justify-content: flex-end;
}

.hotkey-settings-status .chip {
  max-width: 100%;
}

.hotkey-section-list {
  display: grid;
  gap: 0.9rem;
  overflow: auto;
  padding-right: 0.2rem;
}

.hotkey-section-card,
.hotkey-group-card,
.hotkey-row {
  border: 1px solid rgba(113, 136, 166, 0.18);
  border-radius: 16px;
  background: rgba(6, 12, 18, 0.56);
}

.hotkey-section-card {
  display: grid;
  gap: 0.8rem;
  padding: 0.85rem;
}

.hotkey-section-header {
  justify-content: space-between;
  gap: 1rem;
}

.hotkey-section-header .muted {
  margin-top: 0.12rem;
}

.hotkey-group-list {
  display: grid;
  gap: 0.7rem;
}

.hotkey-group-card {
  display: grid;
  gap: 0.6rem;
  padding: 0.72rem;
}

.hotkey-group-header {
  justify-content: space-between;
}

.hotkey-group-header strong {
  display: block;
}

.hotkey-row-list {
  display: grid;
  gap: 0.55rem;
}

.hotkey-row {
  flex-direction: column;
  align-items: stretch;
  gap: 0.55rem;
  padding: 0.7rem 0.78rem;
}

.hotkey-row.locked {
  border-color: rgba(120, 197, 255, 0.22);
}

.hotkey-row.capturing {
  border-color: rgba(111, 244, 201, 0.34);
  box-shadow: inset 0 0 0 1px rgba(111, 244, 201, 0.08);
}

.hotkey-row.conflict {
  border-color: rgba(255, 122, 122, 0.3);
}

.hotkey-row-main {
  justify-content: space-between;
  gap: 0.8rem;
  flex-wrap: wrap;
}

.hotkey-row-title {
  display: grid;
  gap: 0.18rem;
  min-width: 0;
}

.hotkey-row-title span,
.hotkey-row-meta,
.hotkey-row-capture,
.hotkey-conflict {
  color: var(--fg-muted);
}

.hotkey-row-meta {
  gap: 0.4rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.hotkey-row-actions {
  flex-wrap: wrap;
}

.hotkey-row-capture {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.hotkey-conflict {
  margin: 0;
  font-size: 0.82rem;
  color: #ffb2b2;
}

.fixed-chip {
  border-color: rgba(120, 197, 255, 0.22);
  color: #cdeaff;
}

.subtle {
  opacity: 0.85;
}

.capture-chip {
  border-color: rgba(111, 244, 201, 0.25);
  color: #c2fff2;
}

.hotkey-empty-state {
  padding: 0.5rem 0.2rem 0.9rem;
}

.secondary {
  opacity: 0.9;
}

@media (max-width: 900px) {
  .hotkey-settings-modal {
    padding: 0.78rem;
  }

  .hotkey-settings-header,
  .hotkey-settings-toolbar,
  .hotkey-section-header,
  .hotkey-row-main,
  .hotkey-row-capture {
    align-items: flex-start;
    flex-direction: column;
  }

  .hotkey-settings-actions,
  .hotkey-row-actions {
    width: 100%;
  }

  .hotkey-search {
    max-width: none;
  }
}
</style>
