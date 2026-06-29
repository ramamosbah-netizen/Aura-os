import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import {
  BANK_GUARANTEE_EVENT,
  type BankGuarantee,
  type NewBankGuarantee,
  makeBankGuarantee,
  releaseGuarantee,
  claimGuarantee,
  expireGuarantee,
  isExpiringSoon,
} from './domain/bank-guarantee';
import { BANK_GUARANTEE_STORE, type BankGuaranteeFilter, type BankGuaranteeStore } from './bank-guarantee-store';

type GuaranteeAction = 'release' | 'claim' | 'expire';

const ACTIONS: Record<GuaranteeAction, (g: BankGuarantee) => BankGuarantee> = {
  release: releaseGuarantee,
  claim: claimGuarantee,
  expire: expireGuarantee,
};

/**
 * Bank guarantee service — owns `aura_finance_bank_guarantees`, emits
 * `finance.bank_guarantee.*`, and surfaces an expiry watch-list for treasury.
 */
@Injectable()
export class BankGuaranteeService {
  private readonly logger = new Logger('BankGuarantee');

  constructor(
    @Inject(BANK_GUARANTEE_STORE) private readonly store: BankGuaranteeStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  async create(input: NewBankGuarantee): Promise<BankGuarantee> {
    const g = makeBankGuarantee(input);
    await this.store.save(g);
    await this.events.append([
      makeEvent({
        type: BANK_GUARANTEE_EVENT.created,
        tenantId: g.tenantId,
        companyId: g.companyId,
        actorId: g.createdBy,
        aggregateType: 'finance.bank_guarantee',
        aggregateId: g.id,
        payload: { reference: g.reference, type: g.type, amount: g.amount, expiryDate: g.expiryDate },
      }),
    ]);
    this.logger.log(`Bank guarantee ${g.reference} (${g.type}) created: ${g.amount} ${g.currency}, expires ${g.expiryDate}`);
    return g;
  }

  async changeStatus(id: Id, action: GuaranteeAction): Promise<BankGuarantee> {
    const g = await this.store.get(id);
    if (!g) throw new Error(`bank guarantee ${id} not found`);
    const fn = ACTIONS[action];
    if (!fn) throw new Error(`unknown action ${action}`);
    const updated = fn(g);
    await this.store.save(updated);
    await this.events.append([
      makeEvent({
        type: BANK_GUARANTEE_EVENT.statusChanged,
        tenantId: g.tenantId, companyId: g.companyId, actorId: null,
        aggregateType: 'finance.bank_guarantee', aggregateId: id,
        payload: { reference: g.reference, status: updated.status },
      }),
    ]);
    return updated;
  }

  get(id: Id): Promise<BankGuarantee | null> {
    return this.store.get(id);
  }

  list(filter?: BankGuaranteeFilter): Promise<BankGuarantee[]> {
    return this.store.list(filter);
  }

  /** Active guarantees expiring within `withinDays` — the treasury watch-list. */
  async expiringSoon(tenantId: string, withinDays = 30): Promise<BankGuarantee[]> {
    const asOf = new Date().toISOString().slice(0, 10);
    const all = await this.store.list({ tenantId, status: 'active', limit: 500 });
    return all.filter((g) => isExpiringSoon(g, asOf, withinDays));
  }
}
