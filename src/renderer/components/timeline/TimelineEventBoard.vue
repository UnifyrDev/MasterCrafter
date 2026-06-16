<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import type { CalendarStampDto, CampaignCalendarDto, QuestNodeDto, QuestlineDto, TimelineEventDto, TimelineLaneKind } from "@shared/contracts";
import { GLOBAL_TIMELINE_LABEL } from "@shared/constants";
import {
  buildTimelineBoardProjection,
  formatStamp,
  getTimelineStampFromPosition,
  type TimelineCalendarGuideProjection,
  type TimelineQuestlineLaneProjection,
} from "@renderer/utils/timeline";
import { TimelineViewportStateService, type TimelineViewportState } from "@renderer/services/TimelineViewportStateService";
import {
  QuestlineLaneLayoutStateService,
  type QuestlineLaneLayoutState,
} from "@renderer/services/QuestlineLaneLayoutStateService";
import { TimelineRangeExtensionStateService } from "@renderer/services/TimelineRangeExtensionStateService";
import { TimelineRulerProjectionService } from "@renderer/services/TimelineRulerProjectionService";
import { hotkeyDispatcherService } from "@renderer/services/hotkeys";

const props = defineProps<{
  workspaceId: string | null;
  events: TimelineEventDto[];
  questlines: QuestlineDto[];
  questNodes: QuestNodeDto[];
  calendar: CampaignCalendarDto | null;
  selectedEventId: string | null;
  selectedQuestlineId: string | null;
  selectedQuestNodeId: string | null;
}>();

const emit = defineEmits<{
  (event: "open-event", eventId: string): void;
  (event: "open-questnode", questNodeId: string): void;
  (event: "create-event"): void;
  (event: "create-questline"): void;
  (event: "create-questnode", payload: { questlineId: string; stamp: CalendarStampDto }): void;
  (event: "select-questline", questlineId: string): void;
  (event: "select-questnode", questNodeId: string | null): void;
  (event: "delete-event", eventId: string): void;
  (event: "delete-questnode", questNodeId: string): void;
}>();

const viewportStateService = TimelineViewportStateService.getInstance();
const questlineLaneLayoutStateService = QuestlineLaneLayoutStateService.getInstance();
const timelineRangeExtensionStateService = TimelineRangeExtensionStateService.getInstance();
const timelineRulerProjectionService = TimelineRulerProjectionService.getInstance();
const activeWorkspaceId = ref<string | null>(null);
const timelineExtensionYears = ref(0);
const timelineStageRef = ref<HTMLElement | null>(null);
const timelineStageWidthPx = ref(0);
const laneAlignmentStyles = reactive<Record<string, TimelineLaneAlignment>>({});
const questlineLaneLayoutStyles = reactive<Record<string, QuestlineLaneLayoutState>>({});
let laneAlignmentFrameId: number | null = null;
let laneAlignmentResizeObserver: ResizeObserver | null = null;
let unregisterHotkeys: (() => void) | null = null;

const MIN_TIME_ZOOM = 0.5;
const MAX_TIME_ZOOM = 48;
const TIME_ZOOM_STEP = 1.22;
const TIMELINE_MARKER_SIZE_PX = 11;
const TIMELINE_CARD_COLLISION_THRESHOLD_PX = 16;
const TIMELINE_CARD_STAGGER_GAP_PX = 14;
const TIMELINE_CARD_STAGGER_STEP_PX = 12;
const CAMPAIGN_LANE_BASE_HEIGHT_PX = 96;
const CAMPAIGN_LANE_NODE_GROWTH_PX = 8;
const QUESTLINE_LANE_BASE_HEIGHT_PX = CAMPAIGN_LANE_BASE_HEIGHT_PX / 2;
const QUESTLINE_LANE_NODE_GROWTH_PX = CAMPAIGN_LANE_NODE_GROWTH_PX / 2;
const QUESTLINE_EMPTY_TRACK_WIDTH_PX = 320;
const QUESTLINE_CARD_EXPANDED_WIDTH_PX = 248;
const QUESTLINE_TRACK_EDGE_PADDING_PX = 32;
const TIMELINE_CARD_EDGE_ANCHOR_BUFFER_PX = QUESTLINE_CARD_EXPANDED_WIDTH_PX / 2;
const LANE_TRACK_ALIGNMENT_GAP_PX = 15;
const QUESTLINE_LANE_RESIZE_HANDLE_WIDTH_PX = 12;
const GLOBAL_TIMELINE_LANE_HEIGHT_MULTIPLIER = 4;
const GLOBAL_TIMELINE_LANE_TRACK_OFFSET_PX = 80;
const timelineExtensionControlStyle: Record<string, string> = {
  position: "absolute",
  top: "50%",
  right: "0",
  transform: "translateY(-50%)",
  zIndex: "6",
  pointerEvents: "auto",
  appearance: "none",
  font: "inherit",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  padding: "0.55rem 0.9rem",
  borderRadius: "999px",
  border: "1px solid rgba(244, 202, 58, 0.42)",
  background:
    "linear-gradient(180deg, rgba(44, 35, 10, 0.98), rgba(22, 18, 8, 0.98)), linear-gradient(90deg, rgba(244, 202, 58, 0.18), rgba(255, 255, 255, 0.02))",
  color: "rgba(255, 236, 186, 0.98)",
  fontSize: "0.82rem",
  fontWeight: "700",
  letterSpacing: "0.02em",
  boxShadow: "0 12px 28px rgba(0, 0, 0, 0.34), 0 0 0 1px rgba(255, 255, 255, 0.03) inset, 0 0 16px rgba(244, 202, 58, 0.12)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

type TimelineCardPlacementMode = "center" | "above" | "below";
type TimelineCardAnchor = "start" | "center" | "end";

type TimelineLaneAlignmentKind = "questline" | "event";
type QuestlineLaneResizeEdge = "left" | "right";

interface TimelineLaneAlignment {
  shiftX: number;
  shiftY: number;
}

const EMPTY_LANE_ALIGNMENT: Readonly<TimelineLaneAlignment> = Object.freeze({
  shiftX: 0,
  shiftY: 0,
});

interface TimelineCardPlacement {
  mode: TimelineCardPlacementMode;
  gapPx: number;
  anchor: TimelineCardAnchor;
}

interface QuestlineLaneResizeSession {
  active: boolean;
  laneId: string | null;
  edge: QuestlineLaneResizeEdge | null;
  pointerId: number | null;
  startClientX: number;
  startWidthPx: number;
  startOffsetXPx: number;
  handleElement: HTMLElement | null;
}

interface QuestlineLaneMoveSession {
  active: boolean;
  laneId: string | null;
  pointerId: number | null;
  startClientX: number;
  startOffsetXPx: number;
  handleElement: HTMLElement | null;
}

interface QuestlineLaneWidthSource {
  id?: string;
  nodes?: Array<{ positionPx: number }>;
}

const CENTER_CARD_PLACEMENT: TimelineCardPlacement = { mode: "center", gapPx: 0, anchor: "center" };
const questlineLaneResizeSession: QuestlineLaneResizeSession = {
  active: false,
  laneId: null,
  edge: null,
  pointerId: null,
  startClientX: 0,
  startWidthPx: 0,
  startOffsetXPx: 0,
  handleElement: null,
};
const questlineLaneMoveSession: QuestlineLaneMoveSession = {
  active: false,
  laneId: null,
  pointerId: null,
  startClientX: 0,
  startOffsetXPx: 0,
  handleElement: null,
};

const timelineViewport = reactive({
  zoomX: 1,
  translateX: 0,
  translateY: 0,
  panning: false,
  panAxis: null as "x" | "y" | null,
  pointerId: null as number | null,
  startClientX: 0,
  startClientY: 0,
  startTranslateX: 0,
  startTranslateY: 0,
  dragThreshold: 4,
});

const projection = computed(() =>
  buildTimelineBoardProjection(props.events, props.questlines, props.questNodes, props.calendar, timelineExtensionYears.value),
);
const questlineCardPlacements = computed(() =>
  buildLaneCardPlacements(
    projection.value.questlineLanes,
    timelineViewport.zoomX,
    (node) => node.id,
    (lane) => questlineLaneTrackWidthPx(lane),
  ),
);
const eventCardPlacements = computed(() =>
  buildLaneCardPlacements(
    projection.value.lanes,
    timelineViewport.zoomX,
    (event) => event.event.id,
    () => (projection.value.calendarGuide ? projection.value.calendarGuide.axisWidthPx * Math.max(timelineViewport.zoomX, 0.0001) : 0),
  ),
);

const timelineCanvasStyle = computed(() => ({
  transform: `translate3d(0, ${timelineViewport.translateY}px, 0)`,
  transformOrigin: "0 0",
  willChange: "transform",
}));

const timelineCanvasPanXStyle = computed(() => ({
  transform: `translate3d(${timelineViewport.translateX}px, 0, 0)`,
  transformOrigin: "0 0",
  willChange: "transform",
}));

const timelineRulerProjection = computed(() =>
  timelineRulerProjectionService.buildProjection(
    projection.value.calendarGuide,
    timelineViewport.zoomX,
    timelineStageWidthPx.value,
    timelineViewport.translateX,
  ),
);

const timelineRulerStageStyle = computed(() => ({
  "--timeline-ruler-height": `${timelineRulerProjection.value.heightPx}px`,
  "--timeline-ruler-track-width": `${timelineRulerProjection.value.trackWidthPx}px`,
}));

const timelineChromeStyle = computed(() => ({
  transform: `translate3d(0, ${timelineViewport.translateY}px, 0)`,
  transformOrigin: "0 0",
  willChange: "transform",
}));

const timelineStageStyle = computed(() => ({
  cursor: timelineViewport.panning ? "grabbing" : "grab",
  touchAction: "none",
  ...buildTimelineAxisStyle(projection.value.calendarGuide, timelineViewport.zoomX),
}));

function laneAlignmentKey(kind: TimelineLaneAlignmentKind, laneId: string): string {
  return `${kind}:${laneId}`;
}

function laneAlignmentStyle(kind: TimelineLaneAlignmentKind, laneId: string): Record<string, string> {
  const alignment = laneAlignmentStyles[laneAlignmentKey(kind, laneId)];
  if (!alignment) {
    return {
      "--timeline-lane-track-shift-x": `${EMPTY_LANE_ALIGNMENT.shiftX}px`,
      "--timeline-lane-track-offset-y": `${EMPTY_LANE_ALIGNMENT.shiftY}px`,
    };
  }

  return {
    "--timeline-lane-track-shift-x": `${alignment.shiftX}px`,
    "--timeline-lane-track-offset-y": `${alignment.shiftY}px`,
  };
}

function campaignLaneAlignmentStyle(lane: { key: string; kind: TimelineLaneKind }): Record<string, string> {
  const alignment = laneAlignmentStyle("event", lane.key);
  if (lane.kind !== "global") {
    return alignment;
  }

  const baseOffsetY = Number.parseFloat(alignment["--timeline-lane-track-offset-y"] ?? "0");
  return {
    ...alignment,
    "--timeline-lane-track-offset-y": `${baseOffsetY + GLOBAL_TIMELINE_LANE_TRACK_OFFSET_PX}px`,
  };
}

function scheduleLaneAlignmentMeasurement(): void {
  if (laneAlignmentFrameId !== null) {
    cancelAnimationFrame(laneAlignmentFrameId);
  }

  laneAlignmentFrameId = requestAnimationFrame(() => {
    laneAlignmentFrameId = null;
    void nextTick(() => {
      measureLaneAlignments();
    });
  });
}

function measureLayerLaneAlignments(
  kind: TimelineLaneAlignmentKind,
  canvasSelector: string,
  chromeSelector: string,
  activeKeys: Set<string>,
): void {
  const stage = timelineStageRef.value;
  if (!stage) {
    return;
  }

  const chromeLanes = new Map<string, HTMLElement>();
  stage.querySelectorAll<HTMLElement>(chromeSelector).forEach((lane) => {
    const laneId = lane.dataset.timelineLaneId;
    if (laneId) {
      chromeLanes.set(laneId, lane);
    }
  });

  stage.querySelectorAll<HTMLElement>(canvasSelector).forEach((lane) => {
    const laneId = lane.dataset.timelineLaneId;
    if (!laneId) {
      return;
    }

    const chromeLane = chromeLanes.get(laneId);
    const canvasAnchor = lane.querySelector<HTMLElement>(".timeline-lane-track-anchor");
    const chromeLabel = chromeLane?.querySelector<HTMLElement>(".timeline-lane-label");
    if (!chromeLane || !canvasAnchor || !chromeLabel) {
      return;
    }

    const canvasRect = canvasAnchor.getBoundingClientRect();
    const chromeTitle = chromeLabel.querySelector<HTMLElement>("button, strong");
    const chromeRect = (chromeTitle ?? chromeLabel).getBoundingClientRect();
    const key = laneAlignmentKey(kind, laneId);
    const shiftX = Math.round(chromeRect.left - (canvasRect.left - timelineViewport.translateX));
    const shiftY = Math.round(chromeRect.bottom + LANE_TRACK_ALIGNMENT_GAP_PX - canvasRect.top);
    const current = laneAlignmentStyles[key];
    if (current && current.shiftX === shiftX && current.shiftY === shiftY) {
      activeKeys.add(key);
      return;
    }

    laneAlignmentStyles[key] = { shiftX, shiftY };
    activeKeys.add(key);
  });
}

function measureLaneAlignments(): void {
  const activeKeys = new Set<string>();
  measureLayerLaneAlignments(
    "questline",
    ".timeline-canvas-layer .timeline-questline-strip .questline-lane[data-timeline-lane-id]",
    ".timeline-chrome .timeline-questline-strip .questline-lane[data-timeline-lane-id]",
    activeKeys,
  );
  measureLayerLaneAlignments(
    "event",
    ".timeline-canvas-layer .timeline-event-strip .timeline-lane[data-timeline-lane-id]",
    ".timeline-chrome .timeline-event-strip .timeline-lane[data-timeline-lane-id]",
    activeKeys,
  );

  for (const key of Object.keys(laneAlignmentStyles)) {
    if (!activeKeys.has(key)) {
      delete laneAlignmentStyles[key];
    }
  }
}

watch(
  () => props.workspaceId,
  (nextWorkspaceId, previousWorkspaceId) => {
    if (previousWorkspaceId && previousWorkspaceId !== nextWorkspaceId) {
      persistViewportState(previousWorkspaceId);
      persistQuestlineLaneLayouts(previousWorkspaceId);
      persistTimelineExtensionState(previousWorkspaceId);
    }

    if (!nextWorkspaceId) {
      applyViewportState(viewportStateService.getDefaultViewport());
      replaceQuestlineLaneLayouts({});
      timelineExtensionYears.value = 0;
      activeWorkspaceId.value = null;
      return;
    }

    activeWorkspaceId.value = nextWorkspaceId;
    const savedViewport = viewportStateService.loadViewport(nextWorkspaceId);
    applyViewportState(savedViewport ?? viewportStateService.getDefaultViewport());
    replaceQuestlineLaneLayouts(questlineLaneLayoutStateService.loadWorkspaceLayouts(nextWorkspaceId));
    timelineExtensionYears.value = timelineRangeExtensionStateService.loadExtensionYears(nextWorkspaceId);
  },
  { immediate: true },
);

watch(
  () => [projection.value, timelineViewport.zoomX, timelineViewport.translateY],
  () => {
    scheduleLaneAlignmentMeasurement();
  },
  { immediate: true, flush: "post" },
);

onMounted(() => {
  registerHotkeys();

  if (typeof ResizeObserver === "undefined") {
    if (timelineStageRef.value) {
      timelineStageWidthPx.value = Math.max(0, Math.round(timelineStageRef.value.clientWidth));
    }

    return;
  }

  laneAlignmentResizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (entry) {
      timelineStageWidthPx.value = Math.max(0, Math.round(entry.contentRect.width));
    } else if (timelineStageRef.value) {
      timelineStageWidthPx.value = Math.max(0, Math.round(timelineStageRef.value.clientWidth));
    }

    scheduleLaneAlignmentMeasurement();
  });

  if (timelineStageRef.value) {
    timelineStageWidthPx.value = Math.max(0, Math.round(timelineStageRef.value.clientWidth));
    laneAlignmentResizeObserver.observe(timelineStageRef.value);
  }

  scheduleLaneAlignmentMeasurement();
});

