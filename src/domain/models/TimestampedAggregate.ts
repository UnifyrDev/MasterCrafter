import { nowIso } from "@shared/utils";

export abstract class TimestampedAggregate {
  protected constructor(
    public readonly id: string,
    public readonly createdAt: string,
    public updatedAt: string,
  ) {}

  protected touch(): void {
    this.updatedAt = nowIso();
  }
}
