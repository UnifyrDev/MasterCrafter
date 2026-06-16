<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useMasterCrafter } from "@renderer/composables/useMasterCrafter";
import { useResizableEdgePanels } from "@renderer/composables/useResizableEdgePanels";
import { encounterWorkspaceService } from "@renderer/services/EncounterWorkspaceService";
import { encounterConditionService, type EncounterConditionToastDto } from "@renderer/services/EncounterConditionService";
import EncounterNpcStatblockPopover from "@renderer/components/encounters/EncounterNpcStatblockPopover.vue";
import EncounterConditionFeed from "@renderer/components/encounters/EncounterConditionFeed.vue";
import EncounterConditionIcon from "@renderer/components/encounters/EncounterConditionIcon.vue";
import {
  cloneSessionDto,
  createSessionCombatantFromNpc,
  formatCombatantTeamLabel,
  parseLevelInput,
  parseTagList,
} from "@renderer/components/encounters/encounterDrafts";
import { resolveNpcEntryForHover, resolveNpcEntityForHover } from "@renderer/components/encounters/encounterNpcResolution";
import type {
  EncounterCombatantTeam,
  EncounterConditionStateDto,
  EncounterInitiativeMode,
  EncounterNpcLibraryEntryDto,
  EncounterSessionCombatantDto,
  EncounterSessionDto,
} from "@shared/contracts";
import type { EncounterConditionDefinitionDto, EncounterConditionExpiryDto } from "@shared/encounterConditions";
import { nowIso } from "@shared/utils";
import { hotkeyDispatcherService } from "@renderer/services/hotkeys";

const store = useMasterCrafter();
const state = store.state;
const workspaceState = encounterWorkspaceService.workspaceState;
const draftSyncPaused = ref(false);
const autosaveTimer = ref<number | null>(null);
const sessionDraft = ref<EncounterSessionDto | null>(null);
const message = ref("Select an encounter to begin tracking initiative.");
const autosaveState = ref("Autosave idle.");
const hpAdjustments = reactive<Record<string, number>>({});
const npcFilter = ref("");
const hoveredNpcId = ref<string | null>(null);
const hoveredNpcTeam = ref<EncounterCombatantTeam | null>(null);
const hoveredNpcPosition = reactive({ x: 0, y: 0 });
const conditionToasts = ref<EncounterConditionToastDto[]>([]);
const conditionToastTimers = new Map<string, number>();
let unregisterHotkeys: (() => void) | null = null;
const {
  layoutRef,
  leftResizeHandleRef,
  rightResizeHandleRef,
  layoutStyle,
  isStackedLayout,
  startLeftResize,
  startRightResize,
} = useResizableEdgePanels({
  storageKeyPrefix: "mastercrafter.playTrackerPanels",
  defaultLeftWidth: 440,
  defaultRightWidth: 360,
  minLeftWidth: 260,
  minRightWidth: 280,
  minCenterWidth: 420,
  handleWidth: 12,
  stackedBreakpoint: 1220,
});

const snapshot = computed(() => state.value.snapshot);
const workspaceId = computed(() => snapshot.value?.workspace.id ?? null);
const npcEntries = computed(() => snapshot.value?.npcLibraryEntries ?? []);
const entities = computed(() => snapshot.value?.entities ?? []);
const conditionDefinitions = computed(() => encounterConditionService.listDefinitions());
const turnSeconds = encounterConditionService.turnSeconds;
const selectedEncounter = computed(() => {
  if (!snapshot.value || !workspaceState.selectedEncounterId) {
    return null;
  }

  return snapshot.value.encounters.find((entry) => entry.id === workspaceState.selectedEncounterId) ?? null;
});

