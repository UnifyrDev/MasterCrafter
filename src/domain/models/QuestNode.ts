import { WorkspaceBoundAggregate } from "@domain/models/WorkspaceBoundAggregate";
import type { CalendarStampDto, QuestNodeDto, QuestRewardDto } from "@shared/contracts";

export class QuestNode extends WorkspaceBoundAggregate {
  constructor(
    id: string,
    workspaceId: string,
    public questlineId: string,
    public parentNodeId: string | null,
    public title: string,
    public description: string,
    public rewards: QuestRewardDto[],
    public orderIndex: number,
    public stamp: CalendarStampDto | null,
    createdAt: string,
    updatedAt: string,
  ) {
    super(id, workspaceId, createdAt, updatedAt);
  }

  addReward(reward: QuestRewardDto): void {
    this.rewards = [...this.rewards, reward];
    this.touch();
  }

  setStamp(stamp: CalendarStampDto | null): void {
    if (this.stamp === null && stamp === null) {
      return;
    }

    if (
      this.stamp !== null &&
      stamp !== null &&
      this.stamp.year === stamp.year &&
      this.stamp.month === stamp.month &&
      this.stamp.day === stamp.day &&
      this.stamp.hour === stamp.hour &&
      this.stamp.minute === stamp.minute
    ) {
      return;
    }

    this.stamp = stamp;
    this.touch();
  }

  toDto(): QuestNodeDto {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      questlineId: this.questlineId,
      parentNodeId: this.parentNodeId,
      title: this.title,
      description: this.description,
      rewards: this.rewards,
      orderIndex: this.orderIndex,
      stamp: this.stamp,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
