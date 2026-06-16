<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useMasterCrafter } from "@renderer/composables/useMasterCrafter";
import { renderMarkdown } from "@renderer/utils/markdown";
import { slugify } from "@shared/utils";
import { hotkeyDispatcherService } from "@renderer/services/hotkeys";

const store = useMasterCrafter();
const state = store.state;
const previewRef = ref<HTMLElement | null>(null);

const draft = reactive({
  title: "",
  body: "",
  tags: "",
  kind: "markdown" as const,
  linkedEntityIds: [] as string[],
});

const snapshot = computed(() => state.value.snapshot);
const selectedNote = computed(() => snapshot.value?.notes.find((note) => note.id === state.value.selectedNoteId) ?? null);
const entities = computed(() => snapshot.value?.entities ?? []);
const renderedHtml = computed(() => renderMarkdown(draft.body || ""));
let unregisterHotkeys: (() => void) | null = null;

watch(
  selectedNote,
  (note) => {
    if (!note) {
      draft.title = "";
      draft.body = "";
      draft.tags = "";
      draft.linkedEntityIds = [];
      return;
    }

    draft.title = note.title;
    draft.body = note.body;
    draft.tags = note.tags.join(", ");
    draft.linkedEntityIds = [...note.linkedEntityIds];
  },
  { immediate: true },
);

async function saveNote(): Promise<void> {
  const workspace = state.value.snapshot?.workspace;
  if (!workspace) {
    return;
  }

  const note = selectedNote.value;
  await store.saveNote({
    workspaceId: workspace.id,
    id: note?.id,
    title: draft.title.trim() || "Untitled Note",
    kind: draft.kind,
    body: draft.body,
    tags: draft.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    linkedEntityIds: draft.linkedEntityIds,
  });
}

async function createNote(): Promise<void> {
  const workspace = state.value.snapshot?.workspace;
  if (!workspace) {
    return;
  }

  const created = await store.saveNote({
    workspaceId: workspace.id,
    title: "Untitled Note",
    kind: "markdown",
    body: "",
    tags: [],
    linkedEntityIds: [],
  });

  store.selectNote(created.id);
}

function toggleEntityLink(entityId: string): void {
  if (draft.linkedEntityIds.includes(entityId)) {
    draft.linkedEntityIds = draft.linkedEntityIds.filter((existing) => existing !== entityId);
    return;
  }

  draft.linkedEntityIds = [...draft.linkedEntityIds, entityId];
}

function openWikiLink(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  const anchor = target?.closest("a[href^='app://wiki/']") as HTMLAnchorElement | null;
  if (!anchor) {
    return;
  }

  event.preventDefault();
  const encoded = anchor.getAttribute("href")?.replace("app://wiki/", "") ?? "";
  const key = decodeURIComponent(encoded);
  const currentSnapshot = snapshot.value;
  if (!currentSnapshot) {
    return;
  }

  const note = currentSnapshot.notes.find((entry) => entry.slug === slugify(key));
  if (note) {
    store.selectNote(note.id);
    return;
  }

  const entity = currentSnapshot.entities.find((entry) => entry.slug === slugify(key));
  if (entity) {
    store.selectEntity(entity.id);
  }
}

function registerHotkeys(): void {
  unregisterHotkeys?.();
  unregisterHotkeys = hotkeyDispatcherService.registerScope({
    scopeId: "markdown-editor",
    scopeType: "view",
    contextId: "notes",
    handlers: {
      "notes.createNote": () => void createNote(),
      "notes.saveNote": () => void saveNote(),
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
  <section class="notes-layout">
    <div class="notes-list glass-panel scroll-shell">
      <p class="section-title">Notes</p>
      <button type="button" class="create-note" @click="createNote()">New Note</button>
      <div class="list-stack">
        <button
          v-for="note in snapshot?.notes ?? []"
          :key="note.id"
          type="button"
          class="list-row"
          :class="{ active: note.id === state.selectedNoteId }"
          @click="store.selectNote(note.id)"
        >
          <strong>{{ note.title }}</strong>
          <span>{{ note.tags.join(", ") || note.kind }}</span>
        </button>
      </div>
    </div>

    <div class="note-editor glass-panel scroll-shell">
      <div class="editor-header">
        <div>
          <p class="section-title">Markdown</p>
          <h2>{{ selectedNote?.title || "Untitled Note" }}</h2>
        </div>
        <button type="button" :disabled="!snapshot" @click="saveNote()">Save</button>
      </div>

      <label>
        <span class="field-label">Title</span>
        <input v-model="draft.title" type="text" />
      </label>

      <label>
        <span class="field-label">Tags</span>
        <input v-model="draft.tags" type="text" placeholder="lore, npc, clue" />
      </label>

      <label>
        <span class="field-label">Body</span>
        <textarea v-model="draft.body" class="markdown-input"></textarea>
      </label>

      <div class="linked-entities">
        <p class="section-title">Linked Entities</p>
        <div class="entity-chip-list">
          <button
            v-for="entity in entities"
            :key="entity.id"
            type="button"
            class="entity-chip"
            :class="{ active: draft.linkedEntityIds.includes(entity.id) }"
            @click="toggleEntityLink(entity.id)"
          >
            {{ entity.title }}
          </button>
        </div>
      </div>
    </div>

    <div class="preview-panel glass-panel scroll-shell">
      <p class="section-title">Preview</p>
      <article ref="previewRef" class="markdown-preview" v-html="renderedHtml" @click="openWikiLink"></article>
    </div>
  </section>
</template>

<style scoped>
.notes-layout {
  height: 100%;
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr) 280px;
  gap: 1rem;
}

.notes-list,
.note-editor,
.preview-panel {
  padding: 1rem;
  min-width: 0;
}

.list-stack,
.entity-chip-list {
  display: grid;
  gap: 0.5rem;
}

.list-row {
  text-align: left;
  display: grid;
  gap: 0.2rem;
}

.list-row span {
  color: var(--fg-muted);
}

.list-row.active,
.entity-chip.active {
  background: rgba(111, 244, 201, 0.16);
}

.create-note {
  margin-bottom: 0.75rem;
}

.note-editor {
  display: grid;
  gap: 0.85rem;
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

.field-label {
  display: block;
  margin-bottom: 0.35rem;
  color: var(--fg-muted);
  font-size: 0.82rem;
}

.markdown-input {
  min-height: 42vh;
  font-family: var(--font-mono);
}

.markdown-preview {
  min-height: 70vh;
  line-height: 1.55;
}

.markdown-preview :deep(h1),
.markdown-preview :deep(h2),
.markdown-preview :deep(h3) {
  margin-top: 1.5rem;
}

.markdown-preview :deep(a) {
  color: var(--accent);
}

@media (max-width: 1300px) {
  .notes-layout {
    grid-template-columns: 1fr;
  }
}
</style>
