import { WorkspaceBoundAggregate } from "@domain/models/WorkspaceBoundAggregate";
import type {
  EncounterCombatantDto,
  EncounterCombatantSourceKind,
  EncounterCombatantTeam,
} from "@shared/contracts";

export class EncounterCombatant extends WorkspaceBoundAggregate {
  constructor(
    id: string,
    workspaceId: string,
    public encounterId: string,
    public sourceKind: EncounterCombatantSourceKind,
    public sourceId: string | null,
    public team: EncounterCombatantTeam,
    public name: string,
    public quantity: number,
    public initiativeBonus: number,
    public armorClass: number,
    public hitPoints: number,
    public speed: string,
    public level: number | null,
    public challengeRating: string,
    public notes: string,
    public sortIndex: number,
    createdAt: string,
    updatedAt: string,
  ) {
    super(id, workspaceId, createdAt, updatedAt);
  }

  setTeam(team: EncounterCombatantTeam): void {
    this.team = team;
    this.touch();
  }

  updateCombatProfile(input: {
    name: string;
    quantity: number;
    initiativeBonus: number;
    armorClass: number;
    hitPoints: number;
    speed: string;
    level: number | null;
    challengeRating: string;
    notes: string;
    sortIndex: number;
  }): void {
    this.name = input.name;
    this.quantity = input.quantity;
    this.initiativeBonus = input.initiativeBonus;
    this.armorClass = input.armorClass;
    this.hitPoints = input.hitPoints;
    this.speed = input.speed;
    this.level = input.level;
    this.challengeRating = input.challengeRating;
    this.notes = input.notes;
    this.sortIndex = input.sortIndex;
    this.touch();
  }

  toDto(): EncounterCombatantDto {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      encounterId: this.encounterId,
      sourceKind: this.sourceKind,
      sourceId: this.sourceId,
      team: this.team,
      name: this.name,
      quantity: this.quantity,
      initiativeBonus: this.initiativeBonus,
      armorClass: this.armorClass,
      hitPoints: this.hitPoints,
      speed: this.speed,
      level: this.level,
      challengeRating: this.challengeRating,
      notes: this.notes,
      sortIndex: this.sortIndex,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
