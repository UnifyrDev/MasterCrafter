<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useMasterCrafter } from "@renderer/composables/useMasterCrafter";
import WorkspaceLauncherView from "@renderer/components/WorkspaceLauncherView.vue";
import CampaignShell from "@renderer/components/CampaignShell.vue";
import ConfirmationDialogModal from "@renderer/components/ConfirmationDialogModal.vue";
import NpcEditorModal from "@renderer/components/npc/NpcEditorModal.vue";
import HotkeySettingsModal from "@renderer/components/hotkeys/HotkeySettingsModal.vue";
import { hotkeyDispatcherService, hotkeySettingsService } from "@renderer/services/hotkeys";
import type { AppInfoDto } from "@shared/contracts";

const store = useMasterCrafter();
const state = store.state;
const appInfo = ref<AppInfoDto | null>(null);
let unregisterHotkeySettingsListener: (() => void) | null = null;

async function loadAppInfo(): Promise<void> {
  try {
    appInfo.value = await window.masterCrafter.app.getInfo();
  } catch {
    appInfo.value = null;
  }
}

onMounted(() => {
  void loadAppInfo();

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
    <WorkspaceLauncherView v-if="!state.activeWorkspaceId" :app-version="appInfo?.displayVersion ?? null" />
    <CampaignShell v-else :app-version="appInfo?.displayVersion ?? null" />
    <ConfirmationDialogModal />
    <NpcEditorModal />
    <HotkeySettingsModal />
  </div>
</template>
