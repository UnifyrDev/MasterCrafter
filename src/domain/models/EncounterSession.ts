import { WorkspaceBoundAggregate } from "@domain/models/WorkspaceBoundAggregate";
import { EncounterSessionCombatant } from "@domain/models/EncounterSessionCombatant";
import type { EncounterSessionDto, EncounterSessionInputDto, EncounterSessionStatus } from "@shared/contracts";
import { createId } from "@shared/utils";
import { normalizeEncounterConditionStates } from "@shared/encounterConditions";

export class EncounterSession extends WorkspaceBoundAggregate {
  constructor(
    id: string,
    workspaceId: string,
    public encounterId: string,
    public status: EncounterSessionStatus,
    public roundNumber: number,
    public currentTurnIndex: number,
    public startedAt: string,
    public lastAdvancedAt: string,
    public endedAt: string | null,
    public combatants: EncounterSessionCombatant[],
    createdAt: string,
    updatedAt: string,
  ) {
    super(id, workspaceId, createdAt, updatedAt);
  }

  static createFromInput(input: EncounterSessionInputDto, createdAt: string, updatedAt: string): EncounterSession {
    return new EncounterSession(
      input.id ?? createId(),
      input.workspaceId,
      input.encounterId,
      input.status,
      input.roundNumber,
      input.currentTurnIndex,
      input.startedAt,
      input.lastAdvancedAt,
      input.endedAt,
      input.combatants.map((combatant) => new EncounterSessionCombatant(
        combatant.id,
        combatant.encounterCombatantId,
        combatant.sourceKind,
        combatant.sourceId,
        combatant.team,
        combatant.name,
        combatant.groupName,
        combatant.groupIndex,
        combatant.groupSize,
        combatant.initiativeBonus,
        combatant.initiativeMode === "with-bonus" || combatant.initiativeMode === "without-bonus" ? combatant.initiativeMode : null,
        combatant.initiativeRoll,
        combatant.initiativeScore,
        combatant.armorClass,
        combatant.maxHitPoints,
        combatant.currentHitPoints,
        combatant.tempHitPoints,
        combatant.speed,
        combatant.level,
        combatant.challengeRating,
        combatant.notes,
        normalizeEncounterConditionStates(combatant.conditions),
        combatant.isHidden,
        combatant.isDefeated,
        combatant.sortIndex,
      )),
      createdAt,
      updatedAt,
    );
  }

  static fromCombatants(
    id: string,
    workspaceId: string,
    encounterId: string,
    combatants: EncounterSessionCombatant[],
    startedAt: string,
    createdAt: string,
  ): EncounterSession {
    return new EncounterSession(
      id,
      workspaceId,
      encounterId,
      "active",
      1,
      0,
      startedAt,
      startedAt,
      null,
      combatants,
      createdAt,
      createdAt,
    );
  }

  get currentCombatant(): EncounterSessionCombatant | null {
    return this.combatants[this.currentTurnIndex] ?? null;
  }

  sortCombatants(): void {
    this.combatants = [...this.combatants].sort((left, right) => {
      const leftScore = left.initiativeScore ?? left.initiativeBonus;
      const rightScore = right.initiativeScore ?? right.initiativeBonus;

      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }

      if (right.initiativeBonus !== left.initiativeBonus) {
        return right.initiativeBonus - left.initiativeBonus;
      }

      return left.sortIndex - right.sortIndex || left.name.localeCompare(right.name);
    });
    this.touch();
  }

  start(): void {
    this.status = "active";
    this.endedAt = null;
    this.touch();
  }

  pause(): void {
    if (this.status === "completed") {
      return;
    }

    this.status = "paused";
    this.touch();
  }

  resume(): void {
    if (this.status === "completed") {
      return;
    }

    this.status = "active";
    this.touch();
  }

  complete(): void {
    this.status = "completed";
    this.endedAt = this.lastAdvancedAt;
    this.touch();
  }

  advanceTurn(): void {
    if (!this.combatants.length) {
      return;
    }

    if (this.currentTurnIndex >= this.combatants.length - 1) {
      this.currentTurnIndex = 0;
      this.roundNumber += 1;
    } else {
      this.currentTurnIndex += 1;
    }

    this.lastAdvancedAt = new Date().toISOString();
    this.touch();
  }

  setCurrentTurnIndex(index: number): void {
    if (!Number.isFinite(index)) {
      return;
    }

    this.currentTurnIndex = Math.min(Math.max(0, Math.floor(index)), Math.max(0, this.combatants.length - 1));
    this.touch();
  }

  toDto(): EncounterSessionDto {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      encounterId: this.encounterId,
      status: this.status,
      roundNumber: this.roundNumber,
      currentTurnIndex: this.currentTurnIndex,
      startedAt: this.startedAt,
      lastAdvancedAt: this.lastAdvancedAt,
      endedAt: this.endedAt,
      combatants: this.combatants.map((combatant) => combatant.toDto()),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
