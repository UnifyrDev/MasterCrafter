import type { TimelineCalendarGuideProjection } from "@renderer/utils/timeline";

export type TimelineRulerTier = "year" | "month" | "week" | "day" | "hour";

export interface TimelineRulerTickProjection {
  id: string;
  tier: TimelineRulerTier;
  label: string;
  positionPx: number;
  heightPx: number;
  labelVisible: boolean;
  labelAnchor: "start" | "center" | "end";
}

export interface TimelineRulerRowProjection {
  tier: TimelineRulerTier;
  ticks: TimelineRulerTickProjection[];
}

export interface TimelineRulerProjection {
  rows: TimelineRulerRowProjection[];
  heightPx: number;
  trackWidthPx: number;
}

const MIN_RULER_ZOOM_X = 0.5;
const MAX_RULER_ZOOM_X = 48;
const RULER_BAR_HEIGHT_PX = 96;
const RULER_VISIBLE_OVERSCAN_PX = 220;

const RULER_TICK_HEIGHTS: Record<TimelineRulerTier, number> = {
  year: 18,
  month: 16,
  week: 13,
  day: 11,
  hour: 9,
};

export class TimelineRulerProjectionService {
  private static instance: TimelineRulerProjectionService | null = null;

  static getInstance(): TimelineRulerProjectionService {
    if (!TimelineRulerProjectionService.instance) {
      TimelineRulerProjectionService.instance = new TimelineRulerProjectionService();
    }

    return TimelineRulerProjectionService.instance;
  }

  buildProjection(
    calendarGuide: TimelineCalendarGuideProjection | null,
    zoomX: number,
    viewportWidthPx: number,
    translateX: number,
  ): TimelineRulerProjection {
    if (!calendarGuide) {
      return {
        rows: [],
        heightPx: 0,
        trackWidthPx: 0,
      };
    }

    const safeZoomX = this.normalizeZoomX(zoomX);
    const safeViewportWidthPx = Math.max(0, viewportWidthPx);
    const dayWidthPx = calendarGuide.dayWidthPx * safeZoomX;
    const hourWidthPx = dayWidthPx / Math.max(calendarGuide.hoursPerDay, 1);
    const axisWidthPx = calendarGuide.axisWidthPx * safeZoomX;
    const axisPaddingPx = calendarGuide.axisPaddingPx * safeZoomX;
    const overscanPx = Math.max(RULER_VISIBLE_OVERSCAN_PX, dayWidthPx * 2);
    const visibleLeftPx = Math.max(0, -translateX);
    const visibleStartPx = Math.max(0, visibleLeftPx - overscanPx);
    const visibleEndPx = visibleLeftPx + safeViewportWidthPx + overscanPx;
    const trackWidthPx = axisWidthPx;
    const generationYearCount = Math.max(1, calendarGuide.totalYears);

    const rows: TimelineRulerRowProjection[] = [];
    const rowTiers = this.resolveRowTiers(dayWidthPx, hourWidthPx);

    for (const tier of rowTiers) {
      const ticks = this.buildTicksForTier(
        tier,
        calendarGuide,
        axisPaddingPx,
        dayWidthPx,
        hourWidthPx,
        visibleStartPx,
        visibleEndPx,
        overscanPx,
        generationYearCount,
      );

      if (ticks.length > 0) {
        rows.push({
          tier,
          ticks,
        });
      }
    }

    return {
      rows,
      heightPx: rows.length === 0 ? 0 : RULER_BAR_HEIGHT_PX,
      trackWidthPx,
    };
  }

  private normalizeZoomX(zoomX: number): number {
    if (!Number.isFinite(zoomX)) {
      return MIN_RULER_ZOOM_X;
    }

    return Math.min(MAX_RULER_ZOOM_X, Math.max(MIN_RULER_ZOOM_X, zoomX));
  }

  private resolveRowTiers(dayWidthPx: number, hourWidthPx: number): TimelineRulerTier[] {
    const tiers: TimelineRulerTier[] = ["year", "month", "week"];

    if (dayWidthPx >= 16) {
      tiers.push("day");
    }

    if (hourWidthPx >= 6) {
      tiers.push("hour");
    }

    return tiers;
  }

  private buildTicksForTier(
    tier: TimelineRulerTier,
    calendarGuide: TimelineCalendarGuideProjection,
    axisPaddingPx: number,
    dayWidthPx: number,
    hourWidthPx: number,
    visibleStartPx: number,
    visibleEndPx: number,
    overscanPx: number,
    generationYearCount: number,
  ): TimelineRulerTickProjection[] {
    switch (tier) {
      case "year":
        return this.buildYearTicks(calendarGuide, axisPaddingPx, dayWidthPx, visibleStartPx, visibleEndPx, overscanPx, generationYearCount);
      case "month":
        return this.buildMonthTicks(calendarGuide, axisPaddingPx, dayWidthPx, visibleStartPx, visibleEndPx, overscanPx, generationYearCount);
      case "week":
        return this.buildWeekTicks(calendarGuide, axisPaddingPx, dayWidthPx, visibleStartPx, visibleEndPx, overscanPx, generationYearCount);
      case "day":
        return this.buildDayTicks(calendarGuide, axisPaddingPx, dayWidthPx, visibleStartPx, visibleEndPx, overscanPx, generationYearCount);
      case "hour":
        return this.buildHourTicks(calendarGuide, axisPaddingPx, hourWidthPx, visibleStartPx, visibleEndPx, overscanPx, generationYearCount);
      default:
        return [];
    }
  }

