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
  nextOpenActivityByRecord,
} from '@aura/crm';
import {
  opportunityAttention,
  resolveNextAction,
  checkStageTransition,
  type Opportunity,
  type OpportunityAttention,
  type OpportunityStage,
  type ResolvedNextAction,
} from '@aura/shared';
import { TenderService, type Tender } from '@aura/tendering';
import { ContractService, type Contract } from '@aura/contracts';
import { ProjectService, type Project } from '@aura/projects';

// Opportunity 360 — the deal command center. An opportunity is one pursuit for one
// account. This composes its qualification, the stakeholders behind it, the
// competitors, and the FULL progression it spawned along the deal chain
// (opportunity → tender? → quotation → contract → project) by following the
// provenance links the reactors stamp.

interface ProgressionStep {
  key: 'opportunity' | 'tender' | 'quotation' | 'contract' | 'project';
  label: string;
  reached: boolean;
  count: number;
  value: number | null;
  href: string | null;
}

interface Opportunity360Payload {
  opportunity: Opportunity;
  account: Account | null;
  stakeholders: Contact[];
  tenders: Tender[];
  quotations: Quotation[];
  contracts: Contract[];
  projects: Project[];
  activities: Activity[];
  qualification: { budget: boolean; authority: boolean; need: boolean; timeline: boolean; score: number };
  route: 'tender' | 'direct';
  progression: ProgressionStep[];
  outcome: { status: 'open' | 'won' | 'lost'; lossReason: string | null; contractedValue: number };
  /**
   * G2 — the next action RESOLVED server-side from the activity stream (the columns are only the
   * fallback). Exposed so the UI renders the same next action the invariant judged the deal on,
   * instead of re-deriving the rule and becoming a second truth.
   */
  nextAction: ResolvedNextAction;
  /** The Next-Action Invariant verdict for this deal, computed on the same resolved facts. */
  attention: OpportunityAttention;
  /**
   * G5 — the stage gate for the NEXT forward stage, resolved server-side from the same rule the
   * PATCH enforces (`checkStageTransition`) with the same evidence. The client renders this and
   * NEVER re-derives it, so the preview can never disagree with the enforcement. `null` once the
   * deal is closed or sitting at the last gated stage.
   */
  stageGate: { nextStage: OpportunityStage; label: string; allowed: boolean; gaps: string[] } | null;
}

/** Only forward commercial commitments are gated (won/lost carry their reason at close time). */
const NEXT_FORWARD_STAGE: Partial<Record<OpportunityStage, OpportunityStage>> = {
  qualification: 'proposal',
  proposal: 'negotiation',
};

const r2 = (n: number): number => Math.round(n * 100) / 100;

@Controller('crm/opportunities')
export class Opportunity360Controller {
  constructor(
    private readonly opportunities: OpportunityService,
    private readonly accounts: AccountService,
    private readonly contacts: ContactService,
    private readonly quotations: QuotationService,
    private readonly activities: ActivityService,
    private readonly tenders: TenderService,
    private readonly contracts: ContractService,
    private readonly projects: ProjectService,
    private readonly tenant: TenantContext,
  ) {}

