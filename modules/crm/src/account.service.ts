import { Inject, Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import { type Id, assertSameTenant, makeEvent, newId, sameTenantOrNull } from '@aura/shared';
import { CommandBus, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner, TenantContext } from '@aura/core';
import { CRM_EVENT, type Account, type NewAccount, makeAccount } from './domain/account';
import { CRM_ACCOUNT_STORE, type AccountFilter, type AccountStore } from './account-store';

const CREATE_ACCOUNT = 'crm.account.create';

/**
 * CRM Account service — the first business module, and the template for the rest.
 * It OWNS its data (`aura_crm_accounts`) and emits `crm.account.*` on the event spine.
 * No cross-module DB access — other modules learn about accounts via events / the API.
 *
 * This is also the **reference integration of the kernel command pipeline** (Constitution
 * Law #2): the create path dispatches through the `CommandBus`, which runs validation →
 * RBAC/ABAC authorization → idempotency → a single transaction (atomic row + outbox event)
 * → optional advisory lock. The other modules currently call the access seam + TX_RUNNER
 * inline (equivalent atomic write); routing them through the bus is the rollout from here.
 */
@Injectable()
export class AccountService implements OnModuleInit {
  private readonly logger = new Logger('CRM');

  constructor(
    @Inject(CRM_ACCOUNT_STORE) private readonly store: AccountStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly commands: CommandBus,
    // @Optional() @Inject(...) explicitly: a union-typed ctor param emits `Object` for
    // design:paramtypes and Nest silently injects null, which would make the guards below inert.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
  ) {}

  /** Register the create-account command on the kernel pipeline (once, at module init). */
  onModuleInit(): void {
    this.commands.register<NewAccount, Account>({
      name: CREATE_ACCOUNT,
      permission: 'crm.account.create',
      validate: (input) => {
        if (!input.name || !input.name.trim()) throw new Error('account name is required');
      },
      handler: async (command, tx) => {
        const account = makeAccount(command.payload);
        const event = makeEvent({
          type: CRM_EVENT.accountCreated,
          tenantId: account.tenantId,
          companyId: account.companyId,
          actorId: account.createdBy,
          aggregateType: 'crm.account',
          aggregateId: account.id,
          payload: { name: account.name, status: account.status },
        });
        // Atomic outbox on the bus-provided transaction: the account row and its event
        // commit together (or both roll back). Null tx (no-DB dev) falls back to sequential.
        await this.store.createWithClient(tx, account);
        await this.events.appendWithClient(tx, [event]);
        this.logger.log(`Account created: ${account.name} (${account.id})`);
        return account;
      },
    });
  }

  /**
   * Create an account by dispatching through the kernel command pipeline. An optional
   * idempotency key makes the create safely retryable (same key returns the cached result).
   */
  create(input: NewAccount, idempotencyKey?: string | null): Promise<Account> {
    return this.commands.execute<Account>({
      id: newId(),
      name: CREATE_ACCOUNT,
      tenantId: input.tenantId,
      companyId: input.companyId ?? null,
      actorId: input.createdBy ?? null,
      payload: input,
      idempotencyKey: idempotencyKey ?? null,
    });
  }

  /** Update mutable fields on an account (name, status, industry, website). */
  async update(id: Id, patch: Partial<Pick<Account, 'name' | 'status' | 'partyType' | 'industry' | 'website' | 'phone' | 'email' | 'billingAddress' | 'source' | 'paymentTerms' | 'ownerId'>>): Promise<Account> {
    // Fetch-before-mutate must be tenant-checked too (N-08). Refusing the read while allowing the
    // write would leave the more damaging half of the hole open. "not found" rather than
    // "forbidden": a caller from another tenant must not learn the record exists.
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'account', id);
    if (patch.name !== undefined && !patch.name.trim()) throw new Error('account name is required');
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const updated: Account = { ...existing, ...defined };
    const event = makeEvent({
      type: CRM_EVENT.accountUpdated,
      tenantId: updated.tenantId,
      companyId: updated.companyId,
      actorId: null,
      aggregateType: 'crm.account',
      aggregateId: updated.id,
      payload: { name: updated.name, status: updated.status },
    });
    await this.tx.run(async (handle) => {
      await this.store.updateWithClient(handle, updated);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Account updated: ${updated.name} (${updated.id})`);
    return updated;
  }

  /**
   * Tenant-scoped reads (gap register N-08). `AccountStore.get(id)` takes no tenant and its
   * Postgres query is `WHERE id = $1`; RLS is the net underneath, but it is one layer and it is
   * absent on every no-DB path. The bound tenant is applied here so the application refuses on
   * its own rather than delegating the whole boundary to the database.
   */
  async get(id: Id): Promise<Account | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  list(filter?: AccountFilter): Promise<Account[]> {
    return this.store.list(this.scoped(filter));
  }

  listPaged(filter: AccountFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(this.scoped(filter), page);
  }

  /**
   * Force the caller's tenant onto a list filter. A caller-supplied tenantId is ignored rather
   * than merged — asking for another tenant's rows is not a filter, it is the attack.
   */
  private scoped(filter?: AccountFilter): AccountFilter {
    const bound = this.tenant?.boundTenantId();
    return bound ? { ...filter, tenantId: bound } : { ...filter };
  }
}