const encounterSessions = computed(() => {
  if (!snapshot.value || !selectedEncounter.value) {
    return [];
  }

  return [...snapshot.value.encounterSessions.filter((entry) => entry.encounterId === selectedEncounter.value?.id)].sort(
    (left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.createdAt.localeCompare(left.createdAt),
  );
});

const selectedSession = computed(() => {
  if (!selectedEncounter.value) {
    return null;
  }

  if (workspaceState.selectedSessionId) {
    return encounterSessions.value.find((entry) => entry.id === workspaceState.selectedSessionId) ?? null;
  }

  return encounterSessions.value[0] ?? null;
});

const filteredNpcEntries = computed(() => {
  const term = npcFilter.value.trim().toLowerCase();
  if (!term) {
    return npcEntries.value;
  }

  return npcEntries.value.filter((entry) => [entry.name, entry.challengeRating, entry.notes, entry.tags.join(" "), formatCombatantTeamLabel(entry.team)].join(" ").toLowerCase().includes(term));
});

const hoveredNpcEntry = computed<EncounterNpcLibraryEntryDto | null>(() => {
  return resolveNpcEntryForHover(hoveredNpcId.value, npcEntries.value, entities.value);
});

const hoveredNpcEntity = computed(() => {
  return resolveNpcEntityForHover(hoveredNpcEntry.value, entities.value);
});

const activeCombatant = computed(() => sessionDraft.value?.combatants[sessionDraft.value.currentTurnIndex] ?? null);
const totalTurnCount = computed(() => {
  const combatantCount = sessionDraft.value?.combatants.length ?? 0;
  if (!sessionDraft.value || combatantCount === 0) {
    return 0;
  }

  return (Math.max(1, sessionDraft.value.roundNumber) - 1) * combatantCount + sessionDraft.value.currentTurnIndex + 1;
});

const pendingInitiativeCount = computed(() => {
  if (!sessionDraft.value) {
    return 0;
  }

  return sessionDraft.value.combatants.filter((combatant) => combatant.initiativeMode === null || combatant.initiativeRoll === null).length;
});

const initiativeSetupPending = computed(() => pendingInitiativeCount.value > 0);

function clearConditionToastTimer(toastId: string): void {
  const timerId = conditionToastTimers.get(toastId);
  if (timerId !== undefined) {
    window.clearTimeout(timerId);
    conditionToastTimers.delete(toastId);
  }
}

function dismissConditionToast(toastId: string): void {
  clearConditionToastTimer(toastId);
  conditionToasts.value = conditionToasts.value.filter((toast) => toast.id !== toastId);
}

function pushConditionToast(notice: EncounterConditionExpiryDto): void {
  const toast = encounterConditionService.createToast(notice);
  conditionToasts.value = [...conditionToasts.value, toast];
  while (conditionToasts.value.length > 4) {
    const removed = conditionToasts.value.shift();
    if (removed) {
      clearConditionToastTimer(removed.id);
    }
  }

  const timeoutId = window.setTimeout(() => dismissConditionToast(toast.id), 4800);
  conditionToastTimers.set(toast.id, timeoutId);
}

function tickConditionTimers(turnsElapsed = 1): string | null {
  if (!sessionDraft.value) {
    return null;
  }

  const notices = encounterConditionService.tickCombatantConditions(sessionDraft.value.combatants, turnsElapsed);
  if (!notices.length) {
    return null;
  }

  for (const notice of notices) {
    pushConditionToast(notice);
  }

  encounterConditionService.playPing();

  if (notices.length === 1) {
    const notice = notices[0];
    return `${notice.combatantName}: ${notice.conditionLabels.join(", ")} expired.`;
  }

  return `${notices.length} condition timers expired.`;
}

function formatConditionTimer(condition: EncounterConditionStateDto): string {
  if (condition.remainingTurns === null) {
    return "";
  }

  return encounterConditionService.formatTimerLabel(condition.remainingTurns);
}

function conditionButtonTitle(definition: EncounterConditionDefinitionDto): string {
  if (definition.defaultRemainingTurns === null) {
    return `${definition.label}: ${definition.description}`;
  }

  return `${definition.label}: ${definition.description} Default duration: ${encounterConditionService.formatTimerLabel(definition.defaultRemainingTurns)}.`;
}

function isConditionActive(combatant: EncounterSessionCombatantDto, key: string): boolean {
  const normalizedKey = key.trim().toLowerCase();
  return combatant.conditions.some((condition) => condition.key.toLowerCase() === normalizedKey || condition.label.toLowerCase() === normalizedKey);
}

function toggleCombatantCondition(combatant: EncounterSessionCombatantDto, definition: EncounterConditionDefinitionDto): void {
  encounterConditionService.toggleCondition(combatant, definition.key);
  autosaveState.value = "Saving changes...";
  message.value = `${combatant.name} conditions updated.`;
  queueAutosave();
}

function removeCombatantCondition(combatant: EncounterSessionCombatantDto, conditionId: string): void {
  const nextConditions = combatant.conditions.filter((condition) => condition.id !== conditionId);
  if (nextConditions.length === combatant.conditions.length) {
    return;
  }

  combatant.conditions = nextConditions;
  autosaveState.value = "Saving changes...";
  message.value = `${combatant.name} condition removed.`;
  queueAutosave();
}

function setCombatantConditionTurns(combatant: EncounterSessionCombatantDto, conditionId: string, value: string): void {
  const trimmed = value.trim();
  const nextTurns = trimmed ? Number.parseInt(trimmed, 10) : null;
  const previousCondition = combatant.conditions.find((condition) => condition.id === conditionId) ?? null;
  const updatedCondition = encounterConditionService.setConditionRemainingTurns(
    combatant,
    conditionId,
    trimmed && Number.isFinite(nextTurns) ? nextTurns : null,
  );
  if (previousCondition !== null && previousCondition.remainingTurns !== null && updatedCondition === null) {
    const expiryNotice: EncounterConditionExpiryDto = {
      combatantId: combatant.id,
      combatantName: combatant.name,
      conditionLabels: [previousCondition.label],
    };
    pushConditionToast(expiryNotice);
    encounterConditionService.playPing();
    message.value = `${combatant.name}: ${previousCondition.label} expired.`;
  } else {
    message.value = `${combatant.name} condition timer updated.`;
  }
  autosaveState.value = "Saving changes...";
  queueAutosave();
}

function adjustCombatantConditionTurns(combatant: EncounterSessionCombatantDto, conditionId: string, deltaTurns: number): void {
  const previousCondition = combatant.conditions.find((condition) => condition.id === conditionId) ?? null;
  const updatedCondition = encounterConditionService.adjustConditionRemainingTurns(combatant, conditionId, deltaTurns);
  if (previousCondition !== null && previousCondition.remainingTurns !== null && updatedCondition === null) {
    const expiryNotice: EncounterConditionExpiryDto = {
      combatantId: combatant.id,
      combatantName: combatant.name,
      conditionLabels: [previousCondition.label],
    };
    pushConditionToast(expiryNotice);
    encounterConditionService.playPing();
    message.value = `${combatant.name}: ${previousCondition.label} expired.`;
  } else {
    message.value = `${combatant.name} condition timer adjusted.`;
  }
  autosaveState.value = "Saving changes...";
  queueAutosave();
}

function clearAutosaveTimer(): void {
  if (autosaveTimer.value !== null) {
    window.clearTimeout(autosaveTimer.value);
    autosaveTimer.value = null;
  }
}

function syncHpAdjustments(combatants: EncounterSessionCombatantDto[]): void {
  const nextAdjustments: Record<string, number> = {};
  for (const combatant of combatants) {
    nextAdjustments[combatant.id] = combatantAdjustmentValue(combatant.id);
  }

  for (const key of Object.keys(hpAdjustments)) {
    delete hpAdjustments[key];
  }

  Object.assign(hpAdjustments, nextAdjustments);
}

function combatantAdjustmentValue(combatantId: string): number {
  const value = hpAdjustments[combatantId];
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  return Math.max(1, Math.floor(value));
}

function setCombatantAdjustment(combatantId: string, value: string): void {
  hpAdjustments[combatantId] = Math.max(1, Math.floor(Number(value) || 1));
}

function parseInitiativeInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatSignedNumber(value: number): string {
  const normalized = Math.floor(value);
  return `${normalized >= 0 ? "+" : ""}${normalized}`;
}

function initiativeLabel(combatant: EncounterSessionCombatantDto): string {
  if (combatant.initiativeMode === "with-bonus") {
    return "With bonus";
  }

  if (combatant.initiativeMode === "without-bonus") {
    return "Without bonus";
  }

  return "Choose role";
}

function initiativeValueLabel(combatant: EncounterSessionCombatantDto): string {
  if (combatant.initiativeMode === "without-bonus") {
    return "Initiative";
  }

  if (combatant.initiativeMode === "with-bonus") {
    return "Roll";
  }

  return "Initiative";
}

function initiativeScoreLabel(combatant: EncounterSessionCombatantDto): string {
  if (combatant.initiativeScore === null) {
    return "Init pending";
  }

  return `Init ${combatant.initiativeScore}`;
}

function initiativeOrderScore(combatant: EncounterSessionCombatantDto): number {
  return combatant.initiativeScore ?? combatant.initiativeBonus;
}

function refreshCombatantInitiative(combatant: EncounterSessionCombatantDto): void {
  if (combatant.initiativeRoll === null || !Number.isFinite(combatant.initiativeRoll)) {
    combatant.initiativeScore = null;
    return;
  }

  if (combatant.initiativeMode === "without-bonus") {
    combatant.initiativeScore = combatant.initiativeRoll;
    return;
  }

  combatant.initiativeScore = combatant.initiativeRoll + combatant.initiativeBonus;
}

function sortCombatantsByInitiative(): void {
  if (!sessionDraft.value || sessionDraft.value.combatants.length === 0) {
    return;
  }

  const previousTurnCombatantId = totalTurnCount.value > 1 ? activeCombatant.value?.id ?? null : null;
  sessionDraft.value.combatants = [...sessionDraft.value.combatants].sort((left, right) => {
    const leftScore = initiativeOrderScore(left);
    const rightScore = initiativeOrderScore(right);

    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    if (right.initiativeBonus !== left.initiativeBonus) {
      return right.initiativeBonus - left.initiativeBonus;
    }

    return left.sortIndex - right.sortIndex || left.name.localeCompare(right.name);
  });

  if (previousTurnCombatantId) {
    const nextTurnIndex = sessionDraft.value.combatants.findIndex((combatant) => combatant.id === previousTurnCombatantId);
    sessionDraft.value.currentTurnIndex = Math.max(0, nextTurnIndex);
    return;
  }

  sessionDraft.value.currentTurnIndex = 0;
}

function applyInitiativeChanges(combatant: EncounterSessionCombatantDto): void {
  refreshCombatantInitiative(combatant);

  if (!sessionDraft.value) {
    return;
  }

  if (initiativeSetupPending.value) {
    message.value = `Finish initiative setup for ${pendingInitiativeCount.value} combatant${pendingInitiativeCount.value === 1 ? "" : "s"}.`;
    queueAutosave();
    return;
  }

  sortCombatantsByInitiative();
  message.value = totalTurnCount.value > 1 ? "Initiative order updated." : "Initiative order set.";
  queueAutosave();
}

function setCombatantInitiativeMode(combatant: EncounterSessionCombatantDto, mode: EncounterInitiativeMode): void {
  combatant.initiativeMode = mode;
  applyInitiativeChanges(combatant);
}

function setCombatantInitiativeRoll(combatant: EncounterSessionCombatantDto, value: string): void {
  combatant.initiativeRoll = parseInitiativeInput(value);
  applyInitiativeChanges(combatant);
}

function queueAutosave(): void {
  if (!sessionDraft.value || draftSyncPaused.value) {
    return;
  }

  autosaveState.value = "Saving changes...";
  clearAutosaveTimer();
  autosaveTimer.value = window.setTimeout(() => {
    autosaveTimer.value = null;
    void flushAutosave();
  }, 250);
}

async function flushAutosave(): Promise<boolean> {
  if (!workspaceId.value || !sessionDraft.value || draftSyncPaused.value) {
    return false;
  }

  clearAutosaveTimer();
  draftSyncPaused.value = true;
  try {
    const saved = await store.saveEncounterSession(cloneSessionDto(sessionDraft.value)!, { refreshSnapshot: false });
    sessionDraft.value = cloneSessionDto(saved);
    syncHpAdjustments(saved.combatants);
    autosaveState.value = "Autosave active.";
    return true;
  } catch (error) {
    autosaveState.value = error instanceof Error ? `Autosave failed: ${error.message}` : "Autosave failed.";
    return false;
  } finally {
    draftSyncPaused.value = false;
  }
}

onBeforeUnmount(() => {
  clearAutosaveTimer();
  for (const toastId of [...conditionToastTimers.keys()]) {
    clearConditionToastTimer(toastId);
  }
  void flushAutosave();
});

watch(
  selectedSession,
  (session) => {
    if (draftSyncPaused.value) {
      return;
    }

    draftSyncPaused.value = true;
    sessionDraft.value = cloneSessionDto(session);
    if (sessionDraft.value) {
      sessionDraft.value.combatants = sessionDraft.value.combatants.map((combatant) => ({
        ...combatant,
        conditions: encounterConditionService.normalizeConditions(combatant.conditions),
      }));
    }
    syncHpAdjustments(sessionDraft.value?.combatants ?? []);
    if (session && pendingInitiativeCount.value === 0) {
      sortCombatantsByInitiative();
    }

    if (!session) {
      message.value = selectedEncounter.value ? "Start a session to assign initiative roles and track HP." : "Select an encounter to begin tracking initiative.";
      autosaveState.value = selectedEncounter.value ? "Autosave idle." : "Autosave idle.";
    } else {
      const pendingCount = session.combatants.filter((combatant) => combatant.initiativeMode === null || combatant.initiativeRoll === null).length;
      message.value =
        pendingCount > 0
          ? `Finish initiative setup for ${pendingCount} combatant${pendingCount === 1 ? "" : "s"} before advancing turns.`
          : `${session.status === "active" ? "Tracking" : "Loaded"} ${selectedEncounter.value?.name ?? "encounter"} round ${session.roundNumber}.`;
      autosaveState.value = "Autosave active.";
    }

    window.setTimeout(() => {
      draftSyncPaused.value = false;
    }, 0);
  },
  { immediate: true },
);

async function selectEncounterSession(session: EncounterSessionDto): Promise<void> {
  if (!selectedEncounter.value) {
    return;
  }

  await flushAutosave();
  encounterWorkspaceService.openPlay(selectedEncounter.value.id, session.id);
}

async function startOrResumeSession(): Promise<void> {
  if (!workspaceId.value || !selectedEncounter.value) {
    return;
  }

  await flushAutosave();
  draftSyncPaused.value = true;
  try {
    const session = await store.startEncounterSession(workspaceId.value, selectedEncounter.value.id);
    sessionDraft.value = cloneSessionDto(session);
    syncHpAdjustments(session.combatants);
    if (pendingInitiativeCount.value === 0) {
      sortCombatantsByInitiative();
    }
    encounterWorkspaceService.openPlay(selectedEncounter.value.id, session.id);
    const pendingCount = session.combatants.filter((combatant) => combatant.initiativeMode === null || combatant.initiativeRoll === null).length;
    message.value =
      pendingCount > 0
        ? `Finish initiative setup for ${pendingCount} combatant${pendingCount === 1 ? "" : "s"}.`
        : `Session ${session.status === "completed" ? "restarted" : "resumed"}.`;
    autosaveState.value = "Autosave active.";
  } finally {
    draftSyncPaused.value = false;
  }
}

function setCombatantTurn(index: number): void {
  if (!sessionDraft.value || initiativeSetupPending.value) {
    return;
  }

  sessionDraft.value.currentTurnIndex = Math.max(0, Math.min(index, sessionDraft.value.combatants.length - 1));
  sessionDraft.value.lastAdvancedAt = nowIso();
  message.value = `Turn ${sessionDraft.value.currentTurnIndex + 1} selected.`;
  queueAutosave();
}

function endRound(): void {
  if (!sessionDraft.value || initiativeSetupPending.value) {
    return;
  }

  const expiryMessage = tickConditionTimers(1);
  sessionDraft.value.roundNumber += 1;
  sessionDraft.value.currentTurnIndex = 0;
  sessionDraft.value.lastAdvancedAt = nowIso();
  message.value = expiryMessage ? `Round ${sessionDraft.value.roundNumber} started. ${expiryMessage}` : `Round ${sessionDraft.value.roundNumber} started.`;
  autosaveState.value = "Saving changes...";
  queueAutosave();
}

function advanceTurn(): void {
  if (!sessionDraft.value || sessionDraft.value.combatants.length === 0 || initiativeSetupPending.value) {
    return;
  }

  if (sessionDraft.value.currentTurnIndex >= sessionDraft.value.combatants.length - 1) {
    endRound();
    return;
  }

  const expiryMessage = tickConditionTimers(1);
  sessionDraft.value.currentTurnIndex += 1;
  sessionDraft.value.lastAdvancedAt = nowIso();
  message.value = expiryMessage
    ? `Turn ${sessionDraft.value.currentTurnIndex + 1} of ${sessionDraft.value.combatants.length}. ${expiryMessage}`
    : `Turn ${sessionDraft.value.currentTurnIndex + 1} of ${sessionDraft.value.combatants.length}.`;
  autosaveState.value = "Saving changes...";
  queueAutosave();
}

function previousTurn(): void {
  if (!sessionDraft.value || sessionDraft.value.combatants.length === 0 || initiativeSetupPending.value) {
    return;
  }

  if (sessionDraft.value.currentTurnIndex <= 0) {
    if (sessionDraft.value.roundNumber > 1) {
      sessionDraft.value.roundNumber -= 1;
      sessionDraft.value.currentTurnIndex = sessionDraft.value.combatants.length - 1;
    }
  } else {
    sessionDraft.value.currentTurnIndex -= 1;
  }

  sessionDraft.value.lastAdvancedAt = nowIso();
  message.value = `Turn ${sessionDraft.value.currentTurnIndex + 1} selected.`;
  queueAutosave();
}

function toggleStatus(nextStatus: EncounterSessionDto["status"]): void {
  if (!sessionDraft.value) {
    return;
  }

  sessionDraft.value.status = nextStatus;
  if (nextStatus === "completed") {
    sessionDraft.value.endedAt = nowIso();
    message.value = "Session completed.";
  } else if (nextStatus === "active") {
    sessionDraft.value.endedAt = null;
    message.value = "Session resumed.";
  } else {
    message.value = "Session paused.";
  }

  sessionDraft.value.lastAdvancedAt = nowIso();
  queueAutosave();
}

function setCombatantHp(combatant: EncounterSessionCombatantDto, value: string): void {
  const nextHp = Math.max(0, Math.min(combatant.maxHitPoints, Math.floor(Number(value) || 0)));
  combatant.currentHitPoints = nextHp;
  combatant.isDefeated = nextHp <= 0;
  queueAutosave();
}

function setTempHp(combatant: EncounterSessionCombatantDto, value: string): void {
  combatant.tempHitPoints = Math.max(0, Math.floor(Number(value) || 0));
  queueAutosave();
}

function toggleCombatantFlag(combatant: EncounterSessionCombatantDto, key: "isHidden" | "isDefeated"): void {
  combatant[key] = !combatant[key];
  queueAutosave();
}

function updateCombatantLevel(combatant: EncounterSessionCombatantDto, value: string): void {
  combatant.level = parseLevelInput(value);
  queueAutosave();
}

function updateCombatantTeam(combatant: EncounterSessionCombatantDto, value: EncounterCombatantTeam): void {
  combatant.team = value;
  queueAutosave();
}

function applyCombatantHpChange(combatant: EncounterSessionCombatantDto, delta: number): void {
  const amount = Math.max(1, Math.floor(Math.abs(delta) || 0));

  if (delta < 0) {
    let remaining = amount;
    if (combatant.tempHitPoints > 0) {
      const absorbed = Math.min(combatant.tempHitPoints, remaining);
      combatant.tempHitPoints -= absorbed;
      remaining -= absorbed;
    }

    if (remaining > 0) {
      combatant.currentHitPoints = Math.max(0, combatant.currentHitPoints - remaining);
    }
  } else {
    combatant.currentHitPoints = Math.min(combatant.maxHitPoints, combatant.currentHitPoints + amount);
  }

  combatant.isDefeated = combatant.currentHitPoints <= 0;
  queueAutosave();
}

function damageCombatant(combatant: EncounterSessionCombatantDto): void {
  applyCombatantHpChange(combatant, -combatantAdjustmentValue(combatant.id));
}

function healCombatant(combatant: EncounterSessionCombatantDto): void {
  applyCombatantHpChange(combatant, combatantAdjustmentValue(combatant.id));
}

function combatantHpPercent(combatant: EncounterSessionCombatantDto): number {
  if (combatant.maxHitPoints <= 0) {
    return combatant.currentHitPoints > 0 ? 100 : 0;
  }

  return Math.max(0, Math.min(100, Math.round((combatant.currentHitPoints / combatant.maxHitPoints) * 100)));
}

function combatantHpTone(combatant: EncounterSessionCombatantDto): string {
  const percent = combatantHpPercent(combatant);
  if (combatant.isDefeated || percent <= 0) {
    return "defeated";
  }

  if (percent <= 25) {
    return "critical";
  }

  if (percent <= 60) {
    return "wounded";
  }

  return "healthy";
}

async function addNpcToSession(entryId: string, team?: EncounterCombatantTeam): Promise<void> {
  const entry = npcEntries.value.find((npc) => npc.id === entryId);
  if (!entry || !selectedEncounter.value || !workspaceId.value) {
    return;
  }

  if (!sessionDraft.value) {
    await startOrResumeSession();
  }

  if (!sessionDraft.value) {
    return;
  }

  const nextSortIndex = sessionDraft.value.combatants.reduce((highest, combatant) => Math.max(highest, combatant.sortIndex), -1) + 1;
  const combatant = createSessionCombatantFromNpc(entry, team ?? entry.team, nextSortIndex);
  sessionDraft.value.combatants = [...sessionDraft.value.combatants, combatant];
  sessionDraft.value.lastAdvancedAt = nowIso();
  message.value = `${formatCombatantTeamLabel(combatant.team)} ${combatant.name} added to the session.`;
  autosaveState.value = "Saving changes...";
  queueAutosave();
}

function removeCombatantFromTracker(combatant: EncounterSessionCombatantDto, index: number): void {
  if (!sessionDraft.value) {
    return;
  }

  const nextCombatants = sessionDraft.value.combatants.filter((entry) => entry.id !== combatant.id);
  if (nextCombatants.length === sessionDraft.value.combatants.length) {
    return;
  }

  const currentTurnIndex = sessionDraft.value.currentTurnIndex;
  let nextTurnIndex = currentTurnIndex;
  if (index < currentTurnIndex) {
    nextTurnIndex -= 1;
  }

  if (nextCombatants.length > 0) {
    nextTurnIndex = Math.min(nextTurnIndex, nextCombatants.length - 1);
  } else {
    nextTurnIndex = 0;
  }

  sessionDraft.value.combatants = nextCombatants;
  sessionDraft.value.currentTurnIndex = Math.max(0, nextTurnIndex);
  sessionDraft.value.lastAdvancedAt = nowIso();
  syncHpAdjustments(nextCombatants);
  hideNpcHover();
  message.value = `${combatant.name} removed from the tracker.`;
  autosaveState.value = "Saving changes...";
  queueAutosave();
}

function showNpcHover(entryId: string, team: EncounterCombatantTeam | null, event: MouseEvent): void {
  hoveredNpcId.value = entryId;
  hoveredNpcTeam.value = team;
  hoveredNpcPosition.x = event.clientX;
  hoveredNpcPosition.y = event.clientY;
}

function showCombatantNpcHover(combatant: EncounterSessionCombatantDto, event: MouseEvent): void {
  if (combatant.sourceKind !== "npc" || !combatant.sourceId) {
    hideNpcHover();
    return;
  }

  showNpcHover(combatant.sourceId, combatant.team, event);
}

function hideNpcHover(): void {
  hoveredNpcId.value = null;
  hoveredNpcTeam.value = null;
}

function addHotkeyNpcToSession(): void {
  const entry = filteredNpcEntries.value[0];
  if (!entry) {
    return;
  }

  void addNpcToSession(entry.id, entry.team);
}

function pauseSession(): void {
  toggleStatus("paused");
}

function resumeSession(): void {
  toggleStatus("active");
}

function registerHotkeys(): void {
  unregisterHotkeys?.();
  unregisterHotkeys = hotkeyDispatcherService.registerScope({
    scopeId: "encounter-play-tracker",
    scopeType: "view",
    contextId: "encounters-play-tracker",
    handlers: {
      "encounters.startOrResumeSession": () => void startOrResumeSession(),
      "encounters.advanceTurn": () => advanceTurn(),
      "encounters.endRound": () => endRound(),
      "encounters.previousTurn": () => previousTurn(),
      "encounters.pauseSession": () => pauseSession(),
      "encounters.resumeSession": () => resumeSession(),
      "encounters.completeSession": () => toggleStatus("completed"),
      "encounters.addNpcToSession": () => addHotkeyNpcToSession(),
    },
  });
}

onMounted(() => {
  registerHotkeys();
});

onBeforeUnmount(() => {
  unregisterHotkeys?.();
  unregisterHotkeys = null;
});
</script>

<template>
  <div class="play-tracker-shell">
    <div class="play-tracker-toolbar glass-panel">
      <div class="toolbar-copy">
        <strong>Play Tracker</strong>
        <span v-if="selectedEncounter">Running {{ selectedEncounter.name }} in a persisted local session.</span>
        <span v-else>Select an encounter in the builder or library to begin play.</span>
        <span class="autosave-indicator">{{ autosaveState }}</span>
      </div>

      <div class="toolbar-actions">
        <button type="button" @click="startOrResumeSession()">{{ sessionDraft?.status === 'active' ? 'Resume' : 'Start / Resume' }}</button>
        <button type="button" :disabled="initiativeSetupPending" @click="advanceTurn()">Next Turn</button>
        <button type="button" :disabled="initiativeSetupPending" @click="endRound()">End Round</button>
        <button type="button" :disabled="initiativeSetupPending" @click="previousTurn()">Previous</button>
        <button type="button" @click="toggleStatus(sessionDraft?.status === 'paused' ? 'active' : 'paused')">
          {{ sessionDraft?.status === 'paused' ? 'Resume' : 'Pause' }}
        </button>
        <button type="button" class="danger" @click="toggleStatus('completed')">Complete</button>
      </div>
    </div>

    <div v-if="sessionDraft && initiativeSetupPending" class="initiative-setup-banner glass-panel">
      <div class="initiative-setup-copy">
        <p class="section-title">Initiative Setup</p>
        <strong>Choose whether each combatant uses the encounter bonus or a raw initiative total.</strong>
        <span>Pick a role on every row, then enter the number the table is using.</span>
      </div>
      <span class="chip">{{ pendingInitiativeCount }} pending</span>
    </div>

    <div ref="layoutRef" class="play-tracker-layout" :class="{ stacked: isStackedLayout }" :style="layoutStyle">
      <section class="play-tracker-panel glass-panel scroll-shell">
        <div class="panel-header">
          <div>
            <p class="section-title">Sessions</p>
            <strong>{{ selectedEncounter ? selectedEncounter.name : 'No encounter selected' }}</strong>
          </div>
          <span class="muted">{{ autosaveState }}</span>
        </div>

        <div class="session-list">
          <button
            v-for="session in encounterSessions"
            :key="session.id"
            type="button"
            class="session-row"
            :class="{ active: sessionDraft?.id === session.id }"
            @click="selectEncounterSession(session)"
          >
            <strong>Round {{ session.roundNumber }}</strong>
            <span>{{ session.status }} · Turn {{ session.currentTurnIndex + 1 }}</span>
          </button>

          <div v-if="!encounterSessions.length" class="muted">
            No session history yet.
          </div>
        </div>

        <section v-if="selectedEncounter" class="tracker-card quick-add-card">
          <div class="panel-header">
            <div>
              <p class="section-title">Quick Add</p>
              <strong>NPC Library</strong>
            </div>
            <span class="muted">{{ filteredNpcEntries.length }} entries</span>
          </div>

          <label class="picker-search">
            <span class="muted">Filter NPCs</span>
            <input v-model="npcFilter" type="search" placeholder="Search names, CR, or notes" />
          </label>

          <div class="quick-add-list">
            <article
              v-for="entry in filteredNpcEntries"
              :key="entry.id"
              class="quick-add-row"
              @mouseenter="showNpcHover(entry.id, entry.team, $event)"
              @mousemove="showNpcHover(entry.id, entry.team, $event)"
              @mouseleave="hideNpcHover()"
            >
              <div class="quick-add-copy">
                <strong>{{ entry.name }}</strong>
                <span>{{ formatCombatantTeamLabel(entry.team) }} · {{ entry.challengeRating }} · AC {{ entry.armorClass }} · HP {{ entry.hitPoints }}</span>
              </div>
              <div class="quick-add-actions">
                <button type="button" @click="addNpcToSession(entry.id, entry.team)">Add</button>
                <button type="button" @click="addNpcToSession(entry.id, 'party')">Friendly</button>
                <button type="button" @click="addNpcToSession(entry.id, 'enemy')">Enemy</button>
              </div>
            </article>

            <div v-if="!filteredNpcEntries.length" class="muted">
              No NPCs available.
            </div>
          </div>
        </section>
        </section>

      <div
        v-if="!isStackedLayout"
        ref="leftResizeHandleRef"
        class="play-tracker-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sessions panel"
        @pointerdown="startLeftResize"
      ></div>

      <section class="play-tracker-panel glass-panel scroll-shell">
        <div class="panel-header">
          <div>
            <p class="section-title">Current Turn</p>
            <strong v-if="sessionDraft">Round {{ sessionDraft.roundNumber }} · Turn {{ sessionDraft.currentTurnIndex + 1 }}</strong>
            <strong v-else>Waiting for a session</strong>
          </div>
          <span class="chip" v-if="activeCombatant">{{ activeCombatant.name }}</span>
        </div>

        <div v-if="sessionDraft" class="combatant-track-list">
          <article
            v-for="(combatant, index) in sessionDraft.combatants"
            :key="combatant.id"
            class="combatant-track-row"
            :class="{ active: index === sessionDraft.currentTurnIndex, hidden: combatant.isHidden, defeated: combatant.isDefeated }"
            @contextmenu.prevent.stop="removeCombatantFromTracker(combatant, index)"
            @mouseenter="showCombatantNpcHover(combatant, $event)"
            @mousemove="showCombatantNpcHover(combatant, $event)"
            @mouseleave="hideNpcHover()"
          >
            <button type="button" class="combatant-track-main" @click="setCombatantTurn(index)">
              <div class="combatant-title">
                <strong>{{ combatant.name }}</strong>
                <span class="chip">{{ formatCombatantTeamLabel(combatant.team) }}</span>
                <span class="chip">{{ formatSignedNumber(combatant.initiativeBonus) }} bonus</span>
                <span class="chip">{{ initiativeLabel(combatant) }}</span>
                <span class="chip">{{ initiativeScoreLabel(combatant) }}</span>
              </div>
              <span class="muted">{{ combatant.sourceKind }} · {{ combatant.challengeRating }}</span>
            </button>

            <div class="combatant-vitals">
              <div class="combatant-initiative-controls">
                <div class="initiative-toggle">
                  <span>Initiative role</span>
                  <div class="initiative-toggle-buttons">
                    <button
                      type="button"
                      :class="{ active: combatant.initiativeMode === 'with-bonus' }"
                      @click="setCombatantInitiativeMode(combatant, 'with-bonus')"
                    >
                      With bonus
                    </button>
                    <button
                      type="button"
                      :class="{ active: combatant.initiativeMode === 'without-bonus' }"
                      @click="setCombatantInitiativeMode(combatant, 'without-bonus')"
                    >
                      Without bonus
                    </button>
                  </div>
                </div>
                <label>
                  <span>{{ initiativeValueLabel(combatant) }}</span>
                  <input
                    :disabled="combatant.initiativeMode === null"
                    :value="combatant.initiativeRoll ?? ''"
                    type="number"
                    step="1"
                    @change="setCombatantInitiativeRoll(combatant, ($event.target as HTMLInputElement).value)"
                  />
                </label>
              </div>

              <div class="hp-bar" :class="combatantHpTone(combatant)">
                <div class="hp-bar-fill" :style="{ width: `${combatantHpPercent(combatant)}%` }"></div>
                <span>{{ combatant.currentHitPoints }} / {{ combatant.maxHitPoints }} HP</span>
                <span v-if="combatant.tempHitPoints > 0" class="chip hp-temp-chip">Temp {{ combatant.tempHitPoints }}</span>
              </div>
            </div>

            <div class="combatant-adjustments">
              <label>
                <span>Amount</span>
                <input
                  :value="combatantAdjustmentValue(combatant.id)"
                  type="number"
                  min="1"
                  step="1"
                  @change="setCombatantAdjustment(combatant.id, ($event.target as HTMLInputElement).value)"
                />
              </label>
              <button type="button" class="danger" @click="damageCombatant(combatant)">Subtract</button>
              <button type="button" class="positive" @click="healCombatant(combatant)">Add</button>
            </div>

            <div class="combatant-track-fields">
              <label>
                <span>HP</span>
                <input :value="combatant.currentHitPoints" type="number" min="0" step="1" @change="setCombatantHp(combatant, ($event.target as HTMLInputElement).value)" />
              </label>
              <label>
                <span>Temp</span>
                <input :value="combatant.tempHitPoints" type="number" min="0" step="1" @change="setTempHp(combatant, ($event.target as HTMLInputElement).value)" />
              </label>
              <label>
                <span>Team</span>
                <select :value="combatant.team" @change="updateCombatantTeam(combatant, ($event.target as HTMLSelectElement).value as EncounterCombatantTeam)">
                  <option value="party">Friendly</option>
                  <option value="enemy">Unfriendly</option>
                  <option value="neutral">Neutral</option>
                </select>
              </label>
              <label>
                <span>Level</span>
                <input :value="combatant.level ?? ''" type="text" @change="updateCombatantLevel(combatant, ($event.target as HTMLInputElement).value)" />
              </label>
              <div class="condition-panel wide">
                <div class="condition-panel-header">
                  <span>Conditions</span>
                  <small>{{ combatant.conditions.length }} active · Timed in {{ turnSeconds }}-second turns</small>
                </div>

                <div class="condition-button-row">
                  <button
                    v-for="definition in conditionDefinitions"
                    :key="definition.key"
                    type="button"
                    class="condition-button"
                    :class="{ active: isConditionActive(combatant, definition.key) }"
                    :title="conditionButtonTitle(definition)"
                    @click="toggleCombatantCondition(combatant, definition)"
                  >
                    <span class="condition-button-icon" aria-hidden="true">
                      <EncounterConditionIcon :condition-key="definition.key" :size="12" />
                    </span>
                    <strong>{{ definition.label }}</strong>
                  </button>
                </div>

                <div v-if="combatant.conditions.length" class="condition-active-list">
                  <article v-for="condition in combatant.conditions" :key="condition.id" class="condition-chip">
                    <div class="condition-chip-copy">
                      <span class="condition-chip-icon" aria-hidden="true">
                        <EncounterConditionIcon :condition-key="condition.key" :size="10" />
                      </span>
                      <div class="condition-chip-text">
                        <strong>{{ condition.label }}</strong>
                        <span v-if="formatConditionTimer(condition)">{{ formatConditionTimer(condition) }}</span>
                      </div>
                    </div>
                    <div class="condition-chip-controls">
                      <button type="button" @click="adjustCombatantConditionTurns(combatant, condition.id, -1)">-</button>
                      <button type="button" @click="adjustCombatantConditionTurns(combatant, condition.id, 1)">+</button>
                      <input
                        :value="condition.remainingTurns ?? ''"
                        type="number"
                        min="1"
                        step="1"
                        :placeholder="condition.remainingTurns === null ? 'Manual' : ''"
                        @change="setCombatantConditionTurns(combatant, condition.id, ($event.target as HTMLInputElement).value)"
                      />
                      <button type="button" class="danger" @click="removeCombatantCondition(combatant, condition.id)">Remove</button>
                    </div>
                  </article>
                </div>
              </div>
            </div>

            <div class="combatant-track-actions">
              <button type="button" @click="toggleCombatantFlag(combatant, 'isHidden')">{{ combatant.isHidden ? 'Show' : 'Hide' }}</button>
              <button type="button" @click="toggleCombatantFlag(combatant, 'isDefeated')">{{ combatant.isDefeated ? 'Revive' : 'Defeat' }}</button>
            </div>
          </article>
        </div>

        <div v-else class="muted empty-play-state">
          Start or resume a session to assign initiative roles, track initiative order, round count, HP, and conditions.
        </div>
      </section>

      <div
        v-if="!isStackedLayout"
        ref="rightResizeHandleRef"
        class="play-tracker-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize status panel"
        @pointerdown="startRightResize"
      ></div>

      <section class="play-tracker-panel glass-panel scroll-shell">
        <div class="panel-header">
          <div>
            <p class="section-title">Status</p>
            <strong>{{ sessionDraft ? sessionDraft.status : 'No live session' }}</strong>
          </div>
          <span class="chip" v-if="sessionDraft">{{ autosaveState }}</span>
        </div>

        <div class="status-grid">
          <div class="status-card">
            <span>Encounter</span>
            <strong>{{ selectedEncounter?.name ?? 'None' }}</strong>
          </div>
          <div class="status-card">
            <span>Round</span>
            <strong>{{ sessionDraft?.roundNumber ?? 0 }}</strong>
          </div>
          <div class="status-card">
            <span>Turn</span>
            <strong>{{ sessionDraft ? sessionDraft.currentTurnIndex + 1 : 0 }}</strong>
          </div>
          <div class="status-card">
            <span>Turn Count</span>
            <strong>{{ totalTurnCount }}</strong>
          </div>
          <div class="status-card">
            <span>Current</span>
            <strong>{{ activeCombatant?.name ?? '—' }}</strong>
          </div>
          <div class="status-card">
            <span>Autosave</span>
            <strong>{{ autosaveState }}</strong>
          </div>
        </div>

        <div class="tracker-notes">
          <p class="section-title">Notes</p>
          <span>{{ message }}</span>
        </div>
      </section>
    </div>

    <EncounterNpcStatblockPopover
      :visible="hoveredNpcEntry !== null"
      :x="hoveredNpcPosition.x"
      :y="hoveredNpcPosition.y"
      :npc="hoveredNpcEntry"
      :entity="hoveredNpcEntity"
      :team="hoveredNpcTeam ?? hoveredNpcEntry?.team ?? null"
    />
    <EncounterConditionFeed :items="conditionToasts" />
  </div>
</template>

<style scoped>
.play-tracker-shell {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0.22rem;
}

.play-tracker-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 0.16rem;
  flex-wrap: wrap;
  padding: 0.22rem;
}

