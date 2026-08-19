import { Injectable, Logger } from '@nestjs/common';
import { AccessService, WorkflowService } from '@aura/core';
import {
  availableActions,
  type AccessTarget,
  type OrgLevel,
  type WorkflowDefinition,
  type WorkflowInstance,
} from '@aura/shared';
import { TenderService } from '@aura/tendering';
import { VariationService } from '@aura/projects';
import { PurchaseOrderService, PurchaseRequestService } from '@aura/procurement';
import { InvoiceService } from '@aura/finance';
import { SubcontractsService } from '@aura/subcontracts';
import { HrService } from '@aura/hr';
import { QualityService } from '@aura/quality';
import { QuotationService } from '@aura/crm';

export interface InboxItem {
  id: string;
  /** Module display name, e.g. "Procurement". */
  module: string;
  /** Record kind, e.g. "Purchase Request". */
  kind: string;
  title: string;
  detail: string;
  /** The pending verb: Approve / Decide / Certify / Pay / Review. */
  action: string;
  /** Where to act — record page when one exists, module page otherwise. */
  href: string;
  value: number | null;
  createdAt: string | null;
  /** Formal responsibility represented by this work item. */
  actionRequired: DecisionActionRequired;
  /** v1 is a live pending projection derived from the source domain's state. */
  state: 'PENDING';
  /** Due dates are deliberately null until the owning domain supplies one. */
  dueAt: string | null;
  /** Assignment is not inferred from access. */
  assignment: 'ACCESSIBLE_NOT_ASSIGNED';
  /** Authority is still enforced by the source domain, never by this projection. */
  authority: 'SOURCE_DOMAIN';
  source: 'DERIVED_DOMAIN_STATE';
  record: {
    domain: string;
    type: string;
    id: string;
    href: string;
  };
  /** Whether the decision could be linked to the kernel Workflow engine without guessing. */
  workflowLookup: 'NOT_CHECKED' | 'VERIFIED_LINK' | 'CONNECTED_NOT_LINKED' | 'DEFINITION_MISSING' | 'UNAVAILABLE';
  workflow: WorkflowDecisionEvidence | null;
}

export interface WorkflowDecisionEvidence {
  instanceId: string;
  definitionKey: string;
  definitionName: string;
  aggregateType: string;
  currentState: string;
  status: 'open' | 'completed' | 'cancelled';
  updatedAt: string;
  linkage: 'VERIFIED_TYPE_AND_ID';
  historyCount: number;
  latestHistory: { action: string; at: string } | null;
  /** Current formal transitions only. Absence never means the user owns a task. */
  availableDecisions: Array<{
    action: string;
    to: string;
    permission: string;
    eligible: boolean | null;
    authorityCheck: 'PERMISSION_ONLY' | 'PERMISSION_AND_AMOUNT' | 'ACTOR_NOT_VERIFIED';
  }>;
}

export type DecisionActionRequired =
  | 'REVIEW'
  | 'APPROVAL'
  | 'ACKNOWLEDGEMENT'
  | 'SIGN_OFF'
  | 'COMMENT'
  | 'DECISION';

/**
 * Translate legacy display verbs into the stable decision vocabulary consumed by My Work.
 * This does not grant authority; it only describes the kind of formal attention required.
 */
export function classifyDecisionAction(action: string): DecisionActionRequired {
  switch (action.toLowerCase()) {
    case 'review': return 'REVIEW';
    case 'approve':
    case 'pay': return 'APPROVAL';
    case 'activate':
    case 'certify': return 'SIGN_OFF';
    case 'acknowledge': return 'ACKNOWLEDGEMENT';
    case 'comment': return 'COMMENT';
    default: return 'DECISION';
  }
}

type LegacyInboxItem = Omit<InboxItem, 'actionRequired' | 'state' | 'dueAt' | 'assignment' | 'authority' | 'source' | 'record' | 'workflowLookup' | 'workflow'>;

export function toDecisionAssignment(item: LegacyInboxItem): InboxItem {
  return {
    ...item,
    actionRequired: classifyDecisionAction(item.action),
    state: 'PENDING',
    dueAt: null,
    assignment: 'ACCESSIBLE_NOT_ASSIGNED',
    authority: 'SOURCE_DOMAIN',
    source: 'DERIVED_DOMAIN_STATE',
    record: { domain: item.module, type: item.kind, id: item.id, href: item.href },
    workflowLookup: 'NOT_CHECKED',
    workflow: null,
  };
}

