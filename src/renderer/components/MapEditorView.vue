<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useMasterCrafter } from "@renderer/composables/useMasterCrafter";
import { clamp } from "@shared/utils";
import type { MapDto, MapGeometryPointDto, MapPlacementDto, MapPlacementGeometryDto, MapPlacementInputDto, MapInputDto } from "@shared/contracts";
import { calculatePolygonBounds, getPolygonLabelPoint, getPolylineLabelPoint } from "@renderer/utils/mapGeometry";
import MapDetailsEditor from "@renderer/components/MapDetailsEditor.vue";
import PlacementLineWidthControl from "@renderer/components/map/PlacementLineWidthControl.vue";
import PlacementTextDimensionsControl from "@renderer/components/map/PlacementTextDimensionsControl.vue";
import PlacementTextOffsetControl from "@renderer/components/map/PlacementTextOffsetControl.vue";
import { MapViewportStateService, type MapViewportState } from "@renderer/services/MapViewportStateService";
import { confirmationDialogService } from "@renderer/services/ConfirmationDialogService";
import { useAssetImageSource } from "@renderer/composables/useAssetImageSource";
import { hotkeyDispatcherService } from "@renderer/services/hotkeys";
import { mapEditorHistoryService } from "@renderer/services/mapEditor";

const store = useMasterCrafter();
const state = store.state;
const viewportStateService = MapViewportStateService.getInstance();
const mapStage = ref<HTMLElement | null>(null);
const mapStageShell = ref<HTMLElement | null>(null);
type MapPanel = "maps" | "placement" | "tools" | "inspector";
type MapPanelState = MapPanel | null;
type PlacementTool = "select" | "move" | "point" | "region" | "path";
type PlacementDragMode = "point" | "shape" | "vertex";
type PlacementSegment = {
  start: MapGeometryPointDto;
  end: MapGeometryPointDto;
  insertIndex: number;
};
type PlacementDraftSnapshot = {
  label: string;
  notes: string;
  color: string;
  glowColor: string;
  shadowColor: string;
  scale: number;
  fontColor: string;
  lineWidth: number;
  textWidth: number;
  textHeight: number;
  textOffsetX: number;
  textOffsetY: number;
  entityId: string;
};

const form = reactive({
  title: "Untitled Map",
  description: "",
});

const placementDraft = reactive({
  label: "Marker",
  kind: "point" as MapPlacementInputDto["kind"],
  notes: "",
  color: "#77c8ff",
  glowColor: "#77c8ff",
  shadowColor: "#000000",
  scale: 1,
  fontColor: "#ffffff",
  lineWidth: 0.6,
  textWidth: 48,
  textHeight: 48,
  textOffsetX: 0,
  textOffsetY: 0,
  entityId: "",
});
const placementAutosaveTimers = new Map<string, number>();
const placementAutosaveSnapshots = new Map<string, { placement: MapPlacementInputDto; draft: PlacementDraftSnapshot }>();
const isHydratingPlacementDraft = ref(false);
let placementDraftHydrationEpoch = 0;

const activePanel = ref<MapPanelState>(null);
const placementTool = ref<PlacementTool>("select");
const createMode = ref(false);
const draggingPlacementId = ref<string | null>(null);
const draggingShapePlacementId = ref<string | null>(null);
const draggingShapeMode = ref<PlacementDragMode | null>(null);
const draggingShapeVertexIndex = ref<number | null>(null);
const draggingShapeStartPoint = ref<MapGeometryPointDto | null>(null);
const draggingShapeStartPoints = ref<MapGeometryPointDto[]>([]);
const draggingShapePoints = ref<MapGeometryPointDto[]>([]);
const mapViewport = reactive({
  scale: 1,
  translateX: 0,
  translateY: 0,
  panning: false,
  suppressClick: false,
  pointerId: null as number | null,
  startClientX: 0,
  startClientY: 0,
  startTranslateX: 0,
  startTranslateY: 0,
});
const mapImageDimensions = reactive({
  width: 0,
  height: 0,
});
const MAP_OVERLAY_SIZE = 100;
const spacePressed = ref(false);
const activeViewportContext = ref<{ workspaceId: string; mapId: string } | null>(null);
const dragPoint = reactive({ x: 0, y: 0 });
const placementGesture = reactive({
  active: false,
  pointerId: null as number | null,
  point: null as { x: number; y: number } | null,
});
const shapeDraft = reactive({
  active: false,
  points: [] as MapGeometryPointDto[],
  cursor: null as MapGeometryPointDto | null,
});

const MIN_ZOOM = Number.MIN_VALUE;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 1.12;
const PATH_LINE_WIDTH_SCALE = 80;
const MIN_PATH_LINE_THICKNESS = 0.2;
const MAX_PATH_LINE_THICKNESS = 6;
const DEFAULT_PATH_LINE_THICKNESS = 0.6;

const snapshot = computed(() => state.value.snapshot);
const selectedMap = computed(() => snapshot.value?.maps.find((map) => map.id === state.value.selectedMapId) ?? null);
const placements = computed(() => {
  const mapId = selectedMap.value?.id;
  if (!snapshot.value || !mapId) {
    return [];
  }

  return snapshot.value.placements.filter((placement) => placement.mapId === mapId);
});
const placementPreviews = computed<MapPlacementDto[]>(() => {
  const activePlacementId = selectedPlacement.value?.id ?? null;
  if (!activePlacementId) {
    return placements.value;
  }

  return placements.value.map((placement) => {
    if (placement.id !== activePlacementId) {
      return placement;
    }

    const isRegionPlacement = placement.kind === "region";
    const isPathPlacement = placement.kind === "path";
    const isLabelPlacement = isRegionPlacement || isPathPlacement;
    const previewTextWidth = isLabelPlacement ? normalizePlacementDimension(placementDraft.textWidth, placement.textWidth) : placement.textWidth;
    const previewTextHeight = isLabelPlacement ? normalizePlacementDimension(placementDraft.textHeight, placement.textHeight) : placement.textHeight;
    const previewTextOffsetX = isRegionPlacement ? normalizePlacementOffset(placementDraft.textOffsetX, placement.textOffsetX) : placement.textOffsetX;
    const previewTextOffsetY = isRegionPlacement ? normalizePlacementOffset(placementDraft.textOffsetY, placement.textOffsetY) : placement.textOffsetY;
    const previewGeometryWidth = isPathPlacement ? pathLineThicknessToGeometryWidth(placementDraft.lineWidth, placement.geometry.width) : placement.geometry.width;

    return {
      ...placement,
      geometry: {
        ...placement.geometry,
        width: previewGeometryWidth,
      },
      label: placementDraft.label.trim() || placement.label,
      entityId: placementDraft.entityId || null,
      notes: placementDraft.notes,
      color: placementDraft.color,
      glowColor: placementDraft.glowColor,
      shadowColor: placementDraft.shadowColor,
      scale: placementDraft.scale,
      fontColor: placementDraft.fontColor,
      textWidth: previewTextWidth,
      textHeight: previewTextHeight,
      textOffsetX: previewTextOffsetX,
      textOffsetY: previewTextOffsetY,
    };
  });
});
const placementPointPreviews = computed(() => placementPreviews.value.filter((placement) => placement.kind === "point"));
const placementRegionLabelPositions = computed<Record<string, MapGeometryPointDto>>(() => {
  const labelPositions: Record<string, MapGeometryPointDto> = {};

  for (const placement of placementPreviews.value) {
    if (placement.kind !== "region") {
      continue;
    }

    const points = getPlacementGeometryPoints(placement);
    if (points.length < 3) {
      continue;
    }

    const labelPoint = getPolygonLabelPoint(points);
    const bounds = calculatePolygonBounds(points);
    if (labelPoint && bounds) {
      const offsetX = normalizePlacementOffset(placement.textOffsetX, 0);
      const offsetY = normalizePlacementOffset(placement.textOffsetY, 0);
      const boundsWidth = Math.max(bounds.maxX - bounds.minX, 0.01);
      const boundsHeight = Math.max(bounds.maxY - bounds.minY, 0.01);

      labelPositions[placement.id] = {
        x: labelPoint.x + (boundsWidth * offsetX) / 100,
        y: labelPoint.y + (boundsHeight * offsetY) / 100,
      };
    }
  }

  return labelPositions;
});
const placementRegionLabelFrames = computed<Record<string, { width: number; height: number }>>(() => {
  const frames: Record<string, { width: number; height: number }> = {};

  for (const placement of placementPreviews.value) {
    if (placement.kind !== "region") {
      continue;
    }

    const width = clamp(normalizePlacementDimension(placement.textWidth, 48) / 10, 0.2, 90);
    const height = clamp(normalizePlacementDimension(placement.textHeight, 48) / 10, 0.2, 90);

    frames[placement.id] = { width, height };
  }

  return frames;
});
const placementRegionLabelFontSizes = computed<Record<string, number>>(() => {
  const fontSizes: Record<string, number> = {};

  for (const placement of placementPreviews.value) {
    if (placement.kind !== "region") {
      continue;
    }

    fontSizes[placement.id] = clamp(normalizePlacementDimension(placement.textHeight, 48) / 10, 0.2, 90);
  }

  return fontSizes;
});
const placementPathLabelPositions = computed<Record<string, MapGeometryPointDto>>(() => {
  const labelPositions: Record<string, MapGeometryPointDto> = {};

  for (const placement of placementPreviews.value) {
    if (placement.kind !== "path") {
      continue;
    }

    const points = getPlacementGeometryPoints(placement);
    if (points.length < 2) {
      continue;
    }

    const labelPoint = getPolylineLabelPoint(points);
    if (labelPoint) {
      labelPositions[placement.id] = labelPoint;
    }
  }

  return labelPositions;
});
const placementPathLabelFrames = computed<Record<string, { width: number; height: number }>>(() => {
  const frames: Record<string, { width: number; height: number }> = {};

  for (const placement of placementPreviews.value) {
    if (placement.kind !== "path") {
      continue;
    }

    const width = clamp(normalizePlacementDimension(placement.textWidth, 48) / 10, 0.2, 90);
    const height = clamp(normalizePlacementDimension(placement.textHeight, 48) / 10, 0.2, 90);

    frames[placement.id] = { width, height };
  }

  return frames;
});
const placementPathLabelFontSizes = computed<Record<string, number>>(() => {
  const fontSizes: Record<string, number> = {};

  for (const placement of placementPreviews.value) {
    if (placement.kind !== "path") {
      continue;
    }

    fontSizes[placement.id] = clamp(normalizePlacementDimension(placement.textHeight, 48) / 10, 0.2, 90);
  }

  return fontSizes;
});
const placementSegmentsById = computed<Record<string, PlacementSegment[]>>(() => {
  const segmentMap: Record<string, PlacementSegment[]> = {};

  for (const placement of placementPreviews.value) {
    const segments = getPlacementSegments(placement);
    if (segments.length) {
      segmentMap[placement.id] = segments;
    }
  }

  return segmentMap;
});
const selectedPlacement = computed(() => snapshot.value?.placements.find((placement) => placement.id === state.value.selectedPlacementId) ?? null);
const entities = computed(() => snapshot.value?.entities ?? []);
const mapAssetPath = computed(() => selectedMap.value?.assetPath ?? null);
const { source: mapImageSource } = useAssetImageSource(mapAssetPath);
const placementLabel = computed(() => placementDraft.label.trim() || "Marker");
const placementScaleLabel = computed(() => `${placementDraft.scale.toFixed(1)}x`);
const isPointPlacementDraft = computed(() =>
  Boolean(placementTool.value === "point" || placementDraft.kind === "point" || selectedPlacement.value?.kind === "point"),
);
const isRegionPlacementDraft = computed(() =>
  Boolean(placementTool.value === "region" || placementDraft.kind === "region" || selectedPlacement.value?.kind === "region"),
);
const isPathPlacementDraft = computed(() =>
  Boolean(placementTool.value === "path" || placementDraft.kind === "path" || selectedPlacement.value?.kind === "path"),
);
const placementToolLabel = computed(() => {
  switch (placementTool.value) {
    case "select":
      return "Select";
    case "move":
      return "Move/Edit";
    case "point":
      return "Marker";
    case "region":
      return "Area";
    case "path":
      return "Pen";
    default:
      return "Inspect";
  }
});
const placementToolHint = computed(() => {
  switch (placementTool.value) {
    case "select":
      return "Click markers, areas, and pen lines to edit metadata in the floating popup.";
    case "move":
      return "Drag markers to reposition them. Drag areas and pen lines to edit their geometry.";
    case "point":
      return "Click to place markers. Keep the tool active for fast batch placement.";
    case "region":
      return "Click three or more points to shape an area, then finish the polygon.";
    case "path":
      return "Click two or more points to trace a path, then finish the line.";
    default:
      return "Use the floating tools to switch between select, move/edit, markers, areas, and pen paths.";
  }
});
const selectedPlacementTitle = computed(() => selectedPlacement.value?.label ?? "");
const selectedPlacementKindLabel = computed(() => selectedPlacement.value?.kind ?? "");
const selectedPlacementKindDisplay = computed(() => {
  switch (selectedPlacement.value?.kind) {
    case "point":
      return "Marker";
    case "region":
      return "Area";
    case "path":
      return "Pen line";
    default:
      return "Placement";
  }
});
const selectedPlacementEntityLabel = computed(() => {
  const placement = selectedPlacement.value;
  if (!placement?.entityId) {
    return "Unlinked";
  }

  return entities.value.find((entity) => entity.id === placement.entityId)?.title ?? "Linked entity";
});
const selectedPlacementNotes = computed(() => selectedPlacement.value?.notes || "No notes yet.");
const placementPopoverDismissedId = ref<string | null>(null);
const placementPopoverRef = ref<HTMLElement | null>(null);
const placementPopoverDragOffset = reactive({
  x: 0,
  y: 0,
});
const placementPopoverDragState = reactive({
  active: false,
  pointerId: null as number | null,
  startClientX: 0,
  startClientY: 0,
  startOffsetX: 0,
  startOffsetY: 0,
  startRect: null as { left: number; top: number; width: number; height: number } | null,
});
const mapCanvasBounds = reactive({
  left: 0,
  top: 0,
  width: 0,
  height: 0,
});
const placementPopoverAnchor = computed<MapGeometryPointDto | null>(() => {
  const placement = selectedPlacement.value;
  if (!placement) {
    return null;
  }

  if (isMoveTool.value) {
    return null;
  }

  if (placement.id === draggingPlacementId.value && placement.kind === "point") {
    return {
      x: clamp(dragPoint.x, 0, 1),
      y: clamp(dragPoint.y, 0, 1),
    };
  }

  return placementAnchorPoint(placement);
});
const placementPopoverPosition = computed(() => {
  const placement = selectedPlacement.value;
  const anchor = placementPopoverAnchor.value;

  if (
    !placement ||
    !anchor ||
    mapCanvasBounds.width <= 0 ||
    mapCanvasBounds.height <= 0 ||
    (placement.kind !== "point" && placement.kind !== "region" && placement.kind !== "path")
  ) {
    return null;
  }

  const normalizedX = clamp(anchor.x, 0.08, 0.92);
  const normalizedY = clamp(anchor.y, 0.08, 0.92);
  const openLeft = normalizedX > 0.68;
  const openUp = normalizedY > 0.76;
  const left = mapCanvasBounds.left + normalizedX * mapCanvasBounds.width;
  const top = mapCanvasBounds.top + normalizedY * mapCanvasBounds.height;

  return {
    left: `${left}px`,
    top: `${top}px`,
    transform: `translate(${openLeft ? "calc(-100% - 0.7rem)" : "0.7rem"}, ${openUp ? "calc(-100% - 0.7rem)" : "0.7rem"})`,
    orientation: `${openLeft ? "left" : "right"} ${openUp ? "up" : "down"}` as const,
  };
});
const placementPopoverVisible = computed(() => {
  const placement = selectedPlacement.value;
  if (isMoveTool.value || placementTool.value !== "select") {
    return false;
  }

  if (!placement || (placement.kind !== "point" && placement.kind !== "region" && placement.kind !== "path")) {
    return false;
  }

  return placementPopoverDismissedId.value !== placement.id;
});
const isCreateTool = computed(() => placementTool.value === "point" || placementTool.value === "region" || placementTool.value === "path");
const isMoveTool = computed(() => placementTool.value === "move");
const isSpacePanActive = computed(() => spacePressed.value);
const mapCanvasStyle = computed(() => {
  const map = selectedMap.value;
  const width = mapImageDimensions.width || map?.width || 0;
  const height = mapImageDimensions.height || map?.height || 0;

  if (!map || width <= 0 || height <= 0) {
    return undefined;
  }

  return {
    aspectRatio: `${width} / ${height}`,
    transform: `translate3d(${mapViewport.translateX}px, ${mapViewport.translateY}px, 0) scale(${mapViewport.scale})`,
    transformOrigin: "0 0",
    willChange: "transform",
    cursor: mapViewport.panning || isSpacePanActive.value ? "grabbing" : placementTool.value === "select" ? "grab" : placementTool.value === "move" ? "default" : "crosshair",
  };
});
const canFinishShape = computed(() => {
  if (placementTool.value === "region") {
    return shapeDraft.points.length >= 3;
  }

  if (placementTool.value === "path") {
    return shapeDraft.points.length >= 2;
  }

  return false;
});

