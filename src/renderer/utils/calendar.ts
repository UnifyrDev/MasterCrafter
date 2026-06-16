import type { CalendarMonthDefinitionDto, CampaignCalendarDto, CalendarCycleLabel } from "@shared/contracts";

export function getCalendarCycleLabel(calendar: Pick<CampaignCalendarDto, "cycleLabel"> | null | undefined, plural = true): string {
  const cycleLabel = calendar?.cycleLabel ?? "months";
  if (cycleLabel === "seasons") {
    return plural ? "Seasons" : "Season";
  }

  return plural ? "Months" : "Month";
}

export function cloneCalendar(calendar: CampaignCalendarDto): CampaignCalendarDto {
  return {
    ...calendar,
    months: calendar.months.map((month) => ({ ...month })),
    weekdays: [...calendar.weekdays],
    cycleLabel: calendar.cycleLabel ?? "months",
  };
}

export function createCalendarMonth(name: string, days: number): CalendarMonthDefinitionDto {
  return {
    name,
    days,
  };
}

export function normalizeCalendarCycleLabel(value: CalendarCycleLabel | undefined): CalendarCycleLabel {
  return value === "seasons" ? "seasons" : "months";
}