.toolbar-copy {
  display: grid;
  gap: 0.04rem;
  max-width: 36rem;
}

.toolbar-copy span {
  color: var(--fg-muted);
}

.autosave-indicator {
  color: var(--accent);
}

.initiative-setup-banner {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 0.16rem;
  flex-wrap: wrap;
  padding: 0.22rem;
}

.initiative-setup-copy {
  display: grid;
  gap: 0.04rem;
  max-width: 38rem;
}

.initiative-setup-copy span {
  color: var(--fg-muted);
  line-height: 1.45;
}

.toolbar-actions {
  display: flex;
  gap: 0.08rem;
  flex-wrap: wrap;
}

.danger {
  border-color: rgba(255, 109, 122, 0.24);
  color: #ffd6db;
}

.positive {
  border-color: rgba(111, 244, 201, 0.22);
  color: var(--accent-strong);
}

.play-tracker-layout {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
}

.play-tracker-layout.stacked {
  grid-template-columns: minmax(0, 1fr);
}

.play-tracker-panel {
  min-height: 0;
  min-width: 0;
  padding: 0.24rem;
  display: grid;
  gap: 0.16rem;
  align-content: start;
  overflow: auto;
}

.play-tracker-resize-handle {
  position: relative;
  display: flex;
  align-self: stretch;
  justify-content: center;
  min-width: 0.75rem;
  width: 0.75rem;
  cursor: col-resize;
  touch-action: none;
  user-select: none;
  border: 0;
  background: transparent;
  padding: 0;
  z-index: 2;
}

