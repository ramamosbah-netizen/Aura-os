import { Injectable, Logger } from '@nestjs/common';
import { businessDate, type OpportunityStage } from '@aura/shared';
import { OpportunityService, execOpportunityOf, executiveCrm } from '@aura/crm';
import { ContractService } from '@aura/contracts';
import { PurchaseOrderService } from '@aura/procurement';
import { CustomerInvoiceService } from '@aura/finance';
import {
  CbsService, CloseoutReadinessService, CostLedgerService, DelayEotService, ProjectHealthService, ProjectIssueService,
  ProjectRiskService, ProjectService, ResourceBookingService, ScheduleService, VariationService, countableActual,
  type CostTransaction,
} from '@aura/projects';
import { projectRevenueRecognition, type ProjectRevenueRecognition } from '../finance/revenue-recognition.read';
import { readEveryPage } from '../common/complete-read';
import {
  type DecisionExclusion, type DecisionFigure, type DecisionId, type DecisionMeta, type DecisionRecord, EXECUTIVE_DECISIONS, type RecordUnit, type ExecutiveDecision, type ExecutiveDecisionDetail,
  type ExecutiveDecisionsView, inBase, measured, metaOf, sum, summarise, unavailable,
} from './executive-decisions';

/**
 * The money every figure is in. A literal for now and in ONE place: base currency is company
 * configuration to come (CC-06), and no figure here sums two currencies — a record in another
 * currency is reported as an exclusion, never converted at a rate nobody governed.
 */
const BASE_CURRENCY = 'AED';

/**
 * Read no population silently short. Every store here defaults to 100–500 rows: an executive figure
 * over "all opportunities" that was over the first 100. Opportunities (MGT-01, F-06) are read WHOLE,
 * page after page to the store's own total. Every other source still asks for this many explicitly,
 * and if a read comes back FULL its decision says so.
 */
const READ_CAP = 100_000;

/** Projects whose work is in progress — the ones live health, resources and revenue are about. */
const DELIVERY_STATUSES = new Set(['active', 'testing', 'handover', 'closeout']);
const CLOSING_STATUSES = new Set(['handover', 'closeout']);
const OPEN_STAGES: readonly OpportunityStage[] = ['qualification', 'proposal', 'negotiation'];
/** Committed to a supplier and not yet fully received. Draft and pending approval commit nothing. */
const OPEN_PO_STATUSES = new Set(['approved', 'issued', 'partially_received']);

type Reader = (tenantId: string, asOf: string, meta: DecisionMeta) => Promise<ExecutiveDecision>;

interface Context {
  projects: Array<{ id: string; title: string; status: string; value: number; contractId: string | null; tenantId: string }>;
  projectCapped: boolean;
}

@Injectable()
export class ExecutiveDecisionsService {
  private readonly logger = new Logger('ExecutiveDecisions');

  constructor(
    private readonly opportunities: OpportunityService,
    private readonly contracts: ContractService,
    private readonly purchaseOrders: PurchaseOrderService,
    private readonly invoices: CustomerInvoiceService,
    private readonly projects: ProjectService,
    private readonly health: ProjectHealthService,
    private readonly schedules: ScheduleService,
    private readonly bookings: ResourceBookingService,
    private readonly cbs: CbsService,
    private readonly ledger: CostLedgerService,
    private readonly risks: ProjectRiskService,
    private readonly issues: ProjectIssueService,
    private readonly variations: VariationService,
    private readonly delays: DelayEotService,
    private readonly closeout: CloseoutReadinessService,
  ) {}

  /** Every decision, read in one pass at one time — the tiles. */
  async view(tenantId: string): Promise<ExecutiveDecisionsView> {
    const asOf = new Date().toISOString();
    const ctx = await this.context(tenantId);
    const decisions = await Promise.all(EXECUTIVE_DECISIONS.map((meta) => this.read(meta, tenantId, asOf, ctx)));
    return { asOf, currency: BASE_CURRENCY, decisions: decisions.map(summarise) };
  }

  /** One decision with the exact records behind it — the drilldown. Null for an unknown id. */
  async detail(tenantId: string, id: string): Promise<ExecutiveDecisionDetail | null> {
    const meta = metaOf(id);
    if (!meta) return null;
    const asOf = new Date().toISOString();
    return { ...(await this.read(meta, tenantId, asOf, await this.context(tenantId))), currency: BASE_CURRENCY };
  }

