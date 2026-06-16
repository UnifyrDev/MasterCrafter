import { TimestampedAggregate } from "@domain/models/TimestampedAggregate";

export abstract class WorkspaceBoundAggregate extends TimestampedAggregate {
  protected constructor(
    id: string,
    public readonly workspaceId: string,
    createdAt: string,
    updatedAt: string,
  ) {
    super(id, createdAt, updatedAt);
  }
}