let mapCanvasObserver: ResizeObserver | null = null;
let unregisterHotkeys: (() => void) | null = null;

function applyViewportState(viewport: MapViewportState): void {
  mapViewport.scale = viewport.scale;
  mapViewport.translateX = viewport.translateX;
  mapViewport.translateY = viewport.translateY;
}

function currentViewportState(): MapViewportState {
  return {
    scale: mapViewport.scale,
    translateX: mapViewport.translateX,
    translateY: mapViewport.translateY,
  };
}

function persistViewportState(context = activeViewportContext.value): void {
  if (!context) {
    return;
  }

  viewportStateService.saveViewport(context.workspaceId, context.mapId, currentViewportState());
}

function restoreViewportState(context: { workspaceId: string; mapId: string }): void {
  const saved = viewportStateService.loadViewport(context.workspaceId, context.mapId);
  applyViewportState(saved ?? viewportStateService.getDefaultViewport());
  mapViewport.suppressClick = false;
  stopPan();
  activeViewportContext.value = { ...context };
}

watch(
  [mapStage, mapStageShell],
  () => {
    void nextTick().then(() => refreshMapCanvasBounds());
  },
  { immediate: true, flush: "post" },
);

watch(
  () => [snapshot.value?.workspace?.id ?? null, selectedMap.value?.id ?? null] as const,
  ([nextWorkspaceId, nextMapId], previous = [null, null] as [string | null, string | null]) => {
    const [previousWorkspaceId, previousMapId] = previous;
    if (previousWorkspaceId && previousMapId) {
      persistViewportState({ workspaceId: previousWorkspaceId, mapId: previousMapId });
    }

    mapImageDimensions.width = 0;
    mapImageDimensions.height = 0;
    resetPlacementGesture();
    resetShapeDraft();
    resetPlacementDrag();

    if (nextWorkspaceId && nextMapId) {
      restoreViewportState({ workspaceId: nextWorkspaceId, mapId: nextMapId });
    } else {
      applyViewportState(viewportStateService.getDefaultViewport());
      mapViewport.suppressClick = false;
      stopPan();
      activeViewportContext.value = null;
    }

    void nextTick().then(() => refreshMapCanvasBounds());
  },
  { immediate: true, flush: "post" },
);

watch(
  () => selectedPlacement.value?.id,
  () => {
    placementPopoverDismissedId.value = null;
    resetPlacementPopoverDrag();
    if (selectedPlacement.value) {
      syncPlacementDraftFromPlacement(selectedPlacement.value);
    }
  },
  { immediate: true },
);

watch(
  placementDraft,
  () => {
    if (isHydratingPlacementDraft.value || !selectedPlacement.value) {
      return;
    }

    schedulePlacementAutosave();
  },
  { deep: true },
);

watch(
  () => [mapViewport.scale, mapViewport.translateX, mapViewport.translateY, selectedPlacement.value?.id, selectedMap.value?.id],
  async () => {
    await nextTick();
    refreshMapCanvasBounds();
  },
  { flush: "post" },
);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, button, [contenteditable='true']"));
}

function handleGlobalKeyDown(event: KeyboardEvent): void {
  const isSpaceKey = event.code === "Space" || event.key === " ";
  const isEnterKey = event.code === "Enter" || event.key === "Enter";

  if (event.repeat || (!isSpaceKey && !isEnterKey)) {
    return;
  }

  if (isEditableTarget(event.target) || isEditableTarget(document.activeElement)) {
    return;
  }

  if (isEnterKey) {
    if ((placementTool.value === "region" || placementTool.value === "path") && canFinishShape.value) {
      event.preventDefault();
      void finishShapePlacement();
    }
    return;
  }

  spacePressed.value = true;
  event.preventDefault();
}

function handleGlobalKeyUp(event: KeyboardEvent): void {
  if (event.code === "Space" || event.key === " ") {
    spacePressed.value = false;
  }
}

function releasePanShortcut(): void {
  spacePressed.value = false;
}

onMounted(() => {
  registerHotkeys();
  refreshMapCanvasBounds();
  void nextTick().then(() => refreshMapCanvasBounds());

  if (typeof ResizeObserver !== "undefined") {
    mapCanvasObserver = new ResizeObserver(() => {
      refreshMapCanvasBounds();
    });

    if (mapStageShell.value) {
      mapCanvasObserver.observe(mapStageShell.value);
    }

    if (mapStage.value) {
      mapCanvasObserver.observe(mapStage.value);
    }
  }

  window.addEventListener("resize", refreshMapCanvasBounds);
  window.addEventListener("keydown", handleGlobalKeyDown);
  window.addEventListener("keyup", handleGlobalKeyUp);
  window.addEventListener("blur", releasePanShortcut);
});

onBeforeUnmount(() => {
  unregisterHotkeys?.();
  unregisterHotkeys = null;
  void flushAllPlacementAutosaves().catch((error) => {
    console.error("Failed to flush placement autosaves.", error);
  });
  persistViewportState();
  mapCanvasObserver?.disconnect();
  mapCanvasObserver = null;
  window.removeEventListener("resize", refreshMapCanvasBounds);
  window.removeEventListener("keydown", handleGlobalKeyDown);
  window.removeEventListener("keyup", handleGlobalKeyUp);
  window.removeEventListener("blur", releasePanShortcut);
});

function refreshMapCanvasBounds(): void {
  const canvas = mapStage.value;
  const shell = mapStageShell.value;

  if (!canvas || !shell) {
    mapCanvasBounds.left = 0;
    mapCanvasBounds.top = 0;
    mapCanvasBounds.width = 0;
    mapCanvasBounds.height = 0;
    return;
  }

  const canvasRect = canvas.getBoundingClientRect();
  const shellRect = shell.getBoundingClientRect();

  mapCanvasBounds.left = canvasRect.left - shellRect.left;
  mapCanvasBounds.top = canvasRect.top - shellRect.top;
  mapCanvasBounds.width = canvasRect.width;
  mapCanvasBounds.height = canvasRect.height;
}

function selectMap(mapId: string): void {
  resetPlacementGesture();
  resetShapeDraft();
  resetPlacementDrag();
  store.selectMap(mapId);
}

function selectPlacement(placementId: string): void {
  resetPlacementGesture();
  resetShapeDraft();
  placementPopoverDismissedId.value = null;
  resetPlacementPopoverDrag();
  const placement = snapshot.value?.placements.find((entry) => entry.id === placementId) ?? null;
  if (placement) {
    syncPlacementDraftFromPlacement(placement);
  }
  store.selectPlacement(placementId);
}

function syncPlacementDraftFromPlacement(placement: MapPlacementDto): void {
  placementDraftHydrationEpoch += 1;
  const hydrationEpoch = placementDraftHydrationEpoch;
  isHydratingPlacementDraft.value = true;
  placementDraft.label = placement.label;
  placementDraft.kind = placement.kind;
  placementDraft.notes = placement.notes;
  placementDraft.color = placement.color;
  placementDraft.glowColor = placement.glowColor;
  placementDraft.shadowColor = placement.shadowColor;
  placementDraft.scale = placement.scale;
  placementDraft.fontColor = placement.fontColor;
  placementDraft.lineWidth = geometryWidthToPathLineThickness(placement.geometry.width, DEFAULT_PATH_LINE_THICKNESS);
  placementDraft.textWidth = placement.textWidth;
  placementDraft.textHeight = placement.textHeight;
  placementDraft.textOffsetX = placement.textOffsetX;
  placementDraft.textOffsetY = placement.textOffsetY;
  placementDraft.entityId = placement.entityId ?? "";

  void nextTick().then(() => {
    if (placementDraftHydrationEpoch === hydrationEpoch) {
      isHydratingPlacementDraft.value = false;
    }
  });
}

function placementAnchorPoint(placement: MapPlacementDto): MapGeometryPointDto | null {
  if (placement.kind === "point") {
    return placement.geometry.point ? { ...placement.geometry.point } : null;
  }

  const points = placement.geometry.points;
  if (!points.length) {
    return placement.geometry.point ? { ...placement.geometry.point } : null;
  }

  if (placement.kind === "path") {
    return getPolylineLabelPoint(points) ?? placement.geometry.point ?? { x: 0, y: 0 };
  }

  const sum = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  };
}

function cloneGeometryPoints(points: MapGeometryPointDto[]): MapGeometryPointDto[] {
  return points.map((point) => ({ x: point.x, y: point.y }));
}

function clampGeometryPoint(point: MapGeometryPointDto): MapGeometryPointDto {
  return {
    x: clamp(point.x, 0, 1),
    y: clamp(point.y, 0, 1),
  };
}

function clonePlacementGeometryForSave(
  placement: { geometry: MapPlacementGeometryDto },
  overrides: {
    point?: MapGeometryPointDto | null;
    points?: MapGeometryPointDto[];
    radius?: number;
    width?: number;
    height?: number;
  } = {},
): MapPlacementGeometryDto {
  const point = overrides.point !== undefined ? overrides.point : placement.geometry.point;
  const points = overrides.points ?? placement.geometry.points;

  return {
    kind: placement.geometry.kind,
    point: point ? { x: point.x, y: point.y } : null,
    points: cloneGeometryPoints(points),
    radius: overrides.radius ?? placement.geometry.radius,
    width: overrides.width ?? placement.geometry.width,
    height: overrides.height ?? placement.geometry.height,
  };
}

