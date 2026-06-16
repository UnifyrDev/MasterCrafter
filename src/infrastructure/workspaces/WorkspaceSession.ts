import type { WorkspaceSummaryDto } from "@shared/contracts";
import { CampaignDatabase } from "@infra/database/CampaignDatabase";
import { CampaignRepository } from "@infra/database/CampaignRepository";

export class WorkspaceSession {
  constructor(
    public readonly summary: WorkspaceSummaryDto,
    public readonly database: CampaignDatabase,
    public readonly repository: CampaignRepository,
  ) {}

  close(): void {
    this.database.close();
  }
}