onBeforeUnmount(() => {
  unregisterHotkeys?.();
  unregisterHotkeys = null;
  persistViewportState();
  persistQuestlineLaneLayouts();
  persistTimelineExtensionState();
  if (laneAlignmentFrameId !== null) {
    cancelAnimationFrame(laneAlignmentFrameId);
    laneAlignmentFrameId = null;
  }

  laneAlignmentResizeObserver?.disconnect();
  laneAlignmentResizeObserver = null;
});

function registerHotkeys(): void {
  unregisterHotkeys?.();
  unregisterHotkeys = hotkeyDispatcherService.registerScope({
    scopeId: "timeline-board-viewport",
    scopeType: "view",
    contextId: "timeline-board",
    handlers: {
      "timeline.zoomIn": () => zoomIn(),
      "timeline.zoomOut": () => zoomOut(),
      "timeline.resetViewport": () => resetViewport(),
    },
  });
}

function applyViewportState(viewport: TimelineViewportState): void {
  timelineViewport.zoomX = viewport.zoomX;
  timelineViewport.translateX = viewport.translateX;
  timelineViewport.translateY = viewport.translateY;
}

function currentViewportState(): TimelineViewportState {
  return {
    zoomX: timelineViewport.zoomX,
    translateX: timelineViewport.translateX,
    translateY: timelineViewport.translateY,
  };
}

function persistViewportState(workspaceId = activeWorkspaceId.value): void {
  if (!workspaceId) {
    return;
  }

  viewportStateService.saveViewport(workspaceId, currentViewportState());
}

function resetViewport(): void {
  timelineViewport.zoomX = 1;
  timelineViewport.translateX = 0;
  timelineViewport.translateY = 0;
  persistViewportState();
}

function clampTimeZoom(value: number): number {
  return Math.min(MAX_TIME_ZOOM, Math.max(MIN_TIME_ZOOM, value));
}

function zoomTo(nextZoomX: number, focusX?: number): void {
  const clampedZoomX = clampTimeZoom(nextZoomX);
  if (!Number.isFinite(clampedZoomX) || clampedZoomX <= 0) {
    return;
  }

  if (typeof focusX !== "number" || !Number.isFinite(focusX)) {
    timelineViewport.zoomX = clampedZoomX;
    persistViewportState();
    return;
  }

  const currentZoomX = timelineViewport.zoomX;
  const zoomRatio = clampedZoomX / Math.max(currentZoomX, 0.0001);
  timelineViewport.translateX = focusX - (focusX - timelineViewport.translateX) * zoomRatio;
  timelineViewport.zoomX = clampedZoomX;
  persistViewportState();
}

function zoomIn(): void {
  const stage = timelineStageRef.value;
  if (!stage) {
    return;
  }

  const rect = stage.getBoundingClientRect();
  zoomTo(timelineViewport.zoomX * TIME_ZOOM_STEP, rect.width / 2);
}

function zoomOut(): void {
  const stage = timelineStageRef.value;
  if (!stage) {
    return;
  }

  const rect = stage.getBoundingClientRect();
  zoomTo(timelineViewport.zoomX / TIME_ZOOM_STEP, rect.width / 2);
}

function canZoomFromTarget(target: HTMLElement | null): boolean {
  if (!target) {
    return true;
  }

  return target.closest(".timeline-bottom-toolbar, .timeline-tooltip") === null;
}

function handleWheel(event: WheelEvent): void {
  const target = event.target as HTMLElement | null;
  if (!canZoomFromTarget(target)) {
    return;
  }

  const stage = timelineStageRef.value;
  if (!stage) {
    return;
  }

  event.preventDefault();

  const rect = stage.getBoundingClientRect();
  const cursorX = event.clientX - rect.left;
  const primaryDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  const direction = primaryDelta < 0 ? 1 : -1;
  const multiplier = Math.exp(direction * 0.18);
  zoomTo(timelineViewport.zoomX * multiplier, cursorX);
}

function replaceQuestlineLaneLayouts(nextLayouts: Record<string, QuestlineLaneLayoutState>): void {
  for (const key of Object.keys(questlineLaneLayoutStyles)) {
    delete questlineLaneLayoutStyles[key];
  }

  for (const [laneId, layout] of Object.entries(nextLayouts)) {
    questlineLaneLayoutStyles[laneId] = {
      ...layout,
      offsetXPx: clampQuestlineLaneOffsetXPx(layout.offsetXPx),
    };
  }
}

function persistQuestlineLaneLayouts(workspaceId = activeWorkspaceId.value): void {
  if (!workspaceId) {
    return;
  }

  const normalizedLayouts: Record<string, QuestlineLaneLayoutState> = {};
  for (const [laneId, layout] of Object.entries(questlineLaneLayoutStyles)) {
    normalizedLayouts[laneId] = {
      ...layout,
      offsetXPx: clampQuestlineLaneOffsetXPx(layout.offsetXPx),
    };
  }

  questlineLaneLayoutStateService.saveWorkspaceLayouts(workspaceId, normalizedLayouts);
}

function persistTimelineExtensionState(workspaceId = activeWorkspaceId.value): void {
  if (!workspaceId) {
    return;
  }

  timelineRangeExtensionStateService.saveExtensionYears(workspaceId, timelineExtensionYears.value);
}

function questlineLaneAutoWidthPx(lane: QuestlineLaneWidthSource): number {
  if ((lane.nodes ?? []).length === 0) {
    return QUESTLINE_EMPTY_TRACK_WIDTH_PX;
  }

  const safeZoomX = Math.max(timelineViewport.zoomX, 0.0001);
  const furthestRightEdgePx = (lane.nodes ?? []).reduce((max, node) => Math.max(max, node.positionPx * safeZoomX + QUESTLINE_CARD_EXPANDED_WIDTH_PX), 0);
  return Math.max(QUESTLINE_EMPTY_TRACK_WIDTH_PX, furthestRightEdgePx + QUESTLINE_TRACK_EDGE_PADDING_PX);
}

function questlineLaneTrackWidthPx(lane: QuestlineLaneWidthSource): number {
  const laneId = lane.id ?? "";
  const customWidthPx = laneId ? (questlineLaneLayoutStyles[laneId]?.widthPx ?? 0) * Math.max(timelineViewport.zoomX, 0.0001) : 0;
  const autoWidthPx = questlineLaneAutoWidthPx(lane);
  return customWidthPx > 0 ? customWidthPx : autoWidthPx;
}

function questlineLaneTrackStyle(lane: QuestlineLaneWidthSource): Record<string, string> {
  const laneId = lane.id ?? "";
  const layout = laneId ? questlineLaneLayoutStyles[laneId] ?? questlineLaneLayoutStateService.getDefaultLayout() : questlineLaneLayoutStateService.getDefaultLayout();
  const safeZoomX = Math.max(timelineViewport.zoomX, 0.0001);
  const clampedOffsetXPx = clampQuestlineLaneOffsetXPx(layout.offsetXPx);
  return {
    "--timeline-lane-track-width": `${Math.ceil(questlineLaneTrackWidthPx(lane))}px`,
    "--timeline-lane-track-offset-x": `${Math.round(clampedOffsetXPx * safeZoomX)}px`,
  };
}

function clampQuestlineLaneOffsetXPx(offsetXPx: number): number {
  return Number.isFinite(offsetXPx) ? Math.max(0, offsetXPx) : 0;
}

function questlineLaneViewportStyle(_lane?: QuestlineLaneWidthSource): Record<string, string> {
  return {
    borderTop: "2px solid rgba(244, 202, 58, 0.95)",
    borderBottom: "2px solid rgba(244, 202, 58, 0.95)",
    borderLeft: "1px solid rgba(244, 202, 58, 0.55)",
    borderRight: "1px solid rgba(244, 202, 58, 0.55)",
    background: "transparent",
    boxShadow: "0 0 0 1px rgba(244, 202, 58, 0.08) inset",
  };
}

function beginQuestlineLaneResize(laneId: string, edge: QuestlineLaneResizeEdge, event: PointerEvent): void {
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  const lane = projection.value.questlineLanes.find((candidate) => candidate.id === laneId);
  if (!lane) {
    return;
  }

  const currentLayout = questlineLaneLayoutStyles[laneId] ?? questlineLaneLayoutStateService.getDefaultLayout();
  questlineLaneResizeSession.active = true;
  questlineLaneResizeSession.laneId = laneId;
  questlineLaneResizeSession.edge = edge;
  questlineLaneResizeSession.pointerId = event.pointerId;
  questlineLaneResizeSession.startClientX = event.clientX;
  questlineLaneResizeSession.startWidthPx = questlineLaneTrackWidthPx(lane);
  questlineLaneResizeSession.startOffsetXPx = currentLayout.offsetXPx;
  questlineLaneResizeSession.handleElement = event.currentTarget as HTMLElement | null;

  const handle = questlineLaneResizeSession.handleElement;
  if (handle && !handle.hasPointerCapture(event.pointerId)) {
    handle.setPointerCapture(event.pointerId);
  }
}

function beginQuestlineLaneMove(laneId: string, event: PointerEvent): void {
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  const lane = projection.value.questlineLanes.find((candidate) => candidate.id === laneId);
  if (!lane) {
    return;
  }

  const currentLayout = questlineLaneLayoutStyles[laneId] ?? questlineLaneLayoutStateService.getDefaultLayout();
  questlineLaneMoveSession.active = true;
  questlineLaneMoveSession.laneId = laneId;
  questlineLaneMoveSession.pointerId = event.pointerId;
  questlineLaneMoveSession.startClientX = event.clientX;
  questlineLaneMoveSession.startOffsetXPx = currentLayout.offsetXPx;
  questlineLaneMoveSession.handleElement = event.currentTarget as HTMLElement | null;

  const surface = questlineLaneMoveSession.handleElement;
  if (surface && !surface.hasPointerCapture(event.pointerId)) {
    surface.setPointerCapture(event.pointerId);
  }
}