.play-tracker-resize-handle::before {
  content: "";
  width: 1px;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(180deg, transparent, rgba(111, 244, 201, 0.28), transparent);
  transition: background 140ms ease, box-shadow 140ms ease;
}

.play-tracker-resize-handle:hover::before,
.play-tracker-resize-handle:active::before {
  background: linear-gradient(180deg, transparent, rgba(111, 244, 201, 0.62), transparent);
  box-shadow: 0 0 0 1px rgba(111, 244, 201, 0.12);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 0.12rem;
  flex-wrap: wrap;
}

.session-list,
.combatant-track-list {
  display: grid;
  gap: 0.08rem;
}

.session-row {
  display: grid;
  gap: 0.02rem;
  text-align: left;
  padding: 0.18rem 0.2rem;
}

.session-row.active {
  border-color: rgba(111, 244, 201, 0.26);
  background: rgba(111, 244, 201, 0.06);
}

.session-row span {
  color: var(--fg-muted);
  font-size: 0.72rem;
}

.combatant-track-row {
  display: grid;
  gap: 0.12rem;
  padding: 0.18rem;
  border-radius: var(--radius-lg);
  background: rgba(10, 16, 24, 0.42);
  border: 1px solid var(--bg-border);
  cursor: help;
}

.combatant-track-row.active {
  border-color: rgba(111, 244, 201, 0.3);
  box-shadow: 0 0 0 1px rgba(111, 244, 201, 0.1);
}

