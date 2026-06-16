import { WorkspaceBoundAggregate } from "@domain/models/WorkspaceBoundAggregate";
import type { MapDto } from "@shared/contracts";

export class CampaignMap extends WorkspaceBoundAggregate {
  constructor(
    id: string,
    workspaceId: string,
    public title: string,
    public description: string,
    public assetId: string,
    public assetName: string,
    public assetPath: string,
    public width: number,
    public height: number,
    createdAt: string,
    updatedAt: string,
  ) {
    super(id, workspaceId, createdAt, updatedAt);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.touch();
  }

  toDto(): MapDto {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      title: this.title,
      description: this.description,
      assetId: this.assetId,
      assetName: this.assetName,
      assetPath: this.assetPath,
      width: this.width,
      height: this.height,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
