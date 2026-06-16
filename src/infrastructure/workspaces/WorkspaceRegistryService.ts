import fs from "node:fs/promises";
import path from "node:path";
import { AppPathsService } from "@infra/runtime/AppPathsService";
import { safeJsonParse } from "@shared/utils";
import type { WorkspaceSummaryDto } from "@shared/contracts";

interface RegistryFile {
  version: number;
  workspaces: WorkspaceSummaryDto[];
}

const DEFAULT_REGISTRY: RegistryFile = {
  version: 1,
  workspaces: [],
};

export class WorkspaceRegistryService {
  private static instance: WorkspaceRegistryService | null = null;
  private registry: RegistryFile = DEFAULT_REGISTRY;

  private constructor() {}

  static getInstance(): WorkspaceRegistryService {
    if (!WorkspaceRegistryService.instance) {
      WorkspaceRegistryService.instance = new WorkspaceRegistryService();
    }

    return WorkspaceRegistryService.instance;
  }

  async load(): Promise<RegistryFile> {
    await AppPathsService.getInstance().ensureBaseStructure();

    try {
      const raw = await fs.readFile(AppPathsService.getInstance().getRegistryFilePath(), "utf8");
      const parsed = safeJsonParse<RegistryFile>(raw, DEFAULT_REGISTRY);
      this.registry = {
        version: parsed.version ?? 1,
        workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
      };
    } catch {
      this.registry = DEFAULT_REGISTRY;
      await this.save();
    }

    return this.registry;
  }

  async list(): Promise<WorkspaceSummaryDto[]> {
    if (!this.registry.workspaces.length) {
      await this.load();
    }

    return [...this.registry.workspaces].sort((left, right) => {
      const leftStamp = left.lastOpenedAt ?? left.updatedAt;
      const rightStamp = right.lastOpenedAt ?? right.updatedAt;
      return rightStamp.localeCompare(leftStamp);
    });
  }

  async get(workspaceId: string): Promise<WorkspaceSummaryDto | null> {
    const workspaces = await this.list();
    return workspaces.find((entry) => entry.id === workspaceId) ?? null;
  }

  async upsert(workspace: WorkspaceSummaryDto): Promise<WorkspaceSummaryDto> {
    const index = this.registry.workspaces.findIndex((entry) => entry.id === workspace.id);

    if (index >= 0) {
      this.registry.workspaces[index] = workspace;
    } else {
      this.registry.workspaces.push(workspace);
    }

    await this.save();
    return workspace;
  }

  async remove(workspaceId: string): Promise<void> {
    this.registry.workspaces = this.registry.workspaces.filter((workspace) => workspace.id !== workspaceId);
    await this.save();
  }

  async markOpened(workspaceId: string, openedAt: string): Promise<WorkspaceSummaryDto | null> {
    const workspace = this.registry.workspaces.find((entry) => entry.id === workspaceId);
    if (!workspace) {
      return null;
    }

    workspace.lastOpenedAt = openedAt;
    workspace.updatedAt = openedAt;
    await this.save();
    return workspace;
  }

  private async save(): Promise<void> {
    const registryPath = AppPathsService.getInstance().getRegistryFilePath();
    await fs.mkdir(path.dirname(registryPath), { recursive: true });
    await fs.writeFile(registryPath, `${JSON.stringify(this.registry, null, 2)}\n`, "utf8");
  }
}
