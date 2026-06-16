<script setup lang="ts">
import { computed, reactive } from "vue";
import { useMasterCrafter } from "@renderer/composables/useMasterCrafter";
import { confirmationDialogService } from "@renderer/services/ConfirmationDialogService";

const store = useMasterCrafter();
const state = store.state;

const form = reactive({
  name: "New Campaign",
  description: "A fresh campaign workspace for worldbuilding, prep, and encounter design.",
});

const sortedWorkspaces = computed(() =>
  [...store.workspaces.value].sort((left, right) => {
    const leftStamp = left.lastOpenedAt ?? left.updatedAt ?? left.createdAt;
    const rightStamp = right.lastOpenedAt ?? right.updatedAt ?? right.createdAt;

    if (leftStamp !== rightStamp) {
      return rightStamp.localeCompare(leftStamp);
    }

    return left.name.localeCompare(right.name);
  }),
);

async function createWorkspace(): Promise<void> {
  await store.createWorkspace({
    name: form.name.trim(),
    description: form.description.trim(),
  });
}

async function importBundle(): Promise<void> {
  const paths = await window.masterCrafter.dialog.openFile({
    title: "Import Campaign Bundle",
    filters: [{ name: "MasterCrafter Campaign Bundle", extensions: ["mcpack"] }],
    properties: ["openFile"],
  });

  if (!paths.length) {
    return;
  }

  await store.importBundle({ archiveFilePath: paths[0] });
}

async function deleteWorkspace(workspaceId: string, workspaceName: string): Promise<void> {
  const confirmed = await confirmationDialogService.requestConfirmation({
    title: `Delete ${workspaceName}?`,
    message: `This will permanently remove ${workspaceName} and all of its local files from this machine.`,
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    tone: "danger",
  });

  if (!confirmed) {
    return;
  }

  await window.masterCrafter.registry.deleteWorkspace(workspaceId);
  await store.loadWorkspaces();
}
</script>

<template>
  <section class="launcher">
    <div class="launcher-hero glass-panel">
      <div>
        <p class="section-title">MasterCrafter</p>
        <h1>Campaign workspaces built for map-first D&D prep.</h1>
        <p class="muted">
          Create a campaign workspace, import a bundle, or reopen an existing world with all of its maps, notes, questlines, and timeline state.
        </p>
      </div>

      <div class="hero-actions">
        <button type="button" @click="store.loadWorkspaces()">Refresh</button>
        <button type="button" @click="importBundle()">Import Bundle</button>
      </div>
    </div>

    <div class="launcher-grid">
      <section class="glass-panel launcher-card">
        <h2>New Campaign</h2>
        <label>
          <span class="field-label">Name</span>
          <input v-model="form.name" type="text" placeholder="The Iron Coast" />
        </label>
        <label>
          <span class="field-label">Description</span>
          <textarea v-model="form.description" placeholder="Describe the campaign premise, tone, or major arc."></textarea>
        </label>
        <button type="button" :disabled="!form.name.trim()" @click="createWorkspace()">Create Workspace</button>
      </section>

      <section class="glass-panel launcher-card">
        <h2>Campaigns</h2>
        <div class="workspace-list scroll-shell">
          <article v-for="workspace in sortedWorkspaces" :key="workspace.id" class="workspace-row">
            <button type="button" class="workspace-open" @click="store.openWorkspace(workspace.id)">
              <strong>{{ workspace.name }}</strong>
              <span>{{ workspace.description || "No description yet." }}</span>
              <small>Last opened: {{ workspace.lastOpenedAt ?? "Never" }}</small>
            </button>
            <button type="button" class="danger" @click="deleteWorkspace(workspace.id, workspace.name)">Delete</button>
          </article>
          <p v-if="!sortedWorkspaces.length" class="muted">No workspaces yet. Create one to begin.</p>
        </div>
      </section>
    </div>

    <p v-if="state.error" class="error-banner">{{ state.error }}</p>
  </section>
</template>

<style scoped>
.launcher {
  min-height: 100%;
  padding: 2rem;
  display: grid;
  gap: 1.25rem;
}

.launcher-hero {
  padding: 1.5rem 1.6rem;
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.launcher-hero h1 {
  margin: 0.2rem 0 0.55rem;
  font-size: clamp(2rem, 4vw, 3.5rem);
  line-height: 0.95;
  max-width: 15ch;
}

.launcher-grid {
  display: grid;
  grid-template-columns: minmax(320px, 420px) 1fr;
  gap: 1.25rem;
}

.launcher-card {
  padding: 1.25rem;
  display: grid;
  gap: 0.95rem;
}

.field-label {
  display: block;
  margin-bottom: 0.38rem;
  font-size: 0.82rem;
  color: var(--fg-muted);
}

.workspace-list {
  display: grid;
  gap: 0.85rem;
  max-height: 60vh;
  padding-right: 0.2rem;
}

.workspace-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.75rem;
}

.workspace-open {
  text-align: left;
  display: grid;
  gap: 0.25rem;
}

.workspace-open span,
.workspace-open small {
  color: var(--fg-muted);
}

.danger {
  background: rgba(255, 109, 122, 0.12);
}

.error-banner {
  color: #ffb1b8;
  background: rgba(255, 109, 122, 0.12);
  border: 1px solid rgba(255, 109, 122, 0.22);
  border-radius: 12px;
  padding: 0.9rem 1rem;
}

.hero-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

@media (max-width: 1100px) {
  .launcher-grid {
    grid-template-columns: 1fr;
  }

  .launcher-hero {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