function placementSnapshotToInput(placement: MapPlacementDto): MapPlacementInputDto {
  return {
    workspaceId: placement.workspaceId,
    mapId: placement.mapId,
    id: placement.id,
    entityId: placement.entityId,
    label: placement.label,
    kind: placement.kind,
    geometry: clonePlacementGeometryForSave(placement),
    textWidth: placement.textWidth,
    textHeight: placement.textHeight,
    textOffsetX: placement.textOffsetX,
    textOffsetY: placement.textOffsetY,
    notes: placement.notes,
    color: placement.color,
    glowColor: placement.glowColor,
    shadowColor: placement.shadowColor,
    scale: placement.scale,
    fontColor: placement.fontColor,
    zIndex: placement.zIndex,
  };
}

function capturePlacementDraftSnapshot(): PlacementDraftSnapshot {
  return {
    label: placementDraft.label,
    notes: placementDraft.notes,
    color: placementDraft.color,
    glowColor: placementDraft.glowColor,
    shadowColor: placementDraft.shadowColor,
    scale: placementDraft.scale,
    fontColor: placementDraft.fontColor,
    lineWidth: placementDraft.lineWidth,
    textWidth: placementDraft.textWidth,
    textHeight: placementDraft.textHeight,
    textOffsetX: placementDraft.textOffsetX,
    textOffsetY: placementDraft.textOffsetY,
    entityId: placementDraft.entityId,
  };
}

function buildPlacementSaveInput(
  placement: MapPlacementInputDto,
  draft: PlacementDraftSnapshot,
): MapPlacementInputDto {
  const isRegionPlacement = placement.kind === "region";
  const isPathPlacement = placement.kind === "path";
  const isLabelPlacement = isRegionPlacement || isPathPlacement;

  return {
    ...placement,
    entityId: draft.entityId || null,
    label: draft.label.trim() || placement.label || "Marker",
    geometry: clonePlacementGeometryForSave(
      placement,
      isPathPlacement ? { width: pathLineThicknessToGeometryWidth(draft.lineWidth, placement.geometry.width) } : {},
    ),
    textWidth: isLabelPlacement ? normalizePlacementDimension(draft.textWidth, placement.textWidth) : placement.textWidth,
    textHeight: isLabelPlacement ? normalizePlacementDimension(draft.textHeight, placement.textHeight) : placement.textHeight,
    textOffsetX: isRegionPlacement ? normalizePlacementOffset(draft.textOffsetX, placement.textOffsetX) : placement.textOffsetX,
    textOffsetY: isRegionPlacement ? normalizePlacementOffset(draft.textOffsetY, placement.textOffsetY) : placement.textOffsetY,
    notes: draft.notes,
    color: draft.color,
    glowColor: draft.glowColor,
    shadowColor: draft.shadowColor,
    scale: draft.scale,
    fontColor: draft.fontColor,
  };
}

function clearPlacementAutosave(placementId: string): void {
  const timerId = placementAutosaveTimers.get(placementId);
  if (timerId !== undefined) {
    window.clearTimeout(timerId);
  }

  placementAutosaveTimers.delete(placementId);
  placementAutosaveSnapshots.delete(placementId);
}

function schedulePlacementAutosave(): void {
  const placement = selectedPlacement.value;
  if (!placement) {
    return;
  }

  const placementId = placement.id;
  const placementSnapshot = placementSnapshotToInput(placement);
  const draftSnapshot = capturePlacementDraftSnapshot();
  const existingTimer = placementAutosaveTimers.get(placementId);
  if (existingTimer !== undefined) {
    window.clearTimeout(existingTimer);
  }

  placementAutosaveSnapshots.set(placementId, {
    placement: placementSnapshot,
    draft: draftSnapshot,
  });

  placementAutosaveTimers.set(
    placementId,
    window.setTimeout(() => {
      void flushPlacementAutosave(placementId).catch((error) => {
        console.error("Failed to autosave placement edits.", error);
      });
    }, 250),
  );
}

async function flushPlacementAutosave(placementId: string): Promise<void> {
  const pending = placementAutosaveSnapshots.get(placementId);
  if (!pending) {
    return;
  }

  clearPlacementAutosave(placementId);
  await persistPlacementDraft(pending.placement, pending.draft);
}

async function flushAllPlacementAutosaves(): Promise<void> {
  for (const placementId of [...placementAutosaveSnapshots.keys()]) {
    await flushPlacementAutosave(placementId);
  }
}

async function persistPlacementDraft(
  placementSnapshot: MapPlacementInputDto,
  draft: PlacementDraftSnapshot,
): Promise<MapPlacementDto> {
  const saved = await window.masterCrafter.placements.save(buildPlacementSaveInput(placementSnapshot, draft));
  const activeWorkspaceId = state.value.activeWorkspaceId;

  if (activeWorkspaceId === placementSnapshot.workspaceId) {
    await store.refreshSnapshot();
  }

  recordPlacementRestore(placementSnapshot);
  return saved;
}

function mapSnapshotToInput(map: MapDto): MapInputDto {
  return {
    workspaceId: map.workspaceId,
    id: map.id,
    title: map.title,
    description: map.description,
    assetId: map.assetId,
    assetName: map.assetName,
    width: map.width,
    height: map.height,
  };
}

function buildHistoryScopeKey(mapId: string | null | undefined): string | null {
  const workspaceId = snapshot.value?.workspace?.id ?? null;
  if (!workspaceId || !mapId) {
    return null;
  }

  return mapEditorHistoryService.createScopeKey(workspaceId, mapId);
}

function recordHistory(mapId: string | null | undefined, description: string, undo: () => Promise<void> | void): void {
  const scopeKey = buildHistoryScopeKey(mapId);
  if (!scopeKey) {
    return;
  }

  mapEditorHistoryService.push(scopeKey, {
    description,
    undo,
  });
}

function restorePreviousSelection(previousSelection: { mapId: string | null; placementId: string | null }): void {
  const currentSnapshot = snapshot.value;
  if (!currentSnapshot) {
    return;
  }

  if (previousSelection.placementId) {
    const hasPlacement = currentSnapshot.placements.some((placement) => placement.id === previousSelection.placementId);
    if (hasPlacement) {
      store.selectPlacement(previousSelection.placementId);
      return;
    }
  }

  if (previousSelection.mapId) {
    const hasMap = currentSnapshot.maps.some((map) => map.id === previousSelection.mapId);
    if (hasMap) {
      store.selectMap(previousSelection.mapId);
    }
  }
}

function recordPlacementRestore(previousPlacement: MapPlacementInputDto): void {
  recordHistory(previousPlacement.mapId, `Restore placement "${previousPlacement.label}"`, async () => {
    await store.savePlacement(previousPlacement);
  });
}

function recordPlacementDeletion(savedPlacement: MapPlacementDto, previousSelection: { mapId: string | null; placementId: string | null }): void {
  recordHistory(savedPlacement.mapId, `Delete placement "${savedPlacement.label}"`, async () => {
    await store.deletePlacement(savedPlacement.workspaceId, savedPlacement.mapId, savedPlacement.id);
    restorePreviousSelection(previousSelection);
  });
}

function recordMapRestore(previousMap: MapDto): void {
  recordHistory(previousMap.id, `Restore map "${previousMap.title}"`, async () => {
    await store.saveMap(mapSnapshotToInput(previousMap));
  });
}

function recordMapDeletion(savedMap: MapDto, previousSelection: { mapId: string | null; placementId: string | null }): void {
  recordHistory(savedMap.id, `Delete map "${savedMap.title}"`, async () => {
    await store.deleteMap(savedMap.workspaceId, savedMap.id);
    restorePreviousSelection(previousSelection);
  });
}

function getPlacementGeometryPoint(placement: MapPlacementDto): MapGeometryPointDto {
  if (placement.id === draggingPlacementId.value && placement.kind === "point") {
    return {
      x: clamp(dragPoint.x, 0, 1),
      y: clamp(dragPoint.y, 0, 1),
    };
  }

  return placement.geometry.point ? { ...placement.geometry.point } : { x: 0, y: 0 };
}

function getPlacementGeometryPoints(placement: MapPlacementDto): MapGeometryPointDto[] {
  if (placement.id === draggingShapePlacementId.value && draggingShapePoints.value.length) {
    return draggingShapePoints.value;
  }

  return placement.geometry.points;
}

function getPlacementSegments(placement: MapPlacementDto): PlacementSegment[] {
  const points = getPlacementGeometryPoints(placement);
  if (placement.kind === "region") {
    if (points.length < 3) {
      return [];
    }

    return points.map((point, index) => ({
      start: { x: point.x, y: point.y },
      end: { x: points[(index + 1) % points.length].x, y: points[(index + 1) % points.length].y },
      insertIndex: index + 1,
    }));
  }

  if (placement.kind === "path") {
    if (points.length < 2) {
      return [];
    }

    return points.slice(0, -1).map((point, index) => ({
      start: { x: point.x, y: point.y },
      end: { x: points[index + 1].x, y: points[index + 1].y },
      insertIndex: index + 1,
    }));
  }

  return [];
}

function projectPointOnSegment(
  point: MapGeometryPointDto,
  start: MapGeometryPointDto,
  end: MapGeometryPointDto,
): MapGeometryPointDto {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;

  if (lengthSquared <= 0) {
    return { x: start.x, y: start.y };
  }

  const projection = ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared;
  const clampedProjection = clamp(projection, 0, 1);

  return {
    x: start.x + deltaX * clampedProjection,
    y: start.y + deltaY * clampedProjection,
  };
}

function getSegmentMidpoint(start: MapGeometryPointDto, end: MapGeometryPointDto): MapGeometryPointDto {
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
}

function stagePoint(event: MouseEvent | PointerEvent): { x: number; y: number } | null {
  const stage = mapStage.value;
  if (!stage) {
    return null;
  }

  const rect = stage.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
  return { x, y };
}

function resetPlacementGesture(): void {
  placementGesture.active = false;
  placementGesture.pointerId = null;
  placementGesture.point = null;
}

function resetShapeDraft(): void {
  shapeDraft.active = false;
  shapeDraft.points = [];
  shapeDraft.cursor = null;
}

function resetPlacementDrag(): void {
  draggingPlacementId.value = null;
  draggingShapePlacementId.value = null;
  draggingShapeMode.value = null;
  draggingShapeVertexIndex.value = null;
  draggingShapeStartPoint.value = null;
  draggingShapeStartPoints.value = [];
  draggingShapePoints.value = [];
}

function resetPlacementPopoverDrag(): void {
  placementPopoverDragState.active = false;
  placementPopoverDragState.pointerId = null;
  placementPopoverDragState.startClientX = 0;
  placementPopoverDragState.startClientY = 0;
  placementPopoverDragState.startOffsetX = 0;
  placementPopoverDragState.startOffsetY = 0;
  placementPopoverDragState.startRect = null;
  placementPopoverDragOffset.x = 0;
  placementPopoverDragOffset.y = 0;
}

function resetViewport(): void {
  applyViewportState(viewportStateService.getDefaultViewport());
  mapViewport.suppressClick = false;
  stopPan();
  persistViewportState();
}

function setPlacementTool(tool: PlacementTool): void {
  placementTool.value = tool;
  createMode.value = tool === "point" || tool === "region" || tool === "path";
  resetPlacementDrag();

  if (tool === "point" || tool === "region" || tool === "path") {
    placementDraft.kind = tool;
  }

  if (tool === "select") {
    resetPlacementGesture();
    resetShapeDraft();
    return;
  }

  if (tool === "move") {
    resetPlacementGesture();
    resetShapeDraft();
    return;
  }

  if (tool === "point") {
    resetShapeDraft();
    return;
  }

  resetPlacementGesture();
  shapeDraft.active = true;
}

function placementAppearanceStyle(source: {
  color: string;
  glowColor: string;
  shadowColor: string;
  fontColor: string;
  scale: number;
}): Record<string, string> {
  return {
    "--placement-fill": source.color,
    "--placement-glow": source.glowColor,
    "--placement-shadow": source.shadowColor,
    "--placement-ink": source.fontColor,
    "--marker-scale": String(source.scale),
  };
}

function geometryWidthToPathLineThickness(width: number, fallback = DEFAULT_PATH_LINE_THICKNESS): number {
  const numericWidth = Number(width);
  if (!Number.isFinite(numericWidth) || numericWidth <= 0) {
    return fallback;
  }

  return clamp(numericWidth / PATH_LINE_WIDTH_SCALE, MIN_PATH_LINE_THICKNESS, MAX_PATH_LINE_THICKNESS);
}

function pathLineThicknessToGeometryWidth(thickness: number, fallback = 48): number {
  const numericThickness = Number(thickness);
  if (!Number.isFinite(numericThickness) || numericThickness <= 0) {
    return fallback;
  }

  return Math.max(1, Math.round(clamp(numericThickness, MIN_PATH_LINE_THICKNESS, MAX_PATH_LINE_THICKNESS) * PATH_LINE_WIDTH_SCALE));
}

function getPlacementLineStrokeWidth(placement: MapPlacementDto): number {
  if (placement.kind !== "path") {
    return 0.6;
  }

  return geometryWidthToPathLineThickness(placement.geometry.width, DEFAULT_PATH_LINE_THICKNESS);
}

function getPlacementRegionClipId(placementId: string): string {
  return `placement-region-clip-${placementId}`;
}

function normalizePlacementDimension(value: number, fallback: number): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return clamp(Math.round(numericValue), 2, 900);
}

function normalizePlacementOffset(value: number, fallback: number): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return clamp(Math.round(numericValue), -50, 50);
}

function togglePanel(panel: MapPanel): void {
  activePanel.value = activePanel.value === panel ? null : panel;
}

