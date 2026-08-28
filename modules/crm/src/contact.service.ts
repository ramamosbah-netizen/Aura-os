import { Inject, Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import { assertSameTenant, type Id, makeEvent, newId, type PageParams, sameTenantOrNull } from '@aura/shared';
import { CommandBus, EVENT_STORE, type EventStore, NullTxRunner, TenantContext, TX_RUNNER, type TxRunner } from '@aura/core';
import { CRM_CONTACT_EVENT, type Contact, type NewContact, makeContact } from './domain/contact';
import { CRM_CONTACT_STORE, type ContactFilter, type ContactStore, type ContactSummary } from './contact-store';

/**
 * CRM Contact service — people at an account. Owns `aura_crm_contacts` and emits
 * `crm.contact.*` on the spine. Contacts reference their account by id + name snapshot.
 */
const CREATE_CONTACT = 'crm.contact.create';

@Injectable()
export class ContactService implements OnModuleInit {
  private readonly logger = new Logger('CRM');

  constructor(
    @Inject(CRM_CONTACT_STORE) private readonly store: ContactStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Optional() @Inject(TX_RUNNER) private readonly tx: TxRunner = new NullTxRunner(),
    @Optional() @Inject(CommandBus) private readonly commands: CommandBus | null = null,
    // @Optional() @Inject(...) explicitly: a union-typed ctor param emits `Object` for
    // design:paramtypes and Nest injects null silently, which would make the guards inert.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
  ) {}

  onModuleInit(): void {
    if (!this.commands) return;
    this.commands.register<NewContact, Contact>({
      name: CREATE_CONTACT,
      permission: 'crm.contact.create',
      validate: (input) => { if (!input.name?.trim()) throw new Error('contact name is required'); },
      getLockKey: (command) => command.payload.accountId ? `crm.contact.primary:${command.tenantId}:${command.payload.accountId}` : null,
      handler: (command, tx) => this.createDirect(command.payload, tx),
    });
  }

  create(input: NewContact, idempotencyKey?: string | null): Promise<Contact> {
    if (this.commands) return this.commands.execute<Contact>({
      id: newId(),
      name: CREATE_CONTACT,
      tenantId: input.tenantId,
      companyId: input.companyId ?? null,
      actorId: input.createdBy ?? null,
      payload: input,
      idempotencyKey: idempotencyKey ?? null,
    });
    return this.createDirect(input, null);
  }

  private async createDirect(input: NewContact, txHandle: import('@aura/core').TxHandle | null): Promise<Contact> {
    await this.validateReportsTo(input.tenantId, input.accountId ?? null, null, input.reportsToId ?? null);
    const contact = makeContact(input);
    const write = async (handle: import('@aura/core').TxHandle | null) => {
      await this.store.saveWithClient(handle, contact);
      await this.events.appendWithClient(handle, [
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
    };
    if (txHandle !== null) await write(txHandle);
    else await this.tx.run(write);
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
    await this.validateReportsTo(updated.tenantId, updated.accountId, id, updated.reportsToId);

    const event = makeEvent({
      type: CRM_CONTACT_EVENT.updated,
      tenantId: updated.tenantId,
      companyId: updated.companyId,
      actorId: null,
      aggregateType: 'crm.contact',
      aggregateId: updated.id,
      payload: { name: updated.name, accountId: updated.accountId, isPrimary: updated.isPrimary, status: updated.status },
    });
    await this.tx.run(async (handle) => {
      if (updated.isPrimary && updated.accountId && !(existing.isPrimary && existing.accountId === updated.accountId)) {
        const siblings = await this.store.list({ tenantId: existing.tenantId, accountId: updated.accountId });
        for (const sib of siblings) {
          if (sib.id !== id && sib.isPrimary) await this.store.saveWithClient(handle, { ...sib, isPrimary: false });
        }
      }
      await this.store.saveWithClient(handle, updated);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Contact updated: ${updated.name} (${updated.id})`);
    return updated;
  }

  list(filter?: ContactFilter): Promise<Contact[]> {
    return this.store.list(filter);
  }

  listAll(filter: ContactFilter): Promise<Contact[]> {
    return this.store.listAll(filter);
  }

  streamAll(filter: ContactFilter, onBatch: (rows: Contact[]) => Promise<void>): Promise<void> {
    return this.store.streamAll(filter, onBatch);
  }

  listPaged(filter: ContactFilter, page: PageParams) {
    return this.store.listPaged(filter, page);
  }

  summary(filter: ContactFilter): Promise<ContactSummary> {
    return this.store.summary(filter);
  }

  /** Validate the reporting hierarchy before a write. References never cross tenants/accounts,
   * a contact cannot report to itself, and walking the chain must not find the edited contact. */
  private async validateReportsTo(tenantId: string, accountId: string | null, contactId: string | null, reportsToId: string | null): Promise<void> {
    if (!reportsToId) return;
    if (reportsToId === contactId) throw new Error('contact cannot report to itself');
    const target = sameTenantOrNull(await this.store.get(reportsToId), tenantId);
    if (!target) throw new Error('reports-to contact not found');
    if (accountId && target.accountId !== accountId) throw new Error('reports-to contact must belong to the same account');

    const visited = new Set<string>();
    let cursor: Contact | null = target;
    while (cursor?.reportsToId) {
      if (cursor.reportsToId === contactId) throw new Error('reports-to relationship would create a cycle');
      if (visited.has(cursor.reportsToId)) break;
      visited.add(cursor.reportsToId);
      const next: Contact | null = sameTenantOrNull(await this.store.get(cursor.reportsToId), tenantId);
      if (!next) break;
      cursor = next;
    }
  }
}
