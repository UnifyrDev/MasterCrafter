import { hotkeyDefinitionCatalogService, type HotkeyScopeType } from "@renderer/services/hotkeys/HotkeyCatalogService";
import { hotkeyNormalizationService } from "@renderer/services/hotkeys/HotkeyNormalizationService";
import { hotkeyProfileService } from "@renderer/services/hotkeys/HotkeyProfileService";
import { hotkeySettingsService } from "@renderer/services/hotkeys/HotkeySettingsService";

export type HotkeyHandler = () => void | Promise<void>;

export interface HotkeyScopeRegistration {
  scopeId: string;
  scopeType: HotkeyScopeType;
  contextId: string;
  handlers: Record<string, HotkeyHandler | undefined>;
}

interface HotkeyScopeRegistrationRecord extends HotkeyScopeRegistration {
  order: number;
}

const FIXED_OPENER_BINDING = hotkeyNormalizationService.getFixedOpenerBinding();

export class HotkeyDispatcherService {
  private static instance: HotkeyDispatcherService | null = null;
  private readonly registrations = new Map<string, HotkeyScopeRegistrationRecord>();
  private started = false;
  private sequence = 0;
  private readonly keydownListenerOptions = true;

  private constructor() {}

  static getInstance(): HotkeyDispatcherService {
    if (!HotkeyDispatcherService.instance) {
      HotkeyDispatcherService.instance = new HotkeyDispatcherService();
    }

    return HotkeyDispatcherService.instance;
  }

  start(): void {
    if (this.started || typeof window === "undefined") {
      return;
    }

    window.addEventListener("keydown", this.handleKeyDown, this.keydownListenerOptions);
    this.started = true;
  }

  stop(): void {
    if (!this.started || typeof window === "undefined") {
      return;
    }

    window.removeEventListener("keydown", this.handleKeyDown, this.keydownListenerOptions);
    this.started = false;
  }

  registerScope(registration: HotkeyScopeRegistration): () => void {
    this.unregisterScope(registration.scopeId);

    this.registrations.set(registration.scopeId, {
      ...registration,
      order: this.sequence += 1,
    });

    return () => {
      this.unregisterScope(registration.scopeId);
    };
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
      return;
    }

    const binding = hotkeyNormalizationService.normalizeEvent(event);
    if (!binding) {
      return;
    }

    if (binding === FIXED_OPENER_BINDING) {
      event.preventDefault();
      event.stopPropagation();
      hotkeySettingsService.open();
      return;
    }

    if (hotkeyNormalizationService.isEditableTarget(event.target)) {
      return;
    }

    const modalRegistrations = this.getRegistrationsForScopeType("modal");
    if (modalRegistrations.length > 0) {
      if (event.ctrlKey || event.altKey || event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
      }

      this.dispatchAgainstRegistrations([modalRegistrations[0]], binding, event);
      return;
    }

    if (this.dispatchAgainstRegistrations(this.getRegistrationsForScopeType("view"), binding, event)) {
      return;
    }

    if (this.dispatchAgainstRegistrations(this.getRegistrationsForScopeType("shell"), binding, event)) {
      return;
    }

    void this.dispatchAgainstRegistrations(this.getRegistrationsForScopeType("global"), binding, event);
  };

  private dispatchAgainstRegistrations(registrations: HotkeyScopeRegistrationRecord[], binding: string, event: KeyboardEvent): boolean {
    for (const registration of registrations) {
      const definitions = hotkeyDefinitionCatalogService.getDefinitionsForContext(registration.contextId);
      for (const definition of definitions) {
        const handler = registration.handlers[definition.id];
        if (!handler) {
          continue;
        }

        const bindingToMatch = hotkeyProfileService.getBinding(definition.id);

        if (bindingToMatch !== binding) {
          continue;
        }

        event.preventDefault();
        event.stopPropagation();
        void Promise.resolve(handler()).catch((error) => {
          console.error(`Failed to execute hotkey action ${definition.id}.`, error);
        });
        return true;
      }
    }

    return false;
  }

  private getRegistrationsForScopeType(scopeType: HotkeyScopeType): HotkeyScopeRegistrationRecord[] {
    return [...this.registrations.values()]
      .filter((registration) => registration.scopeType === scopeType)
      .sort((left, right) => right.order - left.order);
  }

  private unregisterScope(scopeId: string): void {
    this.registrations.delete(scopeId);
  }
}

export const hotkeyDispatcherService = HotkeyDispatcherService.getInstance();