function updateQuestlineLaneResize(event: PointerEvent): void {
  if (!questlineLaneResizeSession.active || questlineLaneResizeSession.pointerId !== event.pointerId || !questlineLaneResizeSession.laneId || !questlineLaneResizeSession.edge) {
    return;
  }

  const lane = projection.value.questlineLanes.find((candidate) => candidate.id === questlineLaneResizeSession.laneId);
  if (!lane) {
    return;
  }

  const safeZoomX = Math.max(timelineViewport.zoomX, 0.0001);
  const deltaX = event.clientX - questlineLaneResizeSession.startClientX;
  let nextWidthPx = questlineLaneResizeSession.startWidthPx;
  let nextOffsetXPx = questlineLaneResizeSession.startOffsetXPx;
  const normalizedStartOffsetXPx = clampQuestlineLaneOffsetXPx(questlineLaneResizeSession.startOffsetXPx);

  if (questlineLaneResizeSession.edge === "right") {
    nextWidthPx = Math.max(1, questlineLaneResizeSession.startWidthPx + deltaX);
  } else {
    const proposedWidthPx = Math.max(1, questlineLaneResizeSession.startWidthPx - deltaX);
    const widthDeltaPx = proposedWidthPx - questlineLaneResizeSession.startWidthPx;
    nextWidthPx = proposedWidthPx;
    nextOffsetXPx = questlineLaneResizeSession.startOffsetXPx - widthDeltaPx / safeZoomX;
    if (nextOffsetXPx < 0) {
      const currentRightPx = normalizedStartOffsetXPx * safeZoomX + questlineLaneResizeSession.startWidthPx;
      nextOffsetXPx = 0;
      nextWidthPx = Math.max(1, currentRightPx);
    }
  }

  questlineLaneLayoutStyles[lane.id] = {
    widthPx: nextWidthPx / safeZoomX,
    offsetXPx: clampQuestlineLaneOffsetXPx(nextOffsetXPx),
  };
}

function updateQuestlineLaneMove(event: PointerEvent): void {
  if (!questlineLaneMoveSession.active || questlineLaneMoveSession.pointerId !== event.pointerId || !questlineLaneMoveSession.laneId) {
    return;
  }

  const lane = projection.value.questlineLanes.find((candidate) => candidate.id === questlineLaneMoveSession.laneId);
  if (!lane) {
    return;
  }

  const safeZoomX = Math.max(timelineViewport.zoomX, 0.0001);
  const deltaX = event.clientX - questlineLaneMoveSession.startClientX;
  const currentLayout = questlineLaneLayoutStyles[lane.id] ?? questlineLaneLayoutStateService.getDefaultLayout();
  questlineLaneLayoutStyles[lane.id] = {
    widthPx: currentLayout.widthPx,
    offsetXPx: clampQuestlineLaneOffsetXPx(questlineLaneMoveSession.startOffsetXPx + deltaX / safeZoomX),
  };
}

function handleStagePointerMove(event: PointerEvent): void {
  updatePan(event);
  updateQuestlineLaneResize(event);
  updateQuestlineLaneMove(event);
}

