import type {
  CampaignCalendarDto,
  CalendarStampDto,
  QuestNodeDto,
  QuestlineDto,
  TimelineEventDto,
  TimelineLaneKind,
} from "@shared/contracts";
import { GLOBAL_TIMELINE_LABEL } from "@shared/constants";
import { getCalendarCycleLabel } from "@renderer/utils/calendar";

export interface TimelineEventProjection {
  event: TimelineEventDto;
  ordinal: number;
  positionPx: number;
  stampLabel: string;
  questNodeId: string | null;
  questlineId: string | null;
  questlineTitle: string | null;
  questNodeTitle: string | null;
}

export interface TimelineQuestNodeProjection {
  id: string;
  questlineId: string;
  questlineTitle: string;
  title: string;
  parentNodeId: string | null;
  orderIndex: number;
  eventCount: number;
  ordinal: number;
  positionPx: number;
  stampLabel: string;
}

export interface TimelineQuestlineLaneProjection {
  id: string;
  title: string;
  status: QuestlineDto["status"];
  nodeCount: number;
  eventCount: number;
  nodes: TimelineQuestNodeProjection[];
}

export interface TimelineLaneProjection {
  key: string;
  kind: TimelineLaneKind;
  label: string;
  events: TimelineEventProjection[];
}

export interface TimelineQuestlineProjection {
  id: string;
  title: string;
  status: QuestlineDto["status"];
  nodeCount: number;
  eventCount: number;
  ordinal: number;
  positionPx: number;
  stampLabel: string;
}

export interface TimelineBoardProjection {
  calendarGuide: TimelineCalendarGuideProjection | null;
  questlineLanes: TimelineQuestlineLaneProjection[];
  questlines: TimelineQuestlineProjection[];
  lanes: TimelineLaneProjection[];
  rangeLabel: string;
  eventCount: number;
  questlineCount: number;
  questNodeCount: number;
}

export interface TimelineCalendarCycleEntryProjection {
  name: string;
  days: number;
  startDay: number;
  widthPercent: number;
}

export interface TimelineCalendarGuideProjection {
  name: string;
  epochLabel: string;
  timezoneLabel: string;
  cycleLabel: string;
  yearLengthDays: number;
  minutesPerDay: number;
  hoursPerDay: number;
  minutesPerHour: number;
  dayWidthPx: number;
  weekWidthPx: number;
  yearWidthPx: number;
  axisPaddingPx: number;
  axisWidthPx: number;
  axisStartOrdinal: number;
  axisEndOrdinal: number;
  startYear: number;
  endYear: number;
  totalYears: number;
  weekdayLabels: string[];
  cycleEntries: TimelineCalendarCycleEntryProjection[];
}

const TIMELINE_DAY_SLOT_WIDTH_PX = 20;
const TIMELINE_AXIS_EDGE_DAYS = 0;

