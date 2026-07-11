import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
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

  get(id: Id): Promise<ContractBond | null> {
    return this.store.get(id);
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
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`bond ${id} not found`);
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