function stopQuestlineLaneResize(event?: PointerEvent, persist = true): void {
  if (!questlineLaneResizeSession.active) {
    return;
  }

  if (event && questlineLaneResizeSession.pointerId === event.pointerId) {
    const handle = questlineLaneResizeSession.handleElement;
    if (handle && handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
  }

  questlineLaneResizeSession.active = false;
  questlineLaneResizeSession.laneId = null;
  questlineLaneResizeSession.edge = null;
  questlineLaneResizeSession.pointerId = null;
  questlineLaneResizeSession.startClientX = 0;
  questlineLaneResizeSession.startWidthPx = 0;
  questlineLaneResizeSession.startOffsetXPx = 0;
  questlineLaneResizeSession.handleElement = null;

  if (persist) {
    persistQuestlineLaneLayouts();
  }
}

function stopQuestlineLaneMove(event?: PointerEvent, persist = true): void {
  if (!questlineLaneMoveSession.active) {
    return;
  }

  if (event && questlineLaneMoveSession.pointerId === event.pointerId) {
    const surface = questlineLaneMoveSession.handleElement;
    if (surface && surface.hasPointerCapture(event.pointerId)) {
      surface.releasePointerCapture(event.pointerId);
    }
  }

  questlineLaneMoveSession.active = false;
  questlineLaneMoveSession.laneId = null;
  questlineLaneMoveSession.pointerId = null;
  questlineLaneMoveSession.startClientX = 0;
  questlineLaneMoveSession.startOffsetXPx = 0;
  questlineLaneMoveSession.handleElement = null;

  if (persist) {
    persistQuestlineLaneLayouts();
  }
}

function questlineLaneHeight(laneId: string, nodeCount: number): string {
  return `${laneHeightPx(laneId, nodeCount, questlineCardPlacements.value, QUESTLINE_LANE_BASE_HEIGHT_PX, QUESTLINE_LANE_NODE_GROWTH_PX)}px`;
}

function campaignLaneHeight(laneKey: string, eventCount: number, laneKind: TimelineLaneKind): string {
  const heightMultiplier = laneKind === "global" ? GLOBAL_TIMELINE_LANE_HEIGHT_MULTIPLIER : 1;
  return `${laneHeightPx(laneKey, eventCount, eventCardPlacements.value, CAMPAIGN_LANE_BASE_HEIGHT_PX, CAMPAIGN_LANE_NODE_GROWTH_PX) * heightMultiplier}px`;
}

function campaignLaneTrackStyle(laneKind: TimelineLaneKind): Record<string, string> {
  if (laneKind !== "global") {
    return {};
  }

  return {
    "--timeline-lane-track-min-height": "8rem",
  };
}

function laneHeightPx(
  laneKey: string,
  itemCount: number,
  placements: Map<string, Map<string, TimelineCardPlacement>>,
  baseLaneHeightPx: number,
  itemGrowthPx: number,
): number {
  const lanePlacements = placements.get(laneKey);
  let maxGapPx = 0;

  lanePlacements?.forEach((placement) => {
    maxGapPx = Math.max(maxGapPx, placement.gapPx);
  });

  const itemGrowth = Math.max(0, itemCount - 1) * itemGrowthPx;
  const placementEnvelopePx = maxGapPx > 0 ? maxGapPx * 2 + TIMELINE_MARKER_SIZE_PX + 16 : 0;

  return Math.max(baseLaneHeightPx, baseLaneHeightPx + itemGrowth, placementEnvelopePx);
}

function buildLaneCardPlacements<T extends { positionPx: number }>(
  lanes: Array<{ key?: string; id?: string; events?: T[]; nodes?: T[] }>,
  zoomX: number,
  getItemId: (item: T) => string,
  getLaneWidthPx: (lane: { key?: string; id?: string; events?: T[]; nodes?: T[] }) => number,
): Map<string, Map<string, TimelineCardPlacement>> {
  const placements = new Map<string, Map<string, TimelineCardPlacement>>();
  const safeZoomX = Math.max(zoomX, 0.0001);

  for (const lane of lanes) {
    const laneKey = lane.key ?? lane.id;
    if (!laneKey) {
      continue;
    }

    const laneWidthPx = Math.max(getLaneWidthPx(lane), 0);
    const items = [...(lane.events ?? lane.nodes ?? [])]
      .map((item, index) => ({
        ...item,
        itemId: getItemId(item),
        index,
        scaledPosition: item.positionPx * safeZoomX,
      }))
      .sort((left, right) => {
        if (left.scaledPosition !== right.scaledPosition) {
          return left.scaledPosition - right.scaledPosition;
        }

        return left.index - right.index;
      });

    const lanePlacements = new Map<string, TimelineCardPlacement>();
    let cluster: Array<(typeof items)[number]> = [];
    let lastPosition = Number.NEGATIVE_INFINITY;

    const flushCluster = (): void => {
      if (cluster.length === 0) {
        return;
      }

      if (cluster.length === 1) {
        const item = cluster[0]!;
        lanePlacements.set(item.itemId, {
          mode: "center",
          gapPx: 0,
          anchor: resolveCardAnchor(item.scaledPosition, laneWidthPx),
        });
        cluster = [];
        return;
      }

      cluster.forEach((item, index) => {
        const level = Math.floor(index / 2);
        const mode: TimelineCardPlacementMode = index % 2 === 0 ? "above" : "below";
        lanePlacements.set(item.itemId, {
          mode,
          gapPx: Math.max(TIMELINE_CARD_STAGGER_GAP_PX + level * TIMELINE_CARD_STAGGER_STEP_PX, TIMELINE_MARKER_SIZE_PX + 4),
          anchor: resolveCardAnchor(item.scaledPosition, laneWidthPx),
        });
      });

      cluster = [];
    };

    for (const item of items) {
      if (cluster.length === 0 || item.scaledPosition - lastPosition <= TIMELINE_CARD_COLLISION_THRESHOLD_PX) {
        cluster.push(item);
      } else {
        flushCluster();
        cluster = [item];
      }

      lastPosition = item.scaledPosition;
    }

    flushCluster();
    placements.set(laneKey, lanePlacements);
  }

  return placements;
}

function resolveCardAnchor(scaledPositionPx: number, laneWidthPx: number): TimelineCardAnchor {
  if (!Number.isFinite(laneWidthPx) || laneWidthPx <= 0) {
    return "center";
  }

  const edgeBufferPx = Math.min(TIMELINE_CARD_EDGE_ANCHOR_BUFFER_PX, laneWidthPx / 2);
  if (scaledPositionPx <= edgeBufferPx) {
    return "start";
  }

  if (laneWidthPx - scaledPositionPx <= edgeBufferPx) {
    return "end";
  }

  return "center";
}

function resolveCardPlacement(
  placements: Map<string, Map<string, TimelineCardPlacement>>,
  laneKey: string,
  itemId: string,
): TimelineCardPlacement {
  return placements.get(laneKey)?.get(itemId) ?? CENTER_CARD_PLACEMENT;
}

function cardStyle(positionPx: number, placement: TimelineCardPlacement): Record<string, string> {
  return {
    "--timeline-card-position": `${positionPx}px`,
    "--timeline-card-gap": `${placement.gapPx}px`,
  };
}

function cardConnectorStyle(positionPx: number, placement: TimelineCardPlacement): Record<string, string> {
  const lineHeight = Math.max(0, placement.gapPx);

  if (placement.mode === "above") {
    return {
      "--timeline-card-position": `${positionPx}px`,
      left: `calc(var(--timeline-card-position, 0px) * var(--timeline-time-scale, 1))`,
      top: `calc(50% - ${lineHeight}px)`,
      height: `${lineHeight}px`,
    };
  }

  if (placement.mode === "below") {
    return {
      "--timeline-card-position": `${positionPx}px`,
      left: `calc(var(--timeline-card-position, 0px) * var(--timeline-time-scale, 1))`,
      top: "50%",
      height: `${lineHeight}px`,
    };
  }

  return {};
}

function canPanFromTarget(target: HTMLElement | null): boolean {
  if (!target) {
    return true;
  }

  return target.closest("button, input, select, textarea, a, [role='button'], .timeline-bottom-toolbar, .timeline-tooltip, .timeline-chrome, .timeline-questnode-create-line, .timeline-lane-resize-handle") === null;
}

function beginPan(event: PointerEvent): void {
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  const target = event.target as HTMLElement | null;
  if (!canPanFromTarget(target)) {
    return;
  }

  timelineViewport.panning = true;
  timelineViewport.panAxis = null;
  timelineViewport.pointerId = event.pointerId;
  timelineViewport.startClientX = event.clientX;
  timelineViewport.startClientY = event.clientY;
  timelineViewport.startTranslateX = timelineViewport.translateX;
  timelineViewport.startTranslateY = timelineViewport.translateY;

  const stage = event.currentTarget as HTMLElement | null;
  if (stage && !stage.hasPointerCapture(event.pointerId)) {
    stage.setPointerCapture(event.pointerId);
  }
}

function updatePan(event: PointerEvent): void {
  if (questlineLaneMoveSession.active && questlineLaneMoveSession.pointerId === event.pointerId) {
    return;
  }

  if (questlineLaneResizeSession.active && questlineLaneResizeSession.pointerId === event.pointerId) {
    return;
  }

  if (!timelineViewport.panning || timelineViewport.pointerId !== event.pointerId) {
    return;
  }

  const deltaX = event.clientX - timelineViewport.startClientX;
  const deltaY = event.clientY - timelineViewport.startClientY;

  if (!timelineViewport.panAxis) {
    if (Math.abs(deltaX) < timelineViewport.dragThreshold && Math.abs(deltaY) < timelineViewport.dragThreshold) {
      return;
    }

    timelineViewport.panAxis = Math.abs(deltaX) >= Math.abs(deltaY) ? "x" : "y";
  }

  if (timelineViewport.panAxis === "x") {
    timelineViewport.translateX = timelineViewport.startTranslateX + deltaX;
    timelineViewport.translateY = timelineViewport.startTranslateY;
    return;
  }

  timelineViewport.translateX = timelineViewport.startTranslateX;
  timelineViewport.translateY = timelineViewport.startTranslateY + deltaY;
}

function stopPan(): void {
  timelineViewport.panning = false;
  timelineViewport.panAxis = null;
  timelineViewport.pointerId = null;
}

function endPan(event: PointerEvent): void {
  if (questlineLaneResizeSession.active && questlineLaneResizeSession.pointerId === event.pointerId) {
    stopQuestlineLaneResize(event);
  }

  if (questlineLaneMoveSession.active && questlineLaneMoveSession.pointerId === event.pointerId) {
    stopQuestlineLaneMove(event);
  }

  if (!timelineViewport.panning || timelineViewport.pointerId !== event.pointerId) {
    return;
  }

  const stage = event.currentTarget as HTMLElement | null;
  if (stage && stage.hasPointerCapture(event.pointerId)) {
    stage.releasePointerCapture(event.pointerId);
  }

  stopPan();
  persistViewportState();
}

function cancelPan(event?: PointerEvent): void {
  if (event && questlineLaneResizeSession.active && questlineLaneResizeSession.pointerId === event.pointerId) {
    stopQuestlineLaneResize(event, false);
  }

  if (event && questlineLaneMoveSession.active && questlineLaneMoveSession.pointerId === event.pointerId) {
    stopQuestlineLaneMove(event, false);
  }

  if (event) {
    const stage = event.currentTarget as HTMLElement | null;
    if (stage && stage.hasPointerCapture(event.pointerId)) {
      stage.releasePointerCapture(event.pointerId);
    }
  }

  stopPan();
  persistViewportState();
}

function openEvent(eventId: string): void {
  emit("open-event", eventId);
}

function createEvent(): void {
  emit("create-event");
}

function createQuestline(): void {
  emit("create-questline");
}

function extendTimelineWithYear(): void {
  const workspaceId = activeWorkspaceId.value;
  if (!workspaceId) {
    return;
  }

  timelineExtensionYears.value = timelineRangeExtensionStateService.extendByYears(workspaceId, 1);
}

function createQuestNodeAtMoment(questlineId: string, event: MouseEvent): void {
  const guide = projection.value.calendarGuide;
  if (!guide) {
    return;
  }

  const target = event.currentTarget as HTMLElement | null;
  if (!target) {
    return;
  }

  const rect = target.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const unscaledX = localX / Math.max(timelineViewport.zoomX, 0.0001);
  const stamp = getTimelineStampFromPosition(unscaledX, guide);
  emit("create-questnode", { questlineId, stamp });
}

function selectQuestline(questlineId: string): void {
  emit("select-questline", questlineId);
}

function selectQuestnode(questNodeId: string): void {
  emit("select-questnode", questNodeId);
  emit("open-questnode", questNodeId);
}

function deleteQuestNode(questNodeId: string): void {
  emit("delete-questnode", questNodeId);
}

function deleteEvent(eventId: string): void {
  emit("delete-event", eventId);
}

function laneAccentStyle(kind: TimelineLaneKind): Record<string, string> {
  switch (kind) {
    case "quest":
      return {
        "--lane-accent": "rgba(244, 202, 58, 0.72)",
        "--lane-glow": "rgba(244, 202, 58, 0.12)",
      };
    case "entity":
      return {
        "--lane-accent": "rgba(109, 149, 255, 0.72)",
        "--lane-glow": "rgba(109, 149, 255, 0.12)",
      };
    case "location":
      return {
        "--lane-accent": "rgba(111, 244, 201, 0.72)",
        "--lane-glow": "rgba(111, 244, 201, 0.12)",
      };
    case "global":
    default:
      return {
        "--lane-accent": "rgba(123, 216, 255, 0.72)",
        "--lane-glow": "rgba(123, 216, 255, 0.12)",
      };
  }
}

function buildTimelineAxisStyle(calendarGuide: TimelineCalendarGuideProjection | null | undefined, zoomX = 1): Record<string, string> {
  const safeZoomX = clampTimeZoom(zoomX);
  if (!calendarGuide) {
    return {
      "--timeline-time-scale": String(safeZoomX),
    };
  }

  const dayWidthPx = calendarGuide.dayWidthPx;
  const weekWidthPx = calendarGuide.weekWidthPx;
  const yearWidthPx = calendarGuide.yearWidthPx;
  const hourWidthPx = calendarGuide.dayWidthPx / Math.max(calendarGuide.hoursPerDay, 1);
  const axisPaddingPx = calendarGuide.axisPaddingPx;
  const scaledDayWidthPx = dayWidthPx * safeZoomX;
  const scaledWeekWidthPx = weekWidthPx * safeZoomX;
  const scaledYearWidthPx = yearWidthPx * safeZoomX;
  const scaledHourWidthPx = Math.max(1, hourWidthPx * safeZoomX);
  const scaledAxisPaddingPx = axisPaddingPx * safeZoomX;
  const yearBoundaryLayer = `linear-gradient(90deg, rgba(244, 202, 58, 0.26) 0 2px, transparent 2px 100%)`;
  const monthBoundaryLayers = calendarGuide.cycleEntries
    .slice(1)
    .map((entry) => {
      const startPx = entry.startDay * scaledDayWidthPx;
      return `linear-gradient(90deg, transparent ${startPx}px, rgba(244, 202, 58, 0.18) ${startPx}px, rgba(244, 202, 58, 0.18) ${startPx + 2}px, transparent ${startPx + 2}px)`;
    });

  const backgroundImage = [
    "linear-gradient(180deg, rgba(255, 255, 255, 0.01), rgba(255, 255, 255, 0.02))",
    "linear-gradient(90deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.01))",
    `repeating-linear-gradient(90deg, transparent 0, transparent calc(${scaledWeekWidthPx}px - 1px), rgba(123, 147, 179, 0.1) calc(${scaledWeekWidthPx}px - 1px), rgba(123, 147, 179, 0.1) ${scaledWeekWidthPx}px)`,
    yearBoundaryLayer,
    ...monthBoundaryLayers,
  ].join(", ");

  const backgroundSize = [
    "auto",
    "auto",
    `${scaledDayWidthPx}px 100%`,
    `${scaledWeekWidthPx}px 100%`,
    `${scaledYearWidthPx}px 100%`,
    ...monthBoundaryLayers.map(() => `${scaledYearWidthPx}px 100%`),
  ].join(", ");

  const backgroundRepeat = [
    "no-repeat",
    "no-repeat",
    "repeat-x",
    "repeat-x",
    "repeat-x",
    ...monthBoundaryLayers.map(() => "repeat-x"),
  ].join(", ");

  const backgroundPosition = [
    "0 0",
    "0 0",
    `${scaledAxisPaddingPx}px 0`,
    `${scaledAxisPaddingPx}px 0`,
    `${scaledAxisPaddingPx}px 0`,
    ...monthBoundaryLayers.map(() => `${scaledAxisPaddingPx}px 0`),
  ].join(", ");
  const hourReveal = Math.max(0, Math.min(1, (safeZoomX - 1.25) / 4.75));
  const hourGridOpacity = 0.05 + hourReveal * 0.45;

  return {
    "--timeline-time-scale": String(safeZoomX),
    "--timeline-axis-width": `${calendarGuide.axisWidthPx * safeZoomX}px`,
    "--timeline-axis-padding": `${axisPaddingPx * safeZoomX}px`,
    "--timeline-day-width": `${dayWidthPx * safeZoomX}px`,
    "--timeline-week-width": `${weekWidthPx * safeZoomX}px`,
    "--timeline-year-width": `${yearWidthPx * safeZoomX}px`,
    "--timeline-day-grid-opacity": String(Math.min(0.8, 0.24 + Math.max(0, safeZoomX - 1) * 0.06)),
    "--timeline-day-grid-background-image":
      `repeating-linear-gradient(90deg, transparent 0, transparent calc(${scaledDayWidthPx}px - 2px), rgba(203, 226, 255, 0.62) calc(${scaledDayWidthPx}px - 2px), rgba(203, 226, 255, 0.62) ${scaledDayWidthPx}px)`,
    "--timeline-day-grid-background-size": `${scaledDayWidthPx}px 100%`,
    "--timeline-day-grid-background-repeat": "repeat-x",
    "--timeline-day-grid-background-position": `${scaledAxisPaddingPx}px 0`,
    "--timeline-hour-grid-width": `${scaledHourWidthPx}px`,
    "--timeline-hour-grid-opacity": String(hourGridOpacity),
    "--timeline-hour-grid-background-image":
      "repeating-linear-gradient(90deg, transparent 0, transparent calc(var(--timeline-hour-grid-width) - 1px), rgba(123, 147, 179, 0.26) calc(var(--timeline-hour-grid-width) - 1px), rgba(123, 147, 179, 0.26) var(--timeline-hour-grid-width))",
    "--timeline-hour-grid-background-size": "var(--timeline-hour-grid-width) 100%",
    "--timeline-hour-grid-background-repeat": "repeat-x",
    "--timeline-hour-grid-background-position": "0 0",
    "--timeline-axis-grid-background-image": backgroundImage,
    "--timeline-axis-grid-background-size": backgroundSize,
    "--timeline-axis-grid-background-repeat": backgroundRepeat,
    "--timeline-axis-grid-background-position": backgroundPosition,
  };
}
</script>

<template>
  <section class="timeline-board">
    <header class="timeline-board-header">
      <div class="timeline-board-heading">
        <span class="section-title">Campaign canvas</span>
        <h2>Timeline and questlines</h2>
        <p class="muted">{{ projection.rangeLabel }}</p>
      </div>

      <div class="timeline-board-actions">
        <span class="chip">{{ projection.eventCount }} events</span>
        <span class="chip">{{ projection.questNodeCount }} quest nodes</span>
        <span class="chip">{{ projection.lanes.length }} lanes</span>
        <button type="button" @click="createEvent()">New Event</button>
        <button type="button" @click="createQuestline()">New Questline</button>
      </div>
    </header>

    <section v-if="projection.calendarGuide" class="timeline-calendar-guide glass-panel">
      <div class="timeline-calendar-guide-header">
        <div class="timeline-calendar-guide-copy">
          <span class="section-title">Calendar guide</span>
          <h3>{{ projection.calendarGuide.name }}</h3>
          <p class="muted">
            {{ projection.calendarGuide.epochLabel }} · {{ projection.calendarGuide.timezoneLabel }} ·
            {{ projection.calendarGuide.yearLengthDays }} days per year · {{ projection.calendarGuide.hoursPerDay }} hours per day ·
            year range {{ projection.calendarGuide.startYear }} to {{ projection.calendarGuide.endYear }}
          </p>
        </div>

        <div class="timeline-calendar-guide-meta">
          <span class="summary-pill">{{ projection.calendarGuide.weekdayLabels.length }} weekdays</span>
          <span class="summary-pill">{{ projection.calendarGuide.minutesPerHour }} minutes per hour</span>
          <span class="summary-pill">{{ projection.calendarGuide.cycleLabel }}</span>
        </div>
      </div>

      <div class="timeline-calendar-guide-grid">
        <div class="timeline-calendar-guide-row">
          <span class="timeline-calendar-guide-label">Weekdays</span>
          <div class="timeline-calendar-guide-pills">
            <span
              v-for="(weekday, index) in projection.calendarGuide.weekdayLabels"
              :key="`${weekday}-${index}`"
              class="timeline-calendar-pill"
            >
              {{ weekday }}
            </span>
          </div>
        </div>

        <div class="timeline-calendar-guide-row">
          <span class="timeline-calendar-guide-label">{{ projection.calendarGuide.cycleLabel }}</span>
          <div class="timeline-calendar-guide-pills">
            <span
              v-for="cycle in projection.calendarGuide.cycleEntries"
              :key="`${cycle.name}-${cycle.startDay}`"
              class="timeline-calendar-pill timeline-calendar-pill-cycle"
              :title="`Days ${cycle.startDay + 1}-${cycle.startDay + cycle.days}`"
            >
              {{ cycle.name }} · {{ cycle.days }} days
            </span>
          </div>
        </div>
      </div>
    </section>

    <div v-if="timelineRulerProjection.rows.length > 0" class="timeline-ruler-overlay" :style="timelineRulerStageStyle" aria-hidden="true">
      <div class="timeline-ruler-overlay-track" :style="timelineCanvasPanXStyle">
        <div class="timeline-ruler">
          <div v-for="row in timelineRulerProjection.rows" :key="row.tier" class="timeline-ruler-row" :data-tier="row.tier">
            <span
              v-for="tick in row.ticks"
              :key="tick.id"
              class="timeline-ruler-tick"
              :data-tier="tick.tier"
              :data-anchor="tick.labelAnchor"
              :style="{ left: `${tick.positionPx}px`, '--timeline-ruler-tick-height': `${tick.heightPx}px` }"
            >
              <span class="timeline-ruler-tick-line"></span>
              <span v-if="tick.labelVisible" class="timeline-ruler-label">{{ tick.label }}</span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <section
      ref="timelineStageRef"
      class="timeline-stage glass-panel"
      :style="timelineStageStyle"
      @pointerdown="beginPan"
      @pointermove="handleStagePointerMove"
      @pointerup="endPan"
      @pointercancel="cancelPan"
      @wheel.prevent="handleWheel"
    >
      <div class="timeline-canvas" :style="timelineCanvasStyle">
        <div class="timeline-canvas-pan-x" :style="timelineCanvasPanXStyle">
          <div class="timeline-grid" aria-hidden="true"></div>

          <div class="timeline-content timeline-canvas-layer">
            <section class="timeline-strip timeline-questline-strip">
              <div class="timeline-strip-header">
                <div>
                  <p class="section-title">Questlines</p>
                  <h3>Quest nodes</h3>
                </div>
                <span class="chip">{{ projection.questlineCount }} questline{{ projection.questlineCount === 1 ? "" : "s" }}</span>
              </div>

              <div v-if="projection.questlineLanes.length === 0" class="empty-strip">
                <p class="empty-title">No questlines yet</p>
                <p class="muted">Create a questline to place quest nodes on the same timeline axis.</p>
              </div>

              <div v-else class="timeline-lanes timeline-questline-lanes">
                <article
                  v-for="lane in projection.questlineLanes"
                  :key="lane.id"
                  class="timeline-lane questline-lane"
                  :data-timeline-lane-id="lane.id"
                  :class="{ selected: selectedQuestlineId === lane.id }"
                  :style="[
                    { minHeight: questlineLaneHeight(lane.id, lane.nodes.length) },
                    laneAlignmentStyle('questline', lane.id),
                  ]"
                >
                  <div class="timeline-lane-label">
                    <button type="button" class="lane-title-button" @click.stop="selectQuestline(lane.id)">
                      {{ lane.title }}
                    </button>
                    <span>{{ lane.nodeCount }} nodes / {{ lane.eventCount }} events</span>
                  </div>

                  <div class="timeline-lane-track-anchor" aria-hidden="true"></div>
                  <div class="timeline-lane-track-spacer" aria-hidden="true"></div>
                  <div class="timeline-lane-track timeline-lane-track-questnodes" :style="questlineLaneTrackStyle(lane)">
                    <div class="timeline-lane-track-grid" aria-hidden="true"></div>
                    <div
                      class="timeline-lane-track-viewport"
                      :style="questlineLaneViewportStyle(lane)"
                      @pointerdown.stop.prevent="beginQuestlineLaneMove(lane.id, $event)"
                    >
                      <div class="timeline-axis" aria-hidden="true"></div>
                      <button
                        type="button"
                        class="timeline-questnode-create-line"
                        :aria-label="`Create a quest node on ${lane.title} at this point`"
                        @pointerdown.stop.prevent
                        @click="createQuestNodeAtMoment(lane.id, $event)"
                      ></button>
                      <div v-if="lane.nodes.length === 0" class="lane-empty-state" title="Link nodes from the graph or inspector.">
                        <p class="empty-title">No quest nodes yet</p>
                      </div>
                      <div class="timeline-lane-track-content">
                        <template v-for="node in lane.nodes" :key="node.id">
                          <span
                            v-if="resolveCardPlacement(questlineCardPlacements, lane.id, node.id).mode !== 'center'"
                            class="timeline-card-connector"
                            aria-hidden="true"
                            :data-placement="resolveCardPlacement(questlineCardPlacements, lane.id, node.id).mode"
                            :style="cardConnectorStyle(node.positionPx, resolveCardPlacement(questlineCardPlacements, lane.id, node.id))"
                          ></span>
                          <button
                            type="button"
                            class="timeline-card questnode-card"
                            :class="{ selected: selectedQuestNodeId === node.id }"
                            :data-placement="resolveCardPlacement(questlineCardPlacements, lane.id, node.id).mode"
                            :data-anchor="resolveCardPlacement(questlineCardPlacements, lane.id, node.id).anchor"
                            :style="cardStyle(node.positionPx, resolveCardPlacement(questlineCardPlacements, lane.id, node.id))"
                            :aria-label="`Open quest node ${node.title} in ${node.questlineTitle}`"
                            @click.stop="selectQuestnode(node.id)"
                            @contextmenu.prevent.stop="deleteQuestNode(node.id)"
                            @pointerdown.stop
                          >
                            <span class="card-marker" aria-hidden="true">
                              <span class="card-plus">+</span>
                            </span>
                            <span class="timeline-card-body">
                              <span class="card-kicker">QUEST NODE</span>
                              <strong>{{ node.title }}</strong>
                              <span class="card-meta">Questline: {{ node.questlineTitle }}</span>
                              <span class="card-meta">{{ node.stampLabel }}</span>
                              <span class="card-meta">{{ node.eventCount }} linked events</span>
                            </span>
                          </button>
                        </template>
                      </div>
                    </div>
                    <div class="timeline-lane-track-controls">
                      <div
                        class="timeline-lane-resize-handle timeline-lane-resize-handle-left"
                        aria-hidden="true"
                        title="Resize lane from the left edge"
                        @pointerdown.stop.prevent="beginQuestlineLaneResize(lane.id, 'left', $event)"
                      ></div>
                      <div
                        class="timeline-lane-resize-handle timeline-lane-resize-handle-right"
                        aria-hidden="true"
                        title="Resize lane from the right edge"
                        @pointerdown.stop.prevent="beginQuestlineLaneResize(lane.id, 'right', $event)"
                      ></div>
                    </div>
                  </div>
                </article>
              </div>
            </section>

            <section class="timeline-strip timeline-event-strip">
              <div class="timeline-strip-header">
                <div>
                  <p class="section-title">{{ GLOBAL_TIMELINE_LABEL }}</p>
                  <h3>Campaign events</h3>
                </div>
                <span class="chip">{{ projection.lanes.length }} lane{{ projection.lanes.length === 1 ? "" : "s" }}</span>
              </div>

              <div class="timeline-lanes">
                <article
                  v-for="lane in projection.lanes"
                  :key="lane.key"
                  class="timeline-lane"
                  :data-timeline-lane-id="lane.key"
                  :style="[
                    laneAccentStyle(lane.kind),
                    { minHeight: campaignLaneHeight(lane.key, lane.events.length, lane.kind) },
                    campaignLaneTrackStyle(lane.kind),
                    campaignLaneAlignmentStyle(lane),
                  ]"
                >
                  <div class="timeline-lane-label">
                    <strong>{{ lane.label }}</strong>
                    <span>{{ lane.events.length }} event{{ lane.events.length === 1 ? "" : "s" }}</span>
                  </div>

                  <div class="timeline-lane-track-anchor" aria-hidden="true"></div>
                  <div class="timeline-lane-track-spacer" aria-hidden="true"></div>
                  <div class="timeline-lane-track">
                    <div class="timeline-lane-surface" aria-hidden="true"></div>
                    <div class="timeline-axis" aria-hidden="true"></div>
                    <template v-for="event in lane.events" :key="event.event.id">
                      <span
                        v-if="resolveCardPlacement(eventCardPlacements, lane.key, event.event.id).mode !== 'center'"
                        class="timeline-card-connector"
                        aria-hidden="true"
                        :data-placement="resolveCardPlacement(eventCardPlacements, lane.key, event.event.id).mode"
                        :style="cardConnectorStyle(event.positionPx, resolveCardPlacement(eventCardPlacements, lane.key, event.event.id))"
                      ></span>
                      <button
                        type="button"
                        class="timeline-card event-card"
                        :class="{ selected: selectedEventId === event.event.id }"
                        :data-placement="resolveCardPlacement(eventCardPlacements, lane.key, event.event.id).mode"
                        :data-anchor="resolveCardPlacement(eventCardPlacements, lane.key, event.event.id).anchor"
                        :style="cardStyle(event.positionPx, resolveCardPlacement(eventCardPlacements, lane.key, event.event.id))"
                        :aria-label="`Open event ${event.event.title} at ${event.stampLabel}`"
                        @click.stop="openEvent(event.event.id)"
                        @contextmenu.prevent.stop="deleteEvent(event.event.id)"
                        @pointerdown.stop
                      >
                        <span class="card-marker" aria-hidden="true">
                          <span class="card-plus">+</span>
                        </span>
                        <span class="timeline-card-body">
                          <span class="card-kicker">EVENT</span>
                          <strong>{{ event.event.title }}</strong>
                          <span class="card-meta">{{ event.stampLabel }}</span>
                          <span class="card-meta">{{ event.event.eventType }}</span>
                          <span v-if="event.questlineTitle" class="card-meta">Questline: {{ event.questlineTitle }}</span>
                          <span v-if="event.questNodeTitle" class="card-meta">Node: {{ event.questNodeTitle }}</span>
                        </span>
                      </button>
                    </template>
                    <button
                      v-if="lane.kind === 'global' && activeWorkspaceId && projection.calendarGuide"
                      type="button"
                      class="timeline-lane-extend-control"
                      :style="timelineExtensionControlStyle"
                      :aria-label="`Extend ${lane.label} by one year`"
                      @click.stop="extendTimelineWithYear"
                      @pointerdown.stop
                    >
                      Extend with a Year
                    </button>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </div>
      </div>

      <div class="timeline-chrome" :style="timelineChromeStyle">
        <div class="timeline-content timeline-chrome-content">
          <section class="timeline-strip timeline-questline-strip timeline-chrome-questline-strip">
            <div class="timeline-strip-header timeline-chrome-header">
              <div>
                <p class="section-title">Questlines</p>
                <h3>Quest nodes</h3>
              </div>
              <span class="chip">{{ projection.questlineCount }} questline{{ projection.questlineCount === 1 ? "" : "s" }}</span>
            </div>

            <div v-if="projection.questlineLanes.length === 0" class="empty-strip timeline-chrome-empty">
              <p class="empty-title">No questlines yet</p>
              <p class="muted">Create a questline to place quest nodes on the same timeline axis.</p>
            </div>

            <div v-else class="timeline-lanes timeline-questline-lanes">
                <article
                  v-for="lane in projection.questlineLanes"
                  :key="`chrome-${lane.id}`"
                  class="timeline-lane questline-lane timeline-chrome-lane"
                  :data-timeline-lane-id="lane.id"
                  :style="{ minHeight: questlineLaneHeight(lane.id, lane.nodes.length) }"
                >
                  <div class="timeline-lane-label timeline-chrome-lane-label">
                    <button type="button" class="lane-title-button" @click.stop="selectQuestline(lane.id)">
                      {{ lane.title }}
                    </button>
                    <span>{{ lane.nodeCount }} nodes / {{ lane.eventCount }} events</span>
                  </div>

                <div v-if="lane.nodes.length === 0" class="lane-empty-state timeline-chrome-lane-empty" title="Link nodes from the graph or inspector.">
                  <p class="empty-title">No quest nodes yet</p>
                </div>

                <div class="timeline-lane-track timeline-overlay-track" aria-hidden="true" :style="questlineLaneTrackStyle(lane)"></div>
              </article>
            </div>
          </section>

          <section class="timeline-strip timeline-event-strip">
            <div class="timeline-strip-header timeline-chrome-header">
              <div>
                <p class="section-title">{{ GLOBAL_TIMELINE_LABEL }}</p>
                <h3>Campaign events</h3>
              </div>
              <span class="chip">{{ projection.lanes.length }} lane{{ projection.lanes.length === 1 ? "" : "s" }}</span>
            </div>

            <div class="timeline-lanes">
              <article
                v-for="lane in projection.lanes"
                :key="`chrome-${lane.key}`"
                class="timeline-lane timeline-chrome-lane"
                :data-timeline-lane-id="lane.key"
                :style="[laneAccentStyle(lane.kind), { minHeight: campaignLaneHeight(lane.key, lane.events.length, lane.kind) }]"
              >
                <div class="timeline-lane-label timeline-chrome-lane-label">
                  <strong>{{ lane.label }}</strong>
                  <span>{{ lane.events.length }} event{{ lane.events.length === 1 ? "" : "s" }}</span>
                </div>

                <div class="timeline-lane-track timeline-overlay-track" aria-hidden="true">
                  <div class="timeline-lane-surface" aria-hidden="true"></div>
                  <div class="timeline-axis" aria-hidden="true"></div>
                </div>
              </article>
            </div>
          </section>
        </div>
      </div>

      <div class="timeline-tooltip glass-panel">
        <p class="section-title">Timeline canvas</p>
        <span>Drag empty space to pan the calendar ruler. Scroll to zoom the lanes or use the - and + controls below to stretch time horizontally.</span>
      </div>

      <div class="timeline-bottom-toolbar glass-panel">
        <button type="button" class="toolbar-reset" title="Zoom out timeline" @click="zoomOut()">−</button>
        <button type="button" class="toolbar-reset" title="Zoom in timeline" @click="zoomIn()">+</button>
        <button type="button" class="toolbar-reset" title="Reset timeline position" @click="resetViewport()">Reset</button>
      </div>
    </section>
  </section>