export function buildTimelineBoardProjection(
  events: TimelineEventDto[],
  questlines: QuestlineDto[],
  questNodes: QuestNodeDto[],
  calendar: CampaignCalendarDto | null,
  extraYears = 0,
): TimelineBoardProjection {
  const nodeById = new Map(questNodes.map((node) => [node.id, node]));
  const questlineById = new Map(questlines.map((questline) => [questline.id, questline]));
  const questlineNodeCounts = new Map<string, number>();
  const questlineEventCounts = new Map<string, number>();
  const questNodeEventCounts = new Map<string, number>();
  const questlineAnchors = new Map<string, { ordinal: number; stampLabel: string }>();
  const questNodeEventAnchors = new Map<string, { ordinal: number; stampLabel: string }>();

  for (const node of questNodes) {
    questlineNodeCounts.set(node.questlineId, (questlineNodeCounts.get(node.questlineId) ?? 0) + 1);
  }

  const indexedEvents = events
    .map((event) => ({
      event,
      ordinal: getTimelineEventOrdinal(event.stamp, calendar),
      questNode: event.questNodeId ? nodeById.get(event.questNodeId) ?? null : null,
    }))
    .sort((left, right) => {
      if (left.ordinal !== right.ordinal) {
        return left.ordinal - right.ordinal;
      }

      const stampOrder = compareCalendarStamps(left.event.stamp, right.event.stamp);
      if (stampOrder !== 0) {
        return stampOrder;
      }

      return left.event.title.localeCompare(right.event.title);
    });

  const calendarGuide = buildCalendarGuide(calendar, indexedEvents, extraYears);
  for (const entry of indexedEvents) {
    if (!entry.questNode) {
      continue;
    }

    const questNode = entry.questNode;
    questlineEventCounts.set(questNode.questlineId, (questlineEventCounts.get(questNode.questlineId) ?? 0) + 1);
    questNodeEventCounts.set(questNode.id, (questNodeEventCounts.get(questNode.id) ?? 0) + 1);

    const existingAnchor = questNodeEventAnchors.get(questNode.id);
    if (!existingAnchor || entry.ordinal < existingAnchor.ordinal) {
      questNodeEventAnchors.set(questNode.id, {
        ordinal: entry.ordinal,
        stampLabel: formatStamp(entry.event.stamp, calendar),
      });
    }
  }

  function resolveQuestNodeAnchor(node: QuestNodeDto): { ordinal: number; stampLabel: string } {
    if (node.stamp) {
      return {
        ordinal: getTimelineEventOrdinal(node.stamp, calendar),
        stampLabel: formatStamp(node.stamp, calendar),
      };
    }

    const linkedEventAnchor = questNodeEventAnchors.get(node.id);
    if (linkedEventAnchor) {
      return linkedEventAnchor;
    }

    return {
      ordinal: parseTimestampOrdinal(node.createdAt),
      stampLabel: "Created",
    };
  }

  const questNodeAnchors = new Map<string, { ordinal: number; stampLabel: string }>();

  for (const node of questNodes) {
    const anchor = resolveQuestNodeAnchor(node);
    questNodeAnchors.set(node.id, anchor);

    const existingAnchor = questlineAnchors.get(node.questlineId);
    if (!existingAnchor || anchor.ordinal < existingAnchor.ordinal) {
      questlineAnchors.set(node.questlineId, anchor);
    }
  }

  const sortedQuestlines = [...questlines].sort((left, right) => {
    const leftAnchor = questlineAnchors.get(left.id);
    const rightAnchor = questlineAnchors.get(right.id);
    const leftOrdinal = leftAnchor?.ordinal ?? parseTimestampOrdinal(left.createdAt);
    const rightOrdinal = rightAnchor?.ordinal ?? parseTimestampOrdinal(right.createdAt);

    if (leftOrdinal !== rightOrdinal) {
      return leftOrdinal - rightOrdinal;
    }

    if (left.status !== right.status) {
      const order: Record<QuestlineDto["status"], number> = {
        draft: 0,
        active: 1,
        completed: 2,
      };

      return order[left.status] - order[right.status];
    }

    return left.title.localeCompare(right.title);
  });

  const questlineEntries = sortedQuestlines.map((questline) => {
    const anchor = questlineAnchors.get(questline.id) ?? null;
    return {
      id: questline.id,
      title: questline.title,
      status: questline.status,
      nodeCount: questlineNodeCounts.get(questline.id) ?? 0,
      eventCount: questlineEventCounts.get(questline.id) ?? 0,
      ordinal: anchor?.ordinal ?? parseTimestampOrdinal(questline.createdAt),
      stampLabel: anchor?.stampLabel ?? "Created",
      anchorOrdinal: anchor?.ordinal ?? null,
    };
  });

  const questlineCount = questlineEntries.length;
  const questNodeCount = questNodes.length;

  const questlineCards = questlineEntries.map((entry) => {
    let positionPx = calendarGuide?.axisPaddingPx ?? 0;

    if (calendarGuide && entry.anchorOrdinal !== null) {
      positionPx = positionFromOrdinal(entry.ordinal, calendarGuide);
    } else if (questlineCount > 1) {
      const questlineIndex = questlineEntries.findIndex((candidate) => candidate.id === entry.id);
      positionPx = spreadQuestlinePosition(questlineIndex >= 0 ? questlineIndex : 0, questlineCount, calendarGuide);
    }

    return {
      id: entry.id,
      title: entry.title,
      status: entry.status,
      nodeCount: entry.nodeCount,
      eventCount: entry.eventCount,
      ordinal: entry.ordinal,
      positionPx,
      stampLabel: entry.stampLabel,
    };
  });

  const questlineLanes = sortedQuestlines.map((questline) => {
    const nodes = questNodes
      .filter((node) => node.questlineId === questline.id)
      .map((node) => {
        const anchor = questNodeAnchors.get(node.id) ?? null;
        return {
          id: node.id,
          questlineId: node.questlineId,
          questlineTitle: questline.title,
          title: node.title,
          parentNodeId: node.parentNodeId,
          orderIndex: node.orderIndex,
          eventCount: questNodeEventCounts.get(node.id) ?? 0,
          ordinal: anchor?.ordinal ?? parseTimestampOrdinal(node.createdAt),
          stampLabel: anchor?.stampLabel ?? "Created",
        };
      })
      .sort((left, right) => {
        if (left.ordinal !== right.ordinal) {
          return left.ordinal - right.ordinal;
        }

        if (left.orderIndex !== right.orderIndex) {
          return left.orderIndex - right.orderIndex;
        }

        return left.title.localeCompare(right.title);
      });

    const hasAnchoredNode = nodes.some((node) => questNodeAnchors.has(node.id));
    const laneEntries = nodes.map((node, index) => {
      let positionPx = calendarGuide?.axisPaddingPx ?? 0;

      if (calendarGuide && hasAnchoredNode) {
        positionPx = positionFromOrdinal(node.ordinal, calendarGuide);
      } else if (nodes.length > 1) {
        positionPx = spreadQuestlinePosition(index, nodes.length, calendarGuide);
      }

      return {
        ...node,
        positionPx,
      };
    });

    return {
      id: questline.id,
      title: questline.title,
      status: questline.status,
      nodeCount: nodes.length,
      eventCount: questlineEventCounts.get(questline.id) ?? 0,
      nodes: laneEntries,
    };
  });

  const globalLaneKey = `global:${GLOBAL_TIMELINE_LABEL}`;
  const lanes = [
    {
      key: globalLaneKey,
      kind: "global" as const,
      label: GLOBAL_TIMELINE_LABEL,
      events: indexedEvents.map((entry, index) => {
        const questline = entry.questNode ? questlineById.get(entry.questNode.questlineId) ?? null : null;

        return {
          event: entry.event,
          ordinal: entry.ordinal,
          positionPx: calendarGuide ? positionFromOrdinal(entry.ordinal, calendarGuide) : spreadQuestlinePosition(index, indexedEvents.length, calendarGuide),
          stampLabel: formatStamp(entry.event.stamp, calendar),
          questNodeId: entry.questNode?.id ?? null,
          questlineId: questline?.id ?? null,
          questlineTitle: questline?.title ?? null,
          questNodeTitle: entry.questNode?.title ?? null,
        };
      }),
    },
  ];

  const rangeLabel = indexedEvents.length > 0 ? `${formatStamp(indexedEvents[0]!.event.stamp, calendar)} to ${formatStamp(indexedEvents[indexedEvents.length - 1]!.event.stamp, calendar)}` : "No timeline events yet";

  return {
    calendarGuide,
    questlineLanes,
    questlines: questlineCards,
    lanes,
    rangeLabel,
    eventCount: indexedEvents.length,
    questlineCount: questlineCards.length,
    questNodeCount,
  };
}

