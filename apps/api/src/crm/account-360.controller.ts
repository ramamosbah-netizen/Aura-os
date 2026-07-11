import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ParseUuidOr404Pipe, TenantContext } from '@aura/core';
import {
  AccountService,
  ActivityService,
  ContactService,
  OpportunityService,
  QuotationService,
  type Account,
  type Activity,
  type Contact,
  type Quotation,
} from '@aura/crm';
import type { Opportunity } from '@aura/shared';
import { TenderService, type Tender } from '@aura/tendering';
import { ContractService, type Contract } from '@aura/contracts';
import { ProjectService, type Project } from '@aura/projects';
import { CustomerInvoiceService } from '@aura/finance';

// Account 360 — the customer command center. The Account is the PERSISTENT
// commercial party at the head of the deal chain; opportunities, tenders,
// quotations, contracts and projects are the TRANSACTIONS that flow through it.
// One endpoint returns everything the page needs: profile, related records with
// status + value, a commercial summary, receivables, and a synthesized timeline.

interface TimelineEntry {
  at: string;
  kind: string;
  label: string;
  href: string | null;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

@Controller('crm/accounts')
export class Account360Controller {
  constructor(
    private readonly accounts: AccountService,
    private readonly contacts: ContactService,
    private readonly opportunities: OpportunityService,
    private readonly quotations: QuotationService,
    private readonly activities: ActivityService,
    private readonly tenders: TenderService,
    private readonly contracts: ContractService,
    private readonly projects: ProjectService,
    private readonly invoices: CustomerInvoiceService,
    private readonly tenant: TenantContext,
  ) {}

  @Get(':id/summary')
  async summary(@Param('id', ParseUuidOr404Pipe) id: string): Promise<{
    account: Account;
    contacts: Contact[];
    opportunities: Opportunity[];
    tenders: Tender[];
    quotations: Quotation[];
    contracts: Contract[];
    projects: Project[];
    activities: Activity[];
    receivables: { invoiced: number; paid: number; outstanding: number; overdue: number; invoiceCount: number };
    summary: {
      pipelineValue: number;
      activeOpportunities: number;
      tenderCount: number;
      openTenders: number;
      quotationCount: number;
      contractCount: number;
      projectCount: number;
      wonValue: number;
      outstandingReceivables: number;
      health: 'new' | 'good' | 'watch';
    };
    timeline: TimelineEntry[];
  }> {
    const ctx = this.tenant.get();
    const account = await this.accounts.get(id);
    if (!account || account.tenantId !== ctx.tenantId) throw new NotFoundException(`account ${id} not found`);

    const tenantId = ctx.tenantId;
    const [contacts, opportunities, tenders, quotations, contracts, projects, activities, allInvoices] = await Promise.all([
      this.contacts.list({ tenantId, accountId: id }),
      this.opportunities.list({ tenantId, accountId: id }),
      this.tenders.list({ tenantId, accountId: id }),
      this.quotations.list({ tenantId, accountId: id }),
      this.contracts.list({ tenantId, accountId: id }),
      this.projects.list({ tenantId, accountId: id }),
      this.activities.list({ tenantId, relatedId: id }),
      // Invoices reference the customer by name snapshot (no accountId column) — match on it.
      this.invoices.list({ tenantId, limit: 2000 }),
    ]);

    const accInvoices = allInvoices.filter((i) => i.customerName === account.name && i.status !== 'cancelled');
    const today = new Date().toISOString().slice(0, 10);
    const receivables = {
      invoiced: r2(accInvoices.reduce((s, i) => s + i.total, 0)),
      paid: r2(accInvoices.reduce((s, i) => s + i.amountPaid, 0)),
      outstanding: r2(accInvoices.reduce((s, i) => s + (i.total - i.amountPaid), 0)),
      overdue: r2(
        accInvoices
          .filter((i) => i.status !== 'paid' && i.dueDate && i.dueDate < today)
          .reduce((s, i) => s + (i.total - i.amountPaid), 0),
      ),
      invoiceCount: accInvoices.length,
    };

    const openOpps = opportunities.filter((o) => o.stage !== 'won' && o.stage !== 'lost');
    const wonValue = r2(contracts.reduce((s, c) => s + c.value, 0));
    const summary = {
      pipelineValue: r2(openOpps.reduce((s, o) => s + o.value, 0)),
      activeOpportunities: openOpps.length,
      tenderCount: tenders.length,
      openTenders: tenders.filter((t) => t.status === 'draft' || t.status === 'submitted').length,
      quotationCount: quotations.length,
      contractCount: contracts.length,
      projectCount: projects.length,
      wonValue,
      outstandingReceivables: receivables.outstanding,
      health: (receivables.overdue > 0 ? 'watch' : wonValue > 0 || openOpps.length > 0 ? 'good' : 'new') as 'new' | 'good' | 'watch',
    };

    // Timeline — synthesized from the records themselves (no extra store).
    const timeline: TimelineEntry[] = [
      { at: account.createdAt, kind: 'account', label: `Account created (${account.status})`, href: null },
      ...contacts.map((c) => ({ at: c.createdAt, kind: 'contact', label: `Contact added — ${c.name}`, href: '/crm/contacts' })),
      ...opportunities.map((o) => ({
        at: o.createdAt,
        kind: 'opportunity',
        label: `Opportunity — ${o.title} (${o.stage}, AED ${o.value})`,
        href: '/crm/leads',
      })),
      ...tenders.map((t) => ({
        at: t.createdAt,
        kind: 'tender',
        label: `Tender registered — ${t.title} (${t.status}, AED ${t.value})`,
        href: `/tendering/tenders/${t.id}`,
      })),
      ...quotations.map((q) => ({
        at: q.createdAt,
        kind: 'quotation',
        label: `Quotation ${q.quoteNumber} (${q.status}, AED ${q.total})`,
        href: '/crm/quotations',
      })),
      ...contracts.map((c) => ({
        at: c.createdAt,
        kind: 'contract',
        label: `Contract awarded — ${c.title} (${c.status}, AED ${c.value})`,
        href: `/contracts/contracts/${c.id}`,
      })),
      ...projects.map((p) => ({
        at: p.createdAt,
        kind: 'project',
        label: `Project started — ${p.title} (${p.status})`,
        href: `/projects/projects/${p.id}`,
      })),
      ...accInvoices.map((i) => ({
        at: i.issueDate,
        kind: 'invoice',
        label: `Invoice ${i.invoiceNumber} (${i.status}, AED ${i.total})`,
        href: '/finance/ar',
      })),
    ]
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 60);

    return { account, contacts, opportunities, tenders, quotations, contracts, projects, activities, receivables, summary, timeline };
  }
}
