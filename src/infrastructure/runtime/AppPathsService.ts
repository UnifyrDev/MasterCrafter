import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { APP_SLUG, ASSET_VAULT_DIR, DATABASE_FILE_NAME, WORKSPACE_REGISTRY_FILE } from "@shared/constants";
import { slugify } from "@shared/utils";

export interface WorkspaceLocation {
  workspaceId: string;
  folderPath: string;
  dbPath: string;
  assetPath: string;
}

export class AppPathsService {
  private static instance: AppPathsService | null = null;

  private constructor() {}

  static getInstance(): AppPathsService {
    if (!AppPathsService.instance) {
      AppPathsService.instance = new AppPathsService();
    }

    return AppPathsService.instance;
  }

  getBaseDir(): string {
    return path.join(app.getPath("userData"), APP_SLUG);
  }

  getRegistryFilePath(): string {
    return path.join(this.getBaseDir(), WORKSPACE_REGISTRY_FILE);
  }

  getCampaignsRoot(): string {
    return path.join(this.getBaseDir(), "campaigns");
  }

  buildWorkspaceLocation(workspaceId: string, name: string): WorkspaceLocation {
    const folderName = `${slugify(name)}-${workspaceId}`;
    const folderPath = path.join(this.getCampaignsRoot(), folderName);

    return {
      workspaceId,
      folderPath,
      dbPath: path.join(folderPath, DATABASE_FILE_NAME),
      assetPath: path.join(folderPath, ASSET_VAULT_DIR),
    };
  }

  async ensureBaseStructure(): Promise<void> {
    await fs.mkdir(this.getBaseDir(), { recursive: true });
    await fs.mkdir(this.getCampaignsRoot(), { recursive: true });
  }
}