  @Get(':id/summary')
  async summary(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Opportunity360Payload> {
    const tenantId = this.tenant.get().tenantId;
    const opp = await this.opportunities.get(id);
    if (!opp || opp.tenantId !== tenantId) throw new NotFoundException(`opportunity ${id} not found`);

    const accountId = opp.accountId;
    const [account, stakeholders, allTenders, allQuotes, allContracts, allProjects, activities] = await Promise.all([
      accountId ? this.accounts.get(accountId) : Promise.resolve(null),
      accountId ? this.contacts.list({ tenantId, accountId }) : Promise.resolve([]),
      accountId ? this.tenders.list({ tenantId, accountId }) : Promise.resolve([]),
      accountId ? this.quotations.list({ tenantId, accountId }) : Promise.resolve([]),
      accountId ? this.contracts.list({ tenantId, accountId }) : Promise.resolve([]),
      accountId ? this.projects.list({ tenantId, accountId }) : Promise.resolve([]),
      this.activities.list({ tenantId, relatedId: id }),
    ]);

    // Follow the provenance chain this opportunity spawned.
    const tenders = allTenders.filter((t) => t.sourceOpportunityId === id);
    const tenderIds = new Set(tenders.map((t) => t.id));
    const quotations = allQuotes.filter((q) => q.sourceOpportunityId === id || (q.sourceTenderId && tenderIds.has(q.sourceTenderId)));
    // A contract reaches this opportunity by EITHER path: the tender route (contract.tenderId ∈ this
    // opp's tenders) OR the direct route (a quotation of this opp converted to it, quotation.convertedContractId).
    // Without the direct path a completed DIRECT sale showed "Contract —" on its own opportunity.
    const directContractIds = new Set(quotations.map((q) => q.convertedContractId).filter((cid): cid is string => !!cid));
    const contracts = allContracts.filter((c) => (c.tenderId && tenderIds.has(c.tenderId)) || directContractIds.has(c.id));
    const contractIds = new Set(contracts.map((c) => c.id));
    const projects = allProjects.filter((p) => p.contractId && contractIds.has(p.contractId));

    const qualification = {
      budget: opp.budgetConfirmed,
      authority: opp.authorityConfirmed,
      need: opp.needConfirmed,
      timeline: opp.timelineConfirmed,
      score: [opp.budgetConfirmed, opp.authorityConfirmed, opp.needConfirmed, opp.timelineConfirmed].filter(Boolean).length,
    };

    const route: 'tender' | 'direct' = opp.requiresTender ? 'tender' : 'direct';
    const contractedValue = r2(contracts.filter((c) => c.status !== 'cancelled').reduce((s, c) => s + c.value, 0));

    const progression: ProgressionStep[] = [
      { key: 'opportunity', label: 'Opportunity', reached: true, count: 1, value: opp.value, href: null },
      ...(route === 'tender'
        ? [{ key: 'tender' as const, label: 'Tender', reached: tenders.length > 0, count: tenders.length, value: r2(tenders.reduce((s, t) => s + t.value, 0)), href: tenders[0] ? `/tendering/tenders/${tenders[0].id}` : '/tendering/tenders' }]
        : []),
      { key: 'quotation', label: 'Quotation', reached: quotations.length > 0, count: quotations.length, value: r2(quotations.reduce((s, q) => s + q.total, 0)), href: '/crm/quotations' },
      { key: 'contract', label: 'Contract', reached: contracts.length > 0, count: contracts.length, value: contractedValue, href: contracts[0] ? `/contracts/contracts/${contracts[0].id}` : null },
      { key: 'project', label: 'Project', reached: projects.length > 0, count: projects.length, value: null, href: projects[0] ? `/projects/projects/${projects[0].id}` : null },
    ];

    const status: 'open' | 'won' | 'lost' = opp.stage === 'won' ? 'won' : opp.stage === 'lost' ? 'lost' : 'open';

    // G2: the next open activity on THIS opportunity is the next action. Completing it hands the
    // next action to whatever is scheduled after it — no column to maintain by hand.
    const next = nextOpenActivityByRecord(activities).get(id);
    const facts = next
      ? { nextActionSubject: next.subject, nextActionDueIso: next.dueIso, nextActionOwnerId: next.assigneeId }
      : {};

    // G5 stage gate — the SAME rule + evidence the PATCH enforces, resolved here so the client only
    // renders the verdict. Only previewed while the deal is open and has a gated forward stage.
    const nextStage = status === 'open' ? NEXT_FORWARD_STAGE[opp.stage] : undefined;
    const stageGate = nextStage
      ? (() => {
          const check = checkStageTransition(opp, nextStage, {
            hasStakeholder: stakeholders.length > 0,
            hasQuotation: quotations.length > 0,
            quotationSubmitted: quotations.some((q) => q.status !== 'draft' && q.status !== 'internal_review'),
          });
          return {
            nextStage,
            label: nextStage.charAt(0).toUpperCase() + nextStage.slice(1),
            allowed: check.allowed,
            gaps: check.gaps.map((g) => g.message),
          };
        })()
      : null;

    return {
      opportunity: opp,
      account,
      stakeholders,
      tenders,
      quotations,
      contracts,
      projects,
      activities,
      qualification,
      route,
      progression,
      outcome: { status, lossReason: opp.lossReason, contractedValue },
      nextAction: resolveNextAction(opp, facts),
      attention: opportunityAttention(opp, facts),
      stageGate,
    };
  }
}
