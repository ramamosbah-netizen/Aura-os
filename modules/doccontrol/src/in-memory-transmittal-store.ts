import type { TxHandle } from '@aura/core';
import type { Transmittal } from './domain/transmittal';
import type { TransmittalStore } from './store.interface';

export class InMemoryTransmittalStore implements TransmittalStore {
  private items = new Map<string, Transmittal>();

  async save(transmittal: Transmittal, tx?: TxHandle): Promise<void> {
    this.items.set(transmittal.id, { ...transmittal });
  }

  async findById(id: string, tenantId: string): Promise<Transmittal | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item };
  }

  async findByProject(projectId: string, tenantId: string): Promise<Transmittal[]> {
    return Array.from(this.items.values())
      .filter((item) => item.projectId === projectId && item.tenantId === tenantId)
      .map((item) => ({ ...item }));
  }

  async findAll(tenantId: string): Promise<Transmittal[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId)
      .map((item) => ({ ...item }));
  }
}
