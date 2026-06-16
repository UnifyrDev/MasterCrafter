import { WorkspaceBoundAggregate } from "@domain/models/WorkspaceBoundAggregate";
import type { EncounterPlayerLibraryEntryDto } from "@shared/contracts";
import { slugify } from "@shared/utils";

export class EncounterPlayerLibraryEntry extends WorkspaceBoundAggregate {
  constructor(
    id: string,
    workspaceId: string,
    public name: string,
    public slug: string,
    public level: number,
    public armorClass: number,
    public hitPoints: number,
    public initiativeBonus: number,
    public speed: string,
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

  updateCombatProfile(input: {
    level: number;
    armorClass: number;
    hitPoints: number;
    initiativeBonus: number;
    speed: string;
    notes: string;
    tags: string[];
  }): void {
    this.level = input.level;
    this.armorClass = input.armorClass;
    this.hitPoints = input.hitPoints;
    this.initiativeBonus = input.initiativeBonus;
    this.speed = input.speed;
    this.notes = input.notes;
    this.tags = input.tags;
    this.touch();
  }

  toDto(): EncounterPlayerLibraryEntryDto {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      name: this.name,
      slug: this.slug,
      level: this.level,
      armorClass: this.armorClass,
      hitPoints: this.hitPoints,
      initiativeBonus: this.initiativeBonus,
      speed: this.speed,
      notes: this.notes,
      tags: this.tags,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