  private buildYearTicks(
    calendarGuide: TimelineCalendarGuideProjection,
    axisPaddingPx: number,
    dayWidthPx: number,
    visibleStartPx: number,
    visibleEndPx: number,
    overscanPx: number,
    generationYearCount: number,
  ): TimelineRulerTickProjection[] {
    const ticks: TimelineRulerTickProjection[] = [];
    const yearLengthDays = Math.max(calendarGuide.yearLengthDays, 1);

    for (let yearIndex = 0; yearIndex < generationYearCount; yearIndex += 1) {
      const positionPx = this.positionFromDayOffset(axisPaddingPx, dayWidthPx, yearIndex * yearLengthDays);
      if (!this.isVisible(positionPx, visibleStartPx, visibleEndPx, overscanPx)) {
        continue;
      }

      ticks.push({
        id: `year-${calendarGuide.startYear + yearIndex}`,
        tier: "year",
        label: `Year ${calendarGuide.startYear + yearIndex}`,
        positionPx,
        heightPx: RULER_TICK_HEIGHTS.year,
        labelVisible: true,
        labelAnchor: this.resolveLabelAnchor(positionPx, visibleStartPx, visibleEndPx, overscanPx),
      });
    }

    return ticks;
  }

  private buildMonthTicks(
    calendarGuide: TimelineCalendarGuideProjection,
    axisPaddingPx: number,
    dayWidthPx: number,
    visibleStartPx: number,
    visibleEndPx: number,
    overscanPx: number,
    generationYearCount: number,
  ): TimelineRulerTickProjection[] {
    const ticks: TimelineRulerTickProjection[] = [];
    const yearLengthDays = Math.max(calendarGuide.yearLengthDays, 1);
    const cycleEntryLabel = calendarGuide.cycleLabel === "Seasons" ? "Season" : "Month";

    for (let yearIndex = 0; yearIndex < generationYearCount; yearIndex += 1) {
      const yearDayOffset = yearIndex * yearLengthDays;

      for (let monthIndex = 0; monthIndex < calendarGuide.cycleEntries.length; monthIndex += 1) {
        const entry = calendarGuide.cycleEntries[monthIndex];
        if (!entry) {
          continue;
        }

        const positionPx = this.positionFromDayOffset(axisPaddingPx, dayWidthPx, yearDayOffset + entry.startDay);
        if (!this.isVisible(positionPx, visibleStartPx, visibleEndPx, overscanPx)) {
          continue;
        }

        ticks.push({
          id: `${cycleEntryLabel.toLowerCase()}-${yearIndex}-${monthIndex}`,
          tier: "month",
          label: `${cycleEntryLabel} ${monthIndex + 1}`,
          positionPx,
          heightPx: RULER_TICK_HEIGHTS.month,
          labelVisible: true,
          labelAnchor: this.resolveLabelAnchor(positionPx, visibleStartPx, visibleEndPx, overscanPx),
        });
      }
    }

    return ticks;
  }

  private buildWeekTicks(
    calendarGuide: TimelineCalendarGuideProjection,
    axisPaddingPx: number,
    dayWidthPx: number,
    visibleStartPx: number,
    visibleEndPx: number,
    overscanPx: number,
    generationYearCount: number,
  ): TimelineRulerTickProjection[] {
    const ticks: TimelineRulerTickProjection[] = [];
    const yearLengthDays = Math.max(calendarGuide.yearLengthDays, 1);
    const daysPerWeek = Math.max(calendarGuide.weekdayLabels.length, 1);
    const weeksPerYear = Math.max(1, Math.ceil(yearLengthDays / daysPerWeek));

    for (let yearIndex = 0; yearIndex < generationYearCount; yearIndex += 1) {
      const yearDayOffset = yearIndex * yearLengthDays;

      for (let weekIndex = 0; weekIndex < weeksPerYear; weekIndex += 1) {
        const dayOffset = yearDayOffset + weekIndex * daysPerWeek;
        if (dayOffset >= yearDayOffset + yearLengthDays) {
          break;
        }

        const positionPx = this.positionFromDayOffset(axisPaddingPx, dayWidthPx, dayOffset);
        if (!this.isVisible(positionPx, visibleStartPx, visibleEndPx, overscanPx)) {
          continue;
        }

        ticks.push({
          id: `week-${yearIndex}-${weekIndex}`,
          tier: "week",
          label: `Week ${weekIndex + 1}`,
          positionPx,
          heightPx: RULER_TICK_HEIGHTS.week,
          labelVisible: true,
          labelAnchor: this.resolveLabelAnchor(positionPx, visibleStartPx, visibleEndPx, overscanPx),
        });
      }
    }

    return ticks;
  }