.combatant-track-row.hidden {
  opacity: 0.82;
}

.combatant-track-row.defeated {
  border-color: rgba(255, 109, 122, 0.24);
}

.combatant-track-main {
  display: grid;
  gap: 0.04rem;
  text-align: left;
  background: transparent;
  border: 0;
  padding: 0;
}

.combatant-title {
  display: flex;
  flex-wrap: wrap;
  gap: 0.08rem;
  align-items: center;
}

.combatant-track-main .muted {
  color: var(--fg-muted);
  font-size: 0.72rem;
}

.combatant-vitals {
  display: grid;
  gap: 0.08rem;
}

.combatant-initiative-controls {
  display: grid;
  gap: 0.08rem;
  padding: 0.18rem;
  border-radius: var(--radius-md);
  border: 1px solid rgba(64, 177, 255, 0.14);
  background: rgba(64, 177, 255, 0.05);
}

.initiative-toggle {
  display: grid;
  gap: 0.04rem;
}

.initiative-toggle span {
  color: var(--fg-muted);
  font-size: 0.7rem;
}

.initiative-toggle-buttons {
  display: flex;
  gap: 0.08rem;
  flex-wrap: wrap;
}

.initiative-toggle-buttons button.active {
  border-color: rgba(64, 177, 255, 0.48);
  background: rgba(64, 177, 255, 0.16);
}

