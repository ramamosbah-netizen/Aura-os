import type { Id } from '@aura/shared';
import type { DeliveryAcknowledgement, DeliveryAcknowledgementStore } from './delivery-acknowledgement.store';

export class InMemoryDeliveryAcknowledgementStore implements DeliveryAcknowledgementStore {
  private readonly rows = new Map<string, DeliveryAcknowledgement>();

  async create(value: DeliveryAcknowledgement): Promise<void> {
    this.rows.set(value.id, { ...value });
  }

  async getByMovement(tenantId: Id, movementId: Id): Promise<DeliveryAcknowledgement | null> {
    return [...this.rows.values()].find((r) => r.tenantId === tenantId && r.movementId === movementId) ?? null;
  }

  async listByWorkPackage(tenantId: Id, wbsNodeId: Id): Promise<DeliveryAcknowledgement[]> {
    return [...this.rows.values()].filter((r) => r.tenantId === tenantId && r.wbsNodeId === wbsNodeId);
  }
}
