import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { assertSameTenant, type Id, makeEvent, type PageParams, sameTenantOrNull } from '@aura/shared';
import { EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import { CRM_CONTACT_EVENT, type Contact, type NewContact, makeContact } from './domain/contact';
import { CRM_CONTACT_STORE, type ContactFilter, type ContactStore } from './contact-store';

/**
 * CRM Contact service — people at an account. Owns `aura_crm_contacts` and emits
 * `crm.contact.*` on the spine. Contacts reference their account by id + name snapshot.
 */
@Injectable()
export class ContactService {
  private readonly logger = new Logger('CRM');

  constructor(
    @Inject(CRM_CONTACT_STORE) private readonly store: ContactStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    // @Optional() @Inject(...) explicitly: a union-typed ctor param emits `Object` for
    // design:paramtypes and Nest injects null silently, which would make the guards inert.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
  ) {}

  async create(input: NewContact): Promise<Contact> {
    const contact = makeContact(input);
    await this.store.save(contact);
    await this.events.append([
      makeEvent({
        type: CRM_CONTACT_EVENT.created,
        tenantId: contact.tenantId,
        companyId: contact.companyId,
        actorId: contact.createdBy,
        aggregateType: 'crm.contact',
        aggregateId: contact.id,
        payload: { name: contact.name, accountId: contact.accountId, email: contact.email },
      }),
    ]);
    this.logger.log(`Contact created: ${contact.name} (${contact.id})`);
    return contact;
  }

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async get(id: Id): Promise<Contact | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  /**
   * Sparse update. Setting `isPrimary: true` demotes any other primary contact
   * on the same account — an account has at most ONE primary point of contact
   * (the Account 360 header shows it as the main contact).
   */
  async update(
    id: Id,
    patch: Partial<Pick<Contact, 'name' | 'jobTitle' | 'email' | 'phone' | 'isPrimary' | 'status' | 'ownerId' | 'accountId' | 'accountName' | 'stakeholderRole' | 'relationshipStrength' | 'reportsToId' | 'reportsToName'>>,
  ): Promise<Contact> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'contact', id);
    if (patch.name !== undefined && !patch.name.trim()) throw new Error('contact name is required');
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const updated: Contact = { ...existing, ...defined };

    if (updated.isPrimary && updated.accountId && !(existing.isPrimary && existing.accountId === updated.accountId)) {
      const siblings = await this.store.list({ tenantId: existing.tenantId, accountId: updated.accountId });
      for (const sib of siblings) {
        if (sib.id !== id && sib.isPrimary) await this.store.save({ ...sib, isPrimary: false });
      }
    }

    await this.store.save(updated);
    await this.events.append([
      makeEvent({
        type: CRM_CONTACT_EVENT.updated,
        tenantId: updated.tenantId,
        companyId: updated.companyId,
        actorId: null,
        aggregateType: 'crm.contact',
        aggregateId: updated.id,
        payload: { name: updated.name, accountId: updated.accountId, isPrimary: updated.isPrimary, status: updated.status },
      }),
    ]);
    this.logger.log(`Contact updated: ${updated.name} (${updated.id})`);
    return updated;
  }

  list(filter?: ContactFilter): Promise<Contact[]> {
    return this.store.list(filter);
  }

  listPaged(filter: ContactFilter, page: PageParams) {
    return this.store.listPaged(filter, page);
  }
}
