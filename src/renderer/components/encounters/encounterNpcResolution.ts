import type { EncounterNpcLibraryEntryDto, EntityDto } from "@shared/contracts";
import { slugify } from "@shared/utils";

function normalizeExact(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeSlug(value: string | null | undefined): string {
  return value ? slugify(value.trim()) : "";
}

function findEntryForEntity(entity: EntityDto, npcEntries: EncounterNpcLibraryEntryDto[]): EncounterNpcLibraryEntryDto | null {
  const sourceEntityId = entity.id.trim();
  const directEntry = npcEntries.find((entry) => entry.sourceEntityId?.trim() === sourceEntityId) ?? null;
  if (directEntry) {
    return directEntry;
  }

  const entitySlug = normalizeExact(entity.slug);
  if (entitySlug) {
    const bySlug = npcEntries.find((entry) => normalizeExact(entry.slug) === entitySlug) ?? null;
    if (bySlug) {
      return bySlug;
    }
  }

  const entityNameSlug = normalizeSlug(entity.title);
  if (entityNameSlug) {
    const byName = npcEntries.find((entry) => normalizeSlug(entry.name) === entityNameSlug) ?? null;
    if (byName) {
      return byName;
    }
  }

  return null;
}

function findEntityForEntry(entry: EncounterNpcLibraryEntryDto, entities: EntityDto[]): EntityDto | null {
  const sourceEntityId = entry.sourceEntityId?.trim();
  const directEntity = sourceEntityId ? entities.find((candidate) => candidate.id === sourceEntityId) ?? null : null;
  if (directEntity?.npcStatblock) {
    return directEntity;
  }

  const entrySlug = normalizeExact(entry.slug);
  if (entrySlug) {
    const bySlug = entities.find(
      (candidate) => candidate.typeKey === "npc" && Boolean(candidate.npcStatblock) && normalizeExact(candidate.slug) === entrySlug,
    ) ?? null;
    if (bySlug) {
      return bySlug;
    }
  }

  const entryNameSlug = normalizeSlug(entry.name);
  if (entryNameSlug) {
    const byName = entities.find(
      (candidate) => candidate.typeKey === "npc" && Boolean(candidate.npcStatblock) && normalizeSlug(candidate.title) === entryNameSlug,
    ) ?? null;
    if (byName) {
      return byName;
    }
  }

  return directEntity;
}

export function resolveNpcEntryForHover(
  hoveredNpcId: string | null,
  npcEntries: EncounterNpcLibraryEntryDto[],
  entities: EntityDto[],
): EncounterNpcLibraryEntryDto | null {
  if (!hoveredNpcId) {
    return null;
  }

  const directEntry = npcEntries.find((entry) => entry.id === hoveredNpcId) ?? null;
  if (directEntry) {
    return directEntry;
  }

  const hoveredEntity = entities.find((entity) => entity.id === hoveredNpcId) ?? null;
  if (!hoveredEntity) {
    return null;
  }

  return findEntryForEntity(hoveredEntity, npcEntries);
}

export function resolveNpcEntityForHover(
  entry: EncounterNpcLibraryEntryDto | null,
  entities: EntityDto[],
): EntityDto | null {
  if (!entry) {
    return null;
  }

  return findEntityForEntry(entry, entities);
}
