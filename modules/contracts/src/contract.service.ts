import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';
import { CONTRACT_EVENT, type Contract, type ContractStatus, type NewContract, makeContract } from './domain/contract';
import { CONTRACT_STORE, type ContractFilter, type ContractStore } from './contract-store';

/**
 * Contracts service — the third deal-chain module, cloned from the CRM/Tendering
 * template. Owns `aura_contracts_contracts`, goes through the kernel access seam, and
 * emits `contracts.contract.*` on the spine. A contract is awarded from a WON tender,
 * so it carries the tender AND account references by id + snapshot — never a join.
 */
@Injectable()
export class ContractService {
  private readonly logger = new Logger('Contracts');

  constructor(
    @Inject(CONTRACT_STORE) private readonly store: ContractStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly access: AccessService,
  ) {}

  async create(input: NewContract): Promise<Contract> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      const target: AccessTarget = { permission: 'contracts.contract.create', orgPath };
      this.access.assert(input.createdBy, target);
    }

    const contract = makeContract(input);
    const event = makeEvent({
      type: CONTRACT_EVENT.created,
      tenantId: contract.tenantId,
      companyId: contract.companyId,
      actorId: contract.createdBy,
      aggregateType: 'contracts.contract',
      aggregateId: contract.id,
      payload: {
        title: contract.title,
        status: contract.status,
        value: contract.value,
        tender: contract.tenderId
          ? { id: contract.tenderId, title: contract.tenderTitle }
          : null,
        account: contract.accountId
          ? { id: contract.accountId, name: contract.accountName }
          : null,
      },
    });

    // Atomic outbox: the contract row and its event commit in ONE transaction (or both
    // roll back). With no DB the handle is null and the stores fall back to sequential writes.
    await this.tx.run(async (handle) => {
      await this.store.createWithClient(handle, contract);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Contract created: ${contract.title} (${contract.id}) value=${contract.value}`);
    return contract;
  }

  /**
   * Transition a contract's status. Emits specific events like `contract.signed`
   * that trigger cross-module automation (e.g. auto-create a Project).
   */
  async changeStatus(id: Id, status: ContractStatus): Promise<Contract> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`contract ${id} not found`);
    const updated: Contract = { ...existing, status };
    await this.store.update(updated);

    const eventType = status === 'active' ? CONTRACT_EVENT.signed
      : status === 'completed' ? CONTRACT_EVENT.completed
      : CONTRACT_EVENT.updated;

    await this.events.append([
      makeEvent({
        type: eventType,
        tenantId: updated.tenantId,
        companyId: updated.companyId,
        actorId: null,
        aggregateType: 'contracts.contract',
        aggregateId: updated.id,
        payload: {
          title: updated.title,
          status: updated.status,
          value: updated.value,
          tender: updated.tenderId
            ? { id: updated.tenderId, title: updated.tenderTitle }
            : null,
          account: updated.accountId
            ? { id: updated.accountId, name: updated.accountName }
            : null,
        },
      }),
    ]);
    this.logger.log(`Contract ${updated.title} → ${status}`);
    return updated;
  }

  get(id: Id): Promise<Contract | null> {
    return this.store.get(id);
  }

  list(filter?: ContractFilter): Promise<Contract[]> {
    return this.store.list(filter);
  }
}
