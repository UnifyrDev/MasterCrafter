import type Database from "better-sqlite3";
import type {
  BacklinkDto,
  CalendarStampDto,
  CampaignCalendarDto,
  CampaignSnapshotDto,
  CustomFieldDefinitionDto,
  EntityDto,
  EntityInputDto,
  EntityTypeDefinitionDto,
  EntityTypeDefinitionInputDto,
  ImportImageInputDto,
  ItemDto,
  ItemInputDto,
  EncounterCombatantDto,
  EncounterCombatantInputDto,
  EncounterCombatantSourceKind,
  EncounterCombatantTeam,
  EncounterDto,
  EncounterInputDto,
  EncounterNpcLibraryEntryDto,
  EncounterNpcLibraryInputDto,
  EncounterPlayerLibraryEntryDto,
  EncounterPlayerLibraryInputDto,
  EncounterSessionCombatantDto,
  EncounterSessionDto,
  EncounterSessionInputDto,
  EncounterSessionStatus,
  MapDto,
  MapInputDto,
  MapPlacementDto,
  MapPlacementInputDto,
  NoteDto,
  NoteInputDto,
  QuestNodeDto,
  QuestNodeInputDto,
  QuestlineDto,
  QuestlineInputDto,
  QuestRewardDto,
  RelationEdgeDto,
  RelationEdgeInputDto,
  NpcStatblockDto,
  SearchQueryInputDto,
  SearchResultDto,
  StoreStockDto,
  StoreStockInputDto,
  TimelineEventDto,
  TimelineEventInputDto,
  UpdateCalendarInputDto,
  UpdateWorkspaceMetadataInputDto,
  WorkspaceSummaryDto,
} from "@shared/contracts";
import { GLOBAL_TIMELINE_LABEL } from "@shared/constants";
import { createBuiltinEntityTypes, DEFAULT_CALENDAR } from "@infra/database/defaultData";
import { CampaignMap } from "@domain/models/CampaignMap";
import { CampaignWorkspace } from "@domain/models/CampaignWorkspace";
import { Entity } from "@domain/models/Entity";
import { EntityTypeDefinition } from "@domain/models/EntityTypeDefinition";
import { Item } from "@domain/models/Item";
import { Encounter } from "@domain/models/Encounter";
import { EncounterCombatant } from "@domain/models/EncounterCombatant";
import { EncounterSession } from "@domain/models/EncounterSession";
import { EncounterSessionCombatant } from "@domain/models/EncounterSessionCombatant";
import { EncounterNpcLibraryEntry } from "@domain/models/EncounterNpcLibraryEntry";
import { EncounterPlayerLibraryEntry } from "@domain/models/EncounterPlayerLibraryEntry";
import { MapPlacement } from "@domain/models/MapPlacement";
import { QuestNode } from "@domain/models/QuestNode";
import { Questline } from "@domain/models/Questline";
import { RelationEdge } from "@domain/models/RelationEdge";
import { StoreStock } from "@domain/models/StoreStock";
import { TimelineEvent } from "@domain/models/TimelineEvent";
import { npcStatblockSearchText } from "@shared/npcStatblock";
import { createId, nowIso, safeJsonParse, slugify, stableStringify } from "@shared/utils";
import { readFileSync } from "node:fs";
import { imageSize } from "image-size";

type SqliteDatabase = Database.Database;

interface AssetRecord {
  id: string;
  workspaceId: string;
  kind: string;
  originalName: string;
  fileName: string;
  relativePath: string;
  absolutePath: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceMetaMap {
  workspace_name: string;
  workspace_description: string;
  workspace_calendar: string;
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

function toJsonArray(value: unknown[]): string {
  return JSON.stringify(value);
}

function parseArray<T>(value: string, fallback: T[]): T[] {
  return safeJsonParse<T[]>(value, fallback);
}

function parseObject<T>(value: string, fallback: T): T {
  return safeJsonParse<T>(value, fallback);
}

function parseNullableObject<T>(value: unknown): T | null {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return value as T;
  }

  return safeJsonParse<T | null>(value, null);
}

function normalizeStamp(stamp: CalendarStampDto): CalendarStampDto {
  return {
    year: Number(stamp.year),
    month: Number(stamp.month),
    day: Number(stamp.day),
    hour: Number(stamp.hour),
    minute: Number(stamp.minute),
  };
}

function parseNullableStamp(value: unknown): CalendarStampDto | null {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return normalizeStamp(value as CalendarStampDto);
  }

  const parsed = safeJsonParse<CalendarStampDto | null>(value, null);
  return parsed ? normalizeStamp(parsed) : null;
}

function defaultCalendar(): CampaignCalendarDto {
  return DEFAULT_CALENDAR;
}

function normalizeText(value: unknown, fallback = ""): string {
  if (value == null) {
    return fallback;
  }

  const text = String(value).trim();
  return text.length ? text : fallback;
}

function normalizeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeNullableNumber(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  return value.map((entry) => String(entry).trim()).filter(Boolean);
}

function normalizeCombatantSourceKind(value: unknown): EncounterCombatantSourceKind {
  const text = normalizeText(value, "custom") as EncounterCombatantSourceKind;
  if (text === "npc" || text === "player" || text === "custom") {
    return text;
  }

  return "custom";
}

function normalizeCombatantTeam(value: unknown): EncounterCombatantTeam {
  const text = normalizeText(value, "neutral") as EncounterCombatantTeam;
  if (text === "party" || text === "enemy" || text === "neutral") {
    return text;
  }

  return "neutral";
}

function normalizeSessionStatus(value: unknown): EncounterSessionStatus {
  const text = normalizeText(value, "paused") as EncounterSessionStatus;
  if (text === "active" || text === "paused" || text === "completed") {
    return text;
  }

  return "paused";
}

