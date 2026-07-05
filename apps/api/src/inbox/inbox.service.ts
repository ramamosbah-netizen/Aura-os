import { Injectable } from '@nestjs/common';
import { TenderService } from '@aura/tendering';
import { VariationService } from '@aura/projects';
import { PurchaseOrderService, PurchaseRequestService } from '@aura/procurement';
import { InvoiceService } from '@aura/finance';
import { SubcontractsService } from '@aura/subcontracts';
import { HrService } from '@aura/hr';
import { QualityService } from '@aura/quality';

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
  constructor(
    private readonly prs: PurchaseRequestService,
    private readonly pos: PurchaseOrderService,
    private readonly invoices: InvoiceService,
    private readonly subcontracts: SubcontractsService,
    private readonly tenders: TenderService,
    private readonly variations: VariationService,
    private readonly hr: HrService,
    private readonly quality: QualityService,
  ) {}

  async list(tenantId: string): Promise<InboxItem[]> {
    const [prs, pos, invoices, subcontracts, claims, tenders, variations, leaves, timesheets, expenseClaims, advances, mars, employees] =
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
      ]);

    const employeeName = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));
    const who = (id: string): string => employeeName.get(id) ?? 'Employee';

    const items: InboxItem[] = [];

    for (const pr of prs)
      if (pr.status === 'draft')
        items.push({
          id: pr.id, module: 'Procurement', kind: 'Purchase Request', title: pr.title,
          detail: pr.projectName ? `Project: ${pr.projectName}` : (pr.reference ?? ''),
          action: 'Approve', href: '/procurement/purchase-requests', value: pr.value, createdAt: pr.createdAt,
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
          action: 'Activate', href: '/subcontracts/subcontracts', value: sc.value, createdAt: sc.createdAt,
        });

    const subTitle = new Map(subcontracts.map((sc) => [sc.id, sc.title]));
    for (const cl of claims) {
      const title = `Claim #${cl.claimNumber} — ${subTitle.get(cl.subcontractId) ?? 'Subcontract'}`;
      if (cl.status === 'draft')
        items.push({
          id: cl.id, module: 'Subcontracts', kind: 'Claim', title,
          detail: 'Work-completed claim awaiting certification',
          action: 'Certify', href: '/subcontracts/subcontracts', value: cl.workCompletedValue, createdAt: cl.createdAt,
        });
      else if (cl.status === 'certified')
        items.push({
          id: cl.id, module: 'Subcontracts', kind: 'Claim', title,
          detail: 'Certified claim awaiting payment',
          action: 'Pay', href: '/subcontracts/subcontracts', value: cl.netCertifiedValue, createdAt: cl.createdAt,
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
          action: 'Approve', href: '/projects/variations', value: v.signedAmount, createdAt: v.createdAt,
        });

    for (const l of leaves)
      if (l.status === 'pending')
        items.push({
          id: l.id, module: 'HR', kind: 'Leave Request', title: `${who(l.employeeId)} — ${l.leaveType}`,
          detail: `${l.startDate} → ${l.endDate}`,
          action: 'Approve', href: '/hr/control', value: null, createdAt: l.createdAt,
        });

    for (const ts of timesheets)
      if (ts.status === 'submitted')
        items.push({
          id: ts.id, module: 'HR', kind: 'Timesheet', title: `${who(ts.employeeId)} — ${ts.date}`,
          detail: `${ts.hours}h${ts.overtime ? ` + ${ts.overtime}h OT` : ''}`,
          action: 'Approve', href: '/hr/timesheets', value: null, createdAt: ts.createdAt,
        });

    for (const ec of expenseClaims)
      if (ec.status === 'submitted')
        items.push({
          id: ec.id, module: 'HR', kind: 'Expense Claim', title: `${who(ec.employeeId)} — ${ec.category}`,
          detail: ec.description,
          action: 'Approve', href: '/hr/expense-claims', value: ec.amount, createdAt: ec.createdAt,
        });

    for (const sa of advances)
      if (sa.status === 'requested')
        items.push({
          id: sa.id, module: 'HR', kind: 'Staff Advance', title: who(sa.employeeId),
          detail: 'Salary advance request',
          action: 'Approve', href: '/hr/staff-advances', value: sa.amount, createdAt: sa.createdAt,
        });

    for (const mar of mars)
      if (mar.status === 'submitted')
        items.push({
          id: mar.id, module: 'Quality', kind: 'Material Approval', title: mar.materialName,
          detail: mar.projectName ? `Project: ${mar.projectName}` : mar.reference,
          action: 'Review', href: '/quality/material-approvals', value: null, createdAt: mar.createdAt,
        });

    // Newest first; items without a timestamp sink to the end.
    return items.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  }
}
