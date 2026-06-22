import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import JSZip from "jszip";
import { AppPathsService } from "@infra/runtime/AppPathsService";
import type { CampaignSnapshotDto, WorkspaceSummaryDto } from "@shared/contracts";
import { createId, nowIso } from "@shared/utils";

interface BundleManifest {
  version: number;
  app: string;
  exportedAt: string;
  workspace: WorkspaceSummaryDto;
  calendar: CampaignSnapshotDto["calendar"];
}

export interface ImportBundleResult {
  summary: WorkspaceSummaryDto;
  manifest: BundleManifest;
}

export class CampaignBundleService {
  private static instance: CampaignBundleService | null = null;

  private constructor() {}

  static getInstance(): CampaignBundleService {
    if (!CampaignBundleService.instance) {
      CampaignBundleService.instance = new CampaignBundleService();
    }

    return CampaignBundleService.instance;
  }

  async exportWorkspace(snapshot: CampaignSnapshotDto, outputFilePath: string): Promise<void> {
    const zip = new JSZip();
    const manifest: BundleManifest = {
      version: 2,
      app: "MasterCrafter",
      exportedAt: nowIso(),
      workspace: snapshot.workspace,
      calendar: snapshot.calendar,
    };

    zip.file("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
    zip.file("campaign.db", await fs.readFile(snapshot.workspace.dbPath));

    const assetEntries = await this.collectAssetFiles(snapshot.workspace.assetPath);
    for (const entry of assetEntries) {
      zip.file(`assets/${entry.relativePath}`, entry.buffer);
    }

    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    await fs.writeFile(outputFilePath, buffer);
  }

  async importBundle(filePath: string): Promise<{ manifest: BundleManifest; summary: WorkspaceSummaryDto }> {
    const archive = await JSZip.loadAsync(await fs.readFile(filePath));
    const manifestFile = archive.file("manifest.json");
    const dbFile = archive.file("campaign.db");

    if (!manifestFile || !dbFile) {
      throw new Error("The selected bundle is missing either manifest.json or campaign.db.");
    }

    const manifest = JSON.parse(await manifestFile.async("string")) as BundleManifest;
    const workspaceId = await this.ensureImportWorkspaceId(manifest.workspace.id);
    const workspaceFolder = AppPathsService.getInstance().buildWorkspaceLocation(workspaceId, manifest.workspace.name);

    await fs.mkdir(workspaceFolder.folderPath, { recursive: true });
    await fs.mkdir(workspaceFolder.assetPath, { recursive: true });
    await fs.writeFile(workspaceFolder.dbPath, await dbFile.async("nodebuffer"));

    await this.extractAssets(archive, workspaceFolder.assetPath);
    await this.rewriteWorkspaceId(workspaceFolder.dbPath, manifest.workspace.id, workspaceId, workspaceFolder.assetPath);

    const summary: WorkspaceSummaryDto = {
      ...manifest.workspace,
      id: workspaceId,
      folderPath: workspaceFolder.folderPath,
      dbPath: workspaceFolder.dbPath,
      assetPath: workspaceFolder.assetPath,
      createdAt: manifest.workspace.createdAt,
      updatedAt: nowIso(),
      lastOpenedAt: nowIso(),
      calendarName: manifest.calendar.name,
    };

    return { manifest, summary };
  }

  private async collectAssetFiles(assetRoot: string): Promise<Array<{ relativePath: string; buffer: Buffer }>> {
    const result: Array<{ relativePath: string; buffer: Buffer }> = [];

    const walk = async (currentRoot: string, relativeRoot: string): Promise<void> => {
      let entries: Array<import("node:fs").Dirent>;
      try {
        entries = await fs.readdir(currentRoot, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const relativePath = path.join(relativeRoot, entry.name);
        const absolutePath = path.join(currentRoot, entry.name);

        if (entry.isDirectory()) {
          await walk(absolutePath, relativePath);
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        result.push({
          relativePath: relativePath.replaceAll("\\", "/"),
          buffer: await fs.readFile(absolutePath),
        });
      }
    };

    await walk(assetRoot, "");

    return result;
  }

  private async extractAssets(archive: JSZip, assetRoot: string): Promise<void> {
    const files = Object.values(archive.files).filter((entry) => entry.name.startsWith("assets/") && !entry.dir);

    for (const file of files) {
      const relativePath = file.name.replace(/^assets\//, "");
      const targetPath = path.join(assetRoot, relativePath);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, await file.async("nodebuffer"));
    }
  }

  private async rewriteWorkspaceId(dbPath: string, oldWorkspaceId: string, newWorkspaceId: string, assetRoot: string): Promise<void> {
    const database = new Database(dbPath);
    const transaction = database.transaction(() => {
      const tables = [
        "entity_type_definitions",
        "entities",
        "maps",
        "map_placements",
        "notes",
        "content_links",
        "questlines",
        "quest_nodes",
        "timeline_events",
        "relations",
        "items",
        "encounters",
        "encounter_combatants",
        "encounter_sessions",
        "npc_library_entries",
        "player_library_entries",
        "store_stocks",
        "assets",
        "search_index_fts",
      ];

      for (const table of tables) {
        database.prepare(`UPDATE ${table} SET workspace_id = ? WHERE workspace_id = ?`).run(newWorkspaceId, oldWorkspaceId);
      }

      const assets = database
        .prepare("SELECT id, relative_path FROM assets WHERE workspace_id = ?")
        .all(newWorkspaceId) as Array<{ id: string; relative_path: string }>;

      const assetPaths = new Map<string, string>();
      for (const asset of assets) {
        const absolutePath = path.join(assetRoot, asset.relative_path);
        assetPaths.set(asset.id, absolutePath);
        database
          .prepare("UPDATE assets SET absolute_path = ? WHERE workspace_id = ? AND id = ?")
          .run(absolutePath, newWorkspaceId, asset.id);
      }

      const maps = database
        .prepare("SELECT id, asset_id FROM maps WHERE workspace_id = ?")
        .all(newWorkspaceId) as Array<{ id: string; asset_id: string }>;

      for (const map of maps) {
        const assetPath = assetPaths.get(map.asset_id);
        if (!assetPath) {
          continue;
        }

        database
          .prepare("UPDATE maps SET asset_path = ? WHERE workspace_id = ? AND id = ?")
          .run(assetPath, newWorkspaceId, map.id);
      }
    });

    transaction();
    database.close();
  }

  private async ensureImportWorkspaceId(preferredId: string): Promise<string> {
    const registryPath = AppPathsService.getInstance().getRegistryFilePath();
    try {
      const registryRaw = await fs.readFile(registryPath, "utf8");
      const registry = JSON.parse(registryRaw) as { workspaces?: Array<{ id: string }> };
      const collision = registry.workspaces?.some((workspace) => workspace.id === preferredId);
      return collision ? createId() : preferredId;
    } catch {
      return preferredId;
    }
  }
}
