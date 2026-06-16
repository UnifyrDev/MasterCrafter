import { WorkspaceBoundAggregate } from "@domain/models/WorkspaceBoundAggregate";
import type { CalendarStampDto, TimelineEventDto, TimelineLaneKind } from "@shared/contracts";

export class TimelineEvent extends WorkspaceBoundAggregate {
  constructor(
    id: string,
    workspaceId: string,
    public entityId: string | null,
    public questNodeId: string | null,
    public title: string,
    public description: string,
    public eventType: string,
    public laneKind: TimelineLaneKind,
    public laneLabel: string,
    public stamp: CalendarStampDto,
    public durationMinutes: number,
    public locationEntityId: string | null,
    createdAt: string,
    updatedAt: string,
  ) {
    super(id, workspaceId, createdAt, updatedAt);
  }

  reschedule(stamp: CalendarStampDto): void {
    this.stamp = stamp;
    this.touch();
  }

  toDto(): TimelineEventDto {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      entityId: this.entityId,
      questNodeId: this.questNodeId,
      title: this.title,
      description: this.description,
      eventType: this.eventType,
      laneKind: this.laneKind,
      laneLabel: this.laneLabel,
      stamp: this.stamp,
      durationMinutes: this.durationMinutes,
      locationEntityId: this.locationEntityId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
