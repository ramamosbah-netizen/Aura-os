import { Controller, Get, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { AccountService, ActivityService, ContactService, OpportunityService, QuotationService } from '@aura/crm';
import { CustomerInvoiceService, balanceOf } from '@aura/finance';
import { opportunityAttention } from '@aura/shared';

// Relationship Intelligence — the CRM alert engine. It turns the data we already
// hold into a single ranked list of "act on this now" signals: deals with no
// next step (the Next-Action Invariant), relationships going quiet, deals with
// no decision-maker, quotes about to expire, and overdue receivables. Read-only;
// no new storage.

type AlertKind = 'no-next-action' | 'stalled-opportunity' | 'inactive-account' | 'no-decision-maker' | 'expiring-quote' | 'overdue-ar';
type Severity = 'high' | 'medium' | 'low';

interface Alert {
  id: string;
  kind: AlertKind;
  severity: Severity;
  entity: 'account' | 'opportunity' | 'quotation' | 'invoice';
  entityId: string;
  name: string;
  reason: string;
  recommendation: string;
  href: string;
  at: string | null;
}

const GAP_TEXT: Record<string, string> = {
  'no-next-action': 'no next step', 'no-owner': 'no owner', 'no-due-date': 'no due date', overdue: 'next step overdue',
};
const SEV_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

@Controller('crm/intelligence')
export class RelationshipIntelligenceController {
  constructor(
    private readonly accounts: AccountService,
    private readonly opportunities: OpportunityService,
    private readonly activities: ActivityService,
    private readonly contacts: ContactService,
    private readonly quotations: QuotationService,
    private readonly customerInvoices: CustomerInvoiceService,
    private readonly tenant: TenantContext,
  ) {}

  /** GET /crm/intelligence/alerts — ranked cross-signal relationship alerts. */
  @Get('alerts')
  async alerts(
    @Query('accountStaleDays') accountStaleDays?: string,
    @Query('oppStaleDays') oppStaleDays?: string,
    @Query('quoteExpiryDays') quoteExpiryDays?: string,
  ): Promise<{ counts: Record<string, number>; alerts: Alert[]; thresholds: Record<string, number> }> {
    const tenantId = this.tenant.get().tenantId;
    const acctStale = Number(accountStaleDays) > 0 ? Number(accountStaleDays) : 60;
    const oppStale = Number(oppStaleDays) > 0 ? Number(oppStaleDays) : 14;
    const quoteWindow = Number(quoteExpiryDays) > 0 ? Number(quoteExpiryDays) : 7;

    const [accounts, opportunities, activities, contacts, quotations, invoices] = await Promise.all([
      this.accounts.list({ tenantId, limit: 2000 }),
      this.opportunities.list({ tenantId, limit: 5000 }),
      this.activities.list({ tenantId, limit: 5000 }),
      this.contacts.list({ tenantId, limit: 5000 }),
      this.quotations.list({ tenantId, limit: 5000 }),
      this.customerInvoices.list({ tenantId, limit: 5000 }),
    ]);
    // Customer invoices carry only a name snapshot — map it back to the account for a deep link.
    const accountByName = new Map(accounts.map((a) => [a.name, a.id] as const));

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const daysSince = (iso: string | null): number | null =>
      iso ? Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000) : null;

    // Last touch per related record, from the activity stream.
    const lastByRelated = new Map<string, string>();
    for (const a of activities) {
      if (!a.relatedId) continue;
      const at = a.completedAt ?? a.createdAt;
      const prev = lastByRelated.get(a.relatedId);
      if (!prev || at > prev) lastByRelated.set(a.relatedId, at);
    }
    // Accounts that have a decision-maker among their stakeholders.
    const accountsWithDM = new Set(
      contacts.filter((c) => c.stakeholderRole === 'decision_maker' && c.accountId).map((c) => c.accountId as string),
    );

    const alerts: Alert[] = [];
    const openOpps = opportunities.filter((o) => o.stage !== 'won' && o.stage !== 'lost');

    // 1. Next-Action Invariant breaches (reuses the shared predicate from #78).
    for (const o of openOpps) {
      const att = opportunityAttention(o, now);
      if (att.needsAttention) {
        alerts.push({
          id: `no-next-action:${o.id}`, kind: 'no-next-action',
          severity: att.gaps.includes('overdue') ? 'high' : 'medium',
          entity: 'opportunity', entityId: o.id, name: o.title,
          reason: att.gaps.map((g) => GAP_TEXT[g]).join(', '),
          recommendation: 'Set a next step, owner and due date.',
          href: `/crm/opportunities/${o.id}`, at: o.nextActionDueDate,
        });
      }
    }

    // 2. Open deals gone quiet — the real revenue risk.
    for (const o of openOpps) {
      const last = lastByRelated.get(o.id) ?? null;
      const ds = daysSince(last);
      if (last === null || (ds !== null && ds >= oppStale)) {
        alerts.push({
          id: `stalled-opportunity:${o.id}`, kind: 'stalled-opportunity',
          severity: ds !== null && ds >= oppStale * 2 ? 'high' : 'medium',
          entity: 'opportunity', entityId: o.id, name: o.title,
          reason: last === null ? 'no activity ever logged' : `no activity in ${ds} days`,
          recommendation: 'Log a touchpoint or book the next meeting.',
          href: `/crm/opportunities/${o.id}`, at: last,
        });
      }
    }

    // 3. Open deals whose account has no decision-maker mapped.
    for (const o of openOpps) {
      if (o.accountId && !accountsWithDM.has(o.accountId)) {
        alerts.push({
          id: `no-decision-maker:${o.id}`, kind: 'no-decision-maker', severity: 'medium',
          entity: 'opportunity', entityId: o.id, name: o.title,
          reason: 'no decision-maker identified on the account',
          recommendation: 'Map the decision-maker in the account’s stakeholders.',
          href: `/crm/opportunities/${o.id}`, at: null,
        });
      }
    }

    // 4. Accounts with live business gone quiet.
    for (const acc of accounts) {
      if (acc.status === 'inactive' || acc.status === 'dormant') continue;
      const last = lastByRelated.get(acc.id) ?? null;
      const ds = daysSince(last);
      if (last === null || (ds !== null && ds >= acctStale)) {
        alerts.push({
          id: `inactive-account:${acc.id}`, kind: 'inactive-account', severity: 'low',
          entity: 'account', entityId: acc.id, name: acc.name,
          reason: last === null ? 'no activity ever logged' : `no activity in ${ds} days`,
          recommendation: 'Reach out to keep the relationship warm.',
          href: `/crm/accounts/${acc.id}`, at: last,
        });
      }
    }

    // 5. Live quotes expiring soon (or already lapsed) still sitting with the client.
    for (const q of quotations) {
      if (q.status !== 'sent' || !q.validUntil) continue;
      const dueIn = Math.floor((new Date(q.validUntil).getTime() - now.getTime()) / 86400000);
      if (q.validUntil.slice(0, 10) < today) {
        alerts.push({
          id: `expiring-quote:${q.id}`, kind: 'expiring-quote', severity: 'high',
          entity: 'quotation', entityId: q.id, name: `${q.quoteNumber} · ${q.customerName}`,
          reason: `quote expired ${Math.abs(dueIn)} days ago`,
          recommendation: 'Chase the decision or re-issue with a new validity.',
          href: '/crm/quotations', at: q.validUntil,
        });
      } else if (dueIn <= quoteWindow) {
        alerts.push({
          id: `expiring-quote:${q.id}`, kind: 'expiring-quote', severity: 'medium',
          entity: 'quotation', entityId: q.id, name: `${q.quoteNumber} · ${q.customerName}`,
          reason: `quote expires in ${dueIn} day${dueIn === 1 ? '' : 's'}`,
          recommendation: 'Follow up before it lapses.',
          href: '/crm/quotations', at: q.validUntil,
        });
      }
    }

    // 6. Overdue receivables — issued/part-paid invoices past their due date with a balance.
    for (const inv of invoices) {
      if (inv.status !== 'issued' && inv.status !== 'partially_paid') continue;
      if (!inv.dueDate || inv.dueDate.slice(0, 10) >= today) continue;
      const balance = balanceOf(inv);
      if (balance <= 0) continue;
      const daysOverdue = daysSince(inv.dueDate) ?? 0;
      const accountId = accountByName.get(inv.customerName);
      alerts.push({
        id: `overdue-ar:${inv.id}`, kind: 'overdue-ar',
        severity: daysOverdue >= 30 ? 'high' : 'medium',
        entity: accountId ? 'account' : 'invoice',
        entityId: accountId ?? inv.id,
        name: `${inv.invoiceNumber} · ${inv.customerName}`,
        reason: `${inv.currency ?? 'AED'} ${balance.toLocaleString()} overdue ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}`,
        recommendation: 'Chase payment or send a reminder.',
        href: accountId ? `/crm/accounts/${accountId}` : '/finance/ar-aging',
        at: inv.dueDate,
      });
    }

    // Rank: severity first, then soonest relevant date.
    alerts.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || (a.at ?? '9999').localeCompare(b.at ?? '9999'));

    const counts: Record<string, number> = { total: alerts.length };
    for (const a of alerts) counts[a.kind] = (counts[a.kind] ?? 0) + 1;

    return { counts, alerts, thresholds: { accountStaleDays: acctStale, oppStaleDays: oppStale, quoteExpiryDays: quoteWindow } };
  }
}
