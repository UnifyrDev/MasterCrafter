import { WorkspaceBoundAggregate } from "@domain/models/WorkspaceBoundAggregate";
import type { StoreStockDto } from "@shared/contracts";

export class StoreStock extends WorkspaceBoundAggregate {
  constructor(
    id: string,
    workspaceId: string,
    public storeEntityId: string,
    public itemId: string,
    public quantity: number,
    public priceOverride: number | null,
    public notes: string,
    createdAt: string,
    updatedAt: string,
  ) {
    super(id, workspaceId, createdAt, updatedAt);
  }

  setQuantity(quantity: number): void {
    this.quantity = quantity;
    this.touch();
  }

  toDto(): StoreStockDto {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      storeEntityId: this.storeEntityId,
      itemId: this.itemId,
      quantity: this.quantity,
      priceOverride: this.priceOverride,
      notes: this.notes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
