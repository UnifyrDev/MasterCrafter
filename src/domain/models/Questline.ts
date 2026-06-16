import { WorkspaceBoundAggregate } from "@domain/models/WorkspaceBoundAggregate";
import type { QuestlineDto } from "@shared/contracts";

export class Questline extends WorkspaceBoundAggregate {
  constructor(
    id: string,
    workspaceId: string,
    public anchorEntityId: string | null,
    public title: string,
    public description: string,
    public status: QuestlineDto["status"],
    createdAt: string,
    updatedAt: string,
  ) {
    super(id, workspaceId, createdAt, updatedAt);
  }

  activate(): void {
    this.status = "active";
    this.touch();
  }

  complete(): void {
    this.status = "completed";
    this.touch();
  }

  toDto(): QuestlineDto {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      anchorEntityId: this.anchorEntityId,
      title: this.title,
      description: this.description,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