/** Eliminate repeated projections of the same owned record without merging distinct records. */
export function dedupeDecisionAssignments(items: InboxItem[]): InboxItem[] {
  return [...new Map(items.map((item) => [`${item.record.domain}::${item.record.type}::${item.record.id}`, item])).values()];
}

/** Exact mappings only. Unknown domain kinds stay unlinked rather than being matched by UUID alone. */
const WORKFLOW_AGGREGATE_TYPES = new Map<string, string>([
  ['Procurement::Purchase Order', 'procurement.po'],
]);

export function buildWorkflowEvidence(
  item: InboxItem,
  instance: WorkflowInstance,
  definition: WorkflowDefinition,
  access: Pick<AccessService, 'can'>,
  actorId: string | null,
): WorkflowDecisionEvidence {
  const orgPath: Array<{ level: OrgLevel; id: string }> = [{ level: 'tenant', id: instance.tenantId }];
  if (instance.companyId) orgPath.push({ level: 'company', id: instance.companyId });

  const availableDecisions = availableActions(definition, instance)
    .filter((transition): transition is typeof transition & { permission: string } => Boolean(transition.permission))
    .map((transition) => {
      const authorityCheck = actorId === null
        ? 'ACTOR_NOT_VERIFIED' as const
        : item.value === null ? 'PERMISSION_ONLY' as const : 'PERMISSION_AND_AMOUNT' as const;
      const target: AccessTarget = {
        permission: transition.permission,
        orgPath,
        resource: { type: instance.aggregateType, id: instance.aggregateId },
        ...(item.value === null ? {} : { amount: item.value }),
      };
      return {
        action: transition.action,
        to: transition.to,
        permission: transition.permission,
        eligible: actorId === null ? null : access.can(actorId, target).allowed,
        authorityCheck,
      };
    });
  const latest = instance.history.at(-1);

  return {
    instanceId: instance.id,
    definitionKey: definition.key,
    definitionName: definition.name,
    aggregateType: instance.aggregateType,
    currentState: instance.currentState,
    status: instance.status,
    updatedAt: instance.updatedAt,
    linkage: 'VERIFIED_TYPE_AND_ID',
    historyCount: instance.history.length,
    latestHistory: latest ? { action: latest.action, at: latest.at } : null,
    availableDecisions,
  };
}

/**
 * Universal inbox — every item across the platform waiting on a human decision,
 * composed thin in the host from the modules' service APIs (Constitution Law #1:
 * no cross-module joins). v1 derives "pending" from each entity's own status;
 * when modules adopt the Workflow engine this becomes a listInstances projection
 * without changing callers.
 */
