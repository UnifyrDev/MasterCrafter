import { WorkspaceBoundAggregate } from "@domain/models/WorkspaceBoundAggregate";
import type { ItemDto } from "@shared/contracts";

export class Item extends WorkspaceBoundAggregate {
  constructor(
    id: string,
    workspaceId: string,
    public title: string,
    public description: string,
    public worth: number,
    public rarity: string,
    public tags: string[],
    createdAt: string,
    updatedAt: string,
  ) {
    super(id, workspaceId, createdAt, updatedAt);
  }

  setWorth(worth: number): void {
    this.worth = worth;
    this.touch();
  }

  toDto(): ItemDto {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      title: this.title,
      description: this.description,
      worth: this.worth,
      rarity: this.rarity,
      tags: this.tags,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
