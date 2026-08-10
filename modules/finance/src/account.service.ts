import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, sameTenantOrNull } from '@aura/shared';
import { AccessService, TenantContext } from '@aura/core';
import { type Account, type NewAccount, makeAccount } from './domain/account';
import { ACCOUNT_STORE, type AccountFilter, type AccountStore } from './account-store';

@Injectable()
export class AccountService {
  private readonly logger = new Logger('FinanceAccount');

  constructor(
    @Inject(ACCOUNT_STORE) private readonly store: AccountStore,
    private readonly access: AccessService,
    // @Optional() @Inject(...) explicitly: a union-typed ctor param emits `Object` for
    // design:paramtypes and Nest injects null silently, which would make the guards inert.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
  ) {}

  async create(input: NewAccount, actorId?: Id): Promise<Account> {
    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      const target: AccessTarget = { permission: 'finance.account.create', orgPath };
      this.access.assert(actorId, target);
    }

    const existing = await this.store.getByCode(input.tenantId, input.code);
    if (existing) {
      throw new Error(`Account code ${input.code} already exists for this tenant`);
    }

    const account = makeAccount(input);
    await this.store.create(account);
    this.logger.log(`Account created: ${account.code} - ${account.name}`);
    return account;
  }

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async get(id: Id): Promise<Account | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  getByCode(tenantId: Id, code: string): Promise<Account | null> {
    return this.store.getByCode(tenantId, code);
  }

  list(filter?: AccountFilter): Promise<Account[]> {
    return this.store.list(filter);
  }
}