</template>

<style scoped>
.timeline-board {
  position: relative;
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  gap: 0.75rem;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.timeline-board,
.timeline-board * {
  user-select: none;
  -webkit-user-select: none;
}

.timeline-board-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.85rem;
}

.timeline-board-heading {
  display: grid;
  gap: 0.1rem;
}

.timeline-board-heading h2 {
  margin: 0;
  color: var(--fg);
  font-size: 1.02rem;
  line-height: 1.12;
}

.timeline-board-heading .muted {
  margin: 0;
  font-size: 0.86rem;
}

.timeline-board-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.45rem;
}

.timeline-board-actions button,
.toolbar-reset {
  padding: 0.34rem 0.72rem;
}

.timeline-calendar-guide {
  position: relative;
  z-index: 2;
  display: grid;
  gap: 0.3rem;
  padding: 0.6rem 0.72rem;
  border-radius: 14px;
  background: rgba(11, 18, 27, 0.72);
  border: 1px solid rgba(144, 163, 191, 0.18);
  box-shadow: 0 14px 24px rgba(0, 0, 0, 0.18);
}

.timeline-calendar-guide-header {
  display: flex;
  justify-content: space-between;
  gap: 0.7rem;
  align-items: flex-start;
}

.timeline-calendar-guide-copy {
  display: grid;
  gap: 0.03rem;
  min-width: 0;
}

