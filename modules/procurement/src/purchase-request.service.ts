import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type AccessTarget, assertSameTenant, type Id, makeEvent, type OrgLevel, sameTenantOrNull } from '@aura/shared';
import { AccessService, ApprovalMatrixService, EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import { PR_EVENT, type PurchaseRequest, type PurchaseRequestStatus, type NewPurchaseRequest, makePurchaseRequest } from './domain/purchase-request';
import { PR_LINE_STORE, type PurchaseRequestLineStore } from './purchase-request-line-store';
import { governingValue, type PurchaseRequestLine, readyToSubmit } from './domain/purchase-request-line';
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
    // @Optional() @Inject(...) explicitly: a union-typed ctor param emits `Object` for
    // design:paramtypes and Nest injects null silently, which would make the guards inert.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
    /**
     * The requisition's LINES, where it has them — because the value that governs a line-based
     * requisition is derived from them, not from the header.
     *
     * Appended at the END of the constructor deliberately: this service is built positionally by at
     * least one suite, and inserting a parameter anywhere else silently rebinds every later one.
     * Optional so those constructions keep working — a null store means "no lines", which is
     * exactly right for a requisition raised before lines existed.
     */
    @Optional() @Inject(PR_LINE_STORE) private readonly lines: PurchaseRequestLineStore | null = null,
  ) {}

  /**
   * The value that governs this requisition, and whether it may be acted on at all.
   *
   * A requisition with no lines keeps its authored header figure — that is what somebody stated,
   * and refusing to read it would invalidate every historical record. A requisition WITH lines is
   * governed by them: there must not be two totals that can disagree, and the lines are the ones
   * anybody can check.
   */
  private async governing(pr: PurchaseRequest): Promise<{
    value: number | null; derived: boolean; lines: PurchaseRequestLine[];
  }> {
    const lines = this.lines ? await this.lines.listForRequest(pr.id, pr.tenantId) : [];
    return { ...governingValue(pr.value, lines), lines };
  }

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
        /**
         * The permission depends on WHICH decision is being made.
         *
         * Every status change used to assert `procurement.pr.approve`, which meant a requisition
         * could only be SENT for approval by somebody who could already approve it — the maker and
         * the checker collapsed into one person, and a Buyer could not submit their own
         * requisition at all. Sending one for a decision is part of authoring it; making the
         * decision is not.
         */
        const permission = status === 'approved' || status === 'rejected'
          ? 'procurement.pr.approve'
          : 'procurement.pr.update';
        const target: AccessTarget = { permission, orgPath };
        this.access.assert(actorId, target);
      }
    }

    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'PR', id);
    const { value: governedValue, derived, lines } = await this.governing(existing);

    /**
     * A requisition asking for a decision must be able to state what it is asking for.
     *
     * Enforced on BOTH submission and approval, because a draft can be approved directly — and an
     * incomplete requisition reaching an approver is exactly the case where a missing estimate
     * would decide who that approver is.
     */
    if (status === 'submitted' || status === 'approved') {
      const verdict = readyToSubmit(lines);
      if (lines.length > 0 && !verdict.ready) throw new Error(verdict.reason);
    }

    // Approval matrix: when a threshold rule matches the PR, only a listed approver may approve it.
    //
    // Resolved on the GOVERNING value. Reading the header here was the hole: a line-based
    // requisition keeps a header of 0 while its lines say 6,400, so the matrix matched no rule and
    // required no approver at all — a smaller number buying a weaker approval, through a different
    // door from the one the unpriced-line rule closes.
    if (status === 'approved') {
      const decision = await this.approvalMatrix.resolve(existing.tenantId, 'purchase-request', {
        value: governedValue ?? existing.value,
      });
      if (decision && !(actorId && decision.approvers.includes(actorId))) {
        throw new Error(
          `approval requires an authorised approver for "${decision.ruleLabel}" (approvers: ${decision.approvers.join(', ') || 'none'})`,
        );
      }
    }

    // The persisted header follows the lines once they exist, so no reader downstream — the event
    // log, the cost ledger, My Work, spend analytics — is handed a figure the lines contradict.
    const updated: PurchaseRequest = {
      ...existing,
      status,
      value: derived && governedValue !== null ? governedValue : existing.value,
    };
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

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async get(id: Id): Promise<PurchaseRequest | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  list(filter?: PurchaseRequestFilter): Promise<PurchaseRequest[]> {
    return this.store.list(filter);
  }

  listPaged(filter: PurchaseRequestFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }
}
