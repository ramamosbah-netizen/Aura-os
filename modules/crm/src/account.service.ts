import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore } from '@aura/core';
import { CRM_EVENT, type Account, type NewAccount, makeAccount } from './domain/account';
import { CRM_ACCOUNT_STORE, type AccountFilter, type AccountStore } from './account-store';

/**
 * CRM Account service — the first business module, and the template for the rest.
 * It OWNS its data (`aura_crm_accounts`), goes through the kernel access platform,
 * and emits `crm.account.*` on the event spine. No cross-module DB access — other
 * modules learn about accounts via events / the API, never by joining this table.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger('CRM');

  constructor(
    @Inject(CRM_ACCOUNT_STORE) private readonly store: AccountStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly access: AccessService,
  ) {}

  async create(input: NewAccount): Promise<Account> {
    // Access seam: every module write goes through can()/assert(). Enforced once an
    // actor is present; dev (no auth yet) has actorId null, so it passes through.
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      const target: AccessTarget = { permission: 'crm.account.create', orgPath };
      this.access.assert(input.createdBy, target);
    }

    const account = makeAccount(input);
    await this.store.create(account);
    await this.events.append([
      makeEvent({
        type: CRM_EVENT.accountCreated,
        tenantId: account.tenantId,
        companyId: account.companyId,
        actorId: account.createdBy,
        aggregateType: 'crm.account',
        aggregateId: account.id,
        payload: { name: account.name, status: account.status },
      }),
    ]);
    this.logger.log(`Account created: ${account.name} (${account.id})`);
    return account;
  }

  get(id: Id): Promise<Account | null> {
    return this.store.get(id);
  }

  list(filter?: AccountFilter): Promise<Account[]> {
    return this.store.list(filter);
  }
}
