import {
  createEncounterConditionState,
  formatEncounterConditionTimerLabel,
  type EncounterConditionDefinitionDto,
  type EncounterConditionExpiryDto,
  listEncounterConditionDefinitions,
  normalizeEncounterConditionStates,
  tickEncounterConditionStates,
  TURN_SECONDS,
} from "@shared/encounterConditions";
import type {
  EncounterConditionStateDto,
  EncounterSessionCombatantDto,
} from "@shared/contracts";

export interface EncounterConditionToastDto {
  id: string;
  title: string;
  message: string;
  tone: "info" | "warning" | "success";
}

export class EncounterConditionService {
  private static instance: EncounterConditionService | null = null;
  private audioContext: AudioContext | null = null;

  private constructor() {}

  static getInstance(): EncounterConditionService {
    if (!EncounterConditionService.instance) {
      EncounterConditionService.instance = new EncounterConditionService();
    }

    return EncounterConditionService.instance;
  }

  listDefinitions(): EncounterConditionDefinitionDto[] {
    return listEncounterConditionDefinitions();
  }

  formatTimerLabel(remainingTurns: number | null): string {
    return formatEncounterConditionTimerLabel(remainingTurns);
  }

  normalizeConditions(value: unknown): EncounterConditionStateDto[] {
    return normalizeEncounterConditionStates(value);
  }

  createCondition(labelOrKey: string, remainingTurns: number | null = null): EncounterConditionStateDto {
    return createEncounterConditionState(labelOrKey, remainingTurns);
  }

  toggleCondition(combatant: EncounterSessionCombatantDto, labelOrKey: string): void {
    const definition = this.listDefinitions().find((entry) => entry.key === labelOrKey || entry.label.toLowerCase() === labelOrKey.toLowerCase());
    const key = definition?.key ?? labelOrKey.trim().toLowerCase();
    const existingIndex = combatant.conditions.findIndex((condition) => condition.key === key);
    if (existingIndex >= 0) {
      combatant.conditions.splice(existingIndex, 1);
      return;
    }

    combatant.conditions = [...combatant.conditions, this.createCondition(definition?.label ?? labelOrKey, definition?.defaultRemainingTurns ?? null)];
  }

  setConditionRemainingTurns(
    combatant: EncounterSessionCombatantDto,
    conditionId: string,
    remainingTurns: number | null,
  ): EncounterConditionStateDto | null {
    const index = combatant.conditions.findIndex((condition) => condition.id === conditionId);
    if (index < 0) {
      return null;
    }

    if (remainingTurns === null) {
      const nextCondition = {
        ...combatant.conditions[index],
        remainingTurns: null,
        updatedAt: new Date().toISOString(),
      };
      combatant.conditions[index] = nextCondition;
      return nextCondition;
    }

    const normalizedTurns = Math.max(0, Math.floor(remainingTurns));
    if (normalizedTurns <= 0) {
      combatant.conditions = combatant.conditions.filter((entry) => entry.id !== conditionId);
      return null;
    }

    const nextCondition: EncounterConditionStateDto = {
      ...combatant.conditions[index],
      remainingTurns: normalizedTurns,
      updatedAt: new Date().toISOString(),
    };
    combatant.conditions[index] = nextCondition;
    return nextCondition;
  }

  adjustConditionRemainingTurns(
    combatant: EncounterSessionCombatantDto,
    conditionId: string,
    deltaTurns: number,
  ): EncounterConditionStateDto | null {
    const index = combatant.conditions.findIndex((condition) => condition.id === conditionId);
    if (index < 0) {
      return null;
    }

    const currentCondition = combatant.conditions[index];
    if (currentCondition.remainingTurns === null) {
      if (deltaTurns <= 0) {
        return { ...currentCondition, updatedAt: currentCondition.updatedAt };
      }

      const nextCondition: EncounterConditionStateDto = {
        ...currentCondition,
        remainingTurns: Math.max(1, Math.floor(deltaTurns)),
        updatedAt: new Date().toISOString(),
      };
      combatant.conditions[index] = nextCondition;
      return nextCondition;
    }

    const nextRemaining = Math.max(0, Math.floor((currentCondition.remainingTurns ?? 0) + deltaTurns));
    if (nextRemaining <= 0) {
      combatant.conditions = combatant.conditions.filter((entry) => entry.id !== conditionId);
      return null;
    }

    const nextCondition: EncounterConditionStateDto = {
      ...currentCondition,
      remainingTurns: nextRemaining,
      updatedAt: new Date().toISOString(),
    };
    combatant.conditions[index] = nextCondition;
    return nextCondition;
  }

  tickCombatantConditions(
    combatants: EncounterSessionCombatantDto[],
    turnsElapsed = 1,
  ): EncounterConditionExpiryDto[] {
    const notices: EncounterConditionExpiryDto[] = [];
    for (const combatant of combatants) {
      const { nextStates, expiredStates } = tickEncounterConditionStates(combatant.conditions, turnsElapsed);
      if (!expiredStates.length) {
        combatant.conditions = nextStates;
        continue;
      }

      combatant.conditions = nextStates;
      notices.push({
        combatantId: combatant.id,
        combatantName: combatant.name,
        conditionLabels: expiredStates.map((entry) => entry.label),
      });
    }

    return notices;
  }

  createToast(notice: EncounterConditionExpiryDto): EncounterConditionToastDto {
    const summary = notice.conditionLabels.length === 1 ? notice.conditionLabels[0] : notice.conditionLabels.join(", ");
    return {
      id: crypto.randomUUID(),
      title: `${notice.combatantName}`,
      message: `${summary} ${notice.conditionLabels.length === 1 ? "expired" : "conditions expired"}.`,
      tone: "warning",
    };
  }

  playPing(): void {
    if (typeof window === "undefined") {
      return;
    }

    const AudioContextCtor =
      window.AudioContext ?? ((window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null);
    if (!AudioContextCtor) {
      return;
    }

    if (!this.audioContext) {
      this.audioContext = new AudioContextCtor();
    }

    const context = this.audioContext;
    if (context.state === "suspended") {
      void context.resume();
    }

    const gain = context.createGain();
    const low = context.createOscillator();
    const high = context.createOscillator();

    low.type = "sine";
    low.frequency.setValueAtTime(720, context.currentTime);
    high.type = "triangle";
    high.frequency.setValueAtTime(1040, context.currentTime);

    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);

    low.connect(gain);
    high.connect(gain);
    gain.connect(context.destination);

    low.start(context.currentTime);
    high.start(context.currentTime + 0.03);
    low.stop(context.currentTime + 0.24);
    high.stop(context.currentTime + 0.24);
  }

  get turnSeconds(): number {
    return TURN_SECONDS;
  }
}

export const encounterConditionService = EncounterConditionService.getInstance();
