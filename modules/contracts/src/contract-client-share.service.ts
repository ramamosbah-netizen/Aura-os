import { Inject, Injectable, Optional } from '@nestjs/common';
import { assertSameTenant, type Id, makeEvent, sameTenantOrNull } from '@aura/shared';
import { AuditService, EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import { ContractRevisionService } from './contract-revision.service';
import { CONTRACT_CLIENT_SHARE_STORE, type ContractClientShareStore } from './contract-client-share-store';
import { dispatchClientShare, makeContractClientShare, type ContractClientShare, type NewContractClientShare } from './domain/contract-client-share';

@Injectable()
export class ContractClientShareService {
  constructor(@Inject(CONTRACT_CLIENT_SHARE_STORE) private readonly store:ContractClientShareStore,@Inject(EVENT_STORE) private readonly events:EventStore,private readonly revisions:ContractRevisionService,@Optional() @Inject(TenantContext) private readonly tenant:TenantContext|null=null,@Optional() @Inject(AuditService) private readonly audit:AuditService|null=null){}
  async create(input:NewContractClientShare){const r=await this.revisions.get(input.revisionId);if(!r||r.contractId!==input.contractId||r.tenantId!==input.tenantId)throw new Error('revision does not belong to contract');const share=makeContractClientShare(input);await this.store.create(share);await this.events.append([makeEvent({type:'contracts.contract.client_share.prepared',tenantId:share.tenantId,companyId:null,actorId:share.sharedBy,aggregateType:'contracts.contract',aggregateId:share.contractId,payload:{shareId:share.id,revisionId:share.revisionId,method:share.method}})]);await this.audit?.log(share.tenantId,null,share.sharedBy,'contracts','contract_client_share',share.id,'prepared',{method:share.method,recipient:share.recipient},{contractId:share.contractId,revisionId:share.revisionId,correlationId:share.correlationId});return share;}
  async list(contractId:Id){const t=this.tenant?.boundTenantId();return t?this.store.list(t,contractId):[];}
  async dispatch(id:Id){const s=assertSameTenant(await this.store.get(id),this.tenant?.boundTenantId(),'client share',id);if(s.state!=='prepared')return s;const next=dispatchClientShare(s);await this.store.update(next);const actor=this.tenant?.get().actorId??null;await this.events.append([makeEvent({type:'contracts.contract.client_share.dispatched',tenantId:s.tenantId,companyId:null,actorId:actor,aggregateType:'contracts.contract',aggregateId:s.contractId,payload:{shareId:s.id,revisionId:s.revisionId,method:s.method}})]);await this.audit?.log(s.tenantId,null,actor,'contracts','contract_client_share',s.id,'dispatched',{method:s.method},{contractId:s.contractId,revisionId:s.revisionId,correlationId:s.correlationId});return next;}
  async get(id:Id){return sameTenantOrNull(await this.store.get(id),this.tenant?.boundTenantId());}
}
