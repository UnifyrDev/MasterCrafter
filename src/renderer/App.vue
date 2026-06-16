<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { useMasterCrafter } from "@renderer/composables/useMasterCrafter";
import WorkspaceLauncherView from "@renderer/components/WorkspaceLauncherView.vue";
import CampaignShell from "@renderer/components/CampaignShell.vue";
import ConfirmationDialogModal from "@renderer/components/ConfirmationDialogModal.vue";
import NpcEditorModal from "@renderer/components/npc/NpcEditorModal.vue";
import HotkeySettingsModal from "@renderer/components/hotkeys/HotkeySettingsModal.vue";
import { hotkeyDispatcherService, hotkeySettingsService } from "@renderer/services/hotkeys";

const store = useMasterCrafter();
const state = store.state;
let unregisterHotkeySettingsListener: (() => void) | null = null;

onMounted(() => {
  hotkeyDispatcherService.start();
  if (window.masterCrafter?.hotkeys) {
    unregisterHotkeySettingsListener = window.masterCrafter.hotkeys.onToggleSettingsRequested(() => {
      hotkeySettingsService.open();
    });
  }

  void store.loadWorkspaces();
});

onBeforeUnmount(() => {
  unregisterHotkeySettingsListener?.();
  unregisterHotkeySettingsListener = null;
  hotkeyDispatcherService.stop();
});
</script>

<template>
  <div class="app-shell">
    <WorkspaceLauncherView v-if="!state.activeWorkspaceId" />
    <CampaignShell v-else />
    <ConfirmationDialogModal />
    <NpcEditorModal />
    <HotkeySettingsModal />
  </div>
</template>