.timeline-calendar-guide-copy h3 {
  margin: 0;
  color: var(--fg);
  font-size: 0.88rem;
  line-height: 1.12;
}

.timeline-calendar-guide-copy .muted {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.25;
}

.timeline-calendar-guide-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.3rem;
}

.timeline-calendar-guide-grid {
  display: grid;
  gap: 0.28rem;
}

.timeline-calendar-guide-row {
  display: grid;
  gap: 0.18rem;
}

.timeline-calendar-guide-label {
  color: var(--fg-muted);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  line-height: 1;
  text-transform: uppercase;
}

.timeline-calendar-guide-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.24rem;
}

.timeline-calendar-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.22rem 0.48rem;
  border-radius: 999px;
  border: 1px solid rgba(130, 160, 190, 0.18);
  background: rgba(14, 22, 35, 0.72);
  color: var(--fg-muted);
  font-size: 0.69rem;
  line-height: 1;
  white-space: nowrap;
}

.timeline-calendar-pill-cycle {
  border-color: rgba(244, 202, 58, 0.18);
  background: rgba(43, 35, 12, 0.56);
  color: rgba(255, 226, 140, 0.92);
}

.summary-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.28rem 0.56rem;
  border-radius: 999px;
  border: 1px solid rgba(130, 160, 190, 0.18);
  background: rgba(14, 22, 35, 0.72);
  color: var(--fg-muted);
  font-size: 0.76rem;
  line-height: 1;
}

.timeline-stage {
  position: relative;
  z-index: 1;
  --timeline-lane-label-width: 13.5rem;
  --timeline-ruler-gap: 0.45rem;
  --timeline-ruler-height: 72px;
  grid-row: 4;
  height: 100%;
  min-height: 0;
  align-self: stretch;
  overflow: hidden;
  border-radius: 16px;
  background:
    radial-gradient(circle at 50% 36%, rgba(111, 244, 201, 0.03), transparent 30%),
    radial-gradient(circle at 15% 18%, rgba(109, 149, 255, 0.03), transparent 22%),
    radial-gradient(circle at 85% 22%, rgba(244, 202, 58, 0.03), transparent 18%),
    linear-gradient(180deg, rgba(9, 15, 25, 0.985), rgba(7, 12, 20, 0.992));
  border: 1px solid rgba(126, 158, 188, 0.14);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    inset 0 -90px 120px rgba(0, 0, 0, 0.2);
  isolation: isolate;
}

.timeline-stage::before,
.timeline-stage::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.timeline-stage::before {
  background:
    radial-gradient(circle at 50% 38%, rgba(111, 244, 201, 0.12), transparent 24%),
    radial-gradient(circle at 16% 18%, rgba(109, 149, 255, 0.1), transparent 20%),
    radial-gradient(circle at 84% 20%, rgba(244, 202, 58, 0.1), transparent 18%),
    radial-gradient(circle at 50% 100%, rgba(111, 244, 201, 0.04), transparent 40%);
  opacity: 0.9;
  filter: blur(0.2px);
  z-index: 0;
}

.timeline-stage::after {
  background-image:
    radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.09) 0.85px, transparent 0),
    radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.03) 0.9px, transparent 1.2px),
    repeating-linear-gradient(90deg, rgba(130, 160, 190, 0.065) 0 1px, transparent 1px 168px),
    repeating-linear-gradient(0deg, rgba(130, 160, 190, 0.05) 0 1px, transparent 1px 168px),
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.014) 0 1px, transparent 1px 240px);
  background-size: 24px 24px, 120px 120px, 168px 168px, 168px 168px, 240px 240px;
  background-position: 0 0, 0 0, 0 0;
  opacity: 0.24;
  mix-blend-mode: screen;
  z-index: 0;
}

.timeline-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform-origin: 0 0;
  overflow: visible;
  user-select: none;
  z-index: 1;
}

.timeline-canvas-pan-x {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform-origin: 0 0;
  overflow: visible;
  will-change: transform;
}

.timeline-grid {
  position: absolute;
  inset: -300%;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 16%),
    repeating-linear-gradient(90deg, transparent 0, transparent calc(12.5% - 1px), rgba(123, 147, 179, 0.08) calc(12.5% - 1px), rgba(123, 147, 179, 0.08) 12.5%),
    repeating-linear-gradient(0deg, transparent 0, transparent calc(12.5% - 1px), rgba(123, 147, 179, 0.055) calc(12.5% - 1px), rgba(123, 147, 179, 0.055) 12.5%);
  opacity: 0.85;
}

.timeline-ruler-overlay {
  position: relative;
  display: block;
  align-items: stretch;
  padding: 0.35rem 0.55rem 0.25rem;
  box-sizing: border-box;
  width: 100%;
  height: var(--timeline-ruler-height, 0px);
  overflow: hidden;
  pointer-events: none;
  z-index: 2;
  margin-bottom: 0.45rem;
}

.timeline-ruler-overlay-track {
  position: relative;
  width: var(--timeline-ruler-track-width, var(--timeline-axis-width, 100%));
  min-width: var(--timeline-ruler-track-width, var(--timeline-axis-width, 100%));
  height: 100%;
  min-height: 100%;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid rgba(126, 158, 188, 0.18);
  border-top-color: rgba(255, 255, 255, 0.08);
  border-bottom-color: rgba(244, 202, 58, 0.26);
  background:
    linear-gradient(180deg, rgba(15, 22, 35, 0.98), rgba(8, 14, 22, 0.96)),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.01));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    inset 0 -40px 60px rgba(0, 0, 0, 0.1);
  z-index: 1;
}

.timeline-ruler-overlay-track::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.03), rgba(244, 202, 58, 0.28), rgba(255, 255, 255, 0.03));
  opacity: 0.95;
  pointer-events: none;
}

.timeline-ruler {
  position: relative;
  width: var(--timeline-ruler-track-width, var(--timeline-axis-width, 100%));
  min-width: var(--timeline-ruler-track-width, var(--timeline-axis-width, 100%));
  height: 100%;
  box-sizing: border-box;
  padding: 0.25rem 0 0.2rem;
}

.timeline-ruler-row {
  position: absolute;
  inset: 0;
  height: 100%;
  min-height: 100%;
  overflow: visible;
}

.timeline-ruler-row[data-tier="month"] {
  --timeline-ruler-label-offset: 46px;
  z-index: 4;
}

.timeline-ruler-row[data-tier="year"] {
  --timeline-ruler-label-offset: 58px;
  z-index: 5;
}

.timeline-ruler-row[data-tier="week"] {
  --timeline-ruler-label-offset: 34px;
  z-index: 3;
}

.timeline-ruler-row[data-tier="day"] {
  --timeline-ruler-label-offset: 22px;
  z-index: 2;
}

.timeline-ruler-row[data-tier="hour"] {
  --timeline-ruler-label-offset: 10px;
  z-index: 1;
}

.timeline-ruler-row[data-tier="month"] {
  --timeline-ruler-accent: rgba(244, 202, 58, 0.98);
  --timeline-ruler-glow: rgba(244, 202, 58, 0.24);
}

.timeline-ruler-row[data-tier="year"] {
  --timeline-ruler-accent: rgba(255, 224, 146, 0.98);
  --timeline-ruler-glow: rgba(255, 224, 146, 0.28);
}

.timeline-ruler-row[data-tier="week"] {
  --timeline-ruler-accent: rgba(123, 216, 255, 0.96);
  --timeline-ruler-glow: rgba(123, 216, 255, 0.22);
}

.timeline-ruler-row[data-tier="day"] {
  --timeline-ruler-accent: rgba(111, 244, 201, 0.96);
  --timeline-ruler-glow: rgba(111, 244, 201, 0.2);
}

.timeline-ruler-row[data-tier="hour"] {
  --timeline-ruler-accent: rgba(206, 224, 255, 0.92);
  --timeline-ruler-glow: rgba(206, 224, 255, 0.16);
}

.timeline-ruler-tick {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}

.timeline-ruler-tick-line {
  position: absolute;
  left: -0.5px;
  bottom: 0;
  width: 1px;
  height: var(--timeline-ruler-tick-height, 10px);
  background: linear-gradient(180deg, var(--timeline-ruler-accent, rgba(244, 202, 58, 0.98)), rgba(255, 255, 255, 0.12));
  box-shadow: 0 0 10px var(--timeline-ruler-glow, rgba(244, 202, 58, 0.18));
}

.timeline-ruler-label {
  position: absolute;
  left: 0;
  bottom: calc(var(--timeline-ruler-label-offset, var(--timeline-ruler-tick-height, 10px)) + 0.08rem);
  transform: translateX(-50%);
  color: var(--timeline-ruler-accent, rgba(244, 202, 58, 0.96));
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.03em;
  font-variant-numeric: tabular-nums;
  text-shadow:
    0 1px 1px rgba(0, 0, 0, 0.75),
    0 0 8px var(--timeline-ruler-glow, rgba(244, 202, 58, 0.2));
  padding: 0.04rem 0.25rem;
  border-radius: 999px;
  background: rgba(8, 13, 22, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.04);
  white-space: nowrap;
}

.timeline-ruler-tick[data-anchor="start"] .timeline-ruler-label {
  transform: translateX(0);
}

.timeline-ruler-tick[data-anchor="end"] .timeline-ruler-label {
  transform: translateX(-100%);
}

.timeline-content {
  position: relative;
  display: grid;
  align-content: start;
  gap: 0.45rem;
  padding: 0.55rem 0.55rem 1.8rem;
  min-height: 100%;
  box-sizing: border-box;
}

.timeline-canvas-layer .timeline-strip-header,
.timeline-canvas-layer .timeline-lane-label {
  display: none;
}

.timeline-canvas-layer .timeline-event-strip .timeline-strip-header,
.timeline-canvas-layer .timeline-event-strip .timeline-lane-label {
  display: none;
}

.timeline-canvas-layer .timeline-event-strip .timeline-lane-surface,
.timeline-canvas-layer .timeline-event-strip .timeline-axis {
  display: block;
}

.timeline-canvas-layer .timeline-event-strip .timeline-lane-track::before,
.timeline-canvas-layer .timeline-event-strip .timeline-lane-track::after {
  content: "";
}

.timeline-canvas-layer .questline-lane .timeline-lane-track::before {
  content: none;
  background: none;
  box-shadow: none;
}

.timeline-canvas-layer .timeline-questline-strip .timeline-lane-label {
  display: grid;
  visibility: hidden;
}

.timeline-canvas-layer .lane-empty-state {
  display: none;
}

.timeline-canvas-layer .timeline-lane {
  grid-template-columns: minmax(0, 1fr);
}

.timeline-canvas-layer .timeline-lane-track-anchor {
  position: absolute;
  inset: 0 auto auto 0;
  display: block;
  width: 0;
  height: 0;
  pointer-events: none;
}

.timeline-canvas-layer .questline-lane .timeline-lane-track-spacer {
  display: block;
  height: calc(var(--timeline-lane-track-offset-y, 0px) + var(--timeline-lane-track-min-height, 3rem));
  pointer-events: none;
}

.timeline-canvas-layer .timeline-lane-track {
  position: absolute;
  top: var(--timeline-lane-track-offset-y, 0px);
  left: 0;
  transform: translate3d(var(--timeline-lane-track-shift-x, 0px), 0, 0);
  transform-origin: top left;
}

.timeline-canvas-layer .questline-lane .timeline-lane-track-grid {
  position: absolute;
  top: 0;
  left: 0;
  width: var(--timeline-axis-width, 100%);
  min-width: var(--timeline-axis-width, 100%);
  height: 100%;
  clip-path: inset(
    0
    calc(100% - var(--timeline-lane-track-offset-x, 0px) - var(--timeline-lane-track-width, 0px))
    0
    var(--timeline-lane-track-offset-x, 0px)
    round 14px
  );
}

