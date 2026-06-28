import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type Id, makeEvent, newId } from '@aura/shared';
import { CommandBus, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';
import { CONTRACT_EVENT, type Contract, type ContractStatus, type NewContract, makeContract } from './domain/contract';
import { CONTRACT_STORE, type ContractFilter, type ContractStore } from './contract-store';

const CREATE_CONTRACT = 'contracts.contract.create';

/**
 * Contracts service — the third deal-chain module. Owns `aura_contracts_contracts`, emits
 * `contracts.contract.*` on the spine. A contract is awarded from a WON tender, so it carries
 * the tender AND account references by id + snapshot — never a join.
 *
 * Create dispatches through the kernel `CommandBus` (validate → authz → idempotency →
 * one transaction → atomic row + outbox event), mirroring the CRM reference integration.
 * `changeStatus` keeps its inline atomic write (TX_RUNNER) — equivalent, and its
 * `contract.signed` event drives cross-module automation (auto-create a Project).
 */
@Injectable()
export class ContractService implements OnModuleInit {
  private readonly logger = new Logger('Contracts');

  constructor(
    @Inject(CONTRACT_STORE) private readonly store: ContractStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly commands: CommandBus,
  ) {}

  onModuleInit(): void {
    this.commands.register<NewContract, Contract>({
      name: CREATE_CONTRACT,
      permission: 'contracts.contract.create',
      validate: (input) => {
        if (!input.title || !input.title.trim()) throw new Error('contract title is required');
      },
      handler: async (command, tx) => {
        const contract = makeContract(command.payload);
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
        await this.store.createWithClient(tx, contract);
        await this.events.appendWithClient(tx, [event]);
        this.logger.log(`Contract created: ${contract.title} (${contract.id}) value=${contract.value}`);
        return contract;
      },
    });
  }

  create(input: NewContract, idempotencyKey?: string | null): Promise<Contract> {
    return this.commands.execute<Contract>({
      id: newId(),
      name: CREATE_CONTRACT,
      tenantId: input.tenantId,
      companyId: input.companyId ?? null,
      actorId: input.createdBy ?? null,
      payload: input,
      idempotencyKey: idempotencyKey ?? null,
    });
  }

  /**
   * Transition a contract's status. Emits specific events like `contract.signed`
   * that trigger cross-module automation (e.g. auto-create a Project).
   */
  async changeStatus(id: Id, status: ContractStatus): Promise<Contract> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`contract ${id} not found`);
    const updated: Contract = { ...existing, status };

    const eventType = status === 'active' ? CONTRACT_EVENT.signed
      : status === 'completed' ? CONTRACT_EVENT.completed
      : CONTRACT_EVENT.updated;

    const event = makeEvent({
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
    });

    // Atomic: the status update and its (cross-module-triggering) event commit together.
    await this.tx.run(async (handle) => {
      await this.store.updateWithClient(handle, updated);
      await this.events.appendWithClient(handle, [event]);
    });
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