function buildCalendarGuide(
  calendar: CampaignCalendarDto | null,
  indexedEvents: { ordinal: number }[],
  extraYears = 0,
): TimelineCalendarGuideProjection | null {
  if (!calendar) {
    return null;
  }

  const hoursPerDay = Math.max(calendar.hoursPerDay, 1);
  const minutesPerHour = Math.max(calendar.minutesPerHour, 1);
  const minutesPerDay = hoursPerDay * minutesPerHour;
  const yearLengthDays = calendar.months.reduce((sum, month) => sum + Math.max(1, Math.floor(Number.isFinite(month.days) ? month.days : 1)), 0) || 1;
  const yearLengthMinutes = yearLengthDays * minutesPerDay;
  const minOrdinal = indexedEvents[0]?.ordinal ?? 0;
  const maxOrdinal = indexedEvents[indexedEvents.length - 1]?.ordinal ?? yearLengthMinutes - 1;
  const startYear = Math.floor(Math.max(minOrdinal, 0) / yearLengthMinutes) + 1;
  const baseEndYear = Math.floor(Math.max(maxOrdinal, 0) / yearLengthMinutes) + 1;
  const extensionYearCount = Math.max(0, Math.floor(extraYears));
  const endYear = baseEndYear + extensionYearCount;
  const totalYears = Math.max(1, endYear - startYear + 1);
  const axisStartOrdinal = (startYear - 1) * yearLengthMinutes;
  const axisEndOrdinal = endYear * yearLengthMinutes;
  const dayWidthPx = TIMELINE_DAY_SLOT_WIDTH_PX;
  const weekWidthPx = dayWidthPx * Math.max(calendar.weekdays.length, 1);
  const yearWidthPx = dayWidthPx * yearLengthDays;
  const axisPaddingPx = dayWidthPx * TIMELINE_AXIS_EDGE_DAYS;
  const axisWidthPx = axisPaddingPx * 2 + totalYears * yearWidthPx;
  let startDay = 0;

  const cycleEntries = calendar.months.map((month, index) => {
    const days = Math.max(1, Math.floor(Number.isFinite(month.days) ? month.days : 1));
    const entry: TimelineCalendarCycleEntryProjection = {
      name: month.name.trim() || `${getCalendarCycleLabel(calendar, false)} ${index + 1}`,
      days,
      startDay,
      widthPercent: (days / yearLengthDays) * 100,
    };

    startDay += days;
    return entry;
  });

  const weekdayLabels = calendar.weekdays.map((weekday, index) => weekday.trim() || `Weekday ${index + 1}`);

  return {
    name: calendar.name,
    epochLabel: calendar.epochLabel,
    timezoneLabel: calendar.timezoneLabel,
    cycleLabel: getCalendarCycleLabel(calendar, true),
    yearLengthDays,
    minutesPerDay,
    hoursPerDay,
    minutesPerHour,
    dayWidthPx,
    weekWidthPx,
    yearWidthPx,
    axisPaddingPx,
    axisWidthPx,
    axisStartOrdinal,
    axisEndOrdinal,
    startYear,
    endYear,
    totalYears,
    weekdayLabels,
    cycleEntries,
  };
}

