import { WorkspaceBoundAggregate } from "@domain/models/WorkspaceBoundAggregate";
import type { EntityDto, NpcStatblockDto } from "@shared/contracts";
import { slugify } from "@shared/utils";

export class Entity extends WorkspaceBoundAggregate {
  constructor(
    id: string,
    workspaceId: string,
    public typeKey: string,
    public title: string,
    public slug: string,
    public subtitle: string,
    public description: string,
    public markdown: string,
    public imageAssetId: string | null,
    public imageAssetPath: string | null,
    public tags: string[],
    public linkedMapId: string | null,
    public linkedPlacementId: string | null,
    public questlineId: string | null,
    public familyTreeRootId: string | null,
    public customFields: Record<string, unknown>,
    public npcStatblock: NpcStatblockDto | null,
    createdAt: string,
    updatedAt: string,
  ) {
    super(id, workspaceId, createdAt, updatedAt);
  }

  updateTitle(title: string, subtitle: string): void {
    this.title = title;
    this.subtitle = subtitle;
    this.slug = slugify(title);
    this.touch();
  }

  updateBody(description: string, markdown: string): void {
    this.description = description;
    this.markdown = markdown;
    this.touch();
  }

  updateStatblock(npcStatblock: NpcStatblockDto | null): void {
    this.npcStatblock = npcStatblock;
    this.touch();
  }

  toDto(): EntityDto {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      typeKey: this.typeKey,
      title: this.title,
      slug: this.slug,
      subtitle: this.subtitle,
      description: this.description,
      markdown: this.markdown,
      imageAssetId: this.imageAssetId,
      imageAssetPath: this.imageAssetPath,
      tags: this.tags,
      linkedMapId: this.linkedMapId,
      linkedPlacementId: this.linkedPlacementId,
      questlineId: this.questlineId,
      familyTreeRootId: this.familyTreeRootId,
      customFields: this.customFields,
      npcStatblock: this.npcStatblock,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