.combatant-initiative-controls label {
  display: grid;
  gap: 0.04rem;
}

.combatant-initiative-controls label span {
  color: var(--fg-muted);
  font-size: 0.7rem;
}

.hp-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.08rem;
  min-height: 1.42rem;
  padding: 0.08rem 0.18rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--bg-border);
  background: rgba(8, 14, 20, 0.74);
  overflow: hidden;
}

.hp-bar-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  transition:
    width 160ms ease,
    background 160ms ease;
}

.hp-bar.healthy .hp-bar-fill {
  background: linear-gradient(90deg, rgba(111, 244, 201, 0.56), rgba(64, 177, 255, 0.36));
}

.hp-bar.wounded .hp-bar-fill {
  background: linear-gradient(90deg, rgba(255, 198, 102, 0.6), rgba(255, 153, 48, 0.38));
}

.hp-bar.critical .hp-bar-fill {
  background: linear-gradient(90deg, rgba(255, 109, 122, 0.65), rgba(255, 82, 108, 0.38));
}

.hp-bar.defeated .hp-bar-fill {
  background: linear-gradient(90deg, rgba(255, 109, 122, 0.34), rgba(255, 109, 122, 0.16));
}

.hp-bar span {
  position: relative;
  z-index: 1;
  font-size: 0.72rem;
}

