import fs from "node:fs/promises";
import path from "node:path";

export class AssetPreviewService {
  private static instance: AssetPreviewService | null = null;
  private readonly dataUrlCache = new Map<string, string | null>();

  private constructor() {}

  static getInstance(): AssetPreviewService {
    if (!AssetPreviewService.instance) {
      AssetPreviewService.instance = new AssetPreviewService();
    }

    return AssetPreviewService.instance;
  }

  async readImageDataUrl(absolutePath: string): Promise<string | null> {
    const normalizedPath = path.resolve(absolutePath);
    const cached = this.dataUrlCache.get(normalizedPath);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const file = await fs.readFile(normalizedPath);
      const mimeType = this.resolveMimeType(path.extname(normalizedPath));
      if (!mimeType) {
        this.dataUrlCache.set(normalizedPath, null);
        return null;
      }

      const dataUrl = `data:${mimeType};base64,${file.toString("base64")}`;
      this.dataUrlCache.set(normalizedPath, dataUrl);
      return dataUrl;
    } catch (error) {
      console.error(`Failed to read image preview data from ${normalizedPath}.`, error);
      this.dataUrlCache.set(normalizedPath, null);
      return null;
    }
  }

  private resolveMimeType(extension: string): string | null {
    switch (extension.toLowerCase()) {
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
        return null;
    }
  }
}
