import { WorkspaceBoundAggregate } from "@domain/models/WorkspaceBoundAggregate";
import type { EncounterDto } from "@shared/contracts";
import { slugify } from "@shared/utils";

export class Encounter extends WorkspaceBoundAggregate {
  constructor(
    id: string,
    workspaceId: string,
    public name: string,
    public slug: string,
    public description: string,
    public notes: string,
    public mapId: string | null,
    public tags: string[],
    createdAt: string,
    updatedAt: string,
  ) {
    super(id, workspaceId, createdAt, updatedAt);
  }

  rename(name: string, description: string): void {
    this.name = name;
    this.description = description;
    this.slug = slugify(name);
    this.touch();
  }

  updateNotes(notes: string): void {
    this.notes = notes;
    this.touch();
  }

  updateMap(mapId: string | null): void {
    this.mapId = mapId;
    this.touch();
  }

  updateTags(tags: string[]): void {
    this.tags = tags;
    this.touch();
  }

  toDto(): EncounterDto {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      name: this.name,
      slug: this.slug,
      description: this.description,
      notes: this.notes,
      mapId: this.mapId,
      tags: this.tags,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
