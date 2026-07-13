import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Contact } from './domain/contact';
import type { ContactFilter, ContactStore } from './contact-store';

/** Phase-0 contact store — keeps contacts in memory (no-DB boots). */
export class InMemoryContactStore implements ContactStore {
  private readonly contacts = new Map<string, Contact>();

  async save(contact: Contact): Promise<void> {
    this.contacts.set(contact.id, { ...contact });
  }

  async saveWithClient(_tx: TxHandle | null, contact: Contact): Promise<void> {
    return this.save(contact);
  }

  async get(id: Id): Promise<Contact | null> {
    const c = this.contacts.get(id);
    return c ? { ...c } : null;
  }

  async list(filter: ContactFilter = {}): Promise<Contact[]> {
    let out = [...this.contacts.values()];
    if (filter.tenantId) out = out.filter((c) => c.tenantId === filter.tenantId);
    if (filter.accountId) out = out.filter((c) => c.accountId === filter.accountId);
    if (filter.status) out = out.filter((c) => c.status === filter.status);
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: ContactFilter, page: PageParams): Promise<Page<Contact>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
