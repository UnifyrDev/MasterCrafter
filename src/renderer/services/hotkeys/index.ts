export {
  hotkeyDefinitionCatalogService,
  HotkeyDefinitionCatalogService,
  type HotkeyDefinition,
  type HotkeyGroupDefinition,
  type HotkeySectionDefinition,
  type HotkeyScopeType,
} from "@renderer/services/hotkeys/HotkeyCatalogService";
export {
  hotkeyDispatcherService,
  HotkeyDispatcherService,
  type HotkeyHandler,
  type HotkeyScopeRegistration,
} from "@renderer/services/hotkeys/HotkeyDispatcherService";
export { hotkeyNormalizationService, HotkeyNormalizationService, type HotkeyCombination } from "@renderer/services/hotkeys/HotkeyNormalizationService";
export {
  hotkeyProfileService,
  HotkeyProfileService,
  type HotkeyConflictEntry,
  type HotkeyProfileState,
} from "@renderer/services/hotkeys/HotkeyProfileService";
export { hotkeySettingsService, HotkeySettingsService, type HotkeySettingsState } from "@renderer/services/hotkeys/HotkeySettingsService";
