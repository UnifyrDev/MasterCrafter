import { TimestampedAggregate } from "@domain/models/TimestampedAggregate";
import type { CampaignCalendarDto, WorkspaceSummaryDto } from "@shared/contracts";
import { slugify } from "@shared/utils";

export class CampaignWorkspace extends TimestampedAggregate {
  constructor(
    id: string,
    public name: string,
    public readonly slug: string,
    public description: string,
    public readonly folderPath: string,
    public readonly dbPath: string,
    public readonly assetPath: string,
    public calendar: CampaignCalendarDto,
    createdAt: string,
    updatedAt: string,
    public lastOpenedAt: string | null,
  ) {
    super(id, createdAt, updatedAt);
  }

  static create(
    id: string,
    name: string,
    description: string,
    folderPath: string,
    dbPath: string,
    assetPath: string,
    calendar: CampaignCalendarDto,
    createdAt: string,
  ): CampaignWorkspace {
    return new CampaignWorkspace(
      id,
      name,
      slugify(name),
      description,
      folderPath,
      dbPath,
      assetPath,
      calendar,
      createdAt,
      createdAt,
      null,
    );
  }

  rename(name: string, description: string): void {
    this.name = name;
    this.description = description;
    this.touch();
  }

  markOpened(openedAt: string): void {
    this.lastOpenedAt = openedAt;
    this.touch();
  }

  updateCalendar(calendar: CampaignCalendarDto): void {
    this.calendar = calendar;
    this.touch();
  }

  toSummaryDto(): WorkspaceSummaryDto {
    return {
      id: this.id,
      name: this.name,
      slug: this.slug,
      description: this.description,
      folderPath: this.folderPath,
      dbPath: this.dbPath,
      assetPath: this.assetPath,
      calendarName: this.calendar.name,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastOpenedAt: this.lastOpenedAt,
    };
  }
}