export function formatStamp(stamp: CalendarStampDto, calendar: CampaignCalendarDto | null): string {
  const monthName = calendar?.months[stamp.month - 1]?.name ?? `Month ${stamp.month}`;
  const hour = String(stamp.hour).padStart(2, "0");
  const minute = String(stamp.minute).padStart(2, "0");
  return `Year ${stamp.year}, ${monthName} ${stamp.day} ${hour}:${minute}`;
}

export function getTimelineEventOrdinal(stamp: CalendarStampDto, calendar: CampaignCalendarDto | null): number {
  if (!calendar) {
    return fallbackOrdinal(stamp);
  }

  const minutesPerHour = Math.max(calendar.minutesPerHour, 1);
  const hoursPerDay = Math.max(calendar.hoursPerDay, 1);
  const dayMinutes = hoursPerDay * minutesPerHour;
  const yearMinutes = calendar.months.reduce((sum, month) => sum + Math.max(month.days, 1) * dayMinutes, 0) || dayMinutes;

  let monthOffset = 0;
  for (let index = 0; index < Math.max(stamp.month - 1, 0); index += 1) {
    const month = calendar.months[index];
    monthOffset += Math.max(month?.days ?? 0, 1) * dayMinutes;
  }

  const dayOffset = Math.max(stamp.day - 1, 0) * dayMinutes;
  const hourOffset = Math.max(stamp.hour, 0) * minutesPerHour;
  const minuteOffset = Math.max(stamp.minute, 0);
  return Math.max(stamp.year - 1, 0) * yearMinutes + monthOffset + dayOffset + hourOffset + minuteOffset;
}

function fallbackOrdinal(stamp: CalendarStampDto): number {
  const minutesPerHour = 60;
  const hoursPerDay = 24;
  const daysPerMonth = 30;
  const monthsPerYear = 12;
  const dayMinutes = hoursPerDay * minutesPerHour;
  const monthMinutes = daysPerMonth * dayMinutes;
  const yearMinutes = monthsPerYear * monthMinutes;

  return Math.max(stamp.year - 1, 0) * yearMinutes + Math.max(stamp.month - 1, 0) * monthMinutes + Math.max(stamp.day - 1, 0) * dayMinutes + Math.max(stamp.hour, 0) * minutesPerHour + Math.max(stamp.minute, 0);
}