function closePanel(): void {
  activePanel.value = null;
}

function togglePlacementMode(): void {
  setPlacementTool(placementTool.value === "select" ? "move" : "select");
}

function registerHotkeys(): void {
  unregisterHotkeys?.();
  unregisterHotkeys = hotkeyDispatcherService.registerScope({
    scopeId: "map-editor",
    scopeType: "view",
    contextId: "maps",
    handlers: {
      "maps.toolSelect": () => setPlacementTool("select"),
      "maps.toolMove": () => setPlacementTool("move"),
      "maps.toolPoint": () => setPlacementTool("point"),
      "maps.toolRegion": () => setPlacementTool("region"),
      "maps.toolPath": () => setPlacementTool("path"),
      "maps.zoomIn": () => zoomIn(),
      "maps.zoomOut": () => zoomOut(),
      "maps.resetViewport": () => resetViewport(),
      "maps.toggleMapsPanel": () => togglePanel("maps"),
      "maps.togglePlacementPanel": () => togglePanel("placement"),
      "maps.toggleToolsPanel": () => togglePanel("tools"),
      "maps.toggleInspectorPanel": () => togglePanel("inspector"),
      "maps.undoLastChange": () => void undoLastChange(),
      "maps.importImage": () => void importMapImage(),
      "maps.savePlacement": () => void savePlacement(),
      "maps.deletePlacement": () => void deleteSelectedPlacement(),
      "maps.finishShape": () => void finishShapePlacement(),
      "maps.cancelShape": () => cancelShapePlacement(),
    },
  });
}

function zoomTo(nextScale: number, focus?: { x: number; y: number }): void {
  const clampedScale = clamp(nextScale, MIN_ZOOM, MAX_ZOOM);
  if (!focus) {
    mapViewport.scale = clampedScale;
    persistViewportState();
    return;
  }

  const scaleRatio = clampedScale / mapViewport.scale;
  mapViewport.translateX = focus.x - (focus.x - mapViewport.translateX) * scaleRatio;
  mapViewport.translateY = focus.y - (focus.y - mapViewport.translateY) * scaleRatio;
  mapViewport.scale = clampedScale;
  persistViewportState();
}

function zoomIn(): void {
  const stage = mapStage.value;
  if (!stage) {
    return;
  }

  const rect = stage.getBoundingClientRect();
  zoomTo(mapViewport.scale * ZOOM_STEP, { x: rect.width / 2, y: rect.height / 2 });
}

function zoomOut(): void {
  const stage = mapStage.value;
  if (!stage) {
    return;
  }

  const rect = stage.getBoundingClientRect();
  zoomTo(mapViewport.scale / ZOOM_STEP, { x: rect.width / 2, y: rect.height / 2 });
}

function handleZoom(event: WheelEvent): void {
  const target = event.target as HTMLElement | null;
  if (target?.closest(".map-drawer, .map-bottom-toolbar, .map-badge, .map-rail, .placement-popover, .placement-handle")) {
    return;
  }

  const stage = mapStage.value;
  if (!stage) {
    return;
  }

  event.preventDefault();
  const rect = stage.getBoundingClientRect();
  const cursor = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };

  const direction = event.deltaY < 0 ? 1 : -1;
  const multiplier = Math.exp(direction * 0.14);
  zoomTo(mapViewport.scale * multiplier, cursor);
}

function beginPan(event: PointerEvent): void {
  if (!selectedMap.value || ((placementTool.value !== "select" && !isSpacePanActive.value) || (event.pointerType === "mouse" && event.button !== 0))) {
    return;
  }

  const target = event.target as HTMLElement | null;
  if (
    target?.closest(".map-bottom-toolbar, .map-drawer, .round-fab, .drawer-close, .tool-chip, .placement-popover") ||
    (!isSpacePanActive.value && target?.closest(".marker-pin, .placement-handle, .placement-segment-hit, .placement-path-hit, .placement-shape"))
  ) {
    return;
  }

  mapViewport.panning = true;
  mapViewport.suppressClick = true;
  mapViewport.pointerId = event.pointerId;
  mapViewport.startClientX = event.clientX;
  mapViewport.startClientY = event.clientY;
  mapViewport.startTranslateX = mapViewport.translateX;
  mapViewport.startTranslateY = mapViewport.translateY;

  const stage = event.currentTarget as HTMLElement | null;
  if (stage && !stage.hasPointerCapture(event.pointerId)) {
    stage.setPointerCapture(event.pointerId);
  }
}

function updatePan(event: PointerEvent): void {
  if (!mapViewport.panning || mapViewport.pointerId !== event.pointerId) {
    return;
  }

  mapViewport.translateX = mapViewport.startTranslateX + (event.clientX - mapViewport.startClientX);
  mapViewport.translateY = mapViewport.startTranslateY + (event.clientY - mapViewport.startClientY);
}

function stopPan(): void {
  mapViewport.panning = false;
  mapViewport.pointerId = null;
}

function endPan(event: PointerEvent): void {
  if (!mapViewport.panning || mapViewport.pointerId !== event.pointerId) {
    return;
  }

  const stage = event.currentTarget as HTMLElement | null;
  if (stage && stage.hasPointerCapture(event.pointerId)) {
    stage.releasePointerCapture(event.pointerId);
  }

  stopPan();
  persistViewportState();
  window.setTimeout(() => {
    mapViewport.suppressClick = false;
  }, 0);
}

function cancelPan(event?: PointerEvent): void {
  if (event) {
    const stage = event.currentTarget as HTMLElement | null;
    if (stage && stage.hasPointerCapture(event.pointerId)) {
      stage.releasePointerCapture(event.pointerId);
    }
  }

  stopPan();
  persistViewportState();
  window.setTimeout(() => {
    mapViewport.suppressClick = false;
  }, 0);
}

function buildPlacementInput(
  kind: MapPlacementInputDto["kind"],
  point: MapGeometryPointDto | null,
  points: MapGeometryPointDto[],
): MapPlacementInputDto | null {
  const workspace = state.value.snapshot?.workspace;
  const map = selectedMap.value;

  if (!workspace || !map) {
    return null;
  }

  const normalizedPoint = point ? { x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) } : null;
  const normalizedPoints = points.map((entry) => ({ x: clamp(entry.x, 0, 1), y: clamp(entry.y, 0, 1) }));
  const fallbackLabel = kind === "point" ? "Marker" : kind === "region" ? "Area" : "Pen";
  const isRegion = kind === "region";
  const isPath = kind === "path";
  const isLabelPlacement = isRegion || isPath;
  const geometryWidth = isPath ? pathLineThicknessToGeometryWidth(placementDraft.lineWidth, 48) : 48;

  return {
    workspaceId: workspace.id,
    mapId: map.id,
    entityId: placementDraft.entityId || null,
    label: placementDraft.label.trim() || `${fallbackLabel} ${placements.value.length + 1}`,
    kind,
    geometry: {
      kind,
      point: normalizedPoint,
      points: normalizedPoints,
      radius: 24,
      width: geometryWidth,
      height: 48,
    },
    textWidth: isLabelPlacement ? normalizePlacementDimension(placementDraft.textWidth, 48) : 48,
    textHeight: isLabelPlacement ? normalizePlacementDimension(placementDraft.textHeight, 48) : 48,
    textOffsetX: isRegion ? normalizePlacementOffset(placementDraft.textOffsetX, 0) : 0,
    textOffsetY: isRegion ? normalizePlacementOffset(placementDraft.textOffsetY, 0) : 0,
    notes: placementDraft.notes.trim(),
    color: placementDraft.color,
    glowColor: placementDraft.glowColor,
    shadowColor: placementDraft.shadowColor,
    scale: placementDraft.scale,
    fontColor: placementDraft.fontColor,
    zIndex: placements.value.length + 1,
  };
}

async function importMapImage(): Promise<void> {
  const workspace = state.value.snapshot?.workspace;
  if (!workspace) {
    return;
  }

  const paths = await window.masterCrafter.dialog.openFile({
    title: "Import Map Image",
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg"] }],
    properties: ["openFile", "multiSelections"],
  });

  if (!paths.length) {
    return;
  }

  const useCustomTitle = paths.length === 1;
  for (const sourceFilePath of paths) {
    const fallbackTitle = sourceFilePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? "Map";
    const previousSelection = {
      mapId: state.value.selectedMapId,
      placementId: state.value.selectedPlacementId,
    };
    const savedMap = await store.importMapImage({
      workspaceId: workspace.id,
      sourceFilePath,
      mapTitle: useCustomTitle ? form.title.trim() || fallbackTitle : fallbackTitle,
      mapDescription: form.description.trim(),
    });
    recordMapDeletion(savedMap, previousSelection);
  }

  form.title = "Untitled Map";
  form.description = "";
}

async function syncMapDimensionsFromImage(mapId: string, width: number, height: number): Promise<void> {
  const workspace = snapshot.value?.workspace;
  const map = snapshot.value?.maps.find((entry) => entry.id === mapId) ?? null;
  if (!workspace || !map) {
    return;
  }

  if (map.width === width && map.height === height) {
    return;
  }

  try {
    await store.saveMap({
      workspaceId: workspace.id,
      id: map.id,
      title: map.title,
      description: map.description,
      assetId: map.assetId,
      assetName: map.assetName,
      width,
      height,
    });
  } catch (error) {
    console.error("Failed to sync map dimensions from the source image.", error);
  }
}

function handleMapImageLoad(event: Event): void {
  const image = event.target as HTMLImageElement | null;
  const mapId = selectedMap.value?.id ?? null;
  if (!image) {
    return;
  }

  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (width <= 0 || height <= 0) {
    return;
  }

  mapImageDimensions.width = width;
  mapImageDimensions.height = height;

  if (mapId) {
    void syncMapDimensionsFromImage(mapId, width, height);
  }
}

function beginPlacement(event: PointerEvent): void {
  if (isSpacePanActive.value || !createMode.value || placementTool.value !== "point" || !selectedMap.value || (event.pointerType === "mouse" && event.button !== 0)) {
    return;
  }

  event.preventDefault();
  const point = stagePoint(event);
  if (!point) {
    return;
  }

  placementGesture.active = true;
  placementGesture.pointerId = event.pointerId;
  placementGesture.point = point;

  const target = event.currentTarget as HTMLElement | null;
  if (target && !target.hasPointerCapture(event.pointerId)) {
    target.setPointerCapture(event.pointerId);
  }
}

function updatePlacement(event: PointerEvent): void {
  if (placementTool.value === "point") {
    if (!placementGesture.active || placementGesture.pointerId !== event.pointerId) {
      return;
    }

    const point = stagePoint(event);
    if (point) {
      placementGesture.point = point;
    }

    return;
  }

  const point = stagePoint(event);
  if (!point) {
    return;
  }

  shapeDraft.cursor = point;
}

async function finishPlacement(event: PointerEvent): Promise<void> {
  if (placementTool.value !== "point" || !placementGesture.active || placementGesture.pointerId !== event.pointerId) {
    return;
  }

  const target = event.currentTarget as HTMLElement | null;

  if (target && target.hasPointerCapture(event.pointerId)) {
    target.releasePointerCapture(event.pointerId);
  }

  resetPlacementGesture();
}

function cancelPlacement(event?: PointerEvent): void {
  if (event && placementGesture.pointerId !== event.pointerId) {
    return;
  }

  const target = event?.currentTarget as HTMLElement | null;
  if (event && target && target.hasPointerCapture(event.pointerId)) {
    target.releasePointerCapture(event.pointerId);
  }

  resetPlacementGesture();
  resetShapeDraft();
  resetPlacementDrag();
}

function addShapePoint(point: MapGeometryPointDto): void {
  if (placementTool.value !== "region" && placementTool.value !== "path") {
    return;
  }

  shapeDraft.active = true;
  shapeDraft.points = [...shapeDraft.points, { x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) }];
  shapeDraft.cursor = point;
}

function undoShapePoint(): void {
  if (placementTool.value !== "region" && placementTool.value !== "path") {
    return;
  }

  if (!shapeDraft.points.length) {
    return;
  }

  shapeDraft.points = shapeDraft.points.slice(0, -1);

  if (!shapeDraft.points.length) {
    shapeDraft.cursor = null;
  } else {
    shapeDraft.cursor = shapeDraft.points[shapeDraft.points.length - 1] ?? null;
  }
}

async function undoLastChange(): Promise<void> {
  if ((placementTool.value === "region" || placementTool.value === "path") && shapeDraft.points.length > 0) {
    undoShapePoint();
    return;
  }

  const historyMapId = selectedMap.value?.id ?? selectedPlacement.value?.mapId ?? null;
  const workspaceId = snapshot.value?.workspace?.id ?? null;
  if (!workspaceId || !historyMapId) {
    return;
  }

  const previousSelectedPlacementId = selectedPlacement.value?.id ?? null;
  const scopeKey = mapEditorHistoryService.createScopeKey(workspaceId, historyMapId);
  const didUndo = await mapEditorHistoryService.undo(scopeKey);
  if (!didUndo) {
    return;
  }

  if (previousSelectedPlacementId && selectedPlacement.value?.id === previousSelectedPlacementId && selectedPlacement.value) {
    syncPlacementDraftFromPlacement(selectedPlacement.value);
  }
}

