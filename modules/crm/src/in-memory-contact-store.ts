import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Contact } from './domain/contact';
import type { ContactFilter, ContactStore, ContactSummary } from './contact-store';

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
    if (filter.stakeholderRole === 'unmapped') out = out.filter((c) => !c.stakeholderRole);
    else if (filter.stakeholderRole) out = out.filter((c) => c.stakeholderRole === filter.stakeholderRole);
    if (filter.relationshipStrength) {
      const strengths = filter.relationshipStrength.split(',').map((v) => v.trim()).filter(Boolean);
      out = out.filter((c) => strengths.includes(c.relationshipStrength ?? ''));
    }
    if (filter.search?.trim()) {
      const needle = filter.search.trim().toLowerCase();
      out = out.filter((c) => [c.name, c.jobTitle, c.email, c.phone, c.accountName]
        .some((value) => value?.toLowerCase().includes(needle)));
    }
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listAll(filter: ContactFilter): Promise<Contact[]> {
    return this.list({ ...filter, limit: undefined });
  }

  async listPaged(filter: ContactFilter, page: PageParams): Promise<Page<Contact>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }

  async summary(filter: ContactFilter): Promise<ContactSummary> {
    const all = await this.list({ ...filter, limit: undefined });
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    return {
      total: all.length,
      active: all.filter((c) => c.status === 'active').length,
      linked: all.filter((c) => Boolean(c.accountId)).length,
      primaries: all.filter((c) => c.isPrimary && c.status === 'active').length,
      recent: all.filter((c) => c.createdAt >= monthAgo).length,
      decisionMakers: all.filter((c) => c.stakeholderRole === 'decision_maker').length,
      champions: all.filter((c) => c.relationshipStrength === 'champion' || c.relationshipStrength === 'strong').length,
      unmapped: all.filter((c) => !c.stakeholderRole).length,
    };
  }
}