function compareCalendarStamps(left: CalendarStampDto, right: CalendarStampDto): number {
  if (left.year !== right.year) {
    return left.year - right.year;
  }

  if (left.month !== right.month) {
    return left.month - right.month;
  }

  if (left.day !== right.day) {
    return left.day - right.day;
  }

  if (left.hour !== right.hour) {
    return left.hour - right.hour;
  }

  if (left.minute !== right.minute) {
    return left.minute - right.minute;
  }

  return 0;
}

function parseTimestampOrdinal(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function positionFromOrdinal(ordinal: number, calendarGuide: TimelineCalendarGuideProjection | null): number {
  if (!calendarGuide) {
    return 0;
  }

  const relativeMinutes = ordinal - calendarGuide.axisStartOrdinal;
  const relativeDays = relativeMinutes / calendarGuide.minutesPerDay;
  const position = calendarGuide.axisPaddingPx + relativeDays * calendarGuide.dayWidthPx;
  return Math.min(calendarGuide.axisWidthPx - calendarGuide.axisPaddingPx, Math.max(calendarGuide.axisPaddingPx, position));
}

export function getTimelineStampFromPosition(positionPx: number, calendarGuide: TimelineCalendarGuideProjection): CalendarStampDto {
  const safeYearLengthMinutes = Math.max(calendarGuide.yearLengthDays * calendarGuide.minutesPerDay, 1);
  const safeMinutesPerDay = Math.max(calendarGuide.minutesPerDay, 1);
  const safeMinutesPerHour = Math.max(calendarGuide.minutesPerHour, 1);
  const maxRelativeMinutes = Math.max(calendarGuide.totalYears * safeYearLengthMinutes - 1, 0);
  const clampedPositionPx = Math.min(calendarGuide.axisWidthPx - calendarGuide.axisPaddingPx, Math.max(calendarGuide.axisPaddingPx, positionPx));
  const relativeMinutes = Math.round(((clampedPositionPx - calendarGuide.axisPaddingPx) / Math.max(calendarGuide.dayWidthPx, 1)) * safeMinutesPerDay);
  const clampedRelativeMinutes = Math.min(maxRelativeMinutes, Math.max(0, relativeMinutes));
  const yearOffset = Math.floor(clampedRelativeMinutes / safeYearLengthMinutes);
  const minuteWithinYear = clampedRelativeMinutes - yearOffset * safeYearLengthMinutes;
  const dayOffset = Math.floor(minuteWithinYear / safeMinutesPerDay);
  const minuteWithinDay = minuteWithinYear - dayOffset * safeMinutesPerDay;
  const hour = Math.floor(minuteWithinDay / safeMinutesPerHour);
  const minute = minuteWithinDay - hour * safeMinutesPerHour;
  const yearDay = dayOffset + 1;

  let month = 1;
  let day = yearDay;
  for (let index = 0; index < calendarGuide.cycleEntries.length; index += 1) {
    const entry = calendarGuide.cycleEntries[index];
    const startDay = entry.startDay + 1;
    const endDay = entry.startDay + entry.days;

    if (yearDay >= startDay && yearDay <= endDay) {
      month = index + 1;
      day = yearDay - entry.startDay;
      break;
    }
  }

  return {
    year: calendarGuide.startYear + yearOffset,
    month,
    day,
    hour,
    minute,
  };
}

function spreadQuestlinePosition(index: number, count: number, calendarGuide: TimelineCalendarGuideProjection | null): number {
  if (count <= 1) {
    return calendarGuide?.axisPaddingPx ?? 0;
  }

  if (!calendarGuide) {
    return 0;
  }

  const usableWidthPx = Math.max(calendarGuide.axisWidthPx - calendarGuide.axisPaddingPx * 2, calendarGuide.dayWidthPx);
  const position = calendarGuide.axisPaddingPx + (index / Math.max(count - 1, 1)) * usableWidthPx;
  return Math.min(calendarGuide.axisWidthPx - calendarGuide.axisPaddingPx, Math.max(calendarGuide.axisPaddingPx, position));
}
