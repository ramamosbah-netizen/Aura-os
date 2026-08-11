import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { assertSameTenant, type Id, makeEvent, sameTenantOrNull } from '@aura/shared';
import { EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import {
  BOND_EVENT,
  type BondAction,
  type ContractBond,
  type NewContractBond,
  applyBondAction,
  expiringBonds,
  makeContractBond,
} from './domain/contract-bond';
import { CONTRACT_BOND_STORE, type BondFilter, type BondStore } from './bond-store';

/**
 * Bond/guarantee service — the bank instruments securing each contract
 * (performance / advance-payment / retention / warranty). Owns
 * `aura_contract_bonds`, emits `contracts.bond.*`. The expiry watch is the
 * point: an unnoticed expired performance bond is a real commercial risk.
 */
@Injectable()
export class BondService {
  private readonly logger = new Logger('Contracts');

  constructor(
    @Inject(CONTRACT_BOND_STORE) private readonly store: BondStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    // @Optional() @Inject(...) explicitly: a union-typed ctor param emits `Object` for
    // design:paramtypes and Nest injects null silently, which would make the guards inert.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
  ) {}

  async create(input: NewContractBond): Promise<ContractBond> {
    const bond = makeContractBond(input);
    await this.store.save(bond);
    await this.events.append([
      makeEvent({
        type: BOND_EVENT.added,
        tenantId: bond.tenantId,
        companyId: bond.companyId,
        actorId: bond.createdBy,
        aggregateType: 'contracts.bond',
        aggregateId: bond.id,
        payload: { contractId: bond.contractId, kind: bond.kind, reference: bond.reference, amount: bond.amount, expiryDate: bond.expiryDate },
      }),
    ]);
    this.logger.log(`Bond added: ${bond.kind} ${bond.reference} (AED ${bond.amount}) on contract ${bond.contractId}`);
    return bond;
  }

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async get(id: Id): Promise<ContractBond | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  list(filter?: BondFilter): Promise<ContractBond[]> {
    return this.store.list(filter);
  }

  /** Active bonds expiring within the window — the commercial watchlist. */
  async expiring(tenantId: string, withinDays = 30): Promise<ContractBond[]> {
    const all = await this.store.list({ tenantId, status: 'active' });
    return expiringBonds(all, withinDays);
  }

  async act(id: Id, action: BondAction): Promise<ContractBond> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'bond', id);
    const updated = applyBondAction(existing, action);
    await this.store.save(updated);
    const eventType = action === 'release' ? BOND_EVENT.released : action === 'call' ? BOND_EVENT.called : null;
    if (eventType) {
      await this.events.append([
        makeEvent({
          type: eventType,
          tenantId: updated.tenantId,
          companyId: updated.companyId,
          actorId: null,
          aggregateType: 'contracts.bond',
          aggregateId: updated.id,
          payload: { contractId: updated.contractId, kind: updated.kind, reference: updated.reference, amount: updated.amount },
        }),
      ]);
    }
    this.logger.log(`Bond ${updated.reference}: ${action} → ${updated.status}`);
    return updated;
  }
}