@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly prs: PurchaseRequestService,
    private readonly pos: PurchaseOrderService,
    private readonly invoices: InvoiceService,
    private readonly subcontracts: SubcontractsService,
    private readonly tenders: TenderService,
    private readonly variations: VariationService,
    private readonly hr: HrService,
    private readonly quality: QualityService,
    private readonly quotations: QuotationService,
    private readonly workflow: WorkflowService,
    private readonly access: AccessService,
  ) {}

  async list(tenantId: string, actorId: string | null = null, companyId: string | null = null): Promise<InboxItem[]> {
    const [prs, pos, invoices, subcontracts, claims, tenders, variations, leaves, timesheets, expenseClaims, advances, mars, employees, quotations] =
      await Promise.all([
        this.prs.list({ tenantId, limit: 100 }),
        this.pos.list({ tenantId, limit: 100 }),
        this.invoices.list({ tenantId, limit: 100 }),
        this.subcontracts.listSubcontracts({ tenantId }),
        this.subcontracts.listClaims({ tenantId }),
        this.tenders.list({ tenantId, limit: 100 }),
        this.variations.list({ tenantId, limit: 100 }),
        this.hr.listLeaves(tenantId),
        this.hr.listTimesheets(tenantId),
        this.hr.listExpenseClaims(tenantId),
        this.hr.listStaffAdvances(tenantId),
        this.quality.listMaterialApprovals(tenantId),
        this.hr.listEmployees(tenantId),
        this.quotations.list({ tenantId, limit: 100 }),
      ]);

    const employeeName = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));
    const who = (id: string): string => employeeName.get(id) ?? 'Employee';

    const items: LegacyInboxItem[] = [];

    // A quotation in internal_review is blocked on an internal approval — the same shape as a
    // purchase request awaiting sign-off. It was absent from this list entirely, so "approve this
    // quote" never reached the platform's decision queue and only existed inside Quotation 360.
    // Deliberately narrow: `draft` is still being written, and `sent` / `under_negotiation` wait
    // on the customer, not on us.
    for (const q of quotations)
      if (q.status === 'internal_review')
        items.push({
          id: q.id, module: 'Commercial', kind: 'Quotation', title: `${q.quoteNumber} — ${q.customerName}`,
          detail: q.revision > 0 ? `Rev ${q.revision}` : '',
          action: 'Approve', href: `/crm/quotations/${q.id}`, value: q.total, createdAt: q.issueDate,
        });

    for (const pr of prs)
      if (pr.status === 'draft')
        items.push({
          id: pr.id, module: 'Procurement', kind: 'Purchase Request', title: pr.title,
          detail: pr.projectName ? `Project: ${pr.projectName}` : (pr.reference ?? ''),
          action: 'Approve', href: `/procurement/purchase-requests?record=${encodeURIComponent(pr.id)}`, value: pr.value, createdAt: pr.createdAt,
        });

    for (const po of pos)
      if (po.status === 'pending_approval')
        items.push({
          id: po.id, module: 'Procurement', kind: 'Purchase Order', title: po.title,
          detail: po.supplierName ? `Supplier: ${po.supplierName}` : (po.reference ?? ''),
          action: 'Approve', href: `/procurement/purchase-orders/${po.id}`, value: po.value, createdAt: po.createdAt,
        });

    for (const inv of invoices) {
      if (inv.status === 'draft')
        items.push({
          id: inv.id, module: 'Finance', kind: 'Invoice', title: inv.title,
          detail: inv.supplierName ? `Supplier: ${inv.supplierName}` : (inv.reference ?? ''),
          action: 'Approve', href: `/finance/invoices/${inv.id}`, value: inv.value, createdAt: inv.createdAt,
        });
      else if (inv.status === 'approved')
        items.push({
          id: inv.id, module: 'Finance', kind: 'Invoice', title: inv.title,
          detail: inv.supplierName ? `Supplier: ${inv.supplierName}` : (inv.reference ?? ''),
          action: 'Pay', href: `/finance/invoices/${inv.id}`, value: inv.value, createdAt: inv.createdAt,
        });
    }

    for (const sc of subcontracts)
      if (sc.status === 'draft')
        items.push({
          id: sc.id, module: 'Subcontracts', kind: 'Subcontract', title: sc.title,
          detail: `Subcontractor: ${sc.subcontractorName}`,
          action: 'Activate', href: `/subcontracts/subcontracts?record=${encodeURIComponent(sc.id)}`, value: sc.value, createdAt: sc.createdAt,
        });

    const subTitle = new Map(subcontracts.map((sc) => [sc.id, sc.title]));
    for (const cl of claims) {
      const title = `Claim #${cl.claimNumber} — ${subTitle.get(cl.subcontractId) ?? 'Subcontract'}`;
      if (cl.status === 'draft')
        items.push({
          id: cl.id, module: 'Subcontracts', kind: 'Claim', title,
          detail: 'Work-completed claim awaiting certification',
          action: 'Certify', href: `/subcontracts/subcontracts?claim=${encodeURIComponent(cl.id)}`, value: cl.workCompletedValue, createdAt: cl.createdAt,
        });
      else if (cl.status === 'certified')
        items.push({
          id: cl.id, module: 'Subcontracts', kind: 'Claim', title,
          detail: 'Certified claim awaiting payment',
          action: 'Pay', href: `/subcontracts/subcontracts?claim=${encodeURIComponent(cl.id)}`, value: cl.netCertifiedValue, createdAt: cl.createdAt,
        });
    }

    for (const t of tenders)
      if (t.status === 'submitted')
        items.push({
          id: t.id, module: 'Tendering', kind: 'Tender', title: t.title,
          detail: t.reference ?? 'Submitted bid awaiting win/loss decision',
          action: 'Decide', href: `/tendering/tenders/${t.id}`, value: t.value, createdAt: t.createdAt,
        });

    for (const v of variations)
      if (v.status === 'submitted')
        items.push({
          id: v.id, module: 'Projects', kind: 'Variation', title: v.title,
          detail: v.projectTitle ? `Project: ${v.projectTitle}` : (v.reference ?? ''),
          action: 'Approve', href: `/projects/variations?record=${encodeURIComponent(v.id)}`, value: v.signedAmount, createdAt: v.createdAt,
        });

    for (const l of leaves)
      if (l.status === 'pending')
        items.push({
          id: l.id, module: 'HR', kind: 'Leave Request', title: `${who(l.employeeId)} — ${l.leaveType}`,
          detail: `${l.startDate} → ${l.endDate}`,
          action: 'Approve', href: `/hr/control?leave=${encodeURIComponent(l.id)}`, value: null, createdAt: l.createdAt,
        });

    for (const ts of timesheets)
      if (ts.status === 'submitted')
        items.push({
          id: ts.id, module: 'HR', kind: 'Timesheet', title: `${who(ts.employeeId)} — ${ts.date}`,
          detail: `${ts.hours}h${ts.overtime ? ` + ${ts.overtime}h OT` : ''}`,
          action: 'Approve', href: `/hr/timesheets?record=${encodeURIComponent(ts.id)}`, value: null, createdAt: ts.createdAt,
        });

    for (const ec of expenseClaims)
      if (ec.status === 'submitted')
        items.push({
          id: ec.id, module: 'HR', kind: 'Expense Claim', title: `${who(ec.employeeId)} — ${ec.category}`,
          detail: ec.description,
          action: 'Approve', href: `/hr/expense-claims?record=${encodeURIComponent(ec.id)}`, value: ec.amount, createdAt: ec.createdAt,
        });

    for (const sa of advances)
      if (sa.status === 'requested')
        items.push({
          id: sa.id, module: 'HR', kind: 'Staff Advance', title: who(sa.employeeId),
          detail: 'Salary advance request',
          action: 'Approve', href: `/hr/staff-advances?record=${encodeURIComponent(sa.id)}`, value: sa.amount, createdAt: sa.createdAt,
        });

    for (const mar of mars)
      if (mar.status === 'submitted')
        items.push({
          id: mar.id, module: 'Quality', kind: 'Material Approval', title: mar.materialName,
          detail: mar.projectName ? `Project: ${mar.projectName}` : mar.reference,
          action: 'Review', href: `/quality/material-approvals?record=${encodeURIComponent(mar.id)}`, value: null, createdAt: mar.createdAt,
        });

    // Newest first; items without a timestamp sink to the end.
    const decisions = dedupeDecisionAssignments(items
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .map(toDecisionAssignment));
    return this.attachWorkflowEvidence(decisions, tenantId, companyId, actorId);
  }

  private async attachWorkflowEvidence(
    items: InboxItem[],
    tenantId: string,
    companyId: string | null,
    actorId: string | null,
  ): Promise<InboxItem[]> {
    try {
      const instances = await this.workflow.listInstances({ tenantId, companyId, status: 'open', limit: 500 });
      const definitions = new Map<string, WorkflowDefinition | null>();
      await Promise.all([...new Set(instances.map((instance) => instance.definitionKey))].map(async (key) => {
        definitions.set(key, await this.workflow.getDefinition(key, tenantId));
      }));
      const byAggregate = new Map(instances.map((instance) => [`${instance.aggregateType}::${instance.aggregateId}`, instance]));

      return items.map((item) => {
        const aggregateType = WORKFLOW_AGGREGATE_TYPES.get(`${item.module}::${item.kind}`);
        if (!aggregateType) return { ...item, workflowLookup: 'CONNECTED_NOT_LINKED', workflow: null };
        const instance = byAggregate.get(`${aggregateType}::${item.id}`);
        if (!instance) return { ...item, workflowLookup: 'CONNECTED_NOT_LINKED', workflow: null };
        const definition = definitions.get(instance.definitionKey);
        if (!definition) return { ...item, workflowLookup: 'DEFINITION_MISSING', workflow: null };
        return {
          ...item,
          workflowLookup: 'VERIFIED_LINK',
          workflow: buildWorkflowEvidence(item, instance, definition, this.access, actorId),
        };
      });
    } catch (error) {
      this.logger.warn(`Workflow evidence unavailable: ${(error as Error).message}`);
      return items.map((item) => ({ ...item, workflowLookup: 'UNAVAILABLE', workflow: null }));
    }
  }
}
