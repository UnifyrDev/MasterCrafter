import fs from "node:fs/promises";
import path from "node:path";
import { AppPathsService } from "@infra/runtime/AppPathsService";
import { safeJsonParse } from "@shared/utils";

export interface RuntimeConfig {
  lastWorkspaceId: string | null;
  theme: "clean" | "midnight" | "paper";
  windowBounds: {
    width: number;
    height: number;
    x: number | null;
    y: number | null;
  };
}

const DEFAULT_CONFIG: RuntimeConfig = {
  lastWorkspaceId: null,
  theme: "clean",
  windowBounds: {
    width: 1600,
    height: 1024,
    x: null,
    y: null,
  },
};

export class ConfigService {
  private static instance: ConfigService | null = null;
  private readonly configPath: string;
  private config: RuntimeConfig = DEFAULT_CONFIG;

  private constructor() {
    this.configPath = path.join(AppPathsService.getInstance().getBaseDir(), "config.json");
  }

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }

    return ConfigService.instance;
  }

  async load(): Promise<RuntimeConfig> {
    await AppPathsService.getInstance().ensureBaseStructure();

    try {
      const raw = await fs.readFile(this.configPath, "utf8");
      this.config = {
        ...DEFAULT_CONFIG,
        ...safeJsonParse<Partial<RuntimeConfig>>(raw, {}),
        windowBounds: {
          ...DEFAULT_CONFIG.windowBounds,
          ...(safeJsonParse<Partial<RuntimeConfig>>(raw, {}).windowBounds ?? {}),
        },
      };
    } catch {
      this.config = DEFAULT_CONFIG;
      await this.save();
    }

    return this.config;
  }

  get(): RuntimeConfig {
    return this.config;
  }

  async update(partial: Partial<RuntimeConfig>): Promise<RuntimeConfig> {
    this.config = {
      ...this.config,
      ...partial,
      windowBounds: {
        ...this.config.windowBounds,
        ...(partial.windowBounds ?? {}),
      },
    };

    await this.save();
    return this.config;
  }

  async setLastWorkspaceId(lastWorkspaceId: string | null): Promise<RuntimeConfig> {
    return this.update({ lastWorkspaceId });
  }

  private async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.writeFile(this.configPath, `${JSON.stringify(this.config, null, 2)}\n`, "utf8");
  }
}