.hp-temp-chip {
  margin-left: auto;
}

.combatant-adjustments {
  display: flex;
  gap: 0.08rem;
  flex-wrap: wrap;
  align-items: end;
}

.combatant-adjustments label {
  display: grid;
  gap: 0.04rem;
  min-width: 5.25rem;
}

.combatant-adjustments span {
  color: var(--fg-muted);
  font-size: 0.7rem;
}

.combatant-adjustments input {
  width: 100%;
}

.condition-panel {
  display: grid;
  gap: 0.1rem;
  padding: 0.18rem;
  border-radius: var(--radius-lg);
  border: 1px solid rgba(111, 183, 244, 0.18);
  background: rgba(10, 16, 24, 0.38);
}

.condition-panel.wide {
  grid-column: 1 / -1;
}

.condition-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.08rem;
}

.condition-panel-header span {
  font-weight: 600;
}

.condition-panel-header small {
  color: var(--fg-muted);
  font-size: 0.68rem;
}

.condition-button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.08rem;
  align-items: flex-start;
}

.condition-button {
  display: flex;
  align-items: center;
  gap: 0.08rem;
  flex: 0 1 4.8rem;
  min-width: 4.2rem;
  padding: 0.08rem 0.1rem;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(119, 200, 255, 0.16);
  background: rgba(15, 24, 35, 0.74);
  text-align: left;
}

