import { WorkspaceBoundAggregate } from "@domain/models/WorkspaceBoundAggregate";
import type { RelationEdgeDto, RelationKind } from "@shared/contracts";

export class RelationEdge extends WorkspaceBoundAggregate {
  constructor(
    id: string,
    workspaceId: string,
    public sourceEntityId: string,
    public targetEntityId: string,
    public relationKind: RelationKind,
    public label: string,
    public notes: string,
    createdAt: string,
    updatedAt: string,
  ) {
    super(id, workspaceId, createdAt, updatedAt);
  }

  reverse(): RelationEdge {
    const reversedKind = this.relationKind === "parent"
      ? "child"
      : this.relationKind === "child"
        ? "parent"
        : this.relationKind === "adopted_parent"
          ? "adopted_child"
          : this.relationKind === "adopted_child"
            ? "adopted_parent"
            : this.relationKind;

    return new RelationEdge(
      this.id,
      this.workspaceId,
      this.targetEntityId,
      this.sourceEntityId,
      reversedKind,
      this.label,
      this.notes,
      this.createdAt,
      this.updatedAt,
    );
  }

  toDto(): RelationEdgeDto {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      sourceEntityId: this.sourceEntityId,
      targetEntityId: this.targetEntityId,
      relationKind: this.relationKind,
      label: this.label,
      notes: this.notes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
