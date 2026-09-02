import { Inject, Injectable, Optional } from '@nestjs/common';
import { assertSameTenant, type Id, makeEvent, sameTenantOrNull } from '@aura/shared';
import { AuditService, EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import { ContractRevisionService } from './contract-revision.service';
import { CONTRACT_NEGOTIATION_STORE, type ContractNegotiationStore } from './contract-negotiation-store';
import { makeContractNegotiationItem, resolveNegotiationItem, type ContractNegotiationItem, type NewContractNegotiationItem } from './domain/contract-negotiation';

@Injectable()
export class ContractNegotiationService {
  constructor(
    @Inject(CONTRACT_NEGOTIATION_STORE) private readonly store: ContractNegotiationStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly revisions: ContractRevisionService,
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext|null = null,
    @Optional() @Inject(AuditService) private readonly audit: AuditService|null = null,
  ) {}
  async create(input: NewContractNegotiationItem): Promise<ContractNegotiationItem> {
    const revision = await this.revisions.get(input.revisionId);
    if (!revision || revision.contractId !== input.contractId || revision.tenantId !== input.tenantId) throw new Error('revision does not belong to contract');
    if (revision.status === 'signed' || revision.status === 'superseded') throw new Error('negotiation is only available before signing');
    const item = makeContractNegotiationItem(input);
    await this.store.create(item);
    await this.events.append([makeEvent({ type:'contracts.contract.negotiation.created', tenantId:item.tenantId, companyId:null, actorId:item.createdBy, aggregateType:'contracts.contract', aggregateId:item.contractId, payload:{ itemId:item.id, revisionId:item.revisionId, visibility:item.visibility, type:item.type } })]);
    await this.audit?.log(item.tenantId,null,item.createdBy,'contracts','contract_negotiation',item.id,'created',{type:item.type,visibility:item.visibility},{contractId:item.contractId,revisionId:item.revisionId});
    return item;
  }
  async list(contractId: Id, revisionId?: Id): Promise<ContractNegotiationItem[]> { const tenant = this.tenant?.boundTenantId(); return tenant ? this.store.list(tenant, contractId, revisionId) : []; }
  async resolve(id: Id, status: 'resolved'|'rejected', resolution: string): Promise<ContractNegotiationItem> {
    const item = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'negotiation item', id);
    const next = resolveNegotiationItem(item, status, resolution);
    await this.store.update(next);
    await this.events.append([makeEvent({ type:`contracts.contract.negotiation.${status}`, tenantId:item.tenantId, companyId:null, actorId:this.tenant?.get().actorId ?? null, aggregateType:'contracts.contract', aggregateId:item.contractId, payload:{ itemId:item.id, revisionId:item.revisionId, status } })]);
    await this.audit?.log(item.tenantId,null,this.tenant?.get().actorId ?? null,'contracts','contract_negotiation',item.id,status,{status,resolution},{contractId:item.contractId,revisionId:item.revisionId});
    return next;
  }
  async get(id: Id): Promise<ContractNegotiationItem|null> { return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId()); }
}
