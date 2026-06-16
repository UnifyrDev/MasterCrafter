import { createId, nowIso, slugify } from "@shared/utils";
import type { EncounterConditionStateDto } from "@shared/contracts";

export const TURN_SECONDS = 6;
export const ONE_MINUTE_TURNS = 10;

export interface EncounterConditionDefinitionDto {
  key: string;
  label: string;
  description: string;
  defaultRemainingTurns: number | null;
}

export interface EncounterConditionExpiryDto {
  combatantId: string;
  combatantName: string;
  conditionLabels: string[];
}

const STANDARD_CONDITIONS: EncounterConditionDefinitionDto[] = [
  {
    key: "blinded",
    label: "Blinded",
    description: "The creature cannot see.",
    defaultRemainingTurns: ONE_MINUTE_TURNS,
  },
  {
    key: "charmed",
    label: "Charmed",
    description: "The creature cannot attack the source of the effect.",
    defaultRemainingTurns: ONE_MINUTE_TURNS,
  },
  {
    key: "deafened",
    label: "Deafened",
    description: "The creature cannot hear.",
    defaultRemainingTurns: ONE_MINUTE_TURNS,
  },
  {
    key: "exhaustion",
    label: "Exhaustion",
    description: "Track exhaustion levels manually on the chip.",
    defaultRemainingTurns: null,
  },
  {
    key: "frightened",
    label: "Frightened",
    description: "The creature is frightened of a source.",
    defaultRemainingTurns: ONE_MINUTE_TURNS,
  },
  {
    key: "grappled",
    label: "Grappled",
    description: "The creature's speed is 0 until the effect ends.",
    defaultRemainingTurns: null,
  },
  {
    key: "incapacitated",
    label: "Incapacitated",
    description: "The creature cannot take actions or reactions.",
    defaultRemainingTurns: null,
  },
  {
    key: "invisible",
    label: "Invisible",
    description: "The creature cannot be seen without special senses.",
    defaultRemainingTurns: ONE_MINUTE_TURNS,
  },
  {
    key: "paralyzed",
    label: "Paralyzed",
    description: "The creature is incapacitated and cannot move.",
    defaultRemainingTurns: ONE_MINUTE_TURNS,
  },
  {
    key: "petrified",
    label: "Petrified",
    description: "The creature is transformed into a solid state.",
    defaultRemainingTurns: null,
  },
  {
    key: "poisoned",
    label: "Poisoned",
    description: "The creature suffers from poison's effects.",
    defaultRemainingTurns: ONE_MINUTE_TURNS,
  },
  {
    key: "prone",
    label: "Prone",
    description: "The creature is lying down and easier to hit in melee.",
    defaultRemainingTurns: null,
  },
  {
    key: "restrained",
    label: "Restrained",
    description: "The creature's speed is 0 and attacks are hindered.",
    defaultRemainingTurns: null,
  },
  {
    key: "stunned",
    label: "Stunned",
    description: "The creature is incapacitated and stunned.",
    defaultRemainingTurns: ONE_MINUTE_TURNS,
  },
  {
    key: "unconscious",
    label: "Unconscious",
    description: "The creature is unconscious and incapacitated.",
    defaultRemainingTurns: null,
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeLabel(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback.trim();
}

function normalizeTurns(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const normalized = Math.max(0, Math.floor(numeric));
  return normalized > 0 ? normalized : null;
}

function normalizedKey(value: string): string {
  return slugify(value.trim().toLowerCase());
}

export function findEncounterConditionDefinition(keyOrLabel: string): EncounterConditionDefinitionDto | null {
  const key = normalizedKey(keyOrLabel);
  return STANDARD_CONDITIONS.find((condition) => normalizedKey(condition.key) === key || normalizedKey(condition.label) === key) ?? null;
}

export function listEncounterConditionDefinitions(): EncounterConditionDefinitionDto[] {
  return [...STANDARD_CONDITIONS];
}

export function createEncounterConditionState(labelOrKey: string, remainingTurns: number | null = null): EncounterConditionStateDto {
  const definition = findEncounterConditionDefinition(labelOrKey);
  const label = definition?.label ?? normalizeLabel(labelOrKey, "Condition");
  const timestamp = nowIso();
  return {
    id: createId(),
    key: definition?.key ?? normalizedKey(label),
    label,
    remainingTurns: normalizeTurns(remainingTurns),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function normalizeEncounterConditionState(value: unknown): EncounterConditionStateDto | null {
  if (typeof value === "string") {
    const label = value.trim();
    if (!label) {
      return null;
    }

    return createEncounterConditionState(label, null);
  }

  if (!isRecord(value)) {
    return null;
  }

  const labelSource = normalizeLabel(value.label ?? value.name ?? value.key, "");
  const definition = findEncounterConditionDefinition(labelSource || String(value.key ?? ""));
  const label = definition?.label ?? (labelSource || "Condition");
  const key = definition?.key ?? normalizedKey(label);
  const remainingTurns = normalizeTurns(value.remainingTurns ?? value.turnsRemaining ?? value.turns);
  if (remainingTurns === null && (value.remainingTurns === 0 || value.turnsRemaining === 0 || value.turns === 0)) {
    return null;
  }

  const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : createId();
  const createdAt = typeof value.createdAt === "string" && value.createdAt.trim() ? value.createdAt.trim() : nowIso();
  const updatedAt = typeof value.updatedAt === "string" && value.updatedAt.trim() ? value.updatedAt.trim() : createdAt;

  return {
    id,
    key,
    label,
    remainingTurns,
    createdAt,
    updatedAt,
  };
}

export function normalizeEncounterConditionStates(value: unknown): EncounterConditionStateDto[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => normalizeEncounterConditionState(entry)).filter((entry): entry is EncounterConditionStateDto => entry !== null);
}

export function tickEncounterConditionStates(
  states: EncounterConditionStateDto[],
  turnsElapsed = 1,
): { nextStates: EncounterConditionStateDto[]; expiredStates: EncounterConditionStateDto[] } {
  const normalizedTurns = Math.max(0, Math.floor(turnsElapsed));
  if (normalizedTurns <= 0) {
    return {
      nextStates: states.map((state) => ({ ...state })),
      expiredStates: [],
    };
  }

  const nextStates: EncounterConditionStateDto[] = [];
  const expiredStates: EncounterConditionStateDto[] = [];
  const updatedAt = nowIso();

  for (const state of states) {
    if (state.remainingTurns === null) {
      nextStates.push({ ...state });
      continue;
    }

    const nextRemaining = state.remainingTurns - normalizedTurns;
    if (nextRemaining > 0) {
      nextStates.push({
        ...state,
        remainingTurns: nextRemaining,
        updatedAt,
      });
      continue;
    }

    expiredStates.push({ ...state });
  }

  return {
    nextStates,
    expiredStates,
  };
}

export function adjustEncounterConditionState(
  state: EncounterConditionStateDto,
  deltaTurns: number,
): EncounterConditionStateDto | null {
  if (!Number.isFinite(deltaTurns) || deltaTurns === 0) {
    return { ...state, updatedAt: nowIso() };
  }

  if (state.remainingTurns === null) {
    return { ...state, updatedAt: nowIso() };
  }

  const nextRemaining = Math.max(0, Math.floor(state.remainingTurns + deltaTurns));
  if (nextRemaining <= 0) {
    return null;
  }

  return {
    ...state,
    remainingTurns: nextRemaining,
    updatedAt: nowIso(),
  };
}

export function formatEncounterConditionTimerLabel(remainingTurns: number | null): string {
  if (remainingTurns === null) {
    return "Manual";
  }

  const safeTurns = Math.max(0, Math.floor(remainingTurns));
  const seconds = safeTurns * TURN_SECONDS;
  return safeTurns === 1 ? `1 turn · ${seconds}s` : `${safeTurns} turns · ${seconds}s`;
}
