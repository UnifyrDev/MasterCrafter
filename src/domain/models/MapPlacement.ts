import { WorkspaceBoundAggregate } from "@domain/models/WorkspaceBoundAggregate";
import type { MapPlacementDto, MapPlacementGeometryDto } from "@shared/contracts";

export class MapPlacement extends WorkspaceBoundAggregate {
  constructor(
    id: string,
    workspaceId: string,
    public mapId: string,
    public entityId: string | null,
    public label: string,
    public kind: MapPlacementGeometryDto["kind"],
    public geometry: MapPlacementGeometryDto,
    public textWidth: number,
    public textHeight: number,
    public textOffsetX: number,
    public textOffsetY: number,
    public notes: string,
    public color: string,
    public glowColor: string,
    public shadowColor: string,
    public scale: number,
    public fontColor: string,
    public zIndex: number,
    createdAt: string,
    updatedAt: string,
  ) {
    super(id, workspaceId, createdAt, updatedAt);
  }

  movePoint(x: number, y: number): void {
    this.geometry = {
      ...this.geometry,
      point: { x, y },
    };
    this.touch();
  }

  updateGeometry(geometry: MapPlacementGeometryDto): void {
    this.geometry = geometry;
    this.kind = geometry.kind;
    this.touch();
  }

  toDto(): MapPlacementDto {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      mapId: this.mapId,
      entityId: this.entityId,
      label: this.label,
      kind: this.kind,
      geometry: this.geometry,
      textWidth: this.textWidth,
      textHeight: this.textHeight,
      textOffsetX: this.textOffsetX,
      textOffsetY: this.textOffsetY,
      notes: this.notes,
      color: this.color,
      glowColor: this.glowColor,
      shadowColor: this.shadowColor,
      scale: this.scale,
      fontColor: this.fontColor,
      zIndex: this.zIndex,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
