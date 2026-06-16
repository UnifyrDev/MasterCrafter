import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";

interface ResizeState {
  active: boolean;
  pointerId: number | null;
  startX: number;
  startWidth: number;
}

export interface ResizableEdgePanelsOptions {
  storageKeyPrefix: string;
  defaultLeftWidth: number;
  defaultRightWidth: number;
  minLeftWidth: number;
  minRightWidth: number;
  minCenterWidth: number;
  handleWidth: number;
  stackedBreakpoint?: number;
}

const LOCAL_STORAGE_SUFFIX_LEFT = ".leftWidth";
const LOCAL_STORAGE_SUFFIX_RIGHT = ".rightWidth";

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function readStoredWidth(key: string, fallback: number): number {
  const parsed = Number.parseInt(window.localStorage.getItem(key) ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function useResizableEdgePanels(options: ResizableEdgePanelsOptions) {
  const layoutRef = ref<HTMLElement | null>(null);
  const leftResizeHandleRef = ref<HTMLElement | null>(null);
  const rightResizeHandleRef = ref<HTMLElement | null>(null);
  const leftWidth = ref(options.defaultLeftWidth);
  const rightWidth = ref(options.defaultRightWidth);
  const layoutWidth = ref(0);
  const viewportWidth = ref(typeof window !== "undefined" ? window.innerWidth : Number.POSITIVE_INFINITY);
  const leftResize = reactive<ResizeState>({
    active: false,
    pointerId: null,
    startX: 0,
    startWidth: options.defaultLeftWidth,
  });
  const rightResize = reactive<ResizeState>({
    active: false,
    pointerId: null,
    startX: 0,
    startWidth: options.defaultRightWidth,
  });
  let layoutObserver: ResizeObserver | null = null;

  const storageKeyLeft = `${options.storageKeyPrefix}${LOCAL_STORAGE_SUFFIX_LEFT}`;
  const storageKeyRight = `${options.storageKeyPrefix}${LOCAL_STORAGE_SUFFIX_RIGHT}`;
  const stackedBreakpoint = options.stackedBreakpoint ?? 1220;
  const handleSpan = options.handleWidth * 2;

  const minimumLayoutWidth = computed(() => options.minLeftWidth + options.minRightWidth + options.minCenterWidth + handleSpan);
  const isStackedLayout = computed(() => viewportWidth.value < stackedBreakpoint || layoutWidth.value === 0 || layoutWidth.value < minimumLayoutWidth.value);
  const layoutStyle = computed(() => {
    if (isStackedLayout.value) {
      return {
        gridTemplateColumns: "minmax(0, 1fr)",
      };
    }

    return {
      gridTemplateColumns: `${leftWidth.value}px ${options.handleWidth}px minmax(0, 1fr) ${options.handleWidth}px ${rightWidth.value}px`,
    };
  });

  function availablePanelSpace(): number {
    return Math.max(0, layoutWidth.value - options.minCenterWidth - handleSpan);
  }

  function clampLeftWidth(nextWidth: number): number {
    if (isStackedLayout.value) {
      return Math.max(options.minLeftWidth, Math.floor(nextWidth));
    }

    const maxWidth = Math.max(options.minLeftWidth, availablePanelSpace() - rightWidth.value);
    return clamp(Math.floor(nextWidth), options.minLeftWidth, maxWidth);
  }

  function clampRightWidth(nextWidth: number): number {
    if (isStackedLayout.value) {
      return Math.max(options.minRightWidth, Math.floor(nextWidth));
    }

    const maxWidth = Math.max(options.minRightWidth, availablePanelSpace() - leftWidth.value);
    return clamp(Math.floor(nextWidth), options.minRightWidth, maxWidth);
  }

  function reconcileWidths(): void {
    if (isStackedLayout.value) {
      return;
    }

    leftWidth.value = clampLeftWidth(leftWidth.value);
    rightWidth.value = clampRightWidth(rightWidth.value);
    leftWidth.value = clampLeftWidth(leftWidth.value);
    rightWidth.value = clampRightWidth(rightWidth.value);
  }

  function measureLayoutWidth(): void {
    const element = layoutRef.value;
    layoutWidth.value = element ? Math.floor(element.getBoundingClientRect().width) : 0;
    reconcileWidths();
  }

  function persistWidths(): void {
    window.localStorage.setItem(storageKeyLeft, String(leftWidth.value));
    window.localStorage.setItem(storageKeyRight, String(rightWidth.value));
  }

  function restoreWidths(): void {
    leftWidth.value = readStoredWidth(storageKeyLeft, options.defaultLeftWidth);
    rightWidth.value = readStoredWidth(storageKeyRight, options.defaultRightWidth);
  }

  function startLeftResize(event: PointerEvent): void {
    if (event.button !== 0 || isStackedLayout.value) {
      return;
    }

    event.preventDefault();
    leftResize.active = true;
    leftResize.pointerId = event.pointerId;
    leftResize.startX = event.clientX;
    leftResize.startWidth = leftWidth.value;

    const handle = leftResizeHandleRef.value;
    if (handle && !handle.hasPointerCapture(event.pointerId)) {
      handle.setPointerCapture(event.pointerId);
    }

    window.addEventListener("pointermove", updateLeftResize);
    window.addEventListener("pointerup", stopLeftResize);
    window.addEventListener("pointercancel", stopLeftResize);
  }

  function updateLeftResize(event: PointerEvent): void {
    if (!leftResize.active || leftResize.pointerId !== event.pointerId) {
      return;
    }

    leftWidth.value = clampLeftWidth(leftResize.startWidth + (event.clientX - leftResize.startX));
    rightWidth.value = clampRightWidth(rightWidth.value);
  }

  function stopLeftResize(event?: PointerEvent): void {
    if (!leftResize.active) {
      return;
    }

    if (event && leftResize.pointerId !== event.pointerId) {
      return;
    }

    const handle = leftResizeHandleRef.value;
    if (event && handle && handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }

    leftResize.active = false;
    leftResize.pointerId = null;

    window.removeEventListener("pointermove", updateLeftResize);
    window.removeEventListener("pointerup", stopLeftResize);
    window.removeEventListener("pointercancel", stopLeftResize);
    persistWidths();
  }

  function startRightResize(event: PointerEvent): void {
    if (event.button !== 0 || isStackedLayout.value) {
      return;
    }

    event.preventDefault();
    rightResize.active = true;
    rightResize.pointerId = event.pointerId;
    rightResize.startX = event.clientX;
    rightResize.startWidth = rightWidth.value;

    const handle = rightResizeHandleRef.value;
    if (handle && !handle.hasPointerCapture(event.pointerId)) {
      handle.setPointerCapture(event.pointerId);
    }

    window.addEventListener("pointermove", updateRightResize);
    window.addEventListener("pointerup", stopRightResize);
    window.addEventListener("pointercancel", stopRightResize);
  }

  function updateRightResize(event: PointerEvent): void {
    if (!rightResize.active || rightResize.pointerId !== event.pointerId) {
      return;
    }

    rightWidth.value = clampRightWidth(rightResize.startWidth - (event.clientX - rightResize.startX));
    leftWidth.value = clampLeftWidth(leftWidth.value);
  }

  function stopRightResize(event?: PointerEvent): void {
    if (!rightResize.active) {
      return;
    }

    if (event && rightResize.pointerId !== event.pointerId) {
      return;
    }

    const handle = rightResizeHandleRef.value;
    if (event && handle && handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }

    rightResize.active = false;
    rightResize.pointerId = null;

    window.removeEventListener("pointermove", updateRightResize);
    window.removeEventListener("pointerup", stopRightResize);
    window.removeEventListener("pointercancel", stopRightResize);
    persistWidths();
  }

  function handleWindowResize(): void {
    viewportWidth.value = window.innerWidth;
    measureLayoutWidth();
  }

  watch(layoutWidth, () => {
    reconcileWidths();
  });

  onMounted(() => {
    restoreWidths();
    measureLayoutWidth();
    window.addEventListener("resize", handleWindowResize);

    layoutObserver = new ResizeObserver(() => {
      measureLayoutWidth();
    });

    if (layoutRef.value) {
      layoutObserver.observe(layoutRef.value);
    }
  });

  onBeforeUnmount(() => {
    window.removeEventListener("resize", handleWindowResize);
    layoutObserver?.disconnect();
    layoutObserver = null;
    stopLeftResize();
    stopRightResize();
  });

  return {
    layoutRef,
    leftResizeHandleRef,
    rightResizeHandleRef,
    leftWidth,
    rightWidth,
    layoutStyle,
    isStackedLayout,
    startLeftResize,
    startRightResize,
  };
}
