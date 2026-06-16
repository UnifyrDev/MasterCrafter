import type {
  EncounterCombatantDto,
  EncounterCombatantSourceKind,
  EncounterCombatantTeam,
  EncounterDto,
  EncounterNpcLibraryEntryDto,
  EncounterPlayerLibraryEntryDto,
  EncounterSessionDto,
  EncounterSessionCombatantDto,
} from "@shared/contracts";
import { createId, slugify } from "@shared/utils";

export interface EncounterDraftState {
  id: string | null;
  name: string;
  slug: string;
  description: string;
  notes: string;
  mapId: string | null;
  tagsText: string;
}

export interface EncounterNpcDraftState {
  id: string | null;
  sourceEntityId: string | null;
  team: EncounterCombatantTeam;
  name: string;
  slug: string;
  challengeRating: string;
  armorClass: number;
  hitPoints: number;
  speed: string;
  initiativeBonus: number;
  notes: string;
  tagsText: string;
}

export interface EncounterPlayerDraftState {
  id: string | null;
  name: string;
  slug: string;
  level: number;
  armorClass: number;
  hitPoints: number;
  initiativeBonus: number;
  speed: string;
  notes: string;
  tagsText: string;
}

export interface EncounterCombatantDraftState {
  id: string | null;
  sourceKind: EncounterCombatantSourceKind;
  sourceId: string | null;
  team: EncounterCombatantTeam;
  name: string;
  quantity: number;
  initiativeBonus: number;
  armorClass: number;
  hitPoints: number;
  speed: string;
  levelText: string;
  challengeRating: string;
  notes: string;
  sortIndex: number;
}

export function parseTagList(text: string): string[] {
  return text
    .split(/[\n,]/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function formatTagList(tags: string[]): string {
  return tags.join(", ");
}

export function formatCombatantTeamLabel(team: EncounterCombatantTeam): string {
  switch (team) {
    case "party":
      return "Friendly";
    case "enemy":
      return "Unfriendly";
    case "neutral":
      return "Neutral";
  }
}

export function parseLevelInput(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

export function createEncounterDraft(encounter: EncounterDto | null = null): EncounterDraftState {
  return {
    id: encounter?.id ?? null,
    name: encounter?.name ?? "Untitled Encounter",
    slug: encounter?.slug ?? slugify(encounter?.name ?? "Untitled Encounter"),
    description: encounter?.description ?? "",
    notes: encounter?.notes ?? "",
    mapId: encounter?.mapId ?? null,
    tagsText: formatTagList(encounter?.tags ?? []),
  };
}

export function createNpcDraft(entry: EncounterNpcLibraryEntryDto | null = null): EncounterNpcDraftState {
  return {
    id: entry?.id ?? null,
    sourceEntityId: entry?.sourceEntityId ?? null,
    team: entry?.team ?? "enemy",
    name: entry?.name ?? "Untitled NPC",
    slug: entry?.slug ?? slugify(entry?.name ?? "Untitled NPC"),
    challengeRating: entry?.challengeRating ?? "0",
    armorClass: entry?.armorClass ?? 10,
    hitPoints: entry?.hitPoints ?? 1,
    speed: entry?.speed ?? "",
    initiativeBonus: entry?.initiativeBonus ?? 0,
    notes: entry?.notes ?? "",
    tagsText: formatTagList(entry?.tags ?? []),
  };
}

export function createPlayerDraft(entry: EncounterPlayerLibraryEntryDto | null = null): EncounterPlayerDraftState {
  return {
    id: entry?.id ?? null,
    name: entry?.name ?? "Untitled Player",
    slug: entry?.slug ?? slugify(entry?.name ?? "Untitled Player"),
    level: entry?.level ?? 1,
    armorClass: entry?.armorClass ?? 10,
    hitPoints: entry?.hitPoints ?? 1,
    initiativeBonus: entry?.initiativeBonus ?? 0,
    speed: entry?.speed ?? "",
    notes: entry?.notes ?? "",
    tagsText: formatTagList(entry?.tags ?? []),
  };
}

export function createCombatantDraft(combatant: EncounterCombatantDto | null = null): EncounterCombatantDraftState {
  return {
    id: combatant?.id ?? null,
    sourceKind: combatant?.sourceKind ?? "custom",
    sourceId: combatant?.sourceId ?? null,
    team: combatant?.team ?? "enemy",
    name: combatant?.name ?? "Untitled Combatant",
    quantity: combatant?.quantity ?? 1,
    initiativeBonus: combatant?.initiativeBonus ?? 0,
    armorClass: combatant?.armorClass ?? 10,
    hitPoints: combatant?.hitPoints ?? 1,
    speed: combatant?.speed ?? "",
    levelText: combatant?.level === null || combatant?.level === undefined ? "" : String(combatant.level),
    challengeRating: combatant?.challengeRating ?? "0",
    notes: combatant?.notes ?? "",
    sortIndex: combatant?.sortIndex ?? 0,
  };
}

export function createCombatantDraftFromNpc(
  entry: EncounterNpcLibraryEntryDto,
  team: EncounterCombatantTeam = entry.team,
): EncounterCombatantDraftState {
  return {
    id: null,
    sourceKind: "npc",
    sourceId: entry.id,
    team,
    name: entry.name,
    quantity: 1,
    initiativeBonus: entry.initiativeBonus,
    armorClass: entry.armorClass,
    hitPoints: entry.hitPoints,
    speed: entry.speed,
    levelText: "",
    challengeRating: entry.challengeRating,
    notes: entry.notes,
    sortIndex: 0,
  };
}

export function createSessionCombatantFromNpc(
  entry: EncounterNpcLibraryEntryDto,
  team: EncounterCombatantTeam = entry.team,
  sortIndex = 0,
): EncounterSessionCombatantDto {
  const id = createId();
  return {
    id,
    encounterCombatantId: createId(),
    sourceKind: "npc",
    sourceId: entry.id,
    team,
    name: entry.name,
    groupName: entry.name,
    groupIndex: 1,
    groupSize: 1,
    initiativeBonus: entry.initiativeBonus,
    initiativeMode: null,
    initiativeRoll: null,
    initiativeScore: null,
    armorClass: entry.armorClass,
    maxHitPoints: entry.hitPoints,
    currentHitPoints: entry.hitPoints,
    tempHitPoints: 0,
    speed: entry.speed,
    level: null,
    challengeRating: entry.challengeRating,
    notes: entry.notes,
    conditions: [],
    isHidden: false,
    isDefeated: false,
    sortIndex,
  };
}

export function createCombatantDraftFromPlayer(entry: EncounterPlayerLibraryEntryDto): EncounterCombatantDraftState {
  return {
    id: null,
    sourceKind: "player",
    sourceId: entry.id,
    team: "party",
    name: entry.name,
    quantity: 1,
    initiativeBonus: entry.initiativeBonus,
    armorClass: entry.armorClass,
    hitPoints: entry.hitPoints,
    speed: entry.speed,
    levelText: String(entry.level),
    challengeRating: String(entry.level),
    notes: entry.notes,
    sortIndex: 0,
  };
}

export function cloneSessionDto(session: EncounterSessionDto | null): EncounterSessionDto | null {
  if (!session) {
    return null;
  }

  return {
    ...session,
    combatants: session.combatants.map((combatant) => ({
      ...combatant,
      conditions: combatant.conditions.map((condition) => ({ ...condition })),
    })),
  };
}
