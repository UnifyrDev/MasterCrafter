import { WorkspaceBoundAggregate } from "@domain/models/WorkspaceBoundAggregate";
import type { EncounterCombatantTeam, EncounterNpcLibraryEntryDto } from "@shared/contracts";
import { slugify } from "@shared/utils";

export class EncounterNpcLibraryEntry extends WorkspaceBoundAggregate {
  constructor(
    id: string,
    workspaceId: string,
    public sourceEntityId: string | null,
    public team: EncounterCombatantTeam,
    public name: string,
    public slug: string,
    public challengeRating: string,
    public armorClass: number,
    public hitPoints: number,
    public speed: string,
    public initiativeBonus: number,
    public notes: string,
    public tags: string[],
    createdAt: string,
    updatedAt: string,
  ) {
    super(id, workspaceId, createdAt, updatedAt);
  }

  rename(name: string): void {
    this.name = name;
    this.slug = slugify(name);
    this.touch();
  }

  setTeam(team: EncounterCombatantTeam): void {
    this.team = team;
    this.touch();
  }

  updateCombatProfile(input: {
    team: EncounterCombatantTeam;
    challengeRating: string;
    armorClass: number;
    hitPoints: number;
    speed: string;
    initiativeBonus: number;
    notes: string;
    tags: string[];
  }): void {
    this.team = input.team;
    this.challengeRating = input.challengeRating;
    this.armorClass = input.armorClass;
    this.hitPoints = input.hitPoints;
    this.speed = input.speed;
    this.initiativeBonus = input.initiativeBonus;
    this.notes = input.notes;
    this.tags = input.tags;
    this.touch();
  }

  toDto(): EncounterNpcLibraryEntryDto {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      sourceEntityId: this.sourceEntityId,
      team: this.team,
      name: this.name,
      slug: this.slug,
      challengeRating: this.challengeRating,
      armorClass: this.armorClass,
      hitPoints: this.hitPoints,
      speed: this.speed,
      initiativeBonus: this.initiativeBonus,
      notes: this.notes,
      tags: this.tags,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
