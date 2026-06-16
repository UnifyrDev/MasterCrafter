import { WorkspaceBoundAggregate } from "@domain/models/WorkspaceBoundAggregate";
import type { CustomFieldDefinitionDto, EntityTypeDefinitionDto } from "@shared/contracts";

export class EntityTypeDefinition extends WorkspaceBoundAggregate {
  constructor(
    id: string,
    workspaceId: string,
    public typeKey: string,
    public displayName: string,
    public icon: string,
    public color: string,
    public description: string,
    public builtin: boolean,
    public fieldDefinitions: CustomFieldDefinitionDto[],
    createdAt: string,
    updatedAt: string,
  ) {
    super(id, workspaceId, createdAt, updatedAt);
  }

  rename(displayName: string, description: string): void {
    this.displayName = displayName;
    this.description = description;
    this.touch();
  }

  updateSchema(fieldDefinitions: CustomFieldDefinitionDto[]): void {
    this.fieldDefinitions = fieldDefinitions;
    this.touch();
  }

  toDto(): EntityTypeDefinitionDto {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      typeKey: this.typeKey,
      displayName: this.displayName,
      icon: this.icon,
      color: this.color,
      description: this.description,
      builtin: this.builtin,
      fieldDefinitions: this.fieldDefinitions,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