async function savePlacementAtPoint(point: MapGeometryPointDto | null): Promise<void> {
  if (!point) {
    return;
  }

  const input = buildPlacementInput("point", point, []);
  if (!input) {
    return;
  }

  const previousSelection = {
    mapId: state.value.selectedMapId,
    placementId: state.value.selectedPlacementId,
  };
  const saved = await store.savePlacement(input);
  store.selectPlacement(saved.id);
  recordPlacementDeletion(saved, previousSelection);
}

async function persistPlacementGeometry(placement: MapPlacementDto, geometry: MapPlacementGeometryDto): Promise<void> {
  const workspace = snapshot.value?.workspace;
  if (!workspace) {
    return;
  }

  const previousPlacement = placementSnapshotToInput(placement);
  await store.savePlacement({
    workspaceId: workspace.id,
    mapId: placement.mapId,
    id: placement.id,
    entityId: placement.entityId,
    label: placement.label,
    kind: placement.kind,
    geometry,
    textWidth: placement.textWidth,
    textHeight: placement.textHeight,
    textOffsetX: placement.textOffsetX,
    textOffsetY: placement.textOffsetY,
    notes: placement.notes,
    color: placement.color,
    glowColor: placement.glowColor,
    shadowColor: placement.shadowColor,
    scale: placement.scale,
    fontColor: placement.fontColor,
    zIndex: placement.zIndex,
  });

  recordPlacementRestore(previousPlacement);
}

async function insertPlacementVertex(placementId: string, segmentIndex: number, event?: MouseEvent): Promise<void> {
  if (placementTool.value !== "move") {
    return;
  }

  const placement = placements.value.find((entry) => entry.id === placementId);
  if (!placement || (placement.kind !== "region" && placement.kind !== "path")) {
    return;
  }

  const segments = getPlacementSegments(placement);
  const segment = segments[segmentIndex];
  if (!segment) {
    return;
  }

  const points = cloneGeometryPoints(getPlacementGeometryPoints(placement));
  if (placement.kind === "region" && points.length < 3) {
    return;
  }

  if (placement.kind === "path" && points.length < 2) {
    return;
  }

  const anchorPoint = event ? stagePoint(event) : null;
  const insertedPoint = anchorPoint ? projectPointOnSegment(anchorPoint, segment.start, segment.end) : getSegmentMidpoint(segment.start, segment.end);
  points.splice(clamp(segment.insertIndex, 0, points.length), 0, clampGeometryPoint(insertedPoint));

  try {
    await persistPlacementGeometry(
      placement,
      clonePlacementGeometryForSave(placement, {
        point: clampGeometryPoint(points[0] ?? placement.geometry.point ?? { x: 0, y: 0 }),
        points,
      }),
    );
  } catch (error) {
    console.error("Failed to insert placement vertex.", error);
  }
}

async function deletePlacementVertex(placementId: string, vertexIndex: number): Promise<void> {
  if (placementTool.value !== "move") {
    return;
  }

  const placement = placements.value.find((entry) => entry.id === placementId);
  if (!placement || (placement.kind !== "region" && placement.kind !== "path")) {
    return;
  }

  const points = cloneGeometryPoints(getPlacementGeometryPoints(placement));
  const minimumPoints = placement.kind === "region" ? 3 : 2;
  if (points.length <= minimumPoints || vertexIndex < 0 || vertexIndex >= points.length) {
    return;
  }

  points.splice(vertexIndex, 1);

  try {
    await persistPlacementGeometry(
      placement,
      clonePlacementGeometryForSave(placement, {
        point: clampGeometryPoint(points[0] ?? placement.geometry.point ?? { x: 0, y: 0 }),
        points,
      }),
    );
  } catch (error) {
    console.error("Failed to delete placement vertex.", error);
  }
}

async function finishShapePlacement(): Promise<void> {
  if ((placementTool.value !== "region" && placementTool.value !== "path") || !canFinishShape.value) {
    return;
  }

  const input = buildPlacementInput(placementTool.value, shapeDraft.points[0] ?? null, shapeDraft.points);
  if (!input) {
    return;
  }

  const previousSelection = {
    mapId: state.value.selectedMapId,
    placementId: state.value.selectedPlacementId,
  };
  const saved = await store.savePlacement(input);
  store.selectPlacement(saved.id);
  recordPlacementDeletion(saved, previousSelection);
  resetShapeDraft();
}

function cancelShapePlacement(): void {
  resetShapeDraft();
  resetPlacementDrag();
  setPlacementTool("select");
}

function dismissPlacementPopover(): void {
  if (selectedPlacement.value) {
    placementPopoverDismissedId.value = selectedPlacement.value.id;
  }
  resetPlacementPopoverDrag();
}

function beginPlacementPopoverDrag(event: PointerEvent): void {
  if (!placementPopoverVisible.value || !placementPopoverPosition.value || event.button !== 0) {
    return;
  }

  const popover = placementPopoverRef.value;
  const shell = mapStageShell.value;
  if (!popover || !shell) {
    return;
  }

  event.preventDefault();
  placementPopoverDragState.active = true;
  placementPopoverDragState.pointerId = event.pointerId;
  placementPopoverDragState.startClientX = event.clientX;
  placementPopoverDragState.startClientY = event.clientY;
  placementPopoverDragState.startOffsetX = placementPopoverDragOffset.x;
  placementPopoverDragState.startOffsetY = placementPopoverDragOffset.y;

  const popoverRect = popover.getBoundingClientRect();
  placementPopoverDragState.startRect = {
    left: popoverRect.left,
    top: popoverRect.top,
    width: popoverRect.width,
    height: popoverRect.height,
  };

  window.addEventListener("pointermove", updatePlacementPopoverDrag);
  window.addEventListener("pointerup", endPlacementPopoverDrag);
  window.addEventListener("pointercancel", endPlacementPopoverDrag);
}

function updatePlacementPopoverDrag(event: PointerEvent): void {
  if (!placementPopoverDragState.active || event.pointerId !== placementPopoverDragState.pointerId) {
    return;
  }

  const shell = mapStageShell.value;
  const startRect = placementPopoverDragState.startRect;
  if (!shell || !startRect) {
    return;
  }

  const shellRect = shell.getBoundingClientRect();
  const deltaX = event.clientX - placementPopoverDragState.startClientX;
  const deltaY = event.clientY - placementPopoverDragState.startClientY;
  const desiredLeft = startRect.left + deltaX;
  const desiredTop = startRect.top + deltaY;
  const minLeft = shellRect.left + 8;
  const minTop = shellRect.top + 8;
  const maxLeft = Math.max(minLeft, shellRect.right - startRect.width - 8);
  const maxTop = Math.max(minTop, shellRect.bottom - startRect.height - 8);
  const clampedLeft = clamp(desiredLeft, minLeft, maxLeft);
  const clampedTop = clamp(desiredTop, minTop, maxTop);

  placementPopoverDragOffset.x = placementPopoverDragState.startOffsetX + (clampedLeft - startRect.left);
  placementPopoverDragOffset.y = placementPopoverDragState.startOffsetY + (clampedTop - startRect.top);
}

function endPlacementPopoverDrag(event?: PointerEvent): void {
  if (event && placementPopoverDragState.pointerId !== null && event.pointerId !== placementPopoverDragState.pointerId) {
    return;
  }

  placementPopoverDragState.active = false;
  placementPopoverDragState.pointerId = null;
  placementPopoverDragState.startRect = null;
  window.removeEventListener("pointermove", updatePlacementPopoverDrag);
  window.removeEventListener("pointerup", endPlacementPopoverDrag);
  window.removeEventListener("pointercancel", endPlacementPopoverDrag);
}

async function savePlacement(): Promise<void> {
  const placement = selectedPlacement.value;
  if (!placement) {
    return;
  }

  const previousPlacement = placementSnapshotToInput(placement);
  await persistPlacementDraft(previousPlacement, capturePlacementDraftSnapshot());
}

function beginDrag(placementId: string, event: PointerEvent): void {
  if (placementTool.value !== "move" || isSpacePanActive.value) {
    return;
  }

  const placement = placements.value.find((entry) => entry.id === placementId);
  if (!placement || placement.geometry.kind !== "point" || !selectedMap.value) {
    return;
  }

  event.preventDefault();
  draggingPlacementId.value = placementId;
  dragPoint.x = placement.geometry.point?.x ?? 0;
  dragPoint.y = placement.geometry.point?.y ?? 0;
  selectPlacement(placementId);

  const move = (moveEvent: PointerEvent): void => {
    const point = stagePoint(moveEvent);
    if (!point) {
      return;
    }

    dragPoint.x = point.x;
    dragPoint.y = point.y;
  };

  const end = async (): Promise<void> => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end as EventListener);

    try {
      const activePlacement = placements.value.find((entry) => entry.id === placementId);
      if (activePlacement) {
        await persistPlacementGeometry(activePlacement, clonePlacementGeometryForSave(activePlacement, {
          point: clampGeometryPoint({ x: dragPoint.x, y: dragPoint.y }),
        }));
      }
    } catch (error) {
      console.error("Failed to save moved marker placement.", error);
    } finally {
      draggingPlacementId.value = null;
    }
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end as EventListener, { once: true });
}

function beginShapeDrag(placementId: string, event: PointerEvent, mode: PlacementDragMode, vertexIndex: number | null = null): void {
  if (placementTool.value !== "move" || isSpacePanActive.value || (event.pointerType === "mouse" && event.button !== 0)) {
    return;
  }

  const placement = placements.value.find((entry) => entry.id === placementId);
  if (!placement || placement.geometry.kind === "point" || !selectedMap.value) {
    return;
  }

  event.preventDefault();
  selectPlacement(placementId);
  resetPlacementDrag();
  draggingShapePlacementId.value = placementId;
  draggingShapeMode.value = mode;
  draggingShapeVertexIndex.value = vertexIndex;
  draggingShapeStartPoint.value = stagePoint(event);
  draggingShapeStartPoints.value = cloneGeometryPoints(placement.geometry.points);
  draggingShapePoints.value = cloneGeometryPoints(placement.geometry.points);

  const move = (moveEvent: PointerEvent): void => {
    if (!draggingShapeStartPoint.value || draggingShapePlacementId.value !== placementId) {
      return;
    }

    const point = stagePoint(moveEvent);
    if (!point) {
      return;
    }

    const deltaX = point.x - draggingShapeStartPoint.value.x;
    const deltaY = point.y - draggingShapeStartPoint.value.y;

    if (draggingShapeMode.value === "vertex" && draggingShapeVertexIndex.value !== null) {
      draggingShapePoints.value = draggingShapeStartPoints.value.map((entry, index) =>
        index === draggingShapeVertexIndex.value ? clampGeometryPoint(point) : { x: entry.x, y: entry.y },
      );
      return;
    }

    draggingShapePoints.value = draggingShapeStartPoints.value.map((entry) =>
      clampGeometryPoint({
        x: entry.x + deltaX,
        y: entry.y + deltaY,
      }),
    );
  };

  const end = async (): Promise<void> => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end as EventListener);

    try {
      const activePlacement = placements.value.find((entry) => entry.id === placementId);
      if (activePlacement && draggingShapePoints.value.length) {
        await persistPlacementGeometry(
          activePlacement,
          clonePlacementGeometryForSave(activePlacement, {
            point: clampGeometryPoint(draggingShapePoints.value[0] ?? activePlacement.geometry.point ?? { x: 0, y: 0 }),
            points: draggingShapePoints.value,
          }),
        );
      }
    } catch (error) {
      console.error("Failed to save moved placement shape.", error);
    } finally {
      resetPlacementDrag();
    }
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end as EventListener, { once: true });
}

async function deletePlacement(placementId: string): Promise<void> {
  const workspace = state.value.snapshot?.workspace;
  const map = selectedMap.value;
  const placement = placements.value.find((entry) => entry.id === placementId) ?? null;
  if (!workspace || !map || !placement) {
    return;
  }

  const confirmed = await confirmationDialogService.requestConfirmation({
    title: `Delete ${placement.label}?`,
    message: `This will permanently remove the placement ${placement.label}.`,
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    tone: "danger",
  });

  if (!confirmed) {
    return;
  }

  clearPlacementAutosave(placementId);
  const wasSelectedPlacement = state.value.selectedPlacementId === placementId;
  await store.deletePlacement(workspace.id, map.id, placementId);
  if (placement) {
    recordPlacementRestore(placementSnapshotToInput(placement));
  }
  if (wasSelectedPlacement) {
    store.selectMap(map.id);
  }
}

async function deleteSelectedPlacement(): Promise<void> {
  const placementId = selectedPlacement.value?.id;
  if (!placementId) {
    return;
  }

  await deletePlacement(placementId);
}

function selectMapFromPlacement(): void {
  if (!selectedPlacement.value) {
    return;
  }

  selectMap(selectedPlacement.value.mapId);
}

function handlePlacementSelectClick(placementId: string): void {
  if (spacePressed.value || mapViewport.suppressClick) {
    return;
  }

  selectPlacement(placementId);
}

function handlePlacementMarkerPointerDown(placementId: string, event: PointerEvent): void {
  if (isSpacePanActive.value) {
    return;
  }

  if (placementTool.value === "move") {
    beginDrag(placementId, event);
  }
}

function handlePlacementShapePointerDown(
  placementId: string,
  event: PointerEvent,
  mode: PlacementDragMode,
  vertexIndex: number | null = null,
): void {
  if (isSpacePanActive.value) {
    return;
  }

  if (placementTool.value === "move") {
    beginShapeDrag(placementId, event, mode, vertexIndex);
  }
}

