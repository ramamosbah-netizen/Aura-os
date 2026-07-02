import type { TransmittalItem } from './domain/transmittal-item';
import type { TransmittalItemStore } from './store.interface';

export class InMemoryTransmittalItemStore implements TransmittalItemStore {
  private readonly items = new Map<string, TransmittalItem>();

  async save(item: TransmittalItem): Promise<void> {
    this.items.set(item.id, { ...item });
  }

  async findByTransmittal(transmittalId: string, tenantId: string): Promise<TransmittalItem[]> {
    return [...this.items.values()]
      .filter((i) => i.transmittalId === transmittalId && i.tenantId === tenantId)
      .sort((a, b) => a.documentNumber.localeCompare(b.documentNumber));
  }

  async findByRegisterEntry(registerEntryId: string, tenantId: string): Promise<TransmittalItem[]> {
    return [...this.items.values()]
      .filter((i) => i.registerEntryId === registerEntryId && i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