.condition-button-icon {
  display: grid;
  place-items: center;
  width: 1rem;
  height: 1rem;
  border-radius: 999px;
  border: 1px solid rgba(119, 200, 255, 0.18);
  background: rgba(111, 183, 244, 0.08);
  color: var(--accent-strong);
  flex: 0 0 auto;
}

.condition-button strong {
  min-width: 0;
  flex: 1 1 auto;
  font-size: 0.56rem;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.condition-button span {
  color: var(--fg-muted);
  font-size: 0.48rem;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.condition-button.active {
  border-color: rgba(111, 244, 201, 0.32);
  background: rgba(111, 244, 201, 0.08);
}

.condition-active-list {
  display: grid;
  gap: 0.1rem;
}

.condition-chip {
  display: grid;
  gap: 0.12rem;
  padding: 0.14rem;
  border-radius: var(--radius-md);
  border: 1px solid rgba(111, 183, 244, 0.18);
  background: rgba(8, 14, 20, 0.68);
}

.condition-chip-copy {
  display: flex;
  align-items: center;
  gap: 0.1rem;
}

.condition-chip-icon {
  display: grid;
  place-items: center;
  width: 1.1rem;
  height: 1.1rem;
  flex: 0 0 auto;
  border-radius: 999px;
  background: rgba(111, 183, 244, 0.1);
  color: var(--fg);
}

.condition-chip-text {
  display: grid;
  gap: 0.02rem;
}

.condition-chip-text strong {
  font-size: 0.72rem;
}

.condition-chip-text span {
  color: var(--fg-muted);
  font-size: 0.65rem;
}

.condition-chip-controls {
  display: flex;
  gap: 0.06rem;
  flex-wrap: wrap;
  align-items: center;
}

.condition-chip-controls input {
  width: 4.5rem;
  min-width: 4.5rem;
}

.combatant-track-fields {
  display: grid;
  gap: 0.08rem;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.combatant-track-fields label {
  display: grid;
  gap: 0.04rem;
}

.combatant-track-fields label.wide {
  grid-column: 1 / -1;
}

.combatant-track-fields span {
  color: var(--fg-muted);
  font-size: 0.7rem;
}

.combatant-track-actions {
  display: flex;
  gap: 0.08rem;
  flex-wrap: wrap;
}

.quick-add-card {
  display: grid;
  gap: 0.08rem;
}

.quick-add-list {
  display: grid;
  gap: 0.08rem;
}

.quick-add-row {
  display: grid;
  gap: 0.08rem;
  padding: 0.18rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--bg-border);
  background: rgba(10, 16, 24, 0.38);
  cursor: help;
}

.quick-add-copy {
  display: grid;
  gap: 0.04rem;
}

.quick-add-copy span {
  color: var(--fg-muted);
  font-size: 0.72rem;
}

.quick-add-actions {
  display: flex;
  gap: 0.08rem;
  flex-wrap: wrap;
}

.picker-search {
  display: grid;
  gap: 0.04rem;
}

.picker-search span {
  color: var(--fg-muted);
  font-size: 0.7rem;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.08rem;
}

.status-card {
  display: grid;
  gap: 0.04rem;
  padding: 0.18rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--bg-border);
  background: rgba(119, 200, 255, 0.05);
}

.status-card span {
  color: var(--fg-muted);
  font-size: 0.72rem;
}

.tracker-notes {
  display: grid;
  gap: 0.04rem;
}

.tracker-notes span {
  color: var(--fg-muted);
}

.empty-play-state {
  padding: 0.24rem 0;
}

@media (max-width: 1220px) {
  .play-tracker-layout {
    grid-template-columns: 1fr;
  }

  .play-tracker-resize-handle {
    display: none;
  }
}

@media (max-width: 760px) {
  .combatant-track-fields,
  .status-grid {
    grid-template-columns: 1fr;
  }

  .combatant-adjustments {
    align-items: stretch;
  }

  .initiative-toggle-buttons {
    flex-direction: column;
  }
}
</style>