function handlePlacementSegmentClick(placementId: string, segmentIndex: number, event: MouseEvent): void {
  if (spacePressed.value || mapViewport.suppressClick) {
    return;
  }

  void insertPlacementVertex(placementId, segmentIndex, event);
}

async function handlePlacementClick(event: MouseEvent): Promise<void> {
  if (!createMode.value) {
    return;
  }

  if (spacePressed.value || mapViewport.suppressClick) {
    return;
  }

  const point = stagePoint(event);
  if (!point) {
    return;
  }

  if (placementTool.value === "point") {
    await savePlacementAtPoint(point);
    return;
  }

  if (placementTool.value === "region" || placementTool.value === "path") {
    addShapePoint(point);
  }
}
</script>

<template>
  <div class="map-layout">
    <section ref="mapStageShell" v-if="selectedMap" class="map-stage glass-panel" @wheel="handleZoom">
      <div
        ref="mapStage"
        class="map-canvas"
        :class="{ placing: createMode, panning: mapViewport.panning }"
        :style="mapCanvasStyle"
        @pointerdown="beginPan"
        @pointermove="updatePan"
        @pointerup="endPan"
        @pointercancel="cancelPan"
      >
      <img
        v-if="mapImageSource"
        :src="mapImageSource"
        :alt="selectedMap.title"
        class="map-image"
        draggable="false"
        @load="handleMapImageLoad"
        @dragstart.prevent
      />

      <svg class="map-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <template v-for="placement in placementPreviews" :key="`${placement.id}-clip`">
            <clipPath
              v-if="placement.kind === 'region' && placement.geometry.points.length"
              :id="getPlacementRegionClipId(placement.id)"
              clipPathUnits="userSpaceOnUse"
            >
              <polygon
                :points="getPlacementGeometryPoints(placement).map((point) => `${point.x * 100},${point.y * 100}`).join(' ')"
              />
            </clipPath>
          </template>
        </defs>

        <template v-for="placement in placementPreviews" :key="placement.id">
          <polygon
            v-if="placement.kind === 'region' && placement.geometry.points.length"
            class="placement-shape"
            :points="getPlacementGeometryPoints(placement).map((point) => `${point.x * 100},${point.y * 100}`).join(' ')"
            :fill="placement.color + '33'"
            :stroke="placement.color"
            stroke-width="0.6"
            vector-effect="non-scaling-stroke"
            @pointerdown="handlePlacementShapePointerDown(placement.id, $event as PointerEvent, 'shape')"
            @click.stop="placementTool === 'select' ? handlePlacementSelectClick(placement.id) : undefined"
          />
          <template
            v-if="placementTool === 'move' && state.selectedPlacementId === placement.id && (placement.kind === 'region' || placement.kind === 'path')"
          >
            <line
              v-for="(segment, index) in placementSegmentsById[placement.id] ?? []"
              :key="`${placement.id}-segment-${index}`"
              class="placement-segment-hit"
              :x1="segment.start.x * 100"
              :y1="segment.start.y * 100"
              :x2="segment.end.x * 100"
              :y2="segment.end.y * 100"
              @click.stop.prevent="handlePlacementSegmentClick(placement.id, index, $event as MouseEvent)"
            />
          </template>
          <template v-if="placement.kind === 'region' && placementRegionLabelPositions[placement.id]">
            <g
              :transform="`translate(${placementRegionLabelPositions[placement.id].x * 100}, ${placementRegionLabelPositions[placement.id].y * 100})`"
              :style="{ ...placementAppearanceStyle(placement), pointerEvents: 'none' }"
            >
              <g :clip-path="`url(#${getPlacementRegionClipId(placement.id)})`">
                <rect
                  class="placement-region-label-frame"
                  :x="-(placementRegionLabelFrames[placement.id]?.width ?? 0) / 2"
                  :y="-(placementRegionLabelFrames[placement.id]?.height ?? 0) / 2"
                  :width="placementRegionLabelFrames[placement.id]?.width ?? 0"
                  :height="placementRegionLabelFrames[placement.id]?.height ?? 0"
                  rx="0.8"
                  ry="0.8"
                >
                </rect>
              </g>
              <text
                class="placement-region-label-text-svg"
                :x="0"
                :y="0"
                :font-size="placementRegionLabelFontSizes[placement.id] ?? 3"
                text-anchor="middle"
                dominant-baseline="middle"
                :textLength="Math.max((placementRegionLabelFrames[placement.id]?.width ?? 0) * 0.9, 0)"
                lengthAdjust="spacingAndGlyphs"
              >
                {{ placement.label }}
              </text>
            </g>
          </template>
          <polyline
            v-if="placement.kind === 'path' && placement.geometry.points.length"
            class="placement-path-hit"
            :points="getPlacementGeometryPoints(placement).map((point) => `${point.x * 100},${point.y * 100}`).join(' ')"
            fill="none"
            stroke="rgba(0, 0, 0, 0.001)"
            :stroke-width="Math.max(getPlacementLineStrokeWidth(placement) + 1.8, 2.4)"
            stroke-linecap="round"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
            @pointerdown="handlePlacementShapePointerDown(placement.id, $event as PointerEvent, 'shape')"
            @click.stop="placementTool === 'select' ? handlePlacementSelectClick(placement.id) : undefined"
          />
          <polyline
            v-if="placement.kind === 'path' && placement.geometry.points.length"
            class="placement-shape"
            :points="getPlacementGeometryPoints(placement).map((point) => `${point.x * 100},${point.y * 100}`).join(' ')"
            fill="none"
            :stroke="placement.color"
            :stroke-width="getPlacementLineStrokeWidth(placement)"
            stroke-linecap="round"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
            pointer-events="none"
          />
          <template v-if="placement.kind === 'path' && placementPathLabelPositions[placement.id]">
            <g
              :transform="`translate(${placementPathLabelPositions[placement.id].x * 100}, ${placementPathLabelPositions[placement.id].y * 100})`"
              :style="{ ...placementAppearanceStyle(placement), pointerEvents: 'none' }"
            >
              <text
                class="placement-region-label-text-svg"
                :x="0"
                :y="0"
                :font-size="placementPathLabelFontSizes[placement.id] ?? 3"
                text-anchor="middle"
                dominant-baseline="middle"
                :textLength="Math.max((placementPathLabelFrames[placement.id]?.width ?? 0) * 0.9, 0)"
                lengthAdjust="spacingAndGlyphs"
              >
                {{ placement.label }}
              </text>
            </g>
          </template>
        </template>

        <polygon
          v-if="createMode && placementTool === 'region' && shapeDraft.points.length"
          :points="[...shapeDraft.points, ...(shapeDraft.cursor ? [shapeDraft.cursor] : [])].map((point) => `${point.x * 100},${point.y * 100}`).join(' ')"
          fill="rgba(111, 244, 201, 0.14)"
          stroke="rgba(111, 244, 201, 0.92)"
          stroke-width="0.6"
          vector-effect="non-scaling-stroke"
        />
        <polyline
          v-if="createMode && placementTool === 'path' && shapeDraft.points.length"
          :points="[...shapeDraft.points, ...(shapeDraft.cursor ? [shapeDraft.cursor] : [])].map((point) => `${point.x * 100},${point.y * 100}`).join(' ')"
          fill="none"
          stroke="rgba(111, 244, 201, 0.92)"
          :stroke-width="placementDraft.lineWidth"
          stroke-linecap="round"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
        />
      </svg>

      <template v-if="createMode && (placementTool === 'region' || placementTool === 'path')">
        <span
          v-for="(point, index) in shapeDraft.points"
          :key="`draft-point-${index}`"
          class="placement-handle placement-handle-draft"
          :style="{
            left: `${point.x * 100}%`,
            top: `${point.y * 100}%`,
            background: 'rgba(111, 244, 201, 0.92)',
          }"
          aria-hidden="true"
        />
      </template>

      <template v-for="placement in placementPreviews" :key="`${placement.id}-handles`">
        <button
          v-for="(point, index) in placementTool === 'move' && state.selectedPlacementId === placement.id ? getPlacementGeometryPoints(placement) : []"
          :key="`${placement.id}-handle-${index}`"
          type="button"
          class="placement-handle"
          :style="{
            left: `${point.x * 100}%`,
            top: `${point.y * 100}%`,
            background: placement.color,
          }"
          :aria-label="`Move ${placement.label} point ${index + 1}`"
          @pointerdown="handlePlacementShapePointerDown(placement.id, $event as PointerEvent, 'vertex', index)"
          @contextmenu.prevent.stop="void deletePlacementVertex(placement.id, index)"
          @click.stop
        />
      </template>

      <div
        v-if="createMode"
        class="placement-overlay"
        :class="{ 'placement-overlay-pan': isSpacePanActive }"
        @pointerdown="beginPlacement"
        @pointermove.stop.prevent="updatePlacement"
        @pointerup.stop.prevent="finishPlacement"
        @pointercancel.stop.prevent="cancelPlacement"
        @click.stop.prevent="handlePlacementClick"
        @contextmenu.prevent.stop="undoShapePoint"
      >
        <div v-if="placementTool === 'point'" class="placement-hint">
          <strong>Drop {{ placementLabel }}</strong>
          <span>Click anywhere on the map to place it.</span>
        </div>
        <div v-else class="placement-hint">
          <strong>{{ placementToolLabel }}</strong>
          <span>Click to add vertices, then finish from the toolbar.</span>
        </div>

        <div
          v-if="placementTool === 'point' && placementGesture.active && placementGesture.point"
          class="placement-preview"
          :style="{
            left: `${placementGesture.point.x * 100}%`,
            top: `${placementGesture.point.y * 100}%`,
            background: placementDraft.color,
            color: placementDraft.fontColor,
            ...placementAppearanceStyle(placementDraft),
          }"
        >
          <span>{{ placementLabel.slice(0, 1).toUpperCase() }}</span>
        </div>
      </div>

      <button
        v-for="placement in placementPointPreviews"
        :key="placement.id"
        type="button"
        class="marker-pin"
        draggable="false"
        :disabled="createMode"
        :class="{ active: placement.id === state.selectedPlacementId, dragging: placement.id === draggingPlacementId }"
        :style="{
          left: `${(placement.id === draggingPlacementId ? dragPoint.x : getPlacementGeometryPoint(placement).x) * 100}%`,
          top: `${(placement.id === draggingPlacementId ? dragPoint.y : getPlacementGeometryPoint(placement).y) * 100}%`,
          background: placement.color,
          color: placement.fontColor,
          ...placementAppearanceStyle(placement),
        }"
        @dragstart.prevent
        @pointerdown="handlePlacementMarkerPointerDown(placement.id, $event as PointerEvent)"
        @click.stop="placementTool === 'select' ? handlePlacementSelectClick(placement.id) : undefined"
      >
        {{ placement.label.slice(0, 1).toUpperCase() }}
      </button>

      </div>

      <div
        v-if="placementPopoverVisible && placementPopoverPosition"
        class="placement-popover-anchor"
        :class="placementPopoverPosition.orientation"
        :style="{
          left: placementPopoverPosition.left,
          top: placementPopoverPosition.top,
          transform: placementPopoverPosition.transform,
        }"
      >
        <Transition name="placement-popover">
          <section
            ref="placementPopoverRef"
            class="placement-popover glass-panel scroll-shell"
            :class="{ dragging: placementPopoverDragState.active }"
            :style="{
              '--placement-popover-drag-x': `${placementPopoverDragOffset.x}px`,
              '--placement-popover-drag-y': `${placementPopoverDragOffset.y}px`,
            }"
            @pointerdown.stop
            @click.stop
          >
            <div class="placement-popover-header">
              <div class="placement-popover-title" @pointerdown.stop.prevent="beginPlacementPopoverDrag">
                <p class="section-title">Quick Edit</p>
                <strong>{{ selectedPlacementTitle }}</strong>
                <span>{{ selectedPlacementKindDisplay }} - {{ selectedPlacementEntityLabel }}</span>
              </div>
              <button type="button" class="drawer-close" title="Hide popup" @click="dismissPlacementPopover()">x</button>
            </div>

            <div class="placement-popover-fields">
              <label>
                <span class="field-label">Label</span>
                <input v-model="placementDraft.label" type="text" />
              </label>
              <label>
                <span class="field-label">Entity</span>
                <select v-model="placementDraft.entityId">
                  <option value="">Unlinked</option>
                  <option v-for="entity in entities" :key="entity.id" :value="entity.id">{{ entity.title }}</option>
                </select>
              </label>
              <PlacementTextDimensionsControl
                v-if="selectedPlacement?.kind === 'region' || selectedPlacement?.kind === 'path'"
                v-model:width="placementDraft.textWidth"
                v-model:height="placementDraft.textHeight"
              />
              <PlacementTextOffsetControl
                v-if="selectedPlacement?.kind === 'region'"
                v-model:offsetX="placementDraft.textOffsetX"
                v-model:offsetY="placementDraft.textOffsetY"
              />
              <PlacementLineWidthControl v-if="selectedPlacement?.kind === 'path'" v-model:thickness="placementDraft.lineWidth" />
              <label>
                <span class="field-label">Color</span>
                <input v-model="placementDraft.color" type="color" />
              </label>
              <label>
                <span class="field-label">Glow Color</span>
                <input v-model="placementDraft.glowColor" type="color" />
              </label>
              <label>
                <span class="field-label">Shadow Color</span>
                <input v-model="placementDraft.shadowColor" type="color" />
              </label>
              <label v-if="selectedPlacement?.kind === 'point'">
                <span class="field-label">Scale {{ placementScaleLabel }}</span>
                <input v-model.number="placementDraft.scale" type="range" min="0.5" max="4" step="0.1" />
              </label>
              <label v-if="selectedPlacement?.kind === 'point' || selectedPlacement?.kind === 'region' || selectedPlacement?.kind === 'path'">
                <span class="field-label">Font Color</span>
                <input v-model="placementDraft.fontColor" type="color" />
              </label>
              <label>
                <span class="field-label">Notes</span>
                <textarea v-model="placementDraft.notes" rows="3"></textarea>
              </label>
            </div>

            <div class="placement-popover-actions">
              <button type="button" class="danger placement-delete-button" @click="deleteSelectedPlacement()">Delete</button>
            </div>
          </section>
        </Transition>
      </div>

      <div class="map-chrome">
        <div class="map-head">
          <div class="map-badge glass-panel">
            <p class="section-title">Map</p>
            <strong>{{ selectedMap.title }}</strong>
            <span>{{ selectedMap.description || "Imported map image" }}</span>
          </div>
          <div class="map-rail map-rail-left">
            <button type="button" class="round-fab" :class="{ active: activePanel === 'maps' }" title="Maps" @click="togglePanel('maps')">≡</button>
            <button type="button" class="round-fab" :class="{ active: activePanel === 'placement' }" title="Placements" @click="togglePanel('placement')">●</button>
            <button type="button" class="round-fab" :class="{ active: activePanel === 'tools' }" title="Tools" @click="togglePanel('tools')">✎</button>
          </div>
          <div class="map-rail map-rail-right">
            <button type="button" class="round-fab" :class="{ active: activePanel === 'inspector' }" title="Inspector" @click="togglePanel('inspector')">i</button>
          </div>
        </div>

        <transition name="drawer-swoop">
          <aside v-if="activePanel === 'maps'" class="map-drawer map-drawer-left glass-panel scroll-shell">
            <div class="drawer-section drawer-header">
              <p class="section-title">Maps</p>
              <button type="button" class="drawer-close" title="Close maps panel" @click="closePanel()">×</button>
            </div>
            <div class="drawer-section">
              <div class="map-list compact-list">
                <button
                  v-for="map in snapshot?.maps ?? []"
                  :key="map.id"
                  type="button"
                  class="map-list-item"
                  :class="{ active: map.id === selectedMap?.id }"
                  @click="selectMap(map.id)"
                >
                  <strong>{{ map.title }}</strong>
                  <span>{{ map.description || "Imported map image" }}</span>
                </button>
              </div>
            </div>

            <div class="drawer-section">
              <p class="section-title">Import</p>
              <div class="map-import-form">
                <input v-model="form.title" type="text" placeholder="Map title" />
                <textarea v-model="form.description" placeholder="Map description"></textarea>
              <button type="button" @click="importMapImage()">Import Images</button>
              </div>
            </div>
          </aside>
        </transition>

        <transition name="drawer-swoop">
          <aside v-if="activePanel === 'placement'" class="map-drawer map-drawer-left glass-panel scroll-shell">
            <div class="drawer-section drawer-header">
              <p class="section-title">Placement Draft</p>
              <button type="button" class="drawer-close" title="Close placement panel" @click="closePanel()">×</button>
            </div>
            <div class="drawer-section">
              <div class="compact-field">
                <label>
                  <span>Label</span>
                  <input v-model="placementDraft.label" type="text" placeholder="Marker label" />
                </label>
                <label>
                  <span>Entity</span>
                  <select v-model="placementDraft.entityId">
                    <option value="">Link later</option>
                    <option v-for="entity in entities" :key="entity.id" :value="entity.id">{{ entity.title }}</option>
                  </select>
                </label>
                <label>
                  <span>Color</span>
                  <input v-model="placementDraft.color" type="color" />
                </label>
                <label>
                  <span>Glow Color</span>
                  <input v-model="placementDraft.glowColor" type="color" />
                </label>
                <label>
                  <span>Shadow Color</span>
                  <input v-model="placementDraft.shadowColor" type="color" />
                </label>
                <label v-if="isPointPlacementDraft">
                  <span>Scale {{ placementScaleLabel }}</span>
                  <input v-model.number="placementDraft.scale" type="range" min="0.5" max="4" step="0.1" />
                </label>
                <PlacementTextDimensionsControl
                  v-if="isRegionPlacementDraft || isPathPlacementDraft"
                  v-model:width="placementDraft.textWidth"
                  v-model:height="placementDraft.textHeight"
                />
                <PlacementTextOffsetControl
                  v-if="isRegionPlacementDraft"
                  v-model:offsetX="placementDraft.textOffsetX"
                  v-model:offsetY="placementDraft.textOffsetY"
                />
                <PlacementLineWidthControl v-if="isPathPlacementDraft" v-model:thickness="placementDraft.lineWidth" />
                <label v-if="isPointPlacementDraft || isRegionPlacementDraft || isPathPlacementDraft">
                  <span>Font Color</span>
                  <input v-model="placementDraft.fontColor" type="color" />
                </label>
                <label>
                  <span>Notes</span>
                  <textarea v-model="placementDraft.notes" placeholder="Marker notes"></textarea>
                </label>
              </div>
            </div>

            <div class="drawer-section">
              <p class="section-title">Tool</p>
              <div class="tool-stack">
                <button type="button" class="tool-chip" :class="{ active: placementTool === 'select' }" @click="setPlacementTool('select')">Select</button>
                <button type="button" class="tool-chip" :class="{ active: placementTool === 'move' }" @click="setPlacementTool('move')">Move/Edit</button>
                <button type="button" class="tool-chip" :class="{ active: placementTool === 'point' }" @click="setPlacementTool('point')">Marker</button>
                <button type="button" class="tool-chip" :class="{ active: placementTool === 'region' }" @click="setPlacementTool('region')">Area</button>
                <button type="button" class="tool-chip" :class="{ active: placementTool === 'path' }" @click="setPlacementTool('path')">Pen</button>
              </div>
              <p class="placement-help">{{ placementToolHint }}</p>
            </div>

            <div class="drawer-section">
              <p class="section-title">Markers</p>
              <div class="marker-list compact-list">
                <button
                  v-for="placement in placementPreviews"
                  :key="placement.id"
                  type="button"
                  class="marker-row"
                  :class="{ active: placement.id === state.selectedPlacementId }"
                  @click="selectPlacement(placement.id)"
                >
                  <strong>{{ placement.label }}</strong>
                  <span>{{ placement.entityId ? (entities.find((entity) => entity.id === placement.entityId)?.title ?? placement.label) : placement.kind }}</span>
                </button>
              </div>
            </div>
          </aside>
        </transition>

        <transition name="drawer-swoop">
          <aside v-if="activePanel === 'tools'" class="map-drawer map-drawer-left glass-panel scroll-shell">
            <div class="drawer-section drawer-header">
              <p class="section-title">Tools</p>
              <button type="button" class="drawer-close" title="Close tools panel" @click="closePanel()">×</button>
            </div>
            <div class="drawer-section">
              <div class="tool-stack">
                <button type="button" class="tool-chip" :class="{ active: placementTool === 'select' }" @click="setPlacementTool('select')">Select</button>
                <button type="button" class="tool-chip" :class="{ active: placementTool === 'move' }" @click="setPlacementTool('move')">Move/Edit</button>
                <button type="button" class="tool-chip" :class="{ active: placementTool === 'point' }" @click="setPlacementTool('point')">Marker</button>
                <button type="button" class="tool-chip" :class="{ active: placementTool === 'region' }" @click="setPlacementTool('region')">Area</button>
                <button type="button" class="tool-chip" :class="{ active: placementTool === 'path' }" @click="setPlacementTool('path')">Pen</button>
              </div>
            </div>

            <div class="drawer-section">
              <p class="section-title">Behavior</p>
              <p class="placement-help">{{ placementToolLabel }} mode keeps the map visible while the floating controls stay compact.</p>
              <ul class="tool-notes">
                <li>Use Select for metadata edits and Move/Edit for dragging markers or reshaping placements.</li>
                <li>Use the bottom round buttons for the primary editing modes.</li>
                <li>Use the left rail to open maps, placement drafts, or this tool guide.</li>
                <li>Keep the map itself as the dominant surface while controls float over it.</li>
              </ul>
            </div>
          </aside>
        </transition>

        <transition name="drawer-swoop">
          <aside v-if="activePanel === 'inspector'" class="map-drawer map-drawer-right glass-panel scroll-shell">
            <template v-if="selectedPlacement">
              <div class="drawer-section drawer-header">
                <p class="section-title">Inspector</p>
                <button type="button" class="drawer-close" title="Close inspector panel" @click="closePanel()">×</button>
              </div>
              <div class="drawer-section">
                <h3>{{ selectedPlacementTitle }}</h3>
                <p class="placement-help">{{ selectedPlacementKindLabel }} · {{ selectedPlacementEntityLabel }}</p>
              </div>

              <div class="drawer-section">
                <div class="tool-stack">
                  <button type="button" @click="selectMapFromPlacement()">Go To Map</button>
                  <button type="button" class="danger placement-delete-button" @click="deleteSelectedPlacement()">Delete</button>
                </div>
              </div>

              <div class="drawer-section">
                <p class="section-title">Notes</p>
                <p class="placement-help">{{ selectedPlacementNotes }}</p>
              </div>
            </template>

            <template v-else>
              <div class="drawer-section drawer-header">
                <p class="section-title">Map Details</p>
                <button type="button" class="drawer-close" title="Close inspector panel" @click="closePanel()">×</button>
              </div>
              <div class="drawer-section">
                <MapDetailsEditor />
              </div>
            </template>
          </aside>
        </transition>

        <div class="map-tooltip glass-panel">
          <strong>{{ placementToolLabel }} mode</strong>
          <span>{{ placementToolHint }}</span>
        </div>

        <div class="map-bottom-toolbar glass-panel">
          <button type="button" class="round-fab" :class="{ active: placementTool === 'select' }" title="Select" @click="setPlacementTool('select')">↖</button>
          <button type="button" class="round-fab" :class="{ active: placementTool === 'move' }" title="Move/Edit" @click="setPlacementTool('move')">↔</button>
          <button type="button" class="round-fab" :class="{ active: placementTool === 'point' }" title="Marker" @click="setPlacementTool('point')">●</button>
          <button type="button" class="round-fab" :class="{ active: placementTool === 'region' }" title="Area" @click="setPlacementTool('region')">▢</button>
          <button type="button" class="round-fab" :class="{ active: placementTool === 'path' }" title="Pen" @click="setPlacementTool('path')">✎</button>
          <button type="button" class="round-fab" title="Zoom out" @click="zoomOut()">−</button>
          <button type="button" class="round-fab" title="Zoom in" @click="zoomIn()">+</button>
          <button type="button" class="round-fab" title="Reset view" @click="resetViewport()">⟲</button>
          <button
            v-if="isCreateTool && (placementTool === 'region' || placementTool === 'path')"
            type="button"
            class="round-fab confirm"
            :disabled="!canFinishShape"
            title="Finish shape"
            @click="finishShapePlacement()"
          >
            ✓
          </button>
          <button v-if="isCreateTool" type="button" class="round-fab danger" title="Cancel tool" @click="cancelShapePlacement()">×</button>
        </div>
      </div>
    </section>

    <div v-else class="empty-map">
      <div class="empty-map-card glass-panel">
        <p class="section-title">Map</p>
        <h2>No map selected</h2>
        <p class="muted">Import one or more images to start placing landmarks, NPCs, shrines, and events.</p>
        <button type="button" class="empty-map-import" @click="importMapImage()">Import Images</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-layout {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  gap: 0.18rem;
}