.timeline-canvas-layer .questline-lane .timeline-lane-track-viewport,
.timeline-canvas-layer .questline-lane .timeline-lane-track-controls {
  position: absolute;
  top: 0;
  left: 0;
  width: var(--timeline-lane-track-width, var(--timeline-axis-width, 100%));
  min-width: var(--timeline-lane-track-width, var(--timeline-axis-width, 100%));
  height: 100%;
}

.timeline-canvas-layer .questline-lane .timeline-lane-track-grid {
  z-index: 0;
  pointer-events: none;
}

.timeline-canvas-layer .questline-lane .timeline-lane-track-content {
  z-index: 50;
  pointer-events: none;
  position: absolute;
  top: 0;
  left: 0;
  width: var(--timeline-axis-width, 100%);
  min-width: var(--timeline-axis-width, 100%);
  height: 100%;
  isolation: isolate;
}

.timeline-canvas-layer .questline-lane .timeline-lane-track-viewport {
  z-index: 2;
  overflow: visible;
  border-radius: inherit;
  pointer-events: auto;
  transform: translate3d(var(--timeline-lane-track-offset-x, 0px), 0, 0);
  transform-origin: top left;
  will-change: transform;
  cursor: grab;
  touch-action: none;
  border-top: 1px solid rgba(244, 202, 58, 0.52);
  border-bottom: 1px solid rgba(244, 202, 58, 0.52);
  background: transparent;
  box-shadow: none;
}

.timeline-canvas-layer .questline-lane .timeline-lane-track-viewport::before,
.timeline-canvas-layer .questline-lane .timeline-lane-track-viewport::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  pointer-events: none;
  z-index: 5;
  background: linear-gradient(90deg, transparent, rgba(244, 202, 58, 0.98), transparent);
  box-shadow: 0 0 16px rgba(244, 202, 58, 0.3);
}

.timeline-canvas-layer .questline-lane .timeline-lane-track-viewport::before {
  top: 0;
}

.timeline-canvas-layer .questline-lane .timeline-lane-track-viewport::after {
  bottom: 0;
}

.timeline-canvas-layer .questline-lane:has(.questnode-card:is(:hover, :focus-visible, .selected)) .timeline-lane-track-viewport {
  border-top-color: transparent;
  border-bottom-color: transparent;
}

.timeline-canvas-layer .questline-lane:has(.questnode-card:is(:hover, :focus-visible, .selected)) .timeline-lane-track-viewport::before,
.timeline-canvas-layer .questline-lane:has(.questnode-card:is(:hover, :focus-visible, .selected)) .timeline-lane-track-viewport::after {
  opacity: 0;
  box-shadow: none;
}

.timeline-canvas-layer .questline-lane:has(.questnode-card:is(:hover, :focus-visible, .selected)) .timeline-axis {
  opacity: 0;
}

.timeline-canvas-layer .questline-lane:has(.questnode-card:is(:hover, :focus-visible, .selected)) .timeline-lane-track-controls {
  opacity: 0;
  pointer-events: none;
}

.timeline-canvas-layer .questline-lane:has(.questnode-card:is(:hover, :focus-visible, .selected)) .timeline-lane-resize-handle::before {
  opacity: 0;
}

.timeline-canvas-layer .questline-lane .timeline-lane-track-grid {
  overflow: hidden;
  border-radius: inherit;
  background-image:
    var(
      --timeline-axis-grid-background-image,
      linear-gradient(180deg, rgba(255, 255, 255, 0.01), rgba(255, 255, 255, 0.02)),
      linear-gradient(90deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.01))
    );
  background-size: var(--timeline-axis-grid-background-size, auto, auto);
  background-repeat: var(--timeline-axis-grid-background-repeat, no-repeat, no-repeat);
  background-position: var(--timeline-axis-grid-background-position, 0 0, 0 0);
  border: 1px solid transparent;
  box-shadow: none;
}

.timeline-canvas-layer .questline-lane .timeline-lane-track-grid::before,
.timeline-canvas-layer .questline-lane .timeline-lane-track-grid::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  mix-blend-mode: screen;
  transition: opacity 120ms linear;
}

.timeline-canvas-layer .questline-lane .timeline-lane-track-grid::before {
  opacity: var(--timeline-day-grid-opacity, 0.18);
  background-image: var(
    --timeline-day-grid-background-image,
    repeating-linear-gradient(90deg, transparent 0, transparent calc(20px - 2px), rgba(184, 212, 255, 0.38) calc(20px - 2px), rgba(184, 212, 255, 0.38) 20px)
  );
  background-size: var(--timeline-day-grid-background-size, 20px 100%);
  background-repeat: var(--timeline-day-grid-background-repeat, repeat-x);
  background-position: var(--timeline-day-grid-background-position, 0 0);
}

.timeline-canvas-layer .questline-lane .timeline-lane-track-grid::after {
  opacity: var(--timeline-hour-grid-opacity, 0);
  background-image: var(
    --timeline-hour-grid-background-image,
    repeating-linear-gradient(90deg, transparent 0, transparent calc(1px - 1px), rgba(123, 147, 179, 0.32) calc(1px - 1px), rgba(123, 147, 179, 0.32) 1px)
  );
  background-size: var(--timeline-hour-grid-background-size, 1px 100%);
  background-repeat: var(--timeline-hour-grid-background-repeat, repeat-x);
  background-position: var(--timeline-hour-grid-background-position, 0 0);
}

.timeline-canvas-layer .questline-lane .timeline-lane-track-controls {
  z-index: 15;
  pointer-events: none;
  transform: translate3d(var(--timeline-lane-track-offset-x, 0px), 0, 0);
  transform-origin: top left;
  will-change: transform;
}

.timeline-chrome {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 40;
}

.timeline-chrome .timeline-strip-header,
.timeline-chrome .timeline-lane-label {
  background: transparent;
  border: 0;
  box-shadow: none;
  backdrop-filter: none;
}

.timeline-chrome .timeline-strip-header {
  pointer-events: none;
}

.timeline-chrome .timeline-lane-label {
  transform: none;
}

.timeline-chrome .lane-title-button {
  pointer-events: auto;
}

.timeline-chrome .timeline-overlay-track {
  visibility: hidden;
}

.timeline-chrome .timeline-event-strip .timeline-overlay-track {
  visibility: hidden;
}

.timeline-chrome .timeline-chrome-lane,
.timeline-chrome .questline-lane {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.24rem;
  padding-top: 0.18rem;
}

.timeline-chrome .questline-lane {
  padding-top: 0.12rem;
}

.timeline-chrome .timeline-chrome-lane .timeline-lane-label,
.timeline-chrome .questline-lane .timeline-lane-label,
.timeline-chrome .timeline-chrome-lane .timeline-lane-track,
.timeline-chrome .questline-lane .timeline-lane-track,
.timeline-chrome .timeline-chrome-lane .lane-empty-state,
.timeline-chrome .questline-lane .lane-empty-state {
  flex: 0 0 auto;
}

.timeline-chrome .timeline-chrome-lane .timeline-lane-track,
.timeline-chrome .questline-lane .timeline-lane-track {
  align-self: flex-start;
}

.timeline-chrome .questline-lane .timeline-lane-track {
  visibility: hidden;
}

.timeline-chrome .questline-lane .timeline-lane-label {
  position: static;
  left: auto;
  top: auto;
  z-index: auto;
  transform: none;
}

.timeline-strip {
  display: grid;
  gap: 0.45rem;
}

.timeline-questline-strip {
  gap: 1.35rem;
}

.timeline-strip-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0;
  background: transparent;
  border: 0;
  backdrop-filter: none;
  transform: none;
  pointer-events: auto;
  z-index: 1;
}

.timeline-strip-header h3 {
  margin: 0.06rem 0 0;
  color: var(--fg);
  font-size: 0.88rem;
  line-height: 1.12;
}

.timeline-strip-header .section-title {
  margin: 0;
}

.timeline-questline-strip .timeline-strip-header {
  align-items: center;
  padding: 0.16rem 0.2rem 0.52rem;
}

.timeline-questline-strip .timeline-strip-header h3 {
  margin-top: 0.16rem;
}

.timeline-track {
  position: relative;
}

.timeline-track-questlines {
  min-height: 100%;
  padding-top: 0.2rem;
}

.timeline-track-questlines::before,
.timeline-lane-track::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--lane-accent, rgba(111, 244, 201, 0.44)), transparent);
  transform: translateY(-50%);
  box-shadow: 0 0 0 1px var(--lane-glow, rgba(111, 244, 201, 0.08));
  pointer-events: none;
}

.timeline-track-questlines::before {
  content: none;
  background: none;
  box-shadow: none;
}

.empty-strip {
  display: grid;
  gap: 0.2rem;
  min-height: 4.5rem;
  align-content: center;
  padding: 0.35rem 0;
}

.empty-title {
  margin: 0;
  color: var(--fg);
  font-size: 0.88rem;
  font-weight: 700;
  line-height: 1.16;
}

.empty-strip .muted {
  margin: 0;
  max-width: 38rem;
  font-size: 0.78rem;
  line-height: 1.32;
}

.timeline-lanes {
  display: grid;
  gap: 0.45rem;
}

.timeline-questline-lanes {
  gap: 1.4rem;
}

.timeline-lane {
  position: relative;
  display: grid;
  grid-template-columns: var(--timeline-lane-label-width, 13.5rem) minmax(0, 1fr);
  gap: 0.45rem;
  align-content: start;
  min-height: 3rem;
  padding: 0.1rem 0 0.08rem;
}

.timeline-lane-label {
  display: grid;
  gap: 0.03rem;
  padding-top: 0.12rem;
  background: transparent;
  border: 0;
  backdrop-filter: none;
  transform: none;
  pointer-events: auto;
}

.timeline-lane-label strong {
  color: var(--fg);
  font-size: 0.8rem;
  line-height: 1.1;
}

.timeline-lane-label span {
  color: var(--fg-muted);
  font-size: 0.65rem;
  line-height: 1.2;
}

.lane-title-button {
  display: inline-flex;
  align-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--fg);
  font-size: 0.8rem;
  font-weight: 700;
  line-height: 1.1;
  text-align: left;
  cursor: pointer;
}

.lane-title-button:hover,
.lane-title-button:focus-visible {
  color: #f7df85;
}

.timeline-lane-track {
  position: relative;
  min-height: var(--timeline-lane-track-min-height, 3rem);
  width: var(--timeline-lane-track-width, var(--timeline-axis-width, 100%));
  min-width: var(--timeline-lane-track-width, var(--timeline-axis-width, 100%));
  border-radius: 14px;
  background: transparent;
  border: 1px solid transparent;
  overflow: visible;
}

.timeline-lane-surface {
  position: absolute;
  inset: 0;
  width: 100%;
  border-radius: inherit;
  background-image:
    var(
      --timeline-axis-grid-background-image,
      linear-gradient(180deg, rgba(255, 255, 255, 0.01), rgba(255, 255, 255, 0.02)),
      linear-gradient(90deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.01))
    );
  background-size: var(--timeline-axis-grid-background-size, auto, auto);
  background-repeat: var(--timeline-axis-grid-background-repeat, no-repeat, no-repeat);
  background-position: var(--timeline-axis-grid-background-position, 0 0, 0 0);
  border: 1px solid rgba(126, 158, 188, 0.08);
  pointer-events: none;
  z-index: 0;
}

.timeline-lane-surface::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  opacity: var(--timeline-day-grid-opacity, 0.18);
  background-image: var(
    --timeline-day-grid-background-image,
    repeating-linear-gradient(90deg, transparent 0, transparent calc(20px - 2px), rgba(184, 212, 255, 0.38) calc(20px - 2px), rgba(184, 212, 255, 0.38) 20px)
  );
  background-size: var(--timeline-day-grid-background-size, 20px 100%);
  background-repeat: var(--timeline-day-grid-background-repeat, repeat-x);
  background-position: var(--timeline-day-grid-background-position, 0 0);
  mix-blend-mode: screen;
  transition: opacity 120ms linear;
  z-index: 1;
}

.timeline-lane-surface::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  opacity: var(--timeline-hour-grid-opacity, 0);
  background-image: var(
    --timeline-hour-grid-background-image,
    repeating-linear-gradient(90deg, transparent 0, transparent calc(1px - 1px), rgba(123, 147, 179, 0.32) calc(1px - 1px), rgba(123, 147, 179, 0.32) 1px)
  );
  background-size: var(--timeline-hour-grid-background-size, 1px 100%);
  background-repeat: var(--timeline-hour-grid-background-repeat, repeat-x);
  background-position: var(--timeline-hour-grid-background-position, 0 0);
  mix-blend-mode: screen;
  transition: opacity 120ms linear;
  z-index: 2;
}

.questline-lane {
  --lane-accent: rgba(244, 202, 58, 0.72);
  --lane-glow: rgba(244, 202, 58, 0.12);
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto;
  align-items: start;
  justify-items: start;
  gap: 0.32rem;
  padding-top: 0.24rem;
  width: fit-content;
}