  private async context(tenantId: string): Promise<Context> {
    const rows = await this.projects.list({ tenantId, limit: READ_CAP });
    return { projects: rows.filter((p) => p.tenantId === tenantId), projectCapped: rows.length >= READ_CAP };
  }

  /**
   * A reader that fails reports the decision as unavailable WITH the failure — never a zero. A zero
   * would tell the executive nothing is wrong precisely when the system could not look.
   */
  private async read(meta: DecisionMeta, tenantId: string, asOf: string, ctx: Context): Promise<ExecutiveDecision> {
    const reader = this.readers(ctx)[meta.id];
    try {
      return await reader(tenantId, asOf, meta);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`${meta.id} could not be read for ${tenantId}: ${message}`);
      return unavailable(meta, asOf, `It could not be read just now: ${message}`, 'see the reason');
    }
  }

  private capped(rows: number, what: string): DecisionExclusion {
    return { count: rows >= READ_CAP ? 1 : 0, reason: `the ${what} read returned its full cap of ${READ_CAP} rows — more may exist and are not counted` };
  }

  private readers(ctx: Context): Record<DecisionId, Reader> {
    const delivery = ctx.projects.filter((p) => DELIVERY_STATUSES.has(p.status));
    const projectName = new Map(ctx.projects.map((p) => [p.id, p.title]));
    const name = (projectId: string | null | undefined) => (projectId && projectName.get(projectId)) || 'Unknown project';

    return {
      // ── MGT-01 ───────────────────────────────────────────────────────────────────────────────
      pipeline: async (tenantId, asOf, meta) => {
        // F-06 — the whole book, not its newest N: every page to the store's own total.
        const read = await readEveryPage((page) => this.opportunities.listPaged({ tenantId }, page));
        const all = read.items.filter((o) => o.tenantId === tenantId);
        const open = all.filter((o) => OPEN_STAGES.includes(o.stage));
        // The win rate is the Executive CRM read's own — the same function over the same deals at the
        // same moment — so the pipeline workspace and this tile cannot state two win rates for one
        // business.
        const { decided } = executiveCrm(all.map(execOpportunityOf), 365, new Date(asOf), read.settled);
        const settled = decided.won + decided.lost;
        const figures: DecisionFigure[] = [
          { label: 'Open pipeline', value: sum(open.map((o) => o.value || 0)), unit: 'currency' },
          { label: 'Open deals', value: open.length, unit: 'count' },
        ];
        if (decided.winRate !== null) figures.push({ label: 'Win rate, last 365 days', value: decided.winRate, unit: 'percent' as const });
        return measured(meta, asOf, {
          figures,
          records: open.map((o) => rec(o.id, o.accountName ? `${o.title} · ${o.accountName}` : o.title, `/crm/opportunities/${o.id}`, o.value || 0, 'currency', o.stage)),
          of: 'open opportunities (qualification, proposal, negotiation)',
          excluded: read.settled ? [] : [{
            count: Math.max(1, Math.abs(read.total - read.items.length)),
            reason: 'opportunities written or removed while the book was being read — it would not hold still; read it again',
          }],
          source: 'CRM opportunities — every one on record, read whole',
          basis: settled > 0
            ? `Win rate = ${decided.won} won of ${settled} decided (won or lost) whose last update falls in the last 365 days — the Executive CRM read's own figure. An opportunity's value carries no currency of its own and is read as ${BASE_CURRENCY}.`
            : `No opportunity was won or lost in the last 365 days, so no win rate is stated. An opportunity's value is read as ${BASE_CURRENCY}.`,
        });
      },

      // ── MGT-02 ───────────────────────────────────────────────────────────────────────────────
      backlog: async (tenantId, asOf, meta) => {
        const contracts = (await this.contracts.list({ tenantId, status: 'active', limit: READ_CAP })).filter((c) => c.tenantId === tenantId);
        const invoices = (await this.invoices.list({ tenantId, limit: READ_CAP })).filter((i) => i.tenantId === tenantId);
        const counted = contracts.filter((c) => inBase(c.currency, BASE_CURRENCY));
        const records = counted.map((c) => {
          const billed = sum(invoices
            .filter((i) => i.contractRef === c.id && i.status !== 'draft' && i.status !== 'cancelled' && inBase(i.currency, BASE_CURRENCY))
            .map((i) => i.subtotal));
          const remaining = sum([c.value, -billed]);
          return rec(c.id, c.reference ? `${c.reference} · ${c.title}` : c.title, `/contracts/contracts/${c.id}`, remaining, 'currency', c.status,
            `awarded ${money(c.value)} · billed ${money(billed)} ex-VAT`);
        });
        return measured(meta, asOf, {
          figures: [
            { label: 'Still to bill', value: sum(records.map((r) => r.value ?? 0)), unit: 'currency' },
            { label: 'Active contracts', value: records.length, unit: 'count' },
          ],
          records, of: 'active contracts',
          excluded: [
            { count: contracts.length - counted.length, reason: `active contracts in a currency other than ${BASE_CURRENCY} — not summed with ${BASE_CURRENCY} at an ungoverned rate` },
            this.capped(contracts.length, 'contracts'),
          ],
          source: 'Contracts (awarded value) and customer invoices (billed, ex-VAT)',
          basis: 'Still to bill = awarded value less invoices issued against the contract (not drafts, not cancelled). It is billing backlog, not earned value.',
        });
      },

      // ── MGT-03 ───────────────────────────────────────────────────────────────────────────────
      'project-health': async (tenantId, asOf, meta) => {
        const assessed = await Promise.all(delivery.map(async (p) => {
          try {
            return { p, h: await this.health.assess(tenantId, p.id) };
          } catch {
            return { p, h: null };
          }
        }));
        const read = assessed.filter((a) => a.h !== null) as Array<{ p: Context['projects'][number]; h: NonNullable<(typeof assessed)[number]['h']> }>;
        const atRisk = read.filter((a) => a.h.severity === 'AT_RISK' || a.h.severity === 'CRITICAL');
        const watch = read.filter((a) => a.h.severity === 'WATCH');
        const partial = read.filter((a) => a.h.coverage === 'PARTIAL');
        return measured(meta, asOf, {
          figures: [
            { label: 'At risk or critical', value: atRisk.length, unit: 'count' },
            { label: 'Watch', value: watch.length, unit: 'count' },
            { label: 'Health only partly readable', value: partial.length, unit: 'count' },
          ],
          records: read.map(({ p, h }) => rec(p.id, p.title, `/project/${p.id}`, null, null, h.severity,
            [h.concerns[0]?.reason, h.coverage === 'PARTIAL' ? `${h.unknown.length} signal(s) unreadable` : null].filter(Boolean).join(' · ') || null)),
          of: `projects in delivery (${[...DELIVERY_STATUSES].join(', ')})`,
          excluded: [{ count: assessed.length - read.length, reason: 'projects whose health could not be assessed' }],
          source: 'Project health assessment (every declared signal across Projects, Quality, HSE, Engineering, Procurement, Commissioning)',
          basis: 'A project is never reported CLEAR on what could not be read: partial coverage is counted beside the verdict.',
        });
      },

      // ── MGT-04 ───────────────────────────────────────────────────────────────────────────────
      schedule: async (tenantId, asOf, meta) => {
        const plans = (await this.schedules.list(tenantId)).filter((s) => s.tenantId === tenantId);
        const baselined = plans.filter((s) => s.tasks.some((t) => t.baselineEnd));
        const records: DecisionRecord[] = [];
        for (const s of baselined) {
          for (const t of s.tasks) {
            if (!t.baselineEnd || !t.plannedEnd || t.plannedEnd <= t.baselineEnd) continue;
            const days = Math.round((Date.parse(t.plannedEnd) - Date.parse(t.baselineEnd)) / 86_400_000);
            records.push(rec(t.id ?? `${s.id}:${t.name}`, `${name(s.projectId)} · ${t.name}`, `/projects/schedule?projectId=${s.projectId}`, days, 'days', 'later than baseline',
              `baseline ${t.baselineEnd} → planned ${t.plannedEnd}`));
          }
        }
        records.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
        return measured(meta, asOf, {
          figures: [
            { label: 'Activities later than baseline', value: records.length, unit: 'count' },
            { label: 'Largest slip', value: records[0]?.value ?? 0, unit: 'days' },
          ],
          records, of: 'activities finishing later than their baseline, in baselined schedules',
          excluded: [{ count: plans.length - baselined.length, reason: 'schedules with no baseline — their slippage cannot be measured' }],
          source: 'Project schedules and their baselines',
          basis: 'Calendar days between the baselined and the planned finish of each activity. SPI is not stated: no time-phased planned value exists to divide by.',
        });
      },

      // ── MGT-05 ───────────────────────────────────────────────────────────────────────────────
      resources: async (tenantId, asOf, meta) => {
        const views = (await Promise.all(delivery.map(async (p) => (await this.bookings.listProject(tenantId, p.id)).map((v) => ({ p, v }))))).flat();
        const held = views.filter(({ v }) => v.booking.status === 'held');
        const conflicted = held.filter(({ v }) => v.assessment.feasibility === 'CONFLICTED');
        const unknown = held.filter(({ v }) => v.assessment.feasibility === 'UNKNOWN');
        return measured(meta, asOf, {
          figures: [
            { label: 'Commitments in conflict', value: conflicted.length, unit: 'count' },
            { label: 'Capacity unknown', value: unknown.length, unit: 'count' },
            { label: 'Held commitments', value: held.length, unit: 'count' },
          ],
          records: held.map(({ p, v }) => rec(v.booking.id, `${p.title} · ${v.booking.resource.resourceType} ${v.booking.resource.canonicalResourceId}`,
            `/projects/schedule?projectId=${p.id}`, v.booking.quantity, 'quantity', v.assessment.feasibility, `${v.booking.from} → ${v.booking.to}`)),
          of: 'resource commitments held on projects in delivery',
          source: 'Resource bookings and their live feasibility',
          basis: 'Unknown capacity is reported as unknown, never as available.',
        });
      },

      // ── MGT-06 ───────────────────────────────────────────────────────────────────────────────
      procurement: async (tenantId, asOf, meta) => {
        const all = (await this.purchaseOrders.list({ tenantId, limit: READ_CAP })).filter((po) => po.tenantId === tenantId);
        const open = all.filter((po) => OPEN_PO_STATUSES.has(po.status));
        const counted = open.filter((po) => inBase(po.currency, BASE_CURRENCY));
        return measured(meta, asOf, {
          figures: [
            { label: 'Committed, not yet received', value: sum(counted.map((po) => po.value || 0)), unit: 'currency' },
            { label: 'Open purchase orders', value: counted.length, unit: 'count' },
          ],
          records: counted.map((po) => rec(po.id, `${po.reference ?? po.title} · ${po.supplierName ?? 'supplier'}`, `/procurement/purchase-orders/${po.id}`, po.value || 0, 'currency', po.status,
            po.projectId ? name(po.projectId) : null)),
          of: `purchase orders approved, issued or part-received`,
          excluded: [
            { count: open.length - counted.length, reason: `open orders in a currency other than ${BASE_CURRENCY} — not summed at an ungoverned rate` },
            this.capped(all.length, 'purchase orders'),
          ],
          source: 'Procurement purchase orders',
          basis: 'Order value as committed. A fully received order is no longer exposure; drafts and orders awaiting approval commit nothing yet.',
        });
      },

      // ── MGT-07 ───────────────────────────────────────────────────────────────────────────────
      revenue: async (tenantId, asOf, meta) => {
        const recognitions = await this.recognitions(tenantId, delivery);
        return measured(meta, asOf, {
          figures: [
            { label: 'Revenue recognised', value: sum(recognitions.map(({ r }) => r.recognizedRevenue)), unit: 'currency' },
            { label: 'Earned, not yet billed', value: sum(recognitions.map(({ r }) => r.underBilling)), unit: 'currency' },
            { label: 'Billed ahead of earning', value: sum(recognitions.map(({ r }) => r.overBilling)), unit: 'currency' },
          ],
          records: recognitions.map(({ r }) => rec(r.projectId, r.projectTitle, `/project/${r.projectId}/controls?tab=cost`, r.recognizedRevenue, 'currency', `${r.percentComplete}% complete`,
            `billed ${money(r.billedToDate)} · contract ${money(r.contractValue)}`)),
          of: 'projects in delivery',
          source: 'Revenue recognition (IFRS-15 cost-to-cost) — the same computation Finance reports',
          basis: 'Percent complete = cost incurred ÷ CBS forecast at completion. Where a project\'s forecast was never revised it equals its budget, and the percentage is only as good as that.',
        });
      },

      // ── MGT-08 ───────────────────────────────────────────────────────────────────────────────
      cost: async (tenantId, asOf, meta) => {
        const txns = await this.ledger.list({ tenantId, limit: READ_CAP });
        const byProject = new Map<string, { actual: number[]; committed: number[] }>();
        let unknown = 0;
        for (const t of txns) {
          if (t.tenantId !== tenantId || (t.type !== 'actual' && t.type !== 'committed')) continue;
          const amount = countable(t);
          if (amount == null) { unknown += 1; continue; }
          const cell = byProject.get(t.projectId) ?? { actual: [], committed: [] };
          (t.type === 'actual' ? cell.actual : cell.committed).push(amount);
          byProject.set(t.projectId, cell);
        }
        const records = [...byProject.entries()].map(([projectId, c]) =>
          rec(projectId, name(projectId), `/project/${projectId}/controls?tab=cost`, sum(c.actual), 'currency', null, `committed ${money(sum(c.committed))}`));
        return measured(meta, asOf, {
          figures: [
            { label: 'Actual cost', value: sum(records.map((r) => r.value ?? 0)), unit: 'currency' },
            { label: 'Committed', value: sum([...byProject.values()].map((c) => sum(c.committed))), unit: 'currency' },
          ],
          records, of: 'projects with posted cost',
          excluded: [{ count: unknown, reason: 'cost postings whose base-currency amount is unknown (no FX provenance)' }, this.capped(txns.length, 'cost ledger')],
          source: 'The project Cost Ledger (append-only)',
          basis: 'Only what a source has posted. Purchases, subcontracts, material issues and plant that were never coded to a cost line are absent (COST-CODE-01).',
        });
      },

      // ── MGT-09 ───────────────────────────────────────────────────────────────────────────────
      margin: async (tenantId, asOf, meta) => {
        const recognitions = await this.recognitions(tenantId, delivery);
        const onerous = recognitions.filter(({ r }) => r.isOnerous);
        const unrevised = recognitions.filter(({ s }) => s.totalForecast === s.totalBudget);
        return measured(meta, asOf, {
          figures: [
            { label: 'Forecast margin', value: sum(recognitions.map(({ r }) => r.contractValue - r.estimatedTotalCost)), unit: 'currency' },
            { label: 'Projects forecast to lose money', value: onerous.length, unit: 'count' },
            { label: 'Expected loss', value: sum(onerous.map(({ r }) => r.expectedTotalLoss)), unit: 'currency' },
          ],
          records: recognitions.map(({ r, s }) => rec(r.projectId, r.projectTitle, `/project/${r.projectId}/controls?tab=cost`, sum([r.contractValue, -r.estimatedTotalCost]), 'currency',
            r.isOnerous ? 'loss-making' : 'profitable', `contract ${money(r.contractValue)} · forecast cost ${money(r.estimatedTotalCost)}${s.totalForecast === s.totalBudget ? ' · forecast never revised' : ''}`)),
          of: 'projects in delivery',
          source: 'Revenue recognition — contract value against the CBS forecast at completion',
          basis: `${unrevised.length} of ${recognitions.length} project(s) have a forecast equal to their budget — never revised — so their margin is the budgeted one, not a forecast.`,
        });
      },

      // ── MGT-10 ───────────────────────────────────────────────────────────────────────────────
      cash: async (tenantId, asOf, meta) => {
        const all = (await this.invoices.list({ tenantId, limit: READ_CAP })).filter((i) => i.tenantId === tenantId);
        const open = all.filter((i) => i.status === 'issued' || i.status === 'partially_paid');
        const counted = open.filter((i) => inBase(i.currency, BASE_CURRENCY));
        const today = businessDate();
        const records = counted.map((i) => {
          const outstanding = sum([i.total, -i.amountPaid]);
          const late = !!i.dueDate && i.dueDate < today;
          return rec(i.id, `${i.invoiceNumber} · ${i.customerName}`, `/finance/customer-invoices/${i.id}`, outstanding, 'currency', late ? 'overdue' : i.status, i.dueDate ? `due ${i.dueDate}` : 'no due date');
        });
        return measured(meta, asOf, {
          figures: [
            { label: 'Receivable', value: sum(records.map((r) => r.value ?? 0)), unit: 'currency' },
            { label: 'Overdue', value: sum(records.filter((r) => r.status === 'overdue').map((r) => r.value ?? 0)), unit: 'currency' },
            { label: 'Open invoices', value: records.length, unit: 'count' },
          ],
          records, of: 'issued and part-paid customer invoices',
          excluded: [
            { count: open.length - counted.length, reason: `open invoices in a currency other than ${BASE_CURRENCY} — not summed at an ungoverned rate` },
            this.capped(all.length, 'customer invoices'),
          ],
          source: 'Customer invoices and the receipts recorded against them',
          basis: 'Cash in the bank is NOT shown: customer invoices and receipts never reach the general ledger (AR-GL-01), so the ledger\'s bank balance is not the cash the business has.',
        });
      },

      // ── MGT-11 ───────────────────────────────────────────────────────────────────────────────
      risks: async (tenantId, asOf, meta) => {
        const risks = (await this.risks.list({ openOnly: true, limit: READ_CAP })).filter((r) => r.tenantId === tenantId && (r.severity === 'HIGH' || r.severity === 'CRITICAL'));
        const issues = (await this.issues.list({ openOnly: true, limit: READ_CAP })).filter((i) => i.tenantId === tenantId && (i.severity === 'critical' || i.severity === 'major'));
        return measured(meta, asOf, {
          figures: [
            { label: 'High or critical risks open', value: risks.length, unit: 'count' },
            { label: 'Major or critical issues open', value: issues.length, unit: 'count' },
          ],
          records: [
            ...risks.map((r) => rec(r.id, `Risk · ${name(r.projectId)} · ${r.title}`, `/project/${r.projectId}`, null, null, r.severity, r.status)),
            ...issues.map((i) => rec(i.id, `Issue · ${name(i.projectId)} · ${i.title}`, `/project/${i.projectId}`, null, null, i.severity, i.status)),
          ],
          of: 'open high/critical risks and open major/critical issues',
          source: 'Project risk and issue registers',
        });
      },

      // ── MGT-12 ───────────────────────────────────────────────────────────────────────────────
      variations: async (tenantId, asOf, meta) => {
        const pending = (await this.variations.list({ tenantId, status: 'submitted', limit: READ_CAP })).filter((v) => v.tenantId === tenantId);
        const eots = (await this.delays.listEotClaims({})).filter((c) => c.tenantId === tenantId && (c.status === 'submitted' || c.status === 'under_review'));
        const net = sum(pending.map((v) => (v.type === 'omission' ? -v.amount : v.amount)));
        return measured(meta, asOf, {
          figures: [
            { label: 'Variations awaiting decision', value: pending.length, unit: 'count' },
            { label: 'Their net value', value: net, unit: 'currency' },
            { label: 'Time claims awaiting decision', value: eots.length, unit: 'count' },
          ],
          records: [
            ...pending.map((v) => rec(v.id, `Variation · ${name(v.projectId)} · ${v.reference ?? v.title}`, `/project/${v.projectId}/controls?tab=commercial`,
              v.type === 'omission' ? -v.amount : v.amount, 'currency', v.status, v.type)),
            ...eots.map((c) => rec(c.id, `Time claim #${c.claimNumber} · ${name(c.projectId)} · ${c.title}`, `/project/${c.projectId}/controls?tab=delivery`,
              c.submittedDays, 'days', c.status, `${c.submittedDays} day(s) claimed`)),
          ],
          of: 'variations submitted for decision and extension-of-time claims submitted or under review',
          source: 'Project variations and EOT claims',
          basis: 'A variation approved internally is not client approval — these are waiting for the internal decision.',
        });
      },

      // ── MGT-13 ───────────────────────────────────────────────────────────────────────────────
      forecast: async (tenantId, asOf, meta) => {
        const today = businessDate();
        const plans = (await this.schedules.list(tenantId)).filter((s) => s.tenantId === tenantId && s.baselineSetAt);
        const forecasts = await Promise.all(plans.map(async (s) => {
          try { return { s, f: await this.schedules.forecast(tenantId, s.projectId, today) }; } catch { return { s, f: null }; }
        }));
        const known = forecasts.filter((x) => x.f && x.f.varianceWorkingDays !== null);
        const late = known.filter((x) => (x.f!.varianceWorkingDays ?? 0) > 0);
        return measured(meta, asOf, {
          figures: [
            { label: 'Projects heading past baseline', value: late.length, unit: 'count' },
            { label: 'Worst, working days late', value: Math.max(0, ...late.map((x) => x.f!.varianceWorkingDays ?? 0)), unit: 'days' },
          ],
          records: known.map(({ s, f }) => rec(s.projectId, name(s.projectId), `/projects/schedule?projectId=${s.projectId}`, f!.varianceWorkingDays, 'days',
            (f!.varianceWorkingDays ?? 0) > 0 ? 'late' : 'on or ahead', `baseline ${f!.baselineFinish ?? '—'} → forecast ${f!.forecastFinish ?? '—'} · confidence ${f!.confidence}`)),
          of: 'baselined schedules with a forecast',
          excluded: [{ count: forecasts.length - known.length, reason: 'baselined schedules whose forecast could not be computed' }],
          source: 'Schedule forecast to completion against the baseline',
          basis: 'Each forecast carries its confidence — how many driving activities rest on measured progress rather than declared percentages.',
        });
      },

      // ── MGT-14 ───────────────────────────────────────────────────────────────────────────────
      closeout: async (tenantId, asOf, meta) => {
        const closing = ctx.projects.filter((p) => CLOSING_STATUSES.has(p.status));
        const assessed = await Promise.all(closing.map(async (p) => {
          try { return { p, r: await this.closeout.assess(tenantId, p.id) }; } catch { return { p, r: null }; }
        }));
        const read = assessed.filter((a) => a.r !== null);
        const blocked = read.filter((a) => !a.r!.ready);
        return measured(meta, asOf, {
          figures: [
            { label: 'Not ready to close', value: blocked.length, unit: 'count' },
            { label: 'In handover or closeout', value: read.length, unit: 'count' },
          ],
          records: read.map(({ p, r }) => rec(p.id, p.title, `/project/${p.id}`, r!.blocked.length, 'count', r!.ready ? 'ready' : 'blocked',
            r!.ready ? null : [...r!.blocked.map((c) => c.label), ...r!.unknown.map((c) => `${c.label} (unreadable)`)].join(' · ') || null)),
          of: 'projects in handover or closeout',
          excluded: [{ count: assessed.length - read.length, reason: 'projects whose closeout readiness could not be assessed' }],
          source: 'Closeout readiness across Quality, Commissioning, Handover, Commercial and Finance',
          basis: 'An unreadable check is never a pass.',
        });
      },
    };
  }

  private async recognitions(tenantId: string, projects: Context['projects']): Promise<Array<{ r: ProjectRevenueRecognition; s: { totalBudget: number; totalForecast: number } }>> {
    const invoices = (await this.invoices.list({ tenantId, limit: READ_CAP })).filter((i) => i.tenantId === tenantId);
    return Promise.all(projects.filter((p) => (p.value || 0) > 0).map(async (p) => {
      const s = await this.cbs.getSummary(p.id);
      return { r: projectRevenueRecognition(p, s, invoices), s };
    }));
  }
}

function rec(id: string, label: string, href: string, value: number | null, unit: RecordUnit | null, status: string | null, note: string | null = null): DecisionRecord {
  return { id, label, href, value, unit, status, note };
}

function money(value: number): string {
  return `${BASE_CURRENCY} ${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/** The base-currency amount of a committed or actual posting, by the Cost Ledger's own rule. */
function countable(t: CostTransaction): number | null {
  if (t.type === 'actual') return countableActual(t);
  const amount = t.baseAmount ?? (t.baseCurrency == null && t.sourceCurrency == null ? t.amount : null);
  return amount != null && Number.isFinite(amount) ? amount : null;
}
