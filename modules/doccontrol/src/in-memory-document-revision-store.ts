import type { DocumentRevision } from './domain/document-revision';
import type { TransmittalAcknowledgement } from './domain/transmittal-acknowledgement';
import type { DocumentRevisionStore, TransmittalAcknowledgementStore } from './store.interface';

export class InMemoryDocumentRevisionStore implements DocumentRevisionStore {
  private readonly items = new Map<string, DocumentRevision>();

  async save(rev: DocumentRevision): Promise<void> {
    this.items.set(rev.id, { ...rev });
  }

  async findById(id: string, tenantId: string): Promise<DocumentRevision | null> {
    const r = this.items.get(id);
    return r && r.tenantId === tenantId ? { ...r } : null;
  }

  async listByRegisterEntry(registerEntryId: string, tenantId: string): Promise<DocumentRevision[]> {
    return [...this.items.values()]
      .filter((r) => r.registerEntryId === registerEntryId && r.tenantId === tenantId)
      .map((r) => ({ ...r }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
}

export class InMemoryTransmittalAcknowledgementStore implements TransmittalAcknowledgementStore {
  private readonly items = new Map<string, TransmittalAcknowledgement>();

  async save(ack: TransmittalAcknowledgement): Promise<void> {
    this.items.set(ack.id, { ...ack });
  }

  async listByTransmittal(transmittalId: string, tenantId: string): Promise<TransmittalAcknowledgement[]> {
    return [...this.items.values()]
      .filter((a) => a.transmittalId === transmittalId && a.tenantId === tenantId)
      .map((a) => ({ ...a }))
      .sort((a, b) => (a.acknowledgedAt < b.acknowledgedAt ? 1 : -1));
  }
}
