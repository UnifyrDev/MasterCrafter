import fs from "node:fs/promises";
import path from "node:path";
import { createId, nowIso, slugify } from "@shared/utils";

export interface ImportedAsset {
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

export interface ImportAssetInput {
  workspaceId: string;
  assetRoot: string;
  sourceFilePath: string;
  kind: string;
}

export class AssetVaultService {
  private static instance: AssetVaultService | null = null;

  private constructor() {}

  static getInstance(): AssetVaultService {
    if (!AssetVaultService.instance) {
      AssetVaultService.instance = new AssetVaultService();
    }

    return AssetVaultService.instance;
  }

  async importAsset(input: ImportAssetInput): Promise<ImportedAsset> {
    const stat = await fs.stat(input.sourceFilePath);
    const assetId = createId();
    const createdAt = nowIso();
    const extension = path.extname(input.sourceFilePath).toLowerCase();
    const originalName = path.basename(input.sourceFilePath);
    const folderName = slugify(path.basename(input.sourceFilePath, extension)) || "asset";
    const fileName = `${folderName}-${assetId}${extension}`;
    const relativePath = path.join(assetId, fileName);
    const absoluteFolder = path.join(input.assetRoot, assetId);
    const absolutePath = path.join(absoluteFolder, fileName);

    await fs.mkdir(absoluteFolder, { recursive: true });
    await fs.copyFile(input.sourceFilePath, absolutePath);

    return {
      id: assetId,
      workspaceId: input.workspaceId,
      kind: input.kind,
      originalName,
      fileName,
      relativePath,
      absolutePath,
      mimeType: this.resolveMimeType(extension),
      sizeBytes: stat.size,
      createdAt,
      updatedAt: createdAt,
    };
  }

  private resolveMimeType(extension: string): string {
    switch (extension) {
      case ".png":
        return "image/png";
      case ".jpg":
      case ".jpeg":
        return "image/jpeg";
      case ".gif":
        return "image/gif";
      case ".webp":
        return "image/webp";
      case ".svg":
        return "image/svg+xml";
      default:
        return "application/octet-stream";
    }
  }
}
