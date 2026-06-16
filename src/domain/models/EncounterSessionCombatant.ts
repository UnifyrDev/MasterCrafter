import { createId } from "@shared/utils";
import type {
  EncounterCombatantDto,
  EncounterCombatantSourceKind,
  EncounterCombatantTeam,
  EncounterConditionStateDto,
  EncounterInitiativeMode,
  EncounterSessionCombatantDto,
} from "@shared/contracts";
import { createEncounterConditionState, normalizeEncounterConditionStates, tickEncounterConditionStates } from "@shared/encounterConditions";

export class EncounterSessionCombatant {
  constructor(
    public id: string,
    public encounterCombatantId: string,
    public sourceKind: EncounterCombatantSourceKind,
    public sourceId: string | null,
    public team: EncounterCombatantTeam,
    public name: string,
    public groupName: string,
    public groupIndex: number,
    public groupSize: number,
    public initiativeBonus: number,
    public initiativeMode: EncounterInitiativeMode | null,
    public initiativeRoll: number | null,
    public initiativeScore: number | null,
    public armorClass: number,
    public maxHitPoints: number,
    public currentHitPoints: number,
    public tempHitPoints: number,
    public speed: string,
    public level: number | null,
    public challengeRating: string,
    public notes: string,
    public conditions: EncounterConditionStateDto[],
    public isHidden: boolean,
    public isDefeated: boolean,
    public sortIndex: number,
  ) {}

  static fromCombatant(combatant: EncounterCombatantDto, groupIndex = 1, groupSize = Math.max(1, combatant.quantity)): EncounterSessionCombatant {
    const name = groupSize > 1 ? `${combatant.name} ${groupIndex}` : combatant.name;

    return new EncounterSessionCombatant(
      createId(),
      combatant.id,
      combatant.sourceKind,
      combatant.sourceId,
      combatant.team,
      name,
      combatant.name,
      groupIndex,
      groupSize,
      combatant.initiativeBonus,
      null,
      null,
      null,
      combatant.armorClass,
      combatant.hitPoints,
      combatant.hitPoints,
      0,
      combatant.speed,
      combatant.level,
      combatant.challengeRating,
      combatant.notes,
      [],
      false,
      false,
      combatant.sortIndex,
    );
  }

  setInitiativeRoll(value: number | null): void {
    this.initiativeRoll = value === null || !Number.isFinite(value) ? null : Math.floor(value);
    this.recomputeInitiativeScore();
  }

  setInitiativeMode(value: EncounterInitiativeMode | null): void {
    this.initiativeMode = value;
    this.recomputeInitiativeScore();
  }

  private recomputeInitiativeScore(): void {
    if (this.initiativeRoll === null || !Number.isFinite(this.initiativeRoll)) {
      this.initiativeScore = null;
      return;
    }

    if (this.initiativeMode === "without-bonus") {
      this.initiativeScore = this.initiativeRoll;
      return;
    }

    this.initiativeScore = this.initiativeRoll + this.initiativeBonus;
  }

  takeDamage(amount: number): void {
    const nextAmount = Math.max(0, Math.floor(amount));
    if (nextAmount <= 0) {
      return;
    }

    const mitigated = Math.max(0, nextAmount - this.tempHitPoints);
    this.tempHitPoints = Math.max(0, this.tempHitPoints - nextAmount);
    this.currentHitPoints = Math.max(0, this.currentHitPoints - mitigated);
    this.isDefeated = this.currentHitPoints <= 0;
  }

  heal(amount: number): void {
    const nextAmount = Math.max(0, Math.floor(amount));
    if (nextAmount <= 0) {
      return;
    }

    this.currentHitPoints = Math.min(this.maxHitPoints, this.currentHitPoints + nextAmount);
    this.isDefeated = this.currentHitPoints <= 0;
  }

  toggleCondition(condition: string): void {
    const trimmed = condition.trim();
    if (!trimmed) {
      return;
    }

    const lowered = trimmed.toLowerCase();
    const existingIndex = this.conditions.findIndex((entry) => entry.key.toLowerCase() === lowered || entry.label.toLowerCase() === lowered);
    if (existingIndex >= 0) {
      this.conditions = this.conditions.filter((entry) => entry.id !== this.conditions[existingIndex].id);
      return;
    }

    this.conditions = [...this.conditions, createEncounterConditionState(trimmed, null)];
  }

  addCondition(condition: EncounterConditionStateDto): void {
    this.conditions = [...this.conditions, condition];
  }

  removeCondition(conditionId: string): void {
    this.conditions = this.conditions.filter((entry) => entry.id !== conditionId);
  }

  tickConditions(turnsElapsed = 1): EncounterConditionStateDto[] {
    const { nextStates, expiredStates } = tickEncounterConditionStates(this.conditions, turnsElapsed);
    this.conditions = nextStates;
    return expiredStates;
  }

  toDto(): EncounterSessionCombatantDto {
    return {
      id: this.id,
      encounterCombatantId: this.encounterCombatantId,
      sourceKind: this.sourceKind,
      sourceId: this.sourceId,
      team: this.team,
      name: this.name,
      groupName: this.groupName,
      groupIndex: this.groupIndex,
      groupSize: this.groupSize,
      initiativeBonus: this.initiativeBonus,
      initiativeMode: this.initiativeMode,
      initiativeRoll: this.initiativeRoll,
      initiativeScore: this.initiativeScore,
      armorClass: this.armorClass,
      maxHitPoints: this.maxHitPoints,
      currentHitPoints: this.currentHitPoints,
      tempHitPoints: this.tempHitPoints,
      speed: this.speed,
      level: this.level,
      challengeRating: this.challengeRating,
      notes: this.notes,
      conditions: normalizeEncounterConditionStates(this.conditions),
      isHidden: this.isHidden,
      isDefeated: this.isDefeated,
      sortIndex: this.sortIndex,
    };
  }
}