export class CampaignRepository {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly workspaceSummary: WorkspaceSummaryDto,
  ) {}

  get workspaceId(): string {
    return this.workspaceSummary.id;
  }

  initializeWorkspace(name: string, description: string, calendar: CampaignCalendarDto = defaultCalendar()): void {
    this.setMeta("workspace_name", name);
    this.setMeta("workspace_description", description);
    this.setMeta("workspace_calendar", stableStringify(calendar));
    this.seedBuiltinEntityTypes();
  }

  updateWorkspaceMetadata(input: UpdateWorkspaceMetadataInputDto): WorkspaceSummaryDto {
    this.setMeta("workspace_name", input.name);
    this.setMeta("workspace_description", input.description);
    return this.loadWorkspaceSummary();
  }

  updateCalendar(input: UpdateCalendarInputDto): CampaignCalendarDto {
    this.setMeta("workspace_calendar", stableStringify(input.calendar));
    return this.loadCalendar();
  }

  loadWorkspaceSummary(): WorkspaceSummaryDto {
    const name = this.getMeta("workspace_name") ?? this.workspaceSummary.name;
    const description = this.getMeta("workspace_description") ?? this.workspaceSummary.description;
    const calendar = this.loadCalendar();

    return {
      ...this.workspaceSummary,
      name,
      description,
      calendarName: calendar.name,
    };
  }

  loadCalendar(): CampaignCalendarDto {
    return parseObject<CampaignCalendarDto>(this.getMeta("workspace_calendar") ?? stableStringify(defaultCalendar()), defaultCalendar());
  }

  seedBuiltinEntityTypes(): void {
    const existingBuiltins = this.database
      .prepare("SELECT COUNT(*) AS total FROM entity_type_definitions WHERE workspace_id = ? AND builtin = 1")
      .get(this.workspaceId) as { total: number };

    if (existingBuiltins.total > 0) {
      return;
    }

    const builtins = createBuiltinEntityTypes(this.workspaceId);
    const insert = this.database.prepare(
      `INSERT INTO entity_type_definitions
      (id, workspace_id, type_key, display_name, icon, color, description, builtin, field_definitions_json, created_at, updated_at)
      VALUES (@id, @workspaceId, @typeKey, @displayName, @icon, @color, @description, @builtin, @fieldDefinitionsJson, @createdAt, @updatedAt)`,
    );

    const transaction = this.database.transaction((definitions: EntityTypeDefinitionDto[]) => {
      for (const definition of definitions) {
        insert.run({
          id: definition.id,
          workspaceId: definition.workspaceId,
          typeKey: definition.typeKey,
          displayName: definition.displayName,
          icon: definition.icon,
          color: definition.color,
          description: definition.description,
          builtin: definition.builtin ? 1 : 0,
          fieldDefinitionsJson: toJson(definition.fieldDefinitions),
          createdAt: definition.createdAt,
          updatedAt: definition.updatedAt,
        });
      }
    });

    transaction(builtins);
  }

  snapshot(): CampaignSnapshotDto {
    this.ensureEncounterLibrariesSeeded();
    const workspace = this.loadWorkspaceSummary();
    const calendar = this.loadCalendar();

    return {
      workspace,
      calendar,
      entityTypes: this.listEntityTypes(),
      entities: this.listEntities(),
      maps: this.listMaps(),
      placements: this.listAllPlacements(),
      notes: this.listNotes(),
      questlines: this.listQuestlines(),
      questNodes: this.listQuestNodes(),
      timelineEvents: this.listTimelineEvents(),
      relations: this.listRelations(),
      items: this.listItems(),
      encounters: this.listEncounters(),
      encounterCombatants: this.listAllEncounterCombatants(),
      encounterSessions: this.listEncounterSessions(),
      npcLibraryEntries: this.listNpcLibraryEntries(),
      playerLibraryEntries: this.listPlayerLibraryEntries(),
      storeStocks: this.listStoreStocks(),
    };
  }

  listEntityTypes(): EntityTypeDefinitionDto[] {
    const rows = this.database
      .prepare(
        `SELECT id, workspace_id, type_key, display_name, icon, color, description, builtin, field_definitions_json, created_at, updated_at
         FROM entity_type_definitions
         WHERE workspace_id = ?
         ORDER BY builtin DESC, display_name ASC`,
      )
      .all(this.workspaceId) as Array<Record<string, unknown>>;

    return rows.map((row) => this.rowToEntityType(row));
  }

  saveEntityType(input: EntityTypeDefinitionInputDto): EntityTypeDefinitionDto {
    const id = input.id ?? createId();
    const now = nowIso();
    const row = this.database
      .prepare(
        `SELECT created_at, builtin
         FROM entity_type_definitions
         WHERE workspace_id = ? AND id = ?`,
      )
      .get(this.workspaceId, id) as { created_at?: string; builtin?: number } | undefined;

    const entityType = new EntityTypeDefinition(
      id,
      this.workspaceId,
      input.typeKey,
      input.displayName,
      input.icon,
      input.color,
      input.description,
      input.builtin,
      input.fieldDefinitions,
      row?.created_at ?? now,
      now,
    );

    const statement = this.database.prepare(
      `INSERT INTO entity_type_definitions
        (id, workspace_id, type_key, display_name, icon, color, description, builtin, field_definitions_json, created_at, updated_at)
       VALUES (@id, @workspaceId, @typeKey, @displayName, @icon, @color, @description, @builtin, @fieldDefinitionsJson, @createdAt, @updatedAt)
       ON CONFLICT(id) DO UPDATE SET
         type_key = excluded.type_key,
         display_name = excluded.display_name,
         icon = excluded.icon,
         color = excluded.color,
         description = excluded.description,
         builtin = excluded.builtin,
         field_definitions_json = excluded.field_definitions_json,
         updated_at = excluded.updated_at`,
    );

    statement.run({
      id: entityType.id,
      workspaceId: entityType.workspaceId,
      typeKey: entityType.typeKey,
      displayName: entityType.displayName,
      icon: entityType.icon,
      color: entityType.color,
      description: entityType.description,
      builtin: entityType.builtin ? 1 : 0,
      fieldDefinitionsJson: toJson(entityType.fieldDefinitions),
      createdAt: entityType.createdAt,
      updatedAt: entityType.updatedAt,
    });

    return entityType.toDto();
  }

  deleteEntityType(typeId: string): void {
    const row = this.database
      .prepare("SELECT builtin FROM entity_type_definitions WHERE workspace_id = ? AND id = ?")
      .get(this.workspaceId, typeId) as { builtin?: number } | undefined;

    if (!row) {
      return;
    }

    if (row.builtin === 1) {
      throw new Error("Built-in entity types cannot be deleted.");
    }

    this.database.prepare("DELETE FROM entity_type_definitions WHERE workspace_id = ? AND id = ?").run(this.workspaceId, typeId);
  }

  listEntities(): EntityDto[] {
    const rows = this.database
      .prepare(
        `SELECT id, workspace_id, type_key, title, slug, subtitle, description, markdown, image_asset_id, tags_json, linked_map_id, linked_placement_id, questline_id, family_tree_root_id, custom_fields_json, npc_statblock_json, created_at, updated_at
         FROM entities
         WHERE workspace_id = ?
         ORDER BY title COLLATE NOCASE ASC`,
      )
      .all(this.workspaceId) as Array<Record<string, unknown>>;

    return rows.map((row) => this.rowToEntity(row));
  }

  saveEntity(input: EntityInputDto): EntityDto {
    const id = input.id ?? createId();
    const now = nowIso();
    const existing = this.database
      .prepare("SELECT created_at, type_key FROM entities WHERE workspace_id = ? AND id = ?")
      .get(this.workspaceId, id) as { created_at?: string; type_key?: string } | undefined;

    const entity = new Entity(
      id,
      this.workspaceId,
      input.typeKey,
      input.title,
      input.slug || slugify(input.title),
      input.subtitle,
      input.description,
      input.markdown,
      input.imageAssetId,
      null,
      input.tags,
      input.linkedMapId,
      input.linkedPlacementId,
      input.questlineId,
      input.familyTreeRootId,
      input.customFields,
      input.npcStatblock,
      existing?.created_at ?? now,
      now,
    );

    const imageAssetPath = entity.imageAssetId ? this.getAssetPath(entity.imageAssetId) : null;
    const save = this.database.prepare(
      `INSERT INTO entities
        (id, workspace_id, type_key, title, slug, subtitle, description, markdown, image_asset_id, tags_json, linked_map_id, linked_placement_id, questline_id, family_tree_root_id, custom_fields_json, npc_statblock_json, created_at, updated_at)
       VALUES (@id, @workspaceId, @typeKey, @title, @slug, @subtitle, @description, @markdown, @imageAssetId, @tagsJson, @linkedMapId, @linkedPlacementId, @questlineId, @familyTreeRootId, @customFieldsJson, @npcStatblockJson, @createdAt, @updatedAt)
       ON CONFLICT(id) DO UPDATE SET
          type_key = excluded.type_key,
          title = excluded.title,
          slug = excluded.slug,
          subtitle = excluded.subtitle,
         description = excluded.description,
         markdown = excluded.markdown,
         image_asset_id = excluded.image_asset_id,
         tags_json = excluded.tags_json,
          linked_map_id = excluded.linked_map_id,
          linked_placement_id = excluded.linked_placement_id,
          questline_id = excluded.questline_id,
          family_tree_root_id = excluded.family_tree_root_id,
          custom_fields_json = excluded.custom_fields_json,
          npc_statblock_json = excluded.npc_statblock_json,
          updated_at = excluded.updated_at`,
    );

    const transaction = this.database.transaction(() => {
      save.run({
        id: entity.id,
        workspaceId: entity.workspaceId,
        typeKey: entity.typeKey,
        title: entity.title,
        slug: entity.slug,
        subtitle: entity.subtitle,
        description: entity.description,
        markdown: entity.markdown,
        imageAssetId: entity.imageAssetId,
        tagsJson: toJsonArray(entity.tags),
        linkedMapId: entity.linkedMapId,
        linkedPlacementId: entity.linkedPlacementId,
        questlineId: entity.questlineId,
        familyTreeRootId: entity.familyTreeRootId,
        customFieldsJson: stableStringify(entity.customFields),
        npcStatblockJson: entity.npcStatblock ? stableStringify(entity.npcStatblock) : null,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
      });

      this.upsertSearchIndex({
        recordType: "entity",
        recordId: entity.id,
        typeKey: entity.typeKey,
      title: entity.title,
      body: [
        entity.subtitle,
        entity.description,
        entity.markdown,
        stableStringify(entity.customFields),
        npcStatblockSearchText(entity.npcStatblock),
      ]
        .filter(Boolean)
        .join("\n"),
      tags: entity.tags,
    });

      this.syncContentLinks("entity", entity.id, entity.markdown, entity.slug, entity.title);

      if (entity.typeKey === "npc") {
        this.syncNpcLibraryEntryFromEntity(entity.toDto());
      } else if (existing?.type_key === "npc") {
        this.deleteNpcLibraryEntriesBySourceEntityId(entity.id);
      }
    });

    transaction();

    return {
      ...entity.toDto(),
      imageAssetPath,
    };
  }

  deleteEntity(entityId: string): void {
    const transaction = this.database.transaction(() => {
      const entity = this.database
        .prepare("SELECT image_asset_id FROM entities WHERE workspace_id = ? AND id = ?")
        .get(this.workspaceId, entityId) as { image_asset_id?: string | null } | undefined;

      if (!entity) {
        return;
      }

      this.database.prepare("DELETE FROM map_placements WHERE workspace_id = ? AND entity_id = ?").run(this.workspaceId, entityId);
      this.database.prepare("DELETE FROM relations WHERE workspace_id = ? AND (source_entity_id = ? OR target_entity_id = ?)").run(this.workspaceId, entityId, entityId);
      this.database.prepare("DELETE FROM timeline_events WHERE workspace_id = ? AND (entity_id = ? OR location_entity_id = ?)").run(this.workspaceId, entityId, entityId);
      this.database.prepare("DELETE FROM store_stocks WHERE workspace_id = ? AND (store_entity_id = ? OR item_id = ?)").run(this.workspaceId, entityId, entityId);
      this.database.prepare("DELETE FROM content_links WHERE workspace_id = ? AND (source_id = ? OR target_id = ?)").run(this.workspaceId, entityId, entityId);
      this.database.prepare("UPDATE questlines SET anchor_entity_id = NULL WHERE workspace_id = ? AND anchor_entity_id = ?").run(this.workspaceId, entityId);
      this.deleteNpcLibraryEntriesBySourceEntityId(entityId);
      this.database.prepare("DELETE FROM entities WHERE workspace_id = ? AND id = ?").run(this.workspaceId, entityId);
      this.deleteSearchIndex("entity", entityId);

      if (entity.image_asset_id) {
        this.database.prepare("UPDATE entities SET image_asset_id = NULL WHERE workspace_id = ? AND image_asset_id = ?").run(this.workspaceId, entity.image_asset_id);
      }
    });

    transaction();
  }

  listMaps(): MapDto[] {
    const rows = this.database
      .prepare(
        `SELECT m.id, m.workspace_id, m.title, m.description, m.asset_id, m.asset_name, m.asset_path, m.width, m.height, m.created_at, m.updated_at
         FROM maps AS m
         WHERE m.workspace_id = ?
         ORDER BY m.title COLLATE NOCASE ASC`,
      )
      .all(this.workspaceId) as Array<Record<string, unknown>>;

    return rows.map((row) => this.rowToMap(row));
  }

  saveMap(input: MapInputDto): MapDto {
    const id = input.id ?? createId();
    const now = nowIso();
    const existing = this.database
      .prepare("SELECT created_at FROM maps WHERE workspace_id = ? AND id = ?")
      .get(this.workspaceId, id) as { created_at?: string } | undefined;

    const assetPath = this.getAssetPath(input.assetId);
    if (!assetPath) {
      throw new Error(`Asset ${input.assetId} is not available in this workspace.`);
    }

    const map = new CampaignMap(
      id,
      this.workspaceId,
      input.title,
      input.description,
      input.assetId,
      input.assetName,
      assetPath,
      input.width,
      input.height,
      existing?.created_at ?? now,
      now,
    );

    const transaction = this.database.transaction(() => {
      this.database.prepare(
        `INSERT INTO maps
          (id, workspace_id, title, description, asset_id, asset_name, asset_path, width, height, created_at, updated_at)
         VALUES (@id, @workspaceId, @title, @description, @assetId, @assetName, @assetPath, @width, @height, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           description = excluded.description,
           asset_id = excluded.asset_id,
           asset_name = excluded.asset_name,
           asset_path = excluded.asset_path,
           width = excluded.width,
           height = excluded.height,
           updated_at = excluded.updated_at`,
      ).run({
        id: map.id,
        workspaceId: map.workspaceId,
        title: map.title,
        description: map.description,
        assetId: map.assetId,
        assetName: map.assetName,
        assetPath: map.assetPath,
        width: map.width,
        height: map.height,
        createdAt: map.createdAt,
        updatedAt: map.updatedAt,
      });

      this.upsertSearchIndex({
        recordType: "map",
        recordId: map.id,
        typeKey: "landmark",
        title: map.title,
        body: map.description,
        tags: [map.assetName],
      });
    });

    transaction();

    return map.toDto();
  }

  importImage(input: ImportImageInputDto, asset: AssetRecord): MapDto {
    const map = this.saveMap({
      workspaceId: this.workspaceId,
      id: input.mapId,
      title: input.mapTitle,
      description: input.mapDescription,
      assetId: asset.id,
      assetName: asset.originalName,
      width: 0,
      height: 0,
    });

    const dimensions = this.readImageDimensions(asset.absolutePath);
    this.database.prepare("UPDATE maps SET width = ?, height = ? WHERE workspace_id = ? AND id = ?").run(dimensions.width, dimensions.height, this.workspaceId, map.id);
    return {
      ...map,
      width: dimensions.width,
      height: dimensions.height,
      assetPath: asset.absolutePath,
    };
  }

  deleteMap(mapId: string): void {
    const transaction = this.database.transaction(() => {
      this.database.prepare("DELETE FROM map_placements WHERE workspace_id = ? AND map_id = ?").run(this.workspaceId, mapId);
      this.database.prepare("DELETE FROM content_links WHERE workspace_id = ? AND target_type = 'map' AND target_id = ?").run(this.workspaceId, mapId);
      this.database.prepare("DELETE FROM maps WHERE workspace_id = ? AND id = ?").run(this.workspaceId, mapId);
      this.deleteSearchIndex("map", mapId);
    });

    transaction();
  }

  listPlacements(mapId: string): MapPlacementDto[] {
    const rows = this.database
      .prepare(
        `SELECT id, workspace_id, map_id, entity_id, label, kind, geometry_json, text_width, text_height, text_offset_x, text_offset_y, notes, color, glow_color, shadow_color, scale, font_color, z_index, created_at, updated_at
         FROM map_placements
         WHERE workspace_id = ? AND map_id = ?
         ORDER BY z_index ASC, label COLLATE NOCASE ASC`,
      )
      .all(this.workspaceId, mapId) as Array<Record<string, unknown>>;

    return rows.map((row) => this.rowToPlacement(row));
  }

  listAllPlacements(): MapPlacementDto[] {
    const rows = this.database
      .prepare(
        `SELECT id, workspace_id, map_id, entity_id, label, kind, geometry_json, text_width, text_height, text_offset_x, text_offset_y, notes, color, glow_color, shadow_color, scale, font_color, z_index, created_at, updated_at
         FROM map_placements
         WHERE workspace_id = ?
         ORDER BY z_index ASC, label COLLATE NOCASE ASC`,
      )
      .all(this.workspaceId) as Array<Record<string, unknown>>;

    return rows.map((row) => this.rowToPlacement(row));
  }

  savePlacement(input: MapPlacementInputDto): MapPlacementDto {
    const id = input.id ?? createId();
    const now = nowIso();
    const existing = this.database
      .prepare("SELECT created_at FROM map_placements WHERE workspace_id = ? AND id = ?")
      .get(this.workspaceId, id) as { created_at?: string } | undefined;

    const placement = new MapPlacement(
      id,
      this.workspaceId,
      input.mapId,
      input.entityId,
      input.label,
      input.kind,
      input.geometry,
      input.textWidth,
      input.textHeight,
      input.textOffsetX,
      input.textOffsetY,
      input.notes,
      input.color,
      input.glowColor,
      input.shadowColor,
      input.scale,
      input.fontColor,
      input.zIndex,
      existing?.created_at ?? now,
      now,
    );

    const transaction = this.database.transaction(() => {
      this.database.prepare(
        `INSERT INTO map_placements
          (id, workspace_id, map_id, entity_id, label, kind, geometry_json, text_width, text_height, text_offset_x, text_offset_y, notes, color, glow_color, shadow_color, scale, font_color, z_index, created_at, updated_at)
         VALUES (@id, @workspaceId, @mapId, @entityId, @label, @kind, @geometryJson, @textWidth, @textHeight, @textOffsetX, @textOffsetY, @notes, @color, @glowColor, @shadowColor, @scale, @fontColor, @zIndex, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           map_id = excluded.map_id,
           entity_id = excluded.entity_id,
           label = excluded.label,
           kind = excluded.kind,
           geometry_json = excluded.geometry_json,
           text_width = excluded.text_width,
           text_height = excluded.text_height,
           text_offset_x = excluded.text_offset_x,
           text_offset_y = excluded.text_offset_y,
           notes = excluded.notes,
           color = excluded.color,
           glow_color = excluded.glow_color,
           shadow_color = excluded.shadow_color,
           scale = excluded.scale,
           font_color = excluded.font_color,
           z_index = excluded.z_index,
           updated_at = excluded.updated_at`,
      ).run({
        id: placement.id,
        workspaceId: placement.workspaceId,
        mapId: placement.mapId,
        entityId: placement.entityId,
        label: placement.label,
        kind: placement.kind,
        geometryJson: stableStringify(placement.geometry),
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
        createdAt: placement.createdAt,
        updatedAt: placement.updatedAt,
      });

      this.upsertSearchIndex({
        recordType: "placement",
        recordId: placement.id,
        typeKey: "landmark",
        title: placement.label,
        body: placement.notes,
        tags: [placement.kind],
      });
    });

    transaction();

    return placement.toDto();
  }

  deletePlacement(mapId: string, placementId: string): void {
    this.database
      .prepare("DELETE FROM map_placements WHERE workspace_id = ? AND map_id = ? AND id = ?")
      .run(this.workspaceId, mapId, placementId);
    this.deleteSearchIndex("placement", placementId);
  }

  listNotes(): NoteDto[] {
    const rows = this.database
      .prepare(
        `SELECT id, workspace_id, title, slug, kind, body, tags_json, linked_entity_ids_json, created_at, updated_at
         FROM notes
         WHERE workspace_id = ?
         ORDER BY title COLLATE NOCASE ASC`,
      )
      .all(this.workspaceId) as Array<Record<string, unknown>>;

    return rows.map((row) => this.rowToNote(row));
  }

  saveNote(input: NoteInputDto): NoteDto {
    const id = input.id ?? createId();
    const now = nowIso();
    const existing = this.database
      .prepare("SELECT created_at, slug FROM notes WHERE workspace_id = ? AND id = ?")
      .get(this.workspaceId, id) as { created_at?: string; slug?: string } | undefined;
    const slug = existing?.slug ?? slugify(input.title);

    const note = new NoteDtoRecord(
      id,
      this.workspaceId,
      input.title,
      slug,
      input.kind,
      input.body,
      input.tags,
      input.linkedEntityIds,
      existing?.created_at ?? now,
      now,
    );

    const transaction = this.database.transaction(() => {
      this.database.prepare(
        `INSERT INTO notes
          (id, workspace_id, title, slug, kind, body, tags_json, linked_entity_ids_json, created_at, updated_at)
         VALUES (@id, @workspaceId, @title, @slug, @kind, @body, @tagsJson, @linkedEntityIdsJson, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           slug = excluded.slug,
           kind = excluded.kind,
           body = excluded.body,
           tags_json = excluded.tags_json,
           linked_entity_ids_json = excluded.linked_entity_ids_json,
           updated_at = excluded.updated_at`,
      ).run({
        id: note.id,
        workspaceId: note.workspaceId,
        title: note.title,
        slug: note.slug,
        kind: note.kind,
        body: note.body,
        tagsJson: toJsonArray(note.tags),
        linkedEntityIdsJson: toJsonArray(note.linkedEntityIds),
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      });

      this.upsertSearchIndex({
        recordType: "note",
        recordId: note.id,
        typeKey: "note",
        title: note.title,
        body: note.body,
        tags: note.tags,
      });

      this.syncContentLinks("note", note.id, note.body, note.slug, note.title);
      this.syncExplicitEntityLinks(note.id, note.linkedEntityIds);
    });

    transaction();

    return note.toDto();
  }

  deleteNote(noteId: string): void {
    const note = this.database
      .prepare("SELECT slug FROM notes WHERE workspace_id = ? AND id = ?")
      .get(this.workspaceId, noteId) as { slug?: string } | undefined;

    if (!note) {
      return;
    }

    const transaction = this.database.transaction(() => {
      this.database.prepare("DELETE FROM notes WHERE workspace_id = ? AND id = ?").run(this.workspaceId, noteId);
      this.database.prepare("DELETE FROM content_links WHERE workspace_id = ? AND source_id = ? AND source_type = 'note'").run(this.workspaceId, noteId);
      this.deleteSearchIndex("note", noteId);
    });

    transaction();
  }

  listQuestlines(): QuestlineDto[] {
    const rows = this.database
      .prepare(
        `SELECT id, workspace_id, anchor_entity_id, title, description, status, created_at, updated_at
         FROM questlines
         WHERE workspace_id = ?
         ORDER BY title COLLATE NOCASE ASC`,
      )
      .all(this.workspaceId) as Array<Record<string, unknown>>;

    return rows.map((row) => this.rowToQuestline(row));
  }

  saveQuestline(input: QuestlineInputDto): QuestlineDto {
    const id = input.id ?? createId();
    const now = nowIso();
    const existing = this.database
      .prepare("SELECT created_at FROM questlines WHERE workspace_id = ? AND id = ?")
      .get(this.workspaceId, id) as { created_at?: string } | undefined;

    const questline = new Questline(
      id,
      this.workspaceId,
      input.anchorEntityId,
      input.title,
      input.description,
      input.status,
      existing?.created_at ?? now,
      now,
    );

    const transaction = this.database.transaction(() => {
      this.database.prepare(
        `INSERT INTO questlines
          (id, workspace_id, anchor_entity_id, title, description, status, created_at, updated_at)
         VALUES (@id, @workspaceId, @anchorEntityId, @title, @description, @status, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           anchor_entity_id = excluded.anchor_entity_id,
           title = excluded.title,
           description = excluded.description,
           status = excluded.status,
           updated_at = excluded.updated_at`,
      ).run({
        id: questline.id,
        workspaceId: questline.workspaceId,
        anchorEntityId: questline.anchorEntityId,
        title: questline.title,
        description: questline.description,
        status: questline.status,
        createdAt: questline.createdAt,
        updatedAt: questline.updatedAt,
      });

      this.upsertSearchIndex({
        recordType: "questline",
        recordId: questline.id,
        typeKey: "quest",
        title: questline.title,
        body: questline.description,
        tags: [questline.status],
      });
    });

    transaction();

    return questline.toDto();
  }

  deleteQuestline(questlineId: string): void {
    const transaction = this.database.transaction(() => {
      this.database
        .prepare(
          "UPDATE timeline_events SET quest_node_id = NULL WHERE workspace_id = ? AND quest_node_id IN (SELECT id FROM quest_nodes WHERE workspace_id = ? AND questline_id = ?)",
        )
        .run(this.workspaceId, this.workspaceId, questlineId);
      this.database
        .prepare(
          "DELETE FROM search_index_fts WHERE workspace_id = ? AND record_type = 'questNode' AND record_id IN (SELECT id FROM quest_nodes WHERE workspace_id = ? AND questline_id = ?)",
        )
        .run(this.workspaceId, this.workspaceId, questlineId);
      this.database.prepare("DELETE FROM quest_nodes WHERE workspace_id = ? AND questline_id = ?").run(this.workspaceId, questlineId);
      this.database.prepare("DELETE FROM questlines WHERE workspace_id = ? AND id = ?").run(this.workspaceId, questlineId);
      this.deleteSearchIndex("questline", questlineId);
    });

    transaction();
  }

  listQuestNodes(): QuestNodeDto[] {
    const rows = this.database
      .prepare(
        `SELECT id, workspace_id, questline_id, parent_node_id, title, description, rewards_json, order_index, stamp_json, created_at, updated_at
         FROM quest_nodes
         WHERE workspace_id = ?
         ORDER BY order_index ASC, title COLLATE NOCASE ASC`,
      )
      .all(this.workspaceId) as Array<Record<string, unknown>>;

    return rows.map((row) => this.rowToQuestNode(row));
  }

  listQuestNodesByQuestline(questlineId: string): QuestNodeDto[] {
    const rows = this.database
      .prepare(
        `SELECT id, workspace_id, questline_id, parent_node_id, title, description, rewards_json, order_index, stamp_json, created_at, updated_at
         FROM quest_nodes
         WHERE workspace_id = ? AND questline_id = ?
         ORDER BY order_index ASC, title COLLATE NOCASE ASC`,
      )
      .all(this.workspaceId, questlineId) as Array<Record<string, unknown>>;

    return rows.map((row) => this.rowToQuestNode(row));
  }

  saveQuestNode(input: QuestNodeInputDto): QuestNodeDto {
    const id = input.id ?? createId();
    const now = nowIso();
    const existing = this.database
      .prepare("SELECT created_at, stamp_json FROM quest_nodes WHERE workspace_id = ? AND id = ?")
      .get(this.workspaceId, id) as { created_at?: string; stamp_json?: unknown } | undefined;
    const existingStamp = parseNullableStamp(existing?.stamp_json);
    const nextStamp = input.stamp === undefined ? existingStamp : input.stamp === null ? null : normalizeStamp(input.stamp);

    const questNode = new QuestNode(
      id,
      this.workspaceId,
      input.questlineId,
      input.parentNodeId,
      input.title,
      input.description,
      input.rewards,
      input.orderIndex,
      nextStamp,
      existing?.created_at ?? now,
      now,
    );

    const transaction = this.database.transaction(() => {
      this.persistQuestNode(questNode);

      this.upsertSearchIndex({
        recordType: "questNode",
        recordId: questNode.id,
        typeKey: "quest",
        title: questNode.title,
        body: [questNode.description, stableStringify(questNode.rewards)].join("\n"),
        tags: [questNode.questlineId],
      });
    });

    transaction();

    return questNode.toDto();
  }

  deleteQuestNode(questlineId: string, nodeId: string): void {
    const transaction = this.database.transaction(() => {
      this.database.prepare("UPDATE quest_nodes SET parent_node_id = NULL WHERE workspace_id = ? AND parent_node_id = ?").run(this.workspaceId, nodeId);
      this.database.prepare("UPDATE timeline_events SET quest_node_id = NULL WHERE workspace_id = ? AND quest_node_id = ?").run(this.workspaceId, nodeId);
      this.database.prepare("DELETE FROM quest_nodes WHERE workspace_id = ? AND questline_id = ? AND id = ?").run(this.workspaceId, questlineId, nodeId);
      this.deleteSearchIndex("questNode", nodeId);
    });

    transaction();
  }

  listTimelineEvents(): TimelineEventDto[] {
    const rows = this.database
      .prepare(
        `SELECT id, workspace_id, entity_id, quest_node_id, title, description, event_type, lane_kind, lane_label, stamp_json, duration_minutes, location_entity_id, created_at, updated_at
         FROM timeline_events
         WHERE workspace_id = ?
         ORDER BY
           CAST(json_extract(stamp_json, '$.year') AS INTEGER) ASC,
           CAST(json_extract(stamp_json, '$.month') AS INTEGER) ASC,
           CAST(json_extract(stamp_json, '$.day') AS INTEGER) ASC,
           CAST(json_extract(stamp_json, '$.hour') AS INTEGER) ASC,
           CAST(json_extract(stamp_json, '$.minute') AS INTEGER) ASC,
           created_at ASC,
           id ASC`,
      )
      .all(this.workspaceId) as Array<Record<string, unknown>>;

    return rows.map((row) => this.rowToTimelineEvent(row));
  }

  saveTimelineEvent(input: TimelineEventInputDto): TimelineEventDto {
    const id = input.id ?? createId();
    const now = nowIso();
    const existing = this.database
      .prepare("SELECT created_at FROM timeline_events WHERE workspace_id = ? AND id = ?")
      .get(this.workspaceId, id) as { created_at?: string } | undefined;
    const laneLabel = input.laneKind === "global" ? GLOBAL_TIMELINE_LABEL : input.laneLabel;

    const event = new TimelineEvent(
      id,
      this.workspaceId,
      input.entityId,
      input.questNodeId,
      input.title,
      input.description,
      input.eventType,
      input.laneKind,
      laneLabel,
      normalizeStamp(input.stamp),
      input.durationMinutes,
      input.locationEntityId,
      existing?.created_at ?? now,
      now,
    );

    const transaction = this.database.transaction(() => {
      this.database.prepare(
        `INSERT INTO timeline_events
          (id, workspace_id, entity_id, quest_node_id, title, description, event_type, lane_kind, lane_label, stamp_json, duration_minutes, location_entity_id, created_at, updated_at)
         VALUES (@id, @workspaceId, @entityId, @questNodeId, @title, @description, @eventType, @laneKind, @laneLabel, @stampJson, @durationMinutes, @locationEntityId, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           entity_id = excluded.entity_id,
           quest_node_id = excluded.quest_node_id,
           title = excluded.title,
           description = excluded.description,
           event_type = excluded.event_type,
           lane_kind = excluded.lane_kind,
           lane_label = excluded.lane_label,
           stamp_json = excluded.stamp_json,
           duration_minutes = excluded.duration_minutes,
           location_entity_id = excluded.location_entity_id,
           updated_at = excluded.updated_at`,
      ).run({
        id: event.id,
        workspaceId: event.workspaceId,
        entityId: event.entityId,
        questNodeId: event.questNodeId,
        title: event.title,
        description: event.description,
        eventType: event.eventType,
        laneKind: event.laneKind,
        laneLabel: event.laneLabel,
        stampJson: stableStringify(event.stamp),
        durationMinutes: event.durationMinutes,
        locationEntityId: event.locationEntityId,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      });

      this.upsertSearchIndex({
        recordType: "timelineEvent",
        recordId: event.id,
        typeKey: "event",
        title: event.title,
        body: [event.description, event.eventType, event.laneLabel].join("\n"),
        tags: [event.laneKind],
      });

      if (event.questNodeId) {
        this.syncQuestNodeStampFromEvent(event.questNodeId, event.stamp);
      }
    });

    transaction();

    return event.toDto();
  }

  deleteTimelineEvent(eventId: string): void {
    const transaction = this.database.transaction(() => {
      this.database.prepare("DELETE FROM timeline_events WHERE workspace_id = ? AND id = ?").run(this.workspaceId, eventId);
      this.deleteSearchIndex("timelineEvent", eventId);
    });

    transaction();
  }

  private persistQuestNode(questNode: QuestNode): void {
    this.database.prepare(
      `INSERT INTO quest_nodes
        (id, workspace_id, questline_id, parent_node_id, title, description, rewards_json, order_index, stamp_json, created_at, updated_at)
       VALUES (@id, @workspaceId, @questlineId, @parentNodeId, @title, @description, @rewardsJson, @orderIndex, @stampJson, @createdAt, @updatedAt)
       ON CONFLICT(id) DO UPDATE SET
         questline_id = excluded.questline_id,
         parent_node_id = excluded.parent_node_id,
         title = excluded.title,
         description = excluded.description,
         rewards_json = excluded.rewards_json,
         order_index = excluded.order_index,
         stamp_json = excluded.stamp_json,
         updated_at = excluded.updated_at`,
    ).run({
      id: questNode.id,
      workspaceId: questNode.workspaceId,
      questlineId: questNode.questlineId,
      parentNodeId: questNode.parentNodeId,
      title: questNode.title,
      description: questNode.description,
      rewardsJson: toJson(questNode.rewards),
      orderIndex: questNode.orderIndex,
      stampJson: questNode.stamp ? stableStringify(questNode.stamp) : null,
      createdAt: questNode.createdAt,
      updatedAt: questNode.updatedAt,
    });
  }

  private syncQuestNodeStampFromEvent(questNodeId: string, stamp: CalendarStampDto): void {
    const row = this.database
      .prepare(
        `SELECT id, workspace_id, questline_id, parent_node_id, title, description, rewards_json, order_index, stamp_json, created_at, updated_at
         FROM quest_nodes
         WHERE workspace_id = ? AND id = ?`,
      )
      .get(this.workspaceId, questNodeId) as Record<string, unknown> | undefined;

    if (!row) {
      return;
    }

    const questNode = this.hydrateQuestNode(row);
    questNode.setStamp(normalizeStamp(stamp));
    this.persistQuestNode(questNode);
  }

  listRelations(): RelationEdgeDto[] {
    const rows = this.database
      .prepare(
        `SELECT id, workspace_id, source_entity_id, target_entity_id, relation_kind, label, notes, created_at, updated_at
         FROM relations
         WHERE workspace_id = ?
         ORDER BY label COLLATE NOCASE ASC`,
      )
      .all(this.workspaceId) as Array<Record<string, unknown>>;

    return rows.map((row) => this.rowToRelation(row));
  }

  saveRelation(input: RelationEdgeInputDto): RelationEdgeDto {
    const id = input.id ?? createId();
    const now = nowIso();
    const existing = this.database
      .prepare("SELECT created_at FROM relations WHERE workspace_id = ? AND id = ?")
      .get(this.workspaceId, id) as { created_at?: string } | undefined;

    const relation = new RelationEdge(
      id,
      this.workspaceId,
      input.sourceEntityId,
      input.targetEntityId,
      input.relationKind,
      input.label,
      input.notes,
      existing?.created_at ?? now,
      now,
    );

    const transaction = this.database.transaction(() => {
      this.database.prepare(
        `INSERT INTO relations
          (id, workspace_id, source_entity_id, target_entity_id, relation_kind, label, notes, created_at, updated_at)
         VALUES (@id, @workspaceId, @sourceEntityId, @targetEntityId, @relationKind, @label, @notes, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           source_entity_id = excluded.source_entity_id,
           target_entity_id = excluded.target_entity_id,
           relation_kind = excluded.relation_kind,
           label = excluded.label,
           notes = excluded.notes,
           updated_at = excluded.updated_at`,
      ).run({
        id: relation.id,
        workspaceId: relation.workspaceId,
        sourceEntityId: relation.sourceEntityId,
        targetEntityId: relation.targetEntityId,
        relationKind: relation.relationKind,
        label: relation.label,
        notes: relation.notes,
        createdAt: relation.createdAt,
        updatedAt: relation.updatedAt,
      });

      this.upsertSearchIndex({
        recordType: "relation",
        recordId: relation.id,
        typeKey: "npc",
        title: relation.label,
        body: relation.notes,
        tags: [relation.relationKind],
      });
    });

    transaction();

    return relation.toDto();
  }

  deleteRelation(relationId: string): void {
    const transaction = this.database.transaction(() => {
      this.database.prepare("DELETE FROM relations WHERE workspace_id = ? AND id = ?").run(this.workspaceId, relationId);
      this.deleteSearchIndex("relation", relationId);
    });

    transaction();
  }

  listItems(): ItemDto[] {
    const rows = this.database
      .prepare(
        `SELECT id, workspace_id, title, description, worth, rarity, tags_json, created_at, updated_at
         FROM items
         WHERE workspace_id = ?
         ORDER BY title COLLATE NOCASE ASC`,
      )
      .all(this.workspaceId) as Array<Record<string, unknown>>;

    return rows.map((row) => this.rowToItem(row));
  }

  saveItem(input: ItemInputDto): ItemDto {
    const id = input.id ?? createId();
    const now = nowIso();
    const existing = this.database
      .prepare("SELECT created_at FROM items WHERE workspace_id = ? AND id = ?")
      .get(this.workspaceId, id) as { created_at?: string } | undefined;

    const item = new Item(
      id,
      this.workspaceId,
      input.title,
      input.description,
      input.worth,
      input.rarity,
      input.tags,
      existing?.created_at ?? now,
      now,
    );

    const transaction = this.database.transaction(() => {
      this.database.prepare(
        `INSERT INTO items
          (id, workspace_id, title, description, worth, rarity, tags_json, created_at, updated_at)
         VALUES (@id, @workspaceId, @title, @description, @worth, @rarity, @tagsJson, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           description = excluded.description,
           worth = excluded.worth,
           rarity = excluded.rarity,
           tags_json = excluded.tags_json,
           updated_at = excluded.updated_at`,
      ).run({
        id: item.id,
        workspaceId: item.workspaceId,
        title: item.title,
        description: item.description,
        worth: item.worth,
        rarity: item.rarity,
        tagsJson: toJsonArray(item.tags),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      });

      this.upsertSearchIndex({
        recordType: "item",
        recordId: item.id,
        typeKey: "item",
        title: item.title,
        body: item.description,
        tags: [...item.tags, item.rarity],
      });
    });

    transaction();

    return item.toDto();
  }

  deleteItem(itemId: string): void {
    const transaction = this.database.transaction(() => {
      this.database.prepare("DELETE FROM items WHERE workspace_id = ? AND id = ?").run(this.workspaceId, itemId);
      this.database.prepare("DELETE FROM store_stocks WHERE workspace_id = ? AND item_id = ?").run(this.workspaceId, itemId);
      this.deleteSearchIndex("item", itemId);
    });

    transaction();
  }

  listEncounters(): EncounterDto[] {
    this.ensureEncounterLibrariesSeeded();
    const rows = this.database
      .prepare(
        `SELECT id, workspace_id, name, slug, description, notes, map_id, tags_json, created_at, updated_at
         FROM encounters
         WHERE workspace_id = ?
         ORDER BY updated_at DESC, name COLLATE NOCASE ASC`,
      )
      .all(this.workspaceId) as Array<Record<string, unknown>>;

    return rows.map((row) => this.rowToEncounter(row));
  }

  saveEncounter(input: EncounterInputDto): EncounterDto {
    const id = input.id ?? createId();
    const now = nowIso();
    const existing = this.database
      .prepare("SELECT created_at FROM encounters WHERE workspace_id = ? AND id = ?")
      .get(this.workspaceId, id) as { created_at?: string } | undefined;

    const encounter = new Encounter(
      id,
      this.workspaceId,
      normalizeText(input.name, "Untitled Encounter"),
      input.slug ? slugify(input.slug) : slugify(input.name),
      normalizeText(input.description),
      normalizeText(input.notes),
      input.mapId ?? null,
      normalizeStringArray(input.tags),
      existing?.created_at ?? now,
      now,
    );

    this.database.prepare(
      `INSERT INTO encounters
        (id, workspace_id, name, slug, description, notes, map_id, tags_json, created_at, updated_at)
       VALUES (@id, @workspaceId, @name, @slug, @description, @notes, @mapId, @tagsJson, @createdAt, @updatedAt)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         slug = excluded.slug,
         description = excluded.description,
         notes = excluded.notes,
         map_id = excluded.map_id,
         tags_json = excluded.tags_json,
         updated_at = excluded.updated_at`,
    ).run({
      id: encounter.id,
      workspaceId: encounter.workspaceId,
      name: encounter.name,
      slug: encounter.slug,
      description: encounter.description,
      notes: encounter.notes,
      mapId: encounter.mapId,
      tagsJson: toJsonArray(encounter.tags),
      createdAt: encounter.createdAt,
      updatedAt: encounter.updatedAt,
    });

    this.upsertSearchIndex({
      recordType: "encounter",
      recordId: encounter.id,
      typeKey: "encounter",
      title: encounter.name,
      body: [encounter.description, encounter.notes].filter(Boolean).join("\n"),
      tags: encounter.tags,
    });

    this.syncContentLinks("encounter", encounter.id, [encounter.description, encounter.notes].filter(Boolean).join("\n"), encounter.slug, encounter.name);

    return encounter.toDto();
  }

  deleteEncounter(encounterId: string): void {
    const combatantRows = this.database
      .prepare("SELECT id FROM encounter_combatants WHERE workspace_id = ? AND encounter_id = ?")
      .all(this.workspaceId, encounterId) as Array<{ id: string }>;

    const sessionRows = this.database
      .prepare("SELECT id FROM encounter_sessions WHERE workspace_id = ? AND encounter_id = ?")
      .all(this.workspaceId, encounterId) as Array<{ id: string }>;

    const transaction = this.database.transaction(() => {
      this.database
        .prepare("DELETE FROM encounter_sessions WHERE workspace_id = ? AND encounter_id = ?")
        .run(this.workspaceId, encounterId);
      this.database
        .prepare("DELETE FROM encounter_combatants WHERE workspace_id = ? AND encounter_id = ?")
        .run(this.workspaceId, encounterId);
      this.database
        .prepare("DELETE FROM encounters WHERE workspace_id = ? AND id = ?")
        .run(this.workspaceId, encounterId);
      this.database
        .prepare("DELETE FROM content_links WHERE workspace_id = ? AND source_type = 'encounter' AND source_id = ?")
        .run(this.workspaceId, encounterId);
      this.deleteSearchIndex("encounter", encounterId);

      for (const combatant of combatantRows) {
        this.database
          .prepare("DELETE FROM content_links WHERE workspace_id = ? AND source_type = 'encounterCombatant' AND source_id = ?")
          .run(this.workspaceId, combatant.id);
        this.deleteSearchIndex("encounterCombatant", combatant.id);
      }

      for (const session of sessionRows) {
        this.database
          .prepare("DELETE FROM content_links WHERE workspace_id = ? AND source_type = 'encounterSession' AND source_id = ?")
          .run(this.workspaceId, session.id);
        this.deleteSearchIndex("encounterSession", session.id);
      }
    });

    transaction();
  }

  listCombatants(encounterId: string): EncounterCombatantDto[] {
    const rows = this.database
      .prepare(
        `SELECT id, workspace_id, encounter_id, source_kind, source_id, team, name, quantity, initiative_bonus, armor_class, hit_points, speed, level, challenge_rating, notes, sort_index, created_at, updated_at
         FROM encounter_combatants
         WHERE workspace_id = ? AND encounter_id = ?
         ORDER BY sort_index ASC, name COLLATE NOCASE ASC`,
      )
      .all(this.workspaceId, encounterId) as Array<Record<string, unknown>>;

    return rows.map((row) => this.rowToEncounterCombatant(row));
  }

  listAllEncounterCombatants(): EncounterCombatantDto[] {
    const rows = this.database
      .prepare(
        `SELECT id, workspace_id, encounter_id, source_kind, source_id, team, name, quantity, initiative_bonus, armor_class, hit_points, speed, level, challenge_rating, notes, sort_index, created_at, updated_at
         FROM encounter_combatants
         WHERE workspace_id = ?
         ORDER BY encounter_id ASC, sort_index ASC, name COLLATE NOCASE ASC`,
      )
      .all(this.workspaceId) as Array<Record<string, unknown>>;

    return rows.map((row) => this.rowToEncounterCombatant(row));
  }

  saveCombatant(input: EncounterCombatantInputDto): EncounterCombatantDto {
    const id = input.id ?? createId();
    const now = nowIso();
    const existing = this.database
      .prepare("SELECT created_at FROM encounter_combatants WHERE workspace_id = ? AND id = ?")
      .get(this.workspaceId, id) as { created_at?: string } | undefined;

    const combatant = new EncounterCombatant(
      id,
      this.workspaceId,
      input.encounterId,
      normalizeCombatantSourceKind(input.sourceKind),
      input.sourceId ?? null,
      normalizeCombatantTeam(input.team),
      normalizeText(input.name, "Untitled Combatant"),
      Math.max(1, Math.floor(normalizeNumber(input.quantity, 1))),
      Math.floor(normalizeNumber(input.initiativeBonus, 0)),
      Math.max(0, Math.floor(normalizeNumber(input.armorClass, 10))),
      Math.max(0, Math.floor(normalizeNumber(input.hitPoints, 1))),
      normalizeText(input.speed),
      input.level === null || input.level === undefined ? null : Math.max(0, Math.floor(normalizeNumber(input.level, 0))),
      normalizeText(input.challengeRating),
      normalizeText(input.notes),
      Math.max(0, Math.floor(normalizeNumber(input.sortIndex, 0))),
      existing?.created_at ?? now,
      now,
    );

    this.database.prepare(
      `INSERT INTO encounter_combatants
        (id, workspace_id, encounter_id, source_kind, source_id, team, name, quantity, initiative_bonus, armor_class, hit_points, speed, level, challenge_rating, notes, sort_index, created_at, updated_at)
       VALUES (@id, @workspaceId, @encounterId, @sourceKind, @sourceId, @team, @name, @quantity, @initiativeBonus, @armorClass, @hitPoints, @speed, @level, @challengeRating, @notes, @sortIndex, @createdAt, @updatedAt)
       ON CONFLICT(id) DO UPDATE SET
         encounter_id = excluded.encounter_id,
         source_kind = excluded.source_kind,
         source_id = excluded.source_id,
         team = excluded.team,
         name = excluded.name,
         quantity = excluded.quantity,
         initiative_bonus = excluded.initiative_bonus,
         armor_class = excluded.armor_class,
         hit_points = excluded.hit_points,
         speed = excluded.speed,
         level = excluded.level,
         challenge_rating = excluded.challenge_rating,
         notes = excluded.notes,
         sort_index = excluded.sort_index,
         updated_at = excluded.updated_at`,
    ).run({
      id: combatant.id,
      workspaceId: combatant.workspaceId,
      encounterId: combatant.encounterId,
      sourceKind: combatant.sourceKind,
      sourceId: combatant.sourceId,
      team: combatant.team,
      name: combatant.name,
      quantity: combatant.quantity,
      initiativeBonus: combatant.initiativeBonus,
      armorClass: combatant.armorClass,
      hitPoints: combatant.hitPoints,
      speed: combatant.speed,
      level: combatant.level,
      challengeRating: combatant.challengeRating,
      notes: combatant.notes,
      sortIndex: combatant.sortIndex,
      createdAt: combatant.createdAt,
      updatedAt: combatant.updatedAt,
    });

    this.upsertSearchIndex({
      recordType: "encounterCombatant",
      recordId: combatant.id,
      typeKey: combatant.sourceKind,
      title: combatant.name,
      body: [combatant.notes, combatant.challengeRating, `AC ${combatant.armorClass}`, `HP ${combatant.hitPoints}`].filter(Boolean).join("\n"),
      tags: [combatant.team, combatant.sourceKind],
    });

    this.syncContentLinks("encounterCombatant", combatant.id, combatant.notes, combatant.name, combatant.name);

    return combatant.toDto();
  }

  deleteCombatant(encounterId: string, combatantId: string): void {
    const transaction = this.database.transaction(() => {
      this.database
        .prepare("DELETE FROM encounter_combatants WHERE workspace_id = ? AND encounter_id = ? AND id = ?")
        .run(this.workspaceId, encounterId, combatantId);
      this.deleteSearchIndex("encounterCombatant", combatantId);
    });

    transaction();
  }

  listEncounterSessions(encounterId?: string): EncounterSessionDto[] {
    const rows = encounterId
      ? this.database
          .prepare(
            `SELECT id, workspace_id, encounter_id, status, round_number, current_turn_index, started_at, last_advanced_at, ended_at, state_json, created_at, updated_at
             FROM encounter_sessions
             WHERE workspace_id = ? AND encounter_id = ?
             ORDER BY updated_at DESC, created_at DESC`,
          )
          .all(this.workspaceId, encounterId)
      : this.database
          .prepare(
            `SELECT id, workspace_id, encounter_id, status, round_number, current_turn_index, started_at, last_advanced_at, ended_at, state_json, created_at, updated_at
             FROM encounter_sessions
             WHERE workspace_id = ?
             ORDER BY updated_at DESC, created_at DESC`,
          )
          .all(this.workspaceId);

    return (rows as Array<Record<string, unknown>>).map((row) => this.rowToEncounterSession(row));
  }

  startEncounterSession(encounterId: string): EncounterSessionDto {
    const encounter = this.database
      .prepare("SELECT id FROM encounters WHERE workspace_id = ? AND id = ?")
      .get(this.workspaceId, encounterId) as { id?: string } | undefined;

    if (!encounter) {
      throw new Error("Encounter not found.");
    }

    const latestSession = this.database
      .prepare(
        `SELECT id, workspace_id, encounter_id, status, round_number, current_turn_index, started_at, last_advanced_at, ended_at, state_json, created_at, updated_at
         FROM encounter_sessions
         WHERE workspace_id = ? AND encounter_id = ?
         ORDER BY updated_at DESC, created_at DESC
         LIMIT 1`,
      )
      .get(this.workspaceId, encounterId) as Record<string, unknown> | undefined;

    if (latestSession) {
      const session = this.rowToEncounterSession(latestSession);
      if (session.status !== "completed") {
        const resumed = EncounterSession.createFromInput({
          id: session.id,
          workspaceId: session.workspaceId,
          encounterId: session.encounterId,
          status: "active",
          roundNumber: session.roundNumber,
          currentTurnIndex: session.currentTurnIndex,
          startedAt: session.startedAt,
          lastAdvancedAt: nowIso(),
          endedAt: null,
          combatants: session.combatants,
        }, session.createdAt, nowIso());
        this.persistEncounterSession(resumed);
        return resumed.toDto();
      }
    }

    const templates = this.listCombatants(encounterId);
    const combatants = templates.flatMap((template) => {
      const groupSize = Math.max(1, template.quantity);
      return Array.from({ length: groupSize }, (_, index) => EncounterSessionCombatant.fromCombatant(template, index + 1, groupSize));
    });

    const startedAt = nowIso();
    const session = EncounterSession.fromCombatants(createId(), this.workspaceId, encounterId, combatants, startedAt, startedAt);
    session.sortCombatants();
    this.persistEncounterSession(session);
    return session.toDto();
  }

  saveEncounterSession(input: EncounterSessionInputDto): EncounterSessionDto {
    const id = input.id ?? createId();
    const now = nowIso();
    const existing = this.database
      .prepare("SELECT created_at FROM encounter_sessions WHERE workspace_id = ? AND id = ?")
      .get(this.workspaceId, id) as { created_at?: string } | undefined;
    const session = EncounterSession.createFromInput(
      {
        ...input,
        id,
        workspaceId: this.workspaceId,
      },
      existing?.created_at ?? now,
      now,
    );

    this.persistEncounterSession(session);
    return session.toDto();
  }

  deleteEncounterSession(sessionId: string): void {
    const transaction = this.database.transaction(() => {
      this.database
        .prepare("DELETE FROM encounter_sessions WHERE workspace_id = ? AND id = ?")
        .run(this.workspaceId, sessionId);
      this.deleteSearchIndex("encounterSession", sessionId);
    });

    transaction();
  }

  listNpcLibraryEntries(): EncounterNpcLibraryEntryDto[] {
    this.ensureEncounterLibrariesSeeded();
    const rows = this.database
      .prepare(
        `SELECT id, workspace_id, source_entity_id, team, name, slug, challenge_rating, armor_class, hit_points, speed, initiative_bonus, notes, tags_json, created_at, updated_at
          FROM npc_library_entries
          WHERE workspace_id = ?
          ORDER BY name COLLATE NOCASE ASC`,
      )
      .all(this.workspaceId) as Array<Record<string, unknown>>;

    return rows.map((row) => this.rowToNpcLibraryEntry(row));
  }

  saveNpcLibraryEntry(input: EncounterNpcLibraryInputDto): EncounterNpcLibraryEntryDto {
    const id = input.id ?? createId();
    const now = nowIso();
    const existing = this.database
      .prepare("SELECT created_at FROM npc_library_entries WHERE workspace_id = ? AND id = ?")
      .get(this.workspaceId, id) as { created_at?: string } | undefined;

    const npc = new EncounterNpcLibraryEntry(
      id,
      this.workspaceId,
      input.sourceEntityId ?? null,
      normalizeCombatantTeam(input.team ?? "enemy"),
      normalizeText(input.name, "Untitled NPC"),
      input.slug ? slugify(input.slug) : slugify(input.name),
      normalizeText(input.challengeRating),
      Math.max(0, Math.floor(normalizeNumber(input.armorClass, 10))),
      Math.max(0, Math.floor(normalizeNumber(input.hitPoints, 1))),
      normalizeText(input.speed),
      Math.floor(normalizeNumber(input.initiativeBonus, 0)),
      normalizeText(input.notes),
      normalizeStringArray(input.tags),
      existing?.created_at ?? now,
      now,
    );

    this.persistNpcLibraryEntry(npc);

    return npc.toDto();
  }

  deleteNpcLibraryEntry(npcLibraryEntryId: string): void {
    const transaction = this.database.transaction(() => {
      this.deleteNpcLibraryEntryById(npcLibraryEntryId);
    });

    transaction();
  }

  private persistNpcLibraryEntry(npc: EncounterNpcLibraryEntry): void {
    this.database.prepare(
      `INSERT INTO npc_library_entries
        (id, workspace_id, source_entity_id, team, name, slug, challenge_rating, armor_class, hit_points, speed, initiative_bonus, notes, tags_json, created_at, updated_at)
       VALUES (@id, @workspaceId, @sourceEntityId, @team, @name, @slug, @challengeRating, @armorClass, @hitPoints, @speed, @initiativeBonus, @notes, @tagsJson, @createdAt, @updatedAt)
       ON CONFLICT(id) DO UPDATE SET
          source_entity_id = excluded.source_entity_id,
          team = excluded.team,
          name = excluded.name,
          slug = excluded.slug,
          challenge_rating = excluded.challenge_rating,
         armor_class = excluded.armor_class,
         hit_points = excluded.hit_points,
         speed = excluded.speed,
         initiative_bonus = excluded.initiative_bonus,
         notes = excluded.notes,
         tags_json = excluded.tags_json,
         updated_at = excluded.updated_at`,
    ).run({
      id: npc.id,
      workspaceId: npc.workspaceId,
      sourceEntityId: npc.sourceEntityId,
      team: npc.team,
      name: npc.name,
      slug: npc.slug,
      challengeRating: npc.challengeRating,
      armorClass: npc.armorClass,
      hitPoints: npc.hitPoints,
      speed: npc.speed,
      initiativeBonus: npc.initiativeBonus,
      notes: npc.notes,
      tagsJson: toJsonArray(npc.tags),
      createdAt: npc.createdAt,
      updatedAt: npc.updatedAt,
    });

    this.upsertSearchIndex({
      recordType: "npcLibraryEntry",
      recordId: npc.id,
      typeKey: "npc",
      title: npc.name,
      body: [npc.notes, npc.challengeRating, `AC ${npc.armorClass}`, `HP ${npc.hitPoints}`, `Speed ${npc.speed}`].filter(Boolean).join("\n"),
      tags: npc.tags,
    });

    this.syncContentLinks("npcLibraryEntry", npc.id, npc.notes, npc.slug, npc.name);
  }

  private deleteNpcLibraryEntryById(npcLibraryEntryId: string): void {
    this.database
      .prepare("DELETE FROM npc_library_entries WHERE workspace_id = ? AND id = ?")
      .run(this.workspaceId, npcLibraryEntryId);
    this.database
      .prepare("DELETE FROM content_links WHERE workspace_id = ? AND source_type = 'npcLibraryEntry' AND source_id = ?")
      .run(this.workspaceId, npcLibraryEntryId);
    this.deleteSearchIndex("npcLibraryEntry", npcLibraryEntryId);
  }

  private syncNpcLibraryEntryFromEntity(entity: EntityDto): void {
    const existingRows = this.database
      .prepare(
        `SELECT id, source_entity_id, team, initiative_bonus, notes, tags_json, created_at, slug
         FROM npc_library_entries
         WHERE workspace_id = ? AND (source_entity_id = ? OR slug = ? OR id = ?)
         ORDER BY CASE WHEN source_entity_id = ? THEN 0 WHEN id = ? THEN 1 ELSE 2 END, updated_at DESC
         LIMIT 1`,
      )
      .get(this.workspaceId, entity.id, slugify(entity.slug || entity.title), entity.id, entity.id, entity.id) as Record<string, unknown> | undefined;

    const statblock = entity.npcStatblock;
    const existingArmorClass = existingRows ? Math.max(0, Math.floor(normalizeNumber(existingRows.armor_class, 10))) : 10;
    const existingHitPoints = existingRows ? Math.max(0, Math.floor(normalizeNumber(existingRows.hit_points, 1))) : 1;
    const existingChallengeRating = existingRows ? normalizeText(existingRows.challenge_rating, "0") : "0";
    const existingSpeed = existingRows ? normalizeText(existingRows.speed) : "";
    const existingTags = existingRows ? normalizeStringArray(parseArray<string>(String(existingRows.tags_json ?? "[]"), [])) : [];
    const derivedNotes = normalizeText([entity.description, entity.markdown].filter(Boolean).join("\n\n"));
    const derivedTags = normalizeStringArray(entity.tags);
    const challengeRating = statblock ? normalizeText(statblock.challenge ?? "0") : existingChallengeRating;
    const armorClass = statblock ? this.extractLeadingNumber(statblock.armorClass ?? "", existingArmorClass) : existingArmorClass;
    const hitPoints = statblock ? this.extractLeadingNumber(statblock.hitPoints ?? "", existingHitPoints) : existingHitPoints;
    const speed = statblock ? normalizeText(statblock.speed ?? "") : existingSpeed;
    const npc = new EncounterNpcLibraryEntry(
      String(existingRows?.id ?? entity.id),
      this.workspaceId,
      entity.id,
      existingRows ? normalizeCombatantTeam(existingRows.team) : normalizeCombatantTeam("enemy"),
      normalizeText(entity.title, "Untitled NPC"),
      slugify(entity.slug || entity.title),
      challengeRating,
      armorClass,
      hitPoints,
      speed,
      existingRows ? Math.floor(normalizeNumber(existingRows.initiative_bonus, 0)) : 0,
      existingRows ? normalizeText(existingRows.notes) || derivedNotes : derivedNotes,
      existingRows ? (existingTags.length ? existingTags : derivedTags) : derivedTags,
      existingRows ? String(existingRows.created_at) : entity.createdAt,
      entity.updatedAt,
    );

    this.persistNpcLibraryEntry(npc);
  }

  private deleteNpcLibraryEntriesBySourceEntityId(sourceEntityId: string): void {
    const rows = this.database
      .prepare("SELECT id FROM npc_library_entries WHERE workspace_id = ? AND (source_entity_id = ? OR id = ?)")
      .all(this.workspaceId, sourceEntityId, sourceEntityId) as Array<{ id: string }>;

    for (const row of rows) {
      this.deleteNpcLibraryEntryById(row.id);
    }
  }

  private syncNpcLibraryEntriesFromEntities(): void {
    const npcEntities = this.listEntities().filter((entity) => entity.typeKey === "npc");
    const activeEntityIds = new Set(npcEntities.map((entity) => entity.id));

    for (const entity of npcEntities) {
      this.syncNpcLibraryEntryFromEntity(entity);
    }

    const linkedRows = this.database
      .prepare("SELECT source_entity_id FROM npc_library_entries WHERE workspace_id = ? AND source_entity_id IS NOT NULL")
      .all(this.workspaceId) as Array<{ source_entity_id: string | null }>;

    for (const row of linkedRows) {
      const sourceEntityId = row.source_entity_id ? String(row.source_entity_id) : null;
      if (sourceEntityId && !activeEntityIds.has(sourceEntityId)) {
        this.deleteNpcLibraryEntriesBySourceEntityId(sourceEntityId);
      }
    }
  }

  listPlayerLibraryEntries(): EncounterPlayerLibraryEntryDto[] {
    this.ensureEncounterLibrariesSeeded();
    const rows = this.database
      .prepare(
        `SELECT id, workspace_id, name, slug, level, armor_class, hit_points, initiative_bonus, speed, notes, tags_json, created_at, updated_at
         FROM player_library_entries
         WHERE workspace_id = ?
         ORDER BY name COLLATE NOCASE ASC`,
      )
      .all(this.workspaceId) as Array<Record<string, unknown>>;

    return rows.map((row) => this.rowToPlayerLibraryEntry(row));
  }

  savePlayerLibraryEntry(input: EncounterPlayerLibraryInputDto): EncounterPlayerLibraryEntryDto {
    const id = input.id ?? createId();
    const now = nowIso();
    const existing = this.database
      .prepare("SELECT created_at FROM player_library_entries WHERE workspace_id = ? AND id = ?")
      .get(this.workspaceId, id) as { created_at?: string } | undefined;

    const player = new EncounterPlayerLibraryEntry(
      id,
      this.workspaceId,
      normalizeText(input.name, "Untitled Player"),
      input.slug ? slugify(input.slug) : slugify(input.name),
      Math.max(0, Math.floor(normalizeNumber(input.level, 1))),
      Math.max(0, Math.floor(normalizeNumber(input.armorClass, 10))),
      Math.max(0, Math.floor(normalizeNumber(input.hitPoints, 1))),
      Math.floor(normalizeNumber(input.initiativeBonus, 0)),
      normalizeText(input.speed),
      normalizeText(input.notes),
      normalizeStringArray(input.tags),
      existing?.created_at ?? now,
      now,
    );

    this.database.prepare(
      `INSERT INTO player_library_entries
        (id, workspace_id, name, slug, level, armor_class, hit_points, initiative_bonus, speed, notes, tags_json, created_at, updated_at)
       VALUES (@id, @workspaceId, @name, @slug, @level, @armorClass, @hitPoints, @initiativeBonus, @speed, @notes, @tagsJson, @createdAt, @updatedAt)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         slug = excluded.slug,
         level = excluded.level,
         armor_class = excluded.armor_class,
         hit_points = excluded.hit_points,
         initiative_bonus = excluded.initiative_bonus,
         speed = excluded.speed,
         notes = excluded.notes,
         tags_json = excluded.tags_json,
         updated_at = excluded.updated_at`,
    ).run({
      id: player.id,
      workspaceId: player.workspaceId,
      name: player.name,
      slug: player.slug,
      level: player.level,
      armorClass: player.armorClass,
      hitPoints: player.hitPoints,
      initiativeBonus: player.initiativeBonus,
      speed: player.speed,
      notes: player.notes,
      tagsJson: toJsonArray(player.tags),
      createdAt: player.createdAt,
      updatedAt: player.updatedAt,
    });

    this.upsertSearchIndex({
      recordType: "playerLibraryEntry",
      recordId: player.id,
      typeKey: "player",
      title: player.name,
      body: [player.notes, `Level ${player.level}`, `AC ${player.armorClass}`, `HP ${player.hitPoints}`, `Speed ${player.speed}`].filter(Boolean).join("\n"),
      tags: player.tags,
    });

    this.syncContentLinks("playerLibraryEntry", player.id, player.notes, player.slug, player.name);

    return player.toDto();
  }

  deletePlayerLibraryEntry(playerLibraryEntryId: string): void {
    const transaction = this.database.transaction(() => {
      this.database
        .prepare("DELETE FROM player_library_entries WHERE workspace_id = ? AND id = ?")
        .run(this.workspaceId, playerLibraryEntryId);
      this.database
        .prepare("DELETE FROM content_links WHERE workspace_id = ? AND source_type = 'playerLibraryEntry' AND source_id = ?")
        .run(this.workspaceId, playerLibraryEntryId);
      this.deleteSearchIndex("playerLibraryEntry", playerLibraryEntryId);
    });

    transaction();
  }

  listStoreStocks(): StoreStockDto[] {
    const rows = this.database
      .prepare(
        `SELECT id, workspace_id, store_entity_id, item_id, quantity, price_override, notes, created_at, updated_at
         FROM store_stocks
         WHERE workspace_id = ?
         ORDER BY store_entity_id COLLATE NOCASE ASC, item_id COLLATE NOCASE ASC`,
      )
      .all(this.workspaceId) as Array<Record<string, unknown>>;

    return rows.map((row) => this.rowToStoreStock(row));
  }

  listStock(storeEntityId: string): StoreStockDto[] {
    const rows = this.database
      .prepare(
        `SELECT id, workspace_id, store_entity_id, item_id, quantity, price_override, notes, created_at, updated_at
         FROM store_stocks
         WHERE workspace_id = ? AND store_entity_id = ?
         ORDER BY item_id COLLATE NOCASE ASC`,
      )
      .all(this.workspaceId, storeEntityId) as Array<Record<string, unknown>>;

    return rows.map((row) => this.rowToStoreStock(row));
  }

  saveStock(input: StoreStockInputDto): StoreStockDto {
    const id = input.id ?? createId();
    const now = nowIso();
    const existing = this.database
      .prepare("SELECT created_at FROM store_stocks WHERE workspace_id = ? AND id = ?")
      .get(this.workspaceId, id) as { created_at?: string } | undefined;

    const stock = new StoreStock(
      id,
      this.workspaceId,
      input.storeEntityId,
      input.itemId,
      input.quantity,
      input.priceOverride,
      input.notes,
      existing?.created_at ?? now,
      now,
    );

    const transaction = this.database.transaction(() => {
      this.database.prepare(
        `INSERT INTO store_stocks
          (id, workspace_id, store_entity_id, item_id, quantity, price_override, notes, created_at, updated_at)
         VALUES (@id, @workspaceId, @storeEntityId, @itemId, @quantity, @priceOverride, @notes, @createdAt, @updatedAt)
         ON CONFLICT(workspace_id, store_entity_id, item_id) DO UPDATE SET
           quantity = excluded.quantity,
           price_override = excluded.price_override,
           notes = excluded.notes,
           updated_at = excluded.updated_at`,
      ).run({
        id: stock.id,
        workspaceId: stock.workspaceId,
        storeEntityId: stock.storeEntityId,
        itemId: stock.itemId,
        quantity: stock.quantity,
        priceOverride: stock.priceOverride,
        notes: stock.notes,
        createdAt: stock.createdAt,
        updatedAt: stock.updatedAt,
      });
    });

    transaction();

    return stock.toDto();
  }

  deleteStock(storeEntityId: string, itemId: string): void {
    this.database
      .prepare("DELETE FROM store_stocks WHERE workspace_id = ? AND store_entity_id = ? AND item_id = ?")
      .run(this.workspaceId, storeEntityId, itemId);
  }

  saveAssetRecord(asset: Omit<AssetRecord, "createdAt" | "updatedAt"> & { createdAt?: string; updatedAt?: string }): AssetRecord {
    const now = nowIso();
    const createdAt = asset.createdAt ?? now;
    const updatedAt = asset.updatedAt ?? now;

    this.database.prepare(
      `INSERT INTO assets
        (id, workspace_id, kind, original_name, file_name, relative_path, absolute_path, mime_type, size_bytes, created_at, updated_at)
       VALUES (@id, @workspaceId, @kind, @originalName, @fileName, @relativePath, @absolutePath, @mimeType, @sizeBytes, @createdAt, @updatedAt)
       ON CONFLICT(id) DO UPDATE SET
         kind = excluded.kind,
         original_name = excluded.original_name,
         file_name = excluded.file_name,
         relative_path = excluded.relative_path,
         absolute_path = excluded.absolute_path,
         mime_type = excluded.mime_type,
         size_bytes = excluded.size_bytes,
         updated_at = excluded.updated_at`,
    ).run({
      id: asset.id,
      workspaceId: asset.workspaceId,
      kind: asset.kind,
      originalName: asset.originalName,
      fileName: asset.fileName,
      relativePath: asset.relativePath,
      absolutePath: asset.absolutePath,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      createdAt,
      updatedAt,
    });

    return {
      ...asset,
      createdAt,
      updatedAt,
    } as AssetRecord;
  }

  listAssets(): AssetRecord[] {
    const rows = this.database
      .prepare(
        `SELECT id, workspace_id, kind, original_name, file_name, relative_path, absolute_path, mime_type, size_bytes, created_at, updated_at
         FROM assets
         WHERE workspace_id = ?
         ORDER BY created_at DESC`,
      )
      .all(this.workspaceId) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      workspaceId: String(row.workspace_id),
      kind: String(row.kind),
      originalName: String(row.original_name),
      fileName: String(row.file_name),
      relativePath: String(row.relative_path),
      absolutePath: String(row.absolute_path),
      mimeType: String(row.mime_type),
      sizeBytes: Number(row.size_bytes),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  }

  getAssetPath(assetId: string): string | null {
    const row = this.database
      .prepare("SELECT absolute_path FROM assets WHERE workspace_id = ? AND id = ?")
      .get(this.workspaceId, assetId) as { absolute_path?: string } | undefined;

    return row?.absolute_path ?? null;
  }

  resolveAssetById(assetId: string): AssetRecord | null {
    const row = this.database
      .prepare(
        `SELECT id, workspace_id, kind, original_name, file_name, relative_path, absolute_path, mime_type, size_bytes, created_at, updated_at
         FROM assets
         WHERE workspace_id = ? AND id = ?`,
      )
      .get(this.workspaceId, assetId) as Record<string, unknown> | undefined;

    return row ? this.rowToAsset(row) : null;
  }

  search(input: SearchQueryInputDto): SearchResultDto[] {
    const term = input.term.trim();
    if (!term) {
      return [];
    }

    const rows = this.database
      .prepare(
        `SELECT workspace_id, record_type, record_id, type_key, title, snippet(search_index_fts, 4, '[', ']', '…', 12) AS snippet, tags
         FROM search_index_fts
         WHERE workspace_id = ? AND search_index_fts MATCH ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(this.workspaceId, `${term}*`, input.limit) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      workspaceId: String(row.workspace_id),
      recordType: String(row.record_type),
      recordId: String(row.record_id),
      typeKey: String(row.type_key),
      title: String(row.title),
      snippet: String(row.snippet ?? ""),
      tags: parseArray<string>(String(row.tags ?? "[]"), []),
    }));
  }

  backlinks(targetKey: string): BacklinkDto[] {
    const normalized = slugify(targetKey);
    const rows = this.database
      .prepare(
        `SELECT source_type, source_id, target_key, target_type, target_id
         FROM content_links
         WHERE workspace_id = ? AND target_key = ?
         ORDER BY created_at DESC`,
      )
      .all(this.workspaceId, normalized) as Array<Record<string, unknown>>;

    const backlinks: BacklinkDto[] = [];

    for (const row of rows) {
      const sourceType = String(row.source_type);
      const sourceId = String(row.source_id);
      const sourceRecord = this.lookupSourceRecord(sourceType, sourceId);
      if (!sourceRecord) {
        continue;
      }

      backlinks.push({
        sourceType,
        sourceId,
        sourceTitle: sourceRecord.title,
        sourceSnippet: sourceRecord.snippet,
        targetKey: String(row.target_key),
        targetType: String(row.target_type),
      });
    }

    return backlinks;
  }

  private ensureEncounterLibrariesSeeded(): void {
    this.syncNpcLibraryEntriesFromEntities();
  }

  private persistEncounterSession(session: EncounterSession): void {
    const dto = session.toDto();
    this.database.prepare(
      `INSERT INTO encounter_sessions
        (id, workspace_id, encounter_id, status, round_number, current_turn_index, started_at, last_advanced_at, ended_at, state_json, created_at, updated_at)
       VALUES (@id, @workspaceId, @encounterId, @status, @roundNumber, @currentTurnIndex, @startedAt, @lastAdvancedAt, @endedAt, @stateJson, @createdAt, @updatedAt)
       ON CONFLICT(id) DO UPDATE SET
         encounter_id = excluded.encounter_id,
         status = excluded.status,
         round_number = excluded.round_number,
         current_turn_index = excluded.current_turn_index,
         started_at = excluded.started_at,
         last_advanced_at = excluded.last_advanced_at,
         ended_at = excluded.ended_at,
         state_json = excluded.state_json,
         updated_at = excluded.updated_at`,
    ).run({
      id: dto.id,
      workspaceId: dto.workspaceId,
      encounterId: dto.encounterId,
      status: dto.status,
      roundNumber: dto.roundNumber,
      currentTurnIndex: dto.currentTurnIndex,
      startedAt: dto.startedAt,
      lastAdvancedAt: dto.lastAdvancedAt,
      endedAt: dto.endedAt,
      stateJson: stableStringify(dto),
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
    });
  }

  private extractLeadingNumber(value: string, fallback: number): number {
    const match = normalizeText(value).match(/-?\d+/);
    return match ? Number.parseInt(match[0], 10) : fallback;
  }

  private rowToEncounter(row: Record<string, unknown>): EncounterDto {
    const encounter = new Encounter(
      String(row.id),
      String(row.workspace_id),
      String(row.name),
      String(row.slug),
      String(row.description),
      String(row.notes),
      row.map_id ? String(row.map_id) : null,
      normalizeStringArray(parseArray<string>(String(row.tags_json ?? "[]"), [])),
      String(row.created_at),
      String(row.updated_at),
    );

    return encounter.toDto();
  }

  private rowToEncounterCombatant(row: Record<string, unknown>): EncounterCombatantDto {
    const combatant = new EncounterCombatant(
      String(row.id),
      String(row.workspace_id),
      String(row.encounter_id),
      normalizeCombatantSourceKind(row.source_kind),
      row.source_id ? String(row.source_id) : null,
      normalizeCombatantTeam(row.team),
      String(row.name),
      Math.max(1, Math.floor(normalizeNumber(row.quantity, 1))),
      Math.floor(normalizeNumber(row.initiative_bonus, 0)),
      Math.max(0, Math.floor(normalizeNumber(row.armor_class, 10))),
      Math.max(0, Math.floor(normalizeNumber(row.hit_points, 1))),
      String(row.speed),
      normalizeNullableNumber(row.level),
      String(row.challenge_rating),
      String(row.notes),
      Math.max(0, Math.floor(normalizeNumber(row.sort_index, 0))),
      String(row.created_at),
      String(row.updated_at),
    );

    return combatant.toDto();
  }

  private rowToEncounterSession(row: Record<string, unknown>): EncounterSessionDto {
    const state = parseNullableObject<EncounterSessionDto>(row.state_json);
    if (state) {
      const session = EncounterSession.createFromInput(
        {
          id: String(row.id),
          workspaceId: String(row.workspace_id),
          encounterId: String(row.encounter_id),
          status: normalizeSessionStatus(state.status),
          roundNumber: Math.max(1, Math.floor(normalizeNumber(state.roundNumber, 1))),
          currentTurnIndex: Math.max(0, Math.floor(normalizeNumber(state.currentTurnIndex, 0))),
          startedAt: String(state.startedAt ?? row.started_at),
          lastAdvancedAt: String(state.lastAdvancedAt ?? row.last_advanced_at),
          endedAt: state.endedAt ?? (row.ended_at ? String(row.ended_at) : null),
          combatants: Array.isArray(state.combatants) ? state.combatants : [],
        },
        String(row.created_at),
        String(row.updated_at),
      );

      return session.toDto();
    }

    const session = new EncounterSession(
      String(row.id),
      String(row.workspace_id),
      String(row.encounter_id),
      normalizeSessionStatus(row.status),
      Math.max(1, Math.floor(normalizeNumber(row.round_number, 1))),
      Math.max(0, Math.floor(normalizeNumber(row.current_turn_index, 0))),
      String(row.started_at),
      String(row.last_advanced_at),
      row.ended_at ? String(row.ended_at) : null,
      [],
      String(row.created_at),
      String(row.updated_at),
    );

    return session.toDto();
  }

  private rowToNpcLibraryEntry(row: Record<string, unknown>): EncounterNpcLibraryEntryDto {
    const npc = new EncounterNpcLibraryEntry(
      String(row.id),
      String(row.workspace_id),
      row.source_entity_id ? String(row.source_entity_id) : null,
      normalizeCombatantTeam(row.team),
      String(row.name),
      String(row.slug),
      String(row.challenge_rating),
      Math.max(0, Math.floor(normalizeNumber(row.armor_class, 10))),
      Math.max(0, Math.floor(normalizeNumber(row.hit_points, 1))),
      String(row.speed),
      Math.floor(normalizeNumber(row.initiative_bonus, 0)),
      String(row.notes),
      normalizeStringArray(parseArray<string>(String(row.tags_json ?? "[]"), [])),
      String(row.created_at),
      String(row.updated_at),
    );

    return npc.toDto();
  }

  private rowToPlayerLibraryEntry(row: Record<string, unknown>): EncounterPlayerLibraryEntryDto {
    const player = new EncounterPlayerLibraryEntry(
      String(row.id),
      String(row.workspace_id),
      String(row.name),
      String(row.slug),
      Math.max(0, Math.floor(normalizeNumber(row.level, 1))),
      Math.max(0, Math.floor(normalizeNumber(row.armor_class, 10))),
      Math.max(0, Math.floor(normalizeNumber(row.hit_points, 1))),
      Math.floor(normalizeNumber(row.initiative_bonus, 0)),
      String(row.speed),
      String(row.notes),
      normalizeStringArray(parseArray<string>(String(row.tags_json ?? "[]"), [])),
      String(row.created_at),
      String(row.updated_at),
    );

    return player.toDto();
  }

  private getMeta(key: keyof WorkspaceMetaMap | string): string | null {
    const row = this.database
      .prepare("SELECT value FROM workspace_meta WHERE key = ?")
      .get(key) as { value?: string } | undefined;

    return row?.value ?? null;
  }

  private setMeta(key: keyof WorkspaceMetaMap | string, value: string): void {
    this.database
      .prepare(
        `INSERT INTO workspace_meta (key, value)
         VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  private deleteSearchIndex(recordType: string, recordId: string): void {
    this.database
      .prepare("DELETE FROM search_index_fts WHERE workspace_id = ? AND record_type = ? AND record_id = ?")
      .run(this.workspaceId, recordType, recordId);
  }

  private upsertSearchIndex(input: {
    recordType: string;
    recordId: string;
    typeKey: string;
    title: string;
    body: string;
    tags: string[];
  }): void {
    this.deleteSearchIndex(input.recordType, input.recordId);
    this.database
      .prepare(
        `INSERT INTO search_index_fts (workspace_id, record_type, record_id, type_key, title, body, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(this.workspaceId, input.recordType, input.recordId, input.typeKey, input.title, input.body, input.tags.join(" "));
  }

  private syncContentLinks(sourceType: string, sourceId: string, body: string, sourceSlug: string, sourceTitle: string): void {
    this.database
      .prepare("DELETE FROM content_links WHERE workspace_id = ? AND source_type = ? AND source_id = ?")
      .run(this.workspaceId, sourceType, sourceId);

    const matches = [...body.matchAll(/\[\[([^\]]+)\]\]/g)];
    const uniqueTargets = new Map<string, { targetType: string; targetId: string | null }>();

    for (const match of matches) {
      const rawToken = match[1].split("|", 1)[0].trim();
      const normalized = slugify(rawToken);
      const resolved = this.resolveContentTarget(normalized);
      if (resolved) {
        uniqueTargets.set(normalized, resolved);
      }
    }

    if (sourceSlug) {
      uniqueTargets.delete(sourceSlug);
    }

    const now = nowIso();
    for (const [targetKey, target] of uniqueTargets.entries()) {
      this.database
        .prepare(
          `INSERT INTO content_links
           (id, workspace_id, source_type, source_id, target_key, target_type, target_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(createId(), this.workspaceId, sourceType, sourceId, targetKey, target.targetType, target.targetId, now, now);
    }
  }

  private syncExplicitEntityLinks(sourceId: string, linkedEntityIds: string[]): void {
    this.database
      .prepare("DELETE FROM content_links WHERE workspace_id = ? AND source_type = 'note' AND source_id = ? AND target_type = 'entity'")
      .run(this.workspaceId, sourceId);

    const now = nowIso();
    for (const entityId of linkedEntityIds) {
      const entity = this.database
        .prepare("SELECT id, title, slug FROM entities WHERE workspace_id = ? AND id = ?")
        .get(this.workspaceId, entityId) as { id?: string; title?: string; slug?: string } | undefined;

      if (!entity) {
        continue;
      }

      this.database
        .prepare(
          `INSERT INTO content_links
           (id, workspace_id, source_type, source_id, target_key, target_type, target_id, created_at, updated_at)
           VALUES (?, ?, 'note', ?, ?, 'entity', ?, ?, ?)`,
        )
        .run(createId(), this.workspaceId, sourceId, entity.slug ?? slugify(entity.title ?? entity.id ?? entityId), entity.id, now, now);
    }
  }

  private syncExplicitEntityLink(sourceType: string, sourceId: string, entityId: string | null): void {
    this.database
      .prepare("DELETE FROM content_links WHERE workspace_id = ? AND source_type = ? AND source_id = ? AND target_type = 'entity'")
      .run(this.workspaceId, sourceType, sourceId);

    if (!entityId) {
      return;
    }

    const entity = this.database
      .prepare("SELECT id, title, slug FROM entities WHERE workspace_id = ? AND id = ?")
      .get(this.workspaceId, entityId) as { id?: string; title?: string; slug?: string } | undefined;

    if (!entity) {
      return;
    }

    this.database
      .prepare(
        `INSERT INTO content_links
         (id, workspace_id, source_type, source_id, target_key, target_type, target_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'entity', ?, ?, ?)`,
      )
      .run(createId(), this.workspaceId, sourceType, sourceId, entity.slug ?? slugify(entity.title ?? entity.id ?? entityId), entity.id, nowIso(), nowIso());
  }

  private syncExplicitMapLink(sourceType: string, sourceId: string, mapId: string | null): void {
    this.database
      .prepare("DELETE FROM content_links WHERE workspace_id = ? AND source_type = ? AND source_id = ? AND target_type = 'map'")
      .run(this.workspaceId, sourceType, sourceId);

    if (!mapId) {
      return;
    }

    const map = this.database
      .prepare("SELECT id, title FROM maps WHERE workspace_id = ? AND id = ?")
      .get(this.workspaceId, mapId) as { id?: string; title?: string } | undefined;

    if (!map) {
      return;
    }

    this.database
      .prepare(
        `INSERT INTO content_links
         (id, workspace_id, source_type, source_id, target_key, target_type, target_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'map', ?, ?, ?)`,
      )
      .run(createId(), this.workspaceId, sourceType, sourceId, slugify(map.title ?? map.id ?? mapId), map.id, nowIso(), nowIso());
  }

  private resolveContentTarget(targetKey: string): { targetType: string; targetId: string | null } | null {
    const entity = this.database
      .prepare("SELECT id, slug FROM entities WHERE workspace_id = ?")
      .all(this.workspaceId) as Array<{ id: string; slug: string }>;
    const note = this.database
      .prepare("SELECT id, slug FROM notes WHERE workspace_id = ?")
      .all(this.workspaceId) as Array<{ id: string; slug: string }>;
    const questline = this.database
      .prepare("SELECT id, title FROM questlines WHERE workspace_id = ?")
      .all(this.workspaceId) as Array<{ id: string; title: string }>;
    const map = this.database
      .prepare("SELECT id, title FROM maps WHERE workspace_id = ?")
      .all(this.workspaceId) as Array<{ id: string; title: string }>;
    const item = this.database
      .prepare("SELECT id, title FROM items WHERE workspace_id = ?")
      .all(this.workspaceId) as Array<{ id: string; title: string }>;
    const encounter = this.database
      .prepare("SELECT id, name, slug FROM encounters WHERE workspace_id = ?")
      .all(this.workspaceId) as Array<{ id: string; name: string; slug: string }>;
    const npcLibraryEntry = this.database
      .prepare("SELECT id, name, slug FROM npc_library_entries WHERE workspace_id = ?")
      .all(this.workspaceId) as Array<{ id: string; name: string; slug: string }>;
    const playerLibraryEntry = this.database
      .prepare("SELECT id, name, slug FROM player_library_entries WHERE workspace_id = ?")
      .all(this.workspaceId) as Array<{ id: string; name: string; slug: string }>;
    const entityHit = entity.find((entry) => entry.slug === targetKey);
    if (entityHit) {
      return { targetType: "entity", targetId: entityHit.id };
    }

    const noteHit = note.find((entry) => entry.slug === targetKey);
    if (noteHit) {
      return { targetType: "note", targetId: noteHit.id };
    }

    const questlineHit = questline.find((entry) => slugify(entry.title) === targetKey);
    if (questlineHit) {
      return { targetType: "questline", targetId: questlineHit.id };
    }

    const mapHit = map.find((entry) => slugify(entry.title) === targetKey);
    if (mapHit) {
      return { targetType: "map", targetId: mapHit.id };
    }

    const itemHit = item.find((entry) => slugify(entry.title) === targetKey);
    if (itemHit) {
      return { targetType: "item", targetId: itemHit.id };
    }

    const encounterHit = encounter.find((entry) => entry.slug === targetKey || slugify(entry.name) === targetKey);
    if (encounterHit) {
      return { targetType: "encounter", targetId: encounterHit.id };
    }

    const npcLibraryHit = npcLibraryEntry.find((entry) => entry.slug === targetKey || slugify(entry.name) === targetKey);
    if (npcLibraryHit) {
      return { targetType: "npcLibraryEntry", targetId: npcLibraryHit.id };
    }

    const playerLibraryHit = playerLibraryEntry.find((entry) => entry.slug === targetKey || slugify(entry.name) === targetKey);
    if (playerLibraryHit) {
      return { targetType: "playerLibraryEntry", targetId: playerLibraryHit.id };
    }

    return null;
  }

  private lookupSourceRecord(
    sourceType: string,
    sourceId: string,
  ): { title: string; snippet: string } | null {
    if (sourceType === "note") {
      const note = this.database
        .prepare("SELECT title, body FROM notes WHERE workspace_id = ? AND id = ?")
        .get(this.workspaceId, sourceId) as { title?: string; body?: string } | undefined;

      if (!note) {
        return null;
      }

      return {
        title: note.title ?? "Note",
        snippet: (note.body ?? "").slice(0, 180),
      };
    }

    if (sourceType === "entity") {
      const entity = this.database
        .prepare("SELECT title, description, markdown FROM entities WHERE workspace_id = ? AND id = ?")
        .get(this.workspaceId, sourceId) as { title?: string; description?: string; markdown?: string } | undefined;

      if (!entity) {
        return null;
      }

      return {
        title: entity.title ?? "Entity",
        snippet: [entity.description, entity.markdown].filter(Boolean).join(" ").slice(0, 180),
      };
    }

    if (sourceType === "encounter") {
      const encounter = this.database
        .prepare("SELECT name, description, notes FROM encounters WHERE workspace_id = ? AND id = ?")
        .get(this.workspaceId, sourceId) as { name?: string; description?: string; notes?: string } | undefined;

      if (!encounter) {
        return null;
      }

      return {
        title: encounter.name ?? "Encounter",
        snippet: [encounter.description, encounter.notes].filter(Boolean).join(" ").slice(0, 180),
      };
    }

    if (sourceType === "encounterCombatant") {
      const combatant = this.database
        .prepare(
          `SELECT encounter_combatants.name AS combatant_name, encounter_combatants.notes AS combatant_notes, encounter_combatants.challenge_rating AS challenge_rating, encounters.name AS encounter_name
           FROM encounter_combatants
           INNER JOIN encounters ON encounters.id = encounter_combatants.encounter_id AND encounters.workspace_id = encounter_combatants.workspace_id
           WHERE encounter_combatants.workspace_id = ? AND encounter_combatants.id = ?`,
        )
        .get(this.workspaceId, sourceId) as { combatant_name?: string; combatant_notes?: string; challenge_rating?: string; encounter_name?: string } | undefined;

      if (!combatant) {
        return null;
      }

      return {
        title: combatant.combatant_name ?? "Combatant",
        snippet: [combatant.encounter_name, combatant.challenge_rating, combatant.combatant_notes].filter(Boolean).join(" ").slice(0, 180),
      };
    }

    if (sourceType === "encounterSession") {
      const session = this.database
        .prepare(
          `SELECT encounter_sessions.status AS session_status, encounter_sessions.round_number AS round_number, encounters.name AS encounter_name
           FROM encounter_sessions
           INNER JOIN encounters ON encounters.id = encounter_sessions.encounter_id AND encounters.workspace_id = encounter_sessions.workspace_id
           WHERE encounter_sessions.workspace_id = ? AND encounter_sessions.id = ?`,
        )
        .get(this.workspaceId, sourceId) as { session_status?: string; round_number?: number; encounter_name?: string } | undefined;

      if (!session) {
        return null;
      }

      return {
        title: session.encounter_name ? `${session.encounter_name} Session` : "Encounter Session",
        snippet: [`Round ${session.round_number ?? 1}`, session.session_status].filter(Boolean).join(" "),
      };
    }

    if (sourceType === "npcLibraryEntry") {
      const npc = this.database
        .prepare("SELECT name, notes, challenge_rating FROM npc_library_entries WHERE workspace_id = ? AND id = ?")
        .get(this.workspaceId, sourceId) as { name?: string; notes?: string; challenge_rating?: string } | undefined;

      if (!npc) {
        return null;
      }

      return {
        title: npc.name ?? "NPC",
        snippet: [npc.challenge_rating, npc.notes].filter(Boolean).join(" ").slice(0, 180),
      };
    }

    if (sourceType === "playerLibraryEntry") {
      const player = this.database
        .prepare("SELECT name, notes, level FROM player_library_entries WHERE workspace_id = ? AND id = ?")
        .get(this.workspaceId, sourceId) as { name?: string; notes?: string; level?: number } | undefined;

      if (!player) {
        return null;
      }

      return {
        title: player.name ?? "Player",
        snippet: [`Level ${player.level ?? 1}`, player.notes].filter(Boolean).join(" ").slice(0, 180),
      };
    }

    if (sourceType === "questline") {
      const questline = this.database
        .prepare("SELECT title, description FROM questlines WHERE workspace_id = ? AND id = ?")
        .get(this.workspaceId, sourceId) as { title?: string; description?: string } | undefined;

      if (!questline) {
        return null;
      }

      return {
        title: questline.title ?? "Questline",
        snippet: questline.description ?? "",
      };
    }

    if (sourceType === "questNode") {
      const questNode = this.database
        .prepare("SELECT title, description FROM quest_nodes WHERE workspace_id = ? AND id = ?")
        .get(this.workspaceId, sourceId) as { title?: string; description?: string } | undefined;

      if (!questNode) {
        return null;
      }

      return {
        title: questNode.title ?? "Quest Node",
        snippet: questNode.description ?? "",
      };
    }

    return null;
  }

  private rowToEntityType(row: Record<string, unknown>): EntityTypeDefinitionDto {
    const entityType = new EntityTypeDefinition(
      String(row.id),
      String(row.workspace_id),
      String(row.type_key),
      String(row.display_name),
      String(row.icon),
      String(row.color),
      String(row.description),
      Number(row.builtin) === 1,
      parseArray<CustomFieldDefinitionDto>(String(row.field_definitions_json), []),
      String(row.created_at),
      String(row.updated_at),
    );

    return entityType.toDto();
  }

  private rowToEntity(row: Record<string, unknown>): EntityDto {
    const entity = new Entity(
      String(row.id),
      String(row.workspace_id),
      String(row.type_key),
      String(row.title),
      String(row.slug),
      String(row.subtitle),
      String(row.description),
      String(row.markdown),
      row.image_asset_id ? String(row.image_asset_id) : null,
      row.image_asset_id ? this.getAssetPath(String(row.image_asset_id)) : null,
      parseArray<string>(String(row.tags_json), []),
      row.linked_map_id ? String(row.linked_map_id) : null,
      row.linked_placement_id ? String(row.linked_placement_id) : null,
      row.questline_id ? String(row.questline_id) : null,
      row.family_tree_root_id ? String(row.family_tree_root_id) : null,
      parseObject<Record<string, unknown>>(String(row.custom_fields_json), {}),
      parseNullableObject<NpcStatblockDto>(row.npc_statblock_json),
      String(row.created_at),
      String(row.updated_at),
    );

    return entity.toDto();
  }

  private rowToMap(row: Record<string, unknown>): MapDto {
    const map = new CampaignMap(
      String(row.id),
      String(row.workspace_id),
      String(row.title),
      String(row.description),
      String(row.asset_id),
      String(row.asset_name),
      String(row.asset_path),
      Number(row.width),
      Number(row.height),
      String(row.created_at),
      String(row.updated_at),
    );

    return map.toDto();
  }

  private rowToPlacement(row: Record<string, unknown>): MapPlacementDto {
    const geometry = parseObject<MapPlacementDto["geometry"]>(String(row.geometry_json), {
      kind: "point",
      point: null,
      points: [],
      radius: 24,
      width: 48,
      height: 48,
    });
    const textWidth = Number(row.text_width ?? geometry.width ?? 48);
    const textHeight = Number(row.text_height ?? geometry.height ?? 48);

    const placement = new MapPlacement(
      String(row.id),
      String(row.workspace_id),
      String(row.map_id),
      row.entity_id ? String(row.entity_id) : null,
      String(row.label),
      String(row.kind) as MapPlacementDto["kind"],
      geometry,
      textWidth,
      textHeight,
      Number(row.text_offset_x ?? 0),
      Number(row.text_offset_y ?? 0),
      String(row.notes),
      String(row.color),
      String(row.glow_color ?? row.color ?? "#77c8ff"),
      String(row.shadow_color ?? "#000000"),
      Number(row.scale ?? 1),
      String(row.font_color ?? "#ffffff"),
      Number(row.z_index),
      String(row.created_at),
      String(row.updated_at),
    );

    return placement.toDto();
  }

  private rowToNote(row: Record<string, unknown>): NoteDto {
    return {
      id: String(row.id),
      workspaceId: String(row.workspace_id),
      title: String(row.title),
      slug: String(row.slug),
      kind: String(row.kind) as NoteDto["kind"],
      body: String(row.body),
      tags: parseArray<string>(String(row.tags_json), []),
      linkedEntityIds: parseArray<string>(String(row.linked_entity_ids_json), []),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private rowToQuestline(row: Record<string, unknown>): QuestlineDto {
    const questline = new Questline(
      String(row.id),
      String(row.workspace_id),
      row.anchor_entity_id ? String(row.anchor_entity_id) : null,
      String(row.title),
      String(row.description),
      String(row.status) as QuestlineDto["status"],
      String(row.created_at),
      String(row.updated_at),
    );

    return questline.toDto();
  }

  private rowToQuestNode(row: Record<string, unknown>): QuestNodeDto {
    const questNode = this.hydrateQuestNode(row);

    return questNode.toDto();
  }

  private hydrateQuestNode(row: Record<string, unknown>): QuestNode {
    return new QuestNode(
      String(row.id),
      String(row.workspace_id),
      String(row.questline_id),
      row.parent_node_id ? String(row.parent_node_id) : null,
      String(row.title),
      String(row.description),
      parseArray<QuestRewardDto>(String(row.rewards_json), []),
      Number(row.order_index),
      parseNullableStamp(row.stamp_json),
      String(row.created_at),
      String(row.updated_at),
    );
  }

  private rowToTimelineEvent(row: Record<string, unknown>): TimelineEventDto {
    const event = new TimelineEvent(
      String(row.id),
      String(row.workspace_id),
      row.entity_id ? String(row.entity_id) : null,
      row.quest_node_id ? String(row.quest_node_id) : null,
      String(row.title),
      String(row.description),
      String(row.event_type),
      String(row.lane_kind) as TimelineEventDto["laneKind"],
      String(row.lane_label),
      parseObject<CalendarStampDto>(String(row.stamp_json), {
        year: 1,
        month: 1,
        day: 1,
        hour: 0,
        minute: 0,
      }),
      Number(row.duration_minutes),
      row.location_entity_id ? String(row.location_entity_id) : null,
      String(row.created_at),
      String(row.updated_at),
    );

    return event.toDto();
  }

  private rowToRelation(row: Record<string, unknown>): RelationEdgeDto {
    const relation = new RelationEdge(
      String(row.id),
      String(row.workspace_id),
      String(row.source_entity_id),
      String(row.target_entity_id),
      String(row.relation_kind) as RelationEdgeDto["relationKind"],
      String(row.label),
      String(row.notes),
      String(row.created_at),
      String(row.updated_at),
    );

    return relation.toDto();
  }

  private rowToItem(row: Record<string, unknown>): ItemDto {
    const item = new Item(
      String(row.id),
      String(row.workspace_id),
      String(row.title),
      String(row.description),
      Number(row.worth),
      String(row.rarity),
      parseArray<string>(String(row.tags_json), []),
      String(row.created_at),
      String(row.updated_at),
    );

    return item.toDto();
  }

  private rowToStoreStock(row: Record<string, unknown>): StoreStockDto {
    const stock = new StoreStock(
      String(row.id),
      String(row.workspace_id),
      String(row.store_entity_id),
      String(row.item_id),
      Number(row.quantity),
      row.price_override == null ? null : Number(row.price_override),
      String(row.notes),
      String(row.created_at),
      String(row.updated_at),
    );

    return stock.toDto();
  }

  private rowToAsset(row: Record<string, unknown>): AssetRecord {
    return {
      id: String(row.id),
      workspaceId: String(row.workspace_id),
      kind: String(row.kind),
      originalName: String(row.original_name),
      fileName: String(row.file_name),
      relativePath: String(row.relative_path),
      absolutePath: String(row.absolute_path),
      mimeType: String(row.mime_type),
      sizeBytes: Number(row.size_bytes),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private readImageDimensions(absolutePath: string): { width: number; height: number } {
    try {
      const metadata = imageSize(readFileSync(absolutePath));

      if (!metadata.width || !metadata.height) {
        return {
          width: 0,
          height: 0,
        };
      }

      return {
        width: metadata.width,
        height: metadata.height,
      };
    } catch {
      return {
        width: 0,
        height: 0,
      };
    }
  }
}

class NoteDtoRecord {
  constructor(
    public readonly id: string,
    public readonly workspaceId: string,
    public readonly title: string,
    public readonly slug: string,
    public readonly kind: NoteDto["kind"],
    public readonly body: string,
    public readonly tags: string[],
    public readonly linkedEntityIds: string[],
    public readonly createdAt: string,
    public readonly updatedAt: string,
  ) {}

  toDto(): NoteDto {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      title: this.title,
      slug: this.slug,
      kind: this.kind,
      body: this.body,
      tags: this.tags,
      linkedEntityIds: this.linkedEntityIds,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