  private buildDayTicks(
    calendarGuide: TimelineCalendarGuideProjection,
    axisPaddingPx: number,
    dayWidthPx: number,
    visibleStartPx: number,
    visibleEndPx: number,
    overscanPx: number,
    generationYearCount: number,
  ): TimelineRulerTickProjection[] {
    const ticks: TimelineRulerTickProjection[] = [];
    const yearLengthDays = Math.max(calendarGuide.yearLengthDays, 1);
    const totalDays = yearLengthDays * generationYearCount;
    const safeDayWidthPx = Math.max(dayWidthPx, 1);
    const startDayOffset = Math.max(0, Math.floor((visibleStartPx - axisPaddingPx) / safeDayWidthPx) - 1);
    const endDayOffset = Math.min(totalDays - 1, Math.ceil((visibleEndPx - axisPaddingPx) / safeDayWidthPx) + 1);
    const labelStep = Math.max(1, Math.ceil(32 / safeDayWidthPx));

    for (let dayOffset = startDayOffset; dayOffset <= endDayOffset; dayOffset += 1) {
      const positionPx = this.positionFromDayOffset(axisPaddingPx, dayWidthPx, dayOffset);
      if (!this.isVisible(positionPx, visibleStartPx, visibleEndPx, overscanPx)) {
        continue;
      }

      const dayInYear = dayOffset % yearLengthDays;
      ticks.push({
        id: `day-${dayOffset}`,
        tier: "day",
        label: `Day ${dayInYear + 1}`,
        positionPx,
        heightPx: RULER_TICK_HEIGHTS.day,
        labelVisible: dayOffset === 0 || dayOffset % labelStep === 0,
        labelAnchor: this.resolveLabelAnchor(positionPx, visibleStartPx, visibleEndPx, overscanPx),
      });
    }

    return ticks;
  }

  private buildHourTicks(
    calendarGuide: TimelineCalendarGuideProjection,
    axisPaddingPx: number,
    hourWidthPx: number,
    visibleStartPx: number,
    visibleEndPx: number,
    overscanPx: number,
    generationYearCount: number,
  ): TimelineRulerTickProjection[] {
    const ticks: TimelineRulerTickProjection[] = [];
    const yearLengthDays = Math.max(calendarGuide.yearLengthDays, 1);
    const hoursPerDay = Math.max(calendarGuide.hoursPerDay, 1);
    const totalHours = yearLengthDays * generationYearCount * hoursPerDay;
    const safeHourWidthPx = Math.max(hourWidthPx, 1);
    const startHourOffset = Math.max(0, Math.floor((visibleStartPx - axisPaddingPx) / safeHourWidthPx) - 1);
    const endHourOffset = Math.min(totalHours - 1, Math.ceil((visibleEndPx - axisPaddingPx) / safeHourWidthPx) + 1);
    const labelStep = Math.max(1, Math.ceil(18 / safeHourWidthPx));

    for (let hourOffset = startHourOffset; hourOffset <= endHourOffset; hourOffset += 1) {
      const positionPx = axisPaddingPx + hourOffset * safeHourWidthPx;
      if (!this.isVisible(positionPx, visibleStartPx, visibleEndPx, overscanPx)) {
        continue;
      }

      const hourInDay = hourOffset % hoursPerDay;
      ticks.push({
        id: `hour-${hourOffset}`,
        tier: "hour",
        label: `H${hourInDay}`,
        positionPx,
        heightPx: RULER_TICK_HEIGHTS.hour,
        labelVisible: hourOffset === 0 || hourOffset % labelStep === 0,
        labelAnchor: this.resolveLabelAnchor(positionPx, visibleStartPx, visibleEndPx, overscanPx),
      });
    }

    return ticks;
  }

  private resolveLabelAnchor(
    positionPx: number,
    visibleStartPx: number,
    visibleEndPx: number,
    overscanPx: number,
  ): "start" | "center" | "end" {
    if (positionPx <= visibleStartPx + overscanPx * 0.25) {
      return "start";
    }

    if (positionPx >= visibleEndPx - overscanPx * 0.25) {
      return "end";
    }

    return "center";
  }

  private positionFromDayOffset(axisPaddingPx: number, dayWidthPx: number, dayOffset: number): number {
    return axisPaddingPx + dayOffset * dayWidthPx;
  }

  private isVisible(positionPx: number, visibleStartPx: number, visibleEndPx: number, overscanPx: number): boolean {
    return positionPx >= visibleStartPx - overscanPx && positionPx <= visibleEndPx + overscanPx;
  }
}
