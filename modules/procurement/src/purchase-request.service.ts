import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, ApprovalMatrixService } from '@aura/core';
import { PR_EVENT, type PurchaseRequest, type PurchaseRequestStatus, type NewPurchaseRequest, makePurchaseRequest } from './domain/purchase-request';
import { PURCHASE_REQUEST_STORE, type PurchaseRequestFilter, type PurchaseRequestStore } from './purchase-request-store';
import { PurchaseOrderService } from './purchase-order.service';

@Injectable()
export class PurchaseRequestService {
  private readonly logger = new Logger('PurchaseRequest');

  constructor(
    @Inject(PURCHASE_REQUEST_STORE) private readonly store: PurchaseRequestStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly access: AccessService,
    private readonly purchaseOrders: PurchaseOrderService,
    private readonly approvalMatrix: ApprovalMatrixService,
  ) {}

  async create(input: NewPurchaseRequest): Promise<PurchaseRequest> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      const target: AccessTarget = { permission: 'procurement.pr.create', orgPath };
      this.access.assert(input.createdBy, target);
    }

    const pr = makePurchaseRequest(input);
    await this.store.create(pr);
    await this.events.append([
      makeEvent({
        type: PR_EVENT.prCreated,
        tenantId: pr.tenantId,
        companyId: pr.companyId,
        actorId: pr.createdBy,
        aggregateType: 'procurement.pr',
        aggregateId: pr.id,
        payload: {
          title: pr.title,
          status: pr.status,
          value: pr.value,
          project: pr.projectId ? { id: pr.projectId, name: pr.projectName } : null,
        },
      }),
    ]);
    this.logger.log(`PR created: ${pr.title} (${pr.id}) value=${pr.value}`);
    return pr;
  }

  async changeStatus(id: Id, status: PurchaseRequestStatus, actorId?: Id): Promise<PurchaseRequest> {
    if (actorId) {
      const existing = await this.store.get(id);
      if (existing) {
        const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: existing.tenantId }];
        const target: AccessTarget = { permission: 'procurement.pr.approve', orgPath };
        this.access.assert(actorId, target);
      }
    }

    const existing = await this.store.get(id);
    if (!existing) throw new Error(`PR ${id} not found`);

    // Approval matrix: when a threshold rule matches the PR, only a listed approver may approve it.
    if (status === 'approved') {
      const decision = await this.approvalMatrix.resolve(existing.tenantId, 'purchase-request', { value: existing.value });
      if (decision && !(actorId && decision.approvers.includes(actorId))) {
        throw new Error(
          `approval requires an authorised approver for "${decision.ruleLabel}" (approvers: ${decision.approvers.join(', ') || 'none'})`,
        );
      }
    }

    const updated: PurchaseRequest = { ...existing, status };
    await this.store.update(updated);

    let eventType: string = PR_EVENT.prUpdated;
    if (status === 'submitted') {
      eventType = PR_EVENT.prSubmitted;
    } else if (status === 'approved') {
      eventType = PR_EVENT.prApproved;
    } else if (status === 'rejected') {
      eventType = PR_EVENT.prRejected;
    }

    await this.events.append([
      makeEvent({
        type: eventType,
        tenantId: updated.tenantId,
        companyId: updated.companyId,
        actorId: actorId ?? null,
        aggregateType: 'procurement.pr',
        aggregateId: updated.id,
        payload: {
          title: updated.title,
          status: updated.status,
          value: updated.value,
          project: updated.projectId ? { id: updated.projectId, name: updated.projectName } : null,
        },
      }),
    ]);

    this.logger.log(`PR ${updated.title} (${updated.id}) status changed to ${status}`);

    // If PR is approved, automatically create a draft Purchase Order
    if (status === 'approved') {
      const po = await this.purchaseOrders.create({
        tenantId: updated.tenantId,
        companyId: updated.companyId,
        title: `PO for ${updated.title}`,
        value: updated.value,
        projectId: updated.projectId,
        projectName: updated.projectName,
        status: 'draft',
        createdBy: actorId,
      });
      this.logger.log(`Auto-created PO ${po.title} (${po.id}) from approved PR ${updated.id}`);
    }

    return updated;
  }

  get(id: Id): Promise<PurchaseRequest | null> {
    return this.store.get(id);
  }

  list(filter?: PurchaseRequestFilter): Promise<PurchaseRequest[]> {
    return this.store.list(filter);
  }
}