.map-stage {
  position: relative;
  flex: 1 1 auto;
  align-self: stretch;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 0.28rem;
  border-radius: 12px;
  overflow: hidden;
}

.map-canvas {
  position: relative;
  width: 100%;
  height: auto;
  display: block;
  min-height: 0;
  border-radius: 14px;
  overflow: hidden;
  touch-action: none;
  user-select: none;
}

.map-canvas.placing .marker-pin {
  pointer-events: none;
}

.map-image {
  display: block;
  width: 100%;
  height: auto;
  background: rgba(5, 10, 16, 0.98);
  border-radius: 12px;
  box-shadow: var(--shadow);
  user-select: none;
  -webkit-user-drag: none;
}

.map-overlay,
.map-chrome {
  position: absolute;
  inset: 0;
}

.map-overlay {
  width: 100%;
  height: 100%;
  pointer-events: auto;
  z-index: 1;
}

.placement-region-label-frame {
  fill: color-mix(in srgb, var(--placement-fill, #77c8ff) 22%, rgba(9, 16, 25, 0.92));
  stroke: color-mix(in srgb, var(--placement-glow, #77c8ff) 80%, white);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
  filter:
    drop-shadow(0 0 1px color-mix(in srgb, var(--placement-shadow, #000000) 55%, transparent))
    drop-shadow(0 0 9px color-mix(in srgb, var(--placement-glow, #77c8ff) 28%, transparent))
    drop-shadow(0 6px 10px color-mix(in srgb, var(--placement-shadow, #000000) 72%, transparent));
}

.placement-region-label-text-svg {
  font-family: "Trebuchet MS", "Arial Narrow", "Segoe UI", sans-serif;
  font-weight: 600;
  font-stretch: condensed;
  letter-spacing: -0.03em;
  fill: var(--placement-ink, #ffffff);
  stroke: rgba(0, 0, 0, 0.42);
  stroke-width: 0.35;
  paint-order: stroke fill;
  pointer-events: none;
  user-select: none;
}

.map-chrome {
  pointer-events: none;
  z-index: 4;
}

.map-head {
  position: absolute;
  inset: 0.36rem 0.36rem auto 0.36rem;
  display: flex;
  justify-content: space-between;
  gap: 0.3rem;
  align-items: flex-start;
}

.map-badge {
  pointer-events: auto;
  display: grid;
  gap: 0.06rem;
  max-width: min(18rem, 30vw);
  padding: 0.28rem 0.34rem;
  border-radius: 10px;
}

.map-badge span {
  color: var(--fg-muted);
  font-size: 0.68rem;
}

.map-rail {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  pointer-events: auto;
}

.map-rail-left {
  left: 0.36rem;
  top: calc(3.55rem + 20px);
}

.map-rail-right {
  right: 0.36rem;
  top: 3.2rem;
}

.round-fab {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(130, 160, 190, 0.28);
  background: rgba(14, 22, 33, 0.82);
  color: var(--fg);
  box-shadow: 0 10px 18px rgba(0, 0, 0, 0.2);
  font-size: 0.76rem;
}

.round-fab.active {
  background: rgba(111, 244, 201, 0.18);
  border-color: rgba(111, 244, 201, 0.38);
}

.round-fab.confirm {
  background: rgba(111, 244, 201, 0.18);
  border-color: rgba(111, 244, 201, 0.32);
}

.round-fab.danger {
  background: rgba(235, 97, 97, 0.16);
  border-color: rgba(235, 97, 97, 0.28);
}

.map-drawer {
  position: absolute;
  top: 3.05rem;
  bottom: auto;
  width: min(12.75rem, 24vw);
  max-height: calc(100% - 3.45rem);
  overflow: auto;
  pointer-events: auto;
  padding: 0.28rem 0.3rem;
  display: grid;
  gap: 0.18rem;
  align-content: start;
  border-radius: 12px;
  background: rgba(9, 16, 25, 0.9);
  border: 1px solid rgba(130, 160, 190, 0.18);
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
}

.map-drawer-left {
  left: 0.36rem;
}

.map-drawer-right {
  right: 0.36rem;
}

.drawer-section {
  display: grid;
  gap: 0.16rem;
}

.drawer-section h3 {
  margin: 0;
}

.drawer-header {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}

.drawer-close {
  width: 20px;
  height: 20px;
  padding: 0;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 0.72rem;
  line-height: 1;
  background: rgba(14, 22, 33, 0.9);
  border: 1px solid rgba(130, 160, 190, 0.22);
  color: var(--fg-muted);
}

.compact-list {
  display: grid;
  gap: 0.12rem;
}

.map-list-item,
.marker-row {
  display: grid;
  gap: 0.06rem;
  text-align: left;
  padding: 0.24rem 0.28rem;
  border-radius: 8px;
}

.map-list-item span,
.marker-row span {
  color: var(--fg-muted);
  font-size: 0.7rem;
}

.map-list-item.active,
.marker-row.active {
  background: rgba(111, 244, 201, 0.16);
}

.map-import-form,
.compact-field {
  display: grid;
  gap: 0.14rem;
}

.compact-field label {
  display: grid;
  gap: 0.06rem;
  color: var(--fg-muted);
  font-size: 0.66rem;
}

.compact-field input[type="text"],
.compact-field textarea,
.compact-field select {
  width: 100%;
}

.tool-stack {
  display: flex;
  flex-wrap: wrap;
  gap: 0.12rem;
}

.tool-chip {
  border-radius: 999px;
  padding: 0.2rem 0.34rem;
  background: rgba(14, 22, 33, 0.86);
  border: 1px solid rgba(130, 160, 190, 0.22);
  color: var(--fg);
  font-size: 0.72rem;
}

.tool-chip.active {
  background: rgba(111, 244, 201, 0.18);
  border-color: rgba(111, 244, 201, 0.32);
}

.tool-notes {
  margin: 0;
  padding-left: 0.9rem;
  display: grid;
  gap: 0.14rem;
  color: var(--fg-muted);
  font-size: 0.7rem;
}

.placement-help {
  margin: 0;
  color: var(--fg-muted);
  font-size: 0.7rem;
  line-height: 1.35;
}

.map-bottom-toolbar {
  position: absolute;
  left: 50%;
  bottom: 0.28rem;
  transform: translateX(-50%);
  display: flex;
  gap: 0.1rem;
  align-items: center;
  pointer-events: auto;
  padding: 0.16rem 0.18rem;
  border-radius: 999px;
  background: rgba(9, 16, 25, 0.88);
  border: 1px solid rgba(130, 160, 190, 0.18);
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
  z-index: 40;
}

.map-tooltip {
  position: absolute;
  left: 0.28rem;
  bottom: 0.28rem;
  width: min(15.5rem, 24vw);
  display: grid;
  gap: 0.06rem;
  padding: 0.22rem 0.28rem;
  border-radius: 10px;
  pointer-events: auto;
  background: rgba(9, 16, 25, 0.88);
  border: 1px solid rgba(130, 160, 190, 0.18);
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
  z-index: 40;
}

.map-tooltip span {
  color: var(--fg-muted);
  font-size: 0.68rem;
  line-height: 1.35;
}

.placement-overlay {
  position: absolute;
  inset: 0;
  z-index: 3;
  cursor: crosshair;
  pointer-events: auto;
}

.placement-overlay-pan {
  pointer-events: none;
}

.placement-hint {
  position: absolute;
  top: 3.25rem;
  left: 50%;
  transform: translateX(-50%);
  display: grid;
  gap: 0.05rem;
  padding: 0.22rem 0.3rem;
  border-radius: 10px;
  background: rgba(12, 16, 23, 0.86);
  border: 1px solid rgba(111, 244, 201, 0.16);
  box-shadow: var(--shadow);
  color: var(--fg);
  max-width: 16rem;
  pointer-events: none;
}

.placement-hint span {
  color: var(--fg-muted);
  font-size: 0.68rem;
  line-height: 1.35;
}

.placement-preview {
  position: absolute;
  transform: translate(-50%, -50%) scale(var(--marker-scale, 1));
  transform-origin: center center;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--placement-glow, #77c8ff) 82%, white);
  background: var(--placement-fill, rgba(111, 244, 201, 0.18));
  box-shadow:
    0 0 0 6px color-mix(in srgb, var(--placement-glow, #77c8ff) 18%, transparent),
    0 10px 18px color-mix(in srgb, var(--placement-shadow, #000000) 80%, transparent);
  display: grid;
  place-items: center;
  color: var(--placement-ink, rgba(255, 255, 255, 0.96));
  pointer-events: none;
  z-index: 4;
}

.placement-preview span {
  font-size: 0.48rem;
  font-weight: 700;
  line-height: 1;
}

.marker-pin {
  position: absolute;
  transform: translate(-50%, -50%) scale(var(--marker-scale, 1));
  transform-origin: center center;
  width: 16px;
  height: 16px;
  min-width: 16px;
  min-height: 16px;
  padding: 0;
  aspect-ratio: 1 / 1;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--placement-glow, #77c8ff) 78%, white);
  background: var(--placement-fill, rgba(119, 200, 255, 0.92));
  font-size: 0.46rem;
  line-height: 1;
  display: grid;
  place-items: center;
  color: var(--placement-ink, rgba(255, 255, 255, 0.96));
  box-shadow:
    0 0 0 6px color-mix(in srgb, var(--placement-glow, #77c8ff) 16%, transparent),
    0 8px 14px color-mix(in srgb, var(--placement-shadow, #000000) 82%, transparent);
  pointer-events: auto;
  z-index: 2;
  user-select: none;
  -webkit-user-drag: none;
  appearance: none;
  overflow: hidden;
}

.marker-pin.active {
  outline: 2px solid color-mix(in srgb, var(--placement-glow, #77c8ff) 72%, white);
}

.marker-pin.dragging {
  opacity: 0.85;
}

.placement-handle {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 8px;
  height: 8px;
  min-width: 8px;
  min-height: 8px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12);
  pointer-events: auto;
  z-index: 3;
  user-select: none;
  -webkit-user-drag: none;
  appearance: none;
  overflow: hidden;
}

.placement-handle-draft {
  pointer-events: none;
}

.placement-segment-hit {
  fill: none;
  stroke: rgba(111, 244, 201, 0.001);
  stroke-width: 12;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
  pointer-events: stroke;
  cursor: copy;
}

.placement-segment-hit:hover {
  stroke: rgba(111, 244, 201, 0.14);
}

.placement-path-hit {
  fill: none;
  stroke: rgba(0, 0, 0, 0.001);
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
  pointer-events: stroke;
}

.placement-popover-anchor {
  position: absolute;
  z-index: 45;
  pointer-events: none;
  will-change: left, top, transform;
}

.placement-popover {
  width: min(14.5rem, 36vw);
  max-height: min(88vh, 34rem);
  display: grid;
  gap: 0.2rem;
  padding: 0.34rem;
  padding-right: 0.26rem;
  border-radius: 11px;
  background: rgba(9, 16, 25, 0.96);
  border: 1px solid rgba(111, 244, 201, 0.22);
  box-shadow: 0 16px 28px rgba(0, 0, 0, 0.36);
  backdrop-filter: blur(18px);
  pointer-events: auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  --placement-popover-enter-scale: 1;
  --placement-popover-enter-shift: 0px;
  transform: translate3d(var(--placement-popover-drag-x, 0px), var(--placement-popover-drag-y, 0px), 0) scale(var(--placement-popover-enter-scale)) translateY(var(--placement-popover-enter-shift));
  transform-origin: top left;
  will-change: transform;
}

.placement-popover.dragging {
  transition: none !important;
}

.placement-popover-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.2rem;
}

.placement-popover-title {
  display: grid;
  gap: 0.02rem;
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.placement-popover-title:active {
  cursor: grabbing;
}

.placement-popover-header strong {
  display: block;
  font-size: 0.84rem;
  line-height: 1.15;
}

.placement-popover-header span {
  display: block;
  color: var(--fg-muted);
  font-size: 0.67rem;
  line-height: 1.25;
}

.placement-popover-fields {
  display: grid;
  gap: 0.12rem;
}

.placement-popover label {
  display: grid;
  gap: 0.05rem;
}

.placement-popover .field-label {
  margin-bottom: 0;
  font-size: 0.64rem;
}

.placement-popover input,
.placement-popover select,
.placement-popover textarea {
  width: 100%;
}

.placement-popover textarea {
  min-height: 3rem;
  resize: vertical;
}

.placement-popover-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.12rem;
  flex-wrap: wrap;
}

.placement-delete-button {
  flex: 1 1 8rem;
  min-width: 8rem;
  background: rgba(235, 97, 97, 0.2);
  border: 1px solid rgba(235, 97, 97, 0.34);
  color: #fff;
}

.placement-delete-button:hover {
  background: rgba(235, 97, 97, 0.3);
}

.placement-popover-actions .placement-delete-button {
  width: 100%;
}

.empty-map {
  min-height: 100%;
  display: grid;
  place-items: center;
  text-align: center;
}

.empty-map-card {
  width: min(20rem, 92%);
  display: grid;
  gap: 0.45rem;
  padding: 1rem 1.05rem;
}

.empty-map-card h2 {
  margin: 0;
  font-size: 1.1rem;
}

.empty-map-card .muted {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.4;
}

.empty-map-import {
  justify-self: center;
  padding-inline: 1rem;
}

.placement-popover-enter-active,
.placement-popover-leave-active {
  transition:
    opacity 140ms cubic-bezier(0.2, 0.85, 0.2, 1),
    transform 140ms cubic-bezier(0.2, 0.85, 0.2, 1);
}

.placement-popover-enter-from,
.placement-popover-leave-to {
  opacity: 0;
  --placement-popover-enter-scale: 0.94;
  --placement-popover-enter-shift: 4px;
}

.placement-popover-enter-to,
.placement-popover-leave-from {
  opacity: 1;
  --placement-popover-enter-scale: 1;
  --placement-popover-enter-shift: 0px;
}

.drawer-swoop-enter-active,
.drawer-swoop-leave-active {
  transition: transform 180ms cubic-bezier(0.2, 0.85, 0.2, 1), opacity 180ms cubic-bezier(0.2, 0.85, 0.2, 1);
}

.drawer-swoop-enter-from,
.drawer-swoop-leave-to {
  opacity: 0;
  transform: translate3d(0, 12px, 0) scale(0.96);
}

.drawer-swoop-enter-to,
.drawer-swoop-leave-from {
  opacity: 1;
  transform: translate3d(0, 0, 0) scale(1);
}

@media (max-width: 1280px) {
  .map-stage {
    padding: 0.24rem;
  }

  .map-drawer {
    width: min(12.5rem, 88vw);
  }

  .map-tooltip {
    width: min(15rem, 74vw);
  }
}

@media (max-width: 900px) {
  .map-head {
    inset: 0.3rem 0.3rem auto 0.3rem;
  }

  .map-rail-left {
    top: calc(3rem + 20px);
    left: 0.3rem;
  }

  .map-rail-right {
    top: 3rem;
    right: 0.3rem;
  }

  .map-drawer-left,
  .map-drawer-right {
    top: 2.85rem;
  }

  .map-bottom-toolbar {
    bottom: 0.22rem;
  }

  .map-tooltip {
    display: none;
  }
}
</style>
