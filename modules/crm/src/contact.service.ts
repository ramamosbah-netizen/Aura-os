import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, type PageParams, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
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

  get(id: Id): Promise<Contact | null> {
    return this.store.get(id);
  }

  list(filter?: ContactFilter): Promise<Contact[]> {
    return this.store.list(filter);
  }

  listPaged(filter: ContactFilter, page: PageParams) {
    return this.store.listPaged(filter, page);
  }
}