.questline-lane .timeline-lane-label,
.questline-lane .lane-empty-state,
.questline-lane .timeline-lane-track {
  grid-column: 1;
}

.questline-lane .timeline-lane-label {
  justify-self: start;
}

.questline-lane .timeline-lane-track {
  align-self: start;
  justify-self: start;
}

.questline-lane .timeline-lane-track {
  overflow: visible;
  min-height: 3rem;
  border-color: transparent;
}

.questline-lane .timeline-lane-resize-handle {
  position: absolute;
  top: -0.1rem;
  bottom: -0.1rem;
  width: 12px;
  z-index: 4;
  cursor: ew-resize;
  touch-action: none;
  pointer-events: auto;
}

.questline-lane .timeline-lane-resize-handle::before {
  content: "";
  position: absolute;
  top: 0.2rem;
  bottom: 0.2rem;
  width: 2px;
  border-radius: 999px;
  background: rgba(244, 202, 58, 0.34);
  opacity: 0;
  transition: opacity 120ms ease;
}

.questline-lane:hover .timeline-lane-resize-handle::before,
.questline-lane.selected .timeline-lane-resize-handle::before,
.questline-lane .timeline-lane-resize-handle:focus-visible::before {
  opacity: 1;
}

.questline-lane .timeline-lane-resize-handle-left {
  left: -6px;
}

.questline-lane .timeline-lane-resize-handle-left::before {
  left: 50%;
  transform: translateX(-50%);
}

.questline-lane .timeline-lane-resize-handle-right {
  right: -6px;
}

.questline-lane .timeline-lane-resize-handle-right::before {
  right: 50%;
  transform: translateX(50%);
}

.questline-lane .timeline-lane-surface {
  border-color: rgba(244, 202, 58, 0.14);
}

.timeline-canvas-layer .questline-lane .timeline-lane-surface {
  pointer-events: auto;
  cursor: grab;
  touch-action: none;
}

.timeline-canvas-layer .questline-lane .timeline-lane-surface:active {
  cursor: grabbing;
}

.questline-lane.selected .timeline-lane-track {
  border-color: transparent;
  box-shadow: none;
}

.questline-lane.selected .timeline-lane-surface {
  border-color: transparent;
  box-shadow: none;
}

.lane-empty-state {
  display: grid;
  gap: 0.05rem;
  align-content: center;
  width: fit-content;
  max-width: min(18rem, 100%);
  min-height: 1.8rem;
  padding: 0.16rem 0.45rem;
}

.timeline-axis {
  position: absolute;
  left: 0;
  top: 50%;
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--lane-accent, rgba(111, 244, 201, 0.58)), transparent);
  transform: translateY(-50%);
  pointer-events: none;
  z-index: 1;
}

.timeline-questnode-create-line {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1.05rem;
  transform: translateY(-50%);
  border: 0;
  background: transparent;
  cursor: crosshair;
  z-index: 1;
  pointer-events: auto;
}

.timeline-card {
  position: absolute;
  z-index: 2;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  --timeline-marker-size: 0.72rem;
  --timeline-card-expanded-width: min(15.5rem, 20vw);
  --timeline-card-gap: 0px;
  --timeline-card-shift-x: -50%;
  --timeline-card-shift-y: -50%;
  --timeline-card-hover-shift-x: -50%;
  --timeline-card-hover-shift-y: calc(-50% - 1px);
  transform: translate(var(--timeline-card-shift-x), var(--timeline-card-shift-y));
  width: var(--timeline-marker-size);
  min-width: var(--timeline-marker-size);
  height: var(--timeline-marker-size);
  min-height: var(--timeline-marker-size);
  max-height: var(--timeline-marker-size);
  left: calc(var(--timeline-card-position, 0px) * var(--timeline-time-scale, 1));
  padding: 0;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(15, 24, 37, 0.92);
  border: 1px solid var(--card-accent, rgba(111, 244, 201, 0.38));
  box-shadow:
    0 10px 24px rgba(0, 0, 0, 0.28),
    0 0 0 1px rgba(255, 255, 255, 0.03) inset;
  color: var(--fg);
  text-align: left;
  cursor: pointer;
  pointer-events: auto;
  transition:
    width 180ms ease,
    min-width 180ms ease,
    height 180ms ease,
    min-height 180ms ease,
    max-height 180ms ease,
    padding 180ms ease,
    border-radius 180ms ease,
    transform 140ms ease,
    border-color 140ms ease,
    box-shadow 140ms ease,
    background 140ms ease;
}

.timeline-card[data-placement="center"] {
  top: 50%;
  bottom: auto;
  display: grid;
  place-items: center;
}

.timeline-card[data-placement="above"] {
  top: auto;
  bottom: calc(50% + var(--timeline-card-gap, 0px));
  --timeline-card-shift-y: 0%;
  --timeline-card-hover-shift-y: 0%;
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  justify-content: flex-start;
  border-radius: 12px;
}

.timeline-card[data-placement="below"] {
  top: calc(50% + var(--timeline-card-gap, 0px));
  bottom: auto;
  --timeline-card-shift-y: 0%;
  --timeline-card-hover-shift-y: 0%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  border-radius: 12px;
}

.timeline-card[data-anchor="start"] {
  --timeline-card-shift-x: calc(var(--timeline-marker-size) / -2);
  --timeline-card-hover-shift-x: calc(var(--timeline-marker-size) / -2);
}

.timeline-card[data-anchor="end"] {
  --timeline-card-shift-x: calc(-100% + var(--timeline-marker-size) / 2);
  --timeline-card-hover-shift-x: calc(-100% + var(--timeline-marker-size) / 2);
}

.timeline-card[data-placement="above"][data-anchor="start"],
.timeline-card[data-placement="below"][data-anchor="start"] {
  align-items: flex-start;
}

.timeline-card[data-placement="above"][data-anchor="end"],
.timeline-card[data-placement="below"][data-anchor="end"] {
  align-items: flex-end;
}

.timeline-card:is(:hover, :focus-visible) {
  z-index: 8;
  width: var(--timeline-card-expanded-width);
  min-width: var(--timeline-card-expanded-width);
  height: auto;
  min-height: 4.2rem;
  max-height: 8.8rem;
  padding: 0.55rem 0.68rem 0.58rem;
  border-radius: 14px;
  place-items: start;
  transform: translate(var(--timeline-card-hover-shift-x), var(--timeline-card-hover-shift-y));
  box-shadow:
    0 12px 26px rgba(0, 0, 0, 0.32),
    0 0 0 1px rgba(255, 255, 255, 0.04) inset;
}

.timeline-card.selected {
  z-index: 8;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--card-accent, rgba(111, 244, 201, 0.7)) 78%, white),
    0 0 0 5px color-mix(in srgb, var(--card-accent, rgba(111, 244, 201, 0.7)) 14%, transparent),
    0 10px 24px rgba(0, 0, 0, 0.34);
}

.card-marker {
  position: absolute;
  inset: 0;
  margin: auto;
  display: grid;
  place-items: center;
  width: var(--timeline-marker-size);
  height: var(--timeline-marker-size);
  border-radius: 50%;
  background:
    radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0) 42%),
    color-mix(in srgb, var(--card-accent, rgba(111, 244, 201, 0.72)) 18%, rgba(15, 24, 37, 0.95));
  border: 1px solid color-mix(in srgb, var(--card-accent, rgba(111, 244, 201, 0.88)) 74%, white);
  color: color-mix(in srgb, var(--card-accent, rgba(111, 244, 201, 0.92)) 80%, white);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.04) inset,
    0 0 14px var(--lane-glow, rgba(111, 244, 201, 0.12));
  transition:
    opacity 140ms ease,
    transform 140ms ease,
    box-shadow 140ms ease,
    background 140ms ease;
  pointer-events: none;
}

.timeline-card[data-placement="center"][data-anchor="start"] .card-marker,
.timeline-card[data-placement="center"][data-anchor="end"] .card-marker {
  inset: auto;
  margin: 0;
  top: 50%;
  bottom: auto;
}

.timeline-card[data-placement="center"][data-anchor="start"] .card-marker {
  left: 0;
  right: auto;
  transform: translateY(-50%);
}

.timeline-card[data-placement="center"][data-anchor="end"] .card-marker {
  right: 0;
  left: auto;
  transform: translateY(-50%);
}

.timeline-card[data-placement="above"] .card-marker,
.timeline-card[data-placement="below"] .card-marker {
  position: relative;
  inset: auto;
  margin: 0;
  flex: 0 0 auto;
}

.timeline-card-connector {
  position: absolute;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  border-radius: 999px;
  background: linear-gradient(
    180deg,
    transparent,
    var(--lane-accent, rgba(111, 244, 201, 0.72)) 18%,
    var(--lane-accent, rgba(111, 244, 201, 0.72)) 82%,
    transparent
  );
  box-shadow: 0 0 10px var(--lane-glow, rgba(111, 244, 201, 0.12));
  pointer-events: none;
  z-index: 1;
}

.card-plus {
  font-size: 0.68rem;
  font-weight: 800;
  line-height: 1;
  transform: translateY(-0.02rem);
}

.timeline-card-body {
  display: grid;
  gap: 0.12rem;
  width: 100%;
  opacity: 0;
  transform: translateY(0.12rem);
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}

.timeline-card:is(:hover, :focus-visible) .card-marker {
  opacity: 0;
  transform: scale(0.45);
}

.timeline-card:is(:hover, :focus-visible) .timeline-card-body {
  opacity: 1;
  transform: translateY(0);
}

.timeline-card strong {
  color: var(--fg);
  font-size: 0.87rem;
  line-height: 1.14;
}

.card-kicker {
  color: var(--card-accent, rgba(111, 244, 201, 0.82));
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1;
}

.card-meta {
  color: var(--fg-muted);
  font-size: 0.7rem;
  line-height: 1.25;
}

.card-state {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.66rem;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.questline-card {
  --card-accent: rgba(244, 202, 58, 0.82);
  background: linear-gradient(180deg, rgba(43, 35, 12, 1), rgba(22, 18, 8, 1));
  border-color: rgba(244, 202, 58, 0.46);
}

.event-card {
  --card-accent: var(--lane-accent, rgba(111, 244, 201, 0.82));
}

.questnode-card {
  --card-accent: rgba(244, 202, 58, 0.82);
  background: linear-gradient(180deg, rgba(43, 35, 12, 1), rgba(22, 18, 8, 1));
  border-color: rgba(244, 202, 58, 0.46);
}

.questnode-card:is(:hover, :focus-visible),
.questnode-card.selected {
  z-index: 40;
}

.questnode-card.selected {
  border-color: rgba(244, 202, 58, 0.84);
}

.questnode-card .card-kicker {
  color: rgba(244, 202, 58, 0.94);
}

.timeline-bottom-toolbar {
  position: absolute;
  left: 50%;
  bottom: 0.35rem;
  transform: translateX(-50%);
  display: flex;
  gap: 0.12rem;
  align-items: center;
  padding: 0.16rem 0.18rem;
  border-radius: 999px;
  background: rgba(9, 16, 25, 0.9);
  border: 1px solid rgba(130, 160, 190, 0.18);
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
  z-index: 40;
}

.timeline-bottom-toolbar button {
  min-width: 2rem;
}

.toolbar-reset {
  border-radius: 999px;
}

.timeline-tooltip {
  position: absolute;
  left: 0.35rem;
  bottom: 0.35rem;
  width: min(15.8rem, 24vw);
  display: grid;
  gap: 0.06rem;
  padding: 0.22rem 0.28rem;
  border-radius: 10px;
  pointer-events: auto;
  background: rgba(9, 16, 25, 0.9);
  border: 1px solid rgba(130, 160, 190, 0.18);
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
  z-index: 40;
}

.timeline-tooltip span {
  color: var(--fg-muted);
  font-size: 0.68rem;
  line-height: 1.35;
}

@media (max-width: 1180px) {
  .timeline-stage {
    --timeline-lane-label-width: 11rem;
  }

  .timeline-lane {
    grid-template-columns: var(--timeline-lane-label-width, 11rem) minmax(0, 1fr);
  }

  .timeline-card {
    --timeline-card-expanded-width: min(14rem, 24vw);
    --timeline-marker-size: 1rem;
  }
}

@media (max-width: 900px) {
  .timeline-board {
    gap: 0.6rem;
  }

  .timeline-board-header,
  .timeline-calendar-guide-header {
    flex-direction: column;
    align-items: stretch;
  }

  .timeline-board-actions,
  .timeline-calendar-guide-meta {
    justify-content: flex-start;
  }

  .timeline-stage {
    min-height: 27rem;
  }

  .timeline-content {
    padding: 0.75rem 0.75rem 2.75rem;
  }

  .timeline-lane {
    grid-template-columns: 1fr;
  }

  .timeline-lane-label {
    padding-top: 0;
  }

  .timeline-card {
    --timeline-card-expanded-width: min(13.6rem, 48vw);
    --timeline-marker-size: 0.95rem;
  }
}
</style>
