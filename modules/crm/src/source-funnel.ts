// C5 / G15 (§29) — the source-to-margin funnel: Source → Opportunities → Wins → Contract Value →
// **Actual Margin**. The attribution chain was already carried unbroken (Signal → Lead →
// Opportunity → tender/quotation → contract → project); nothing reported it as money. This walks
// it and reports it. Pure, derived per read, stores nothing.
//
// The discipline that makes this honest — and the reason most "marketing ROI" reports lie:
// **a win that has not been delivered yet has no margin, and that is not the same as zero margin.**
// A source whose deals were all won last month reads `measured: 0` with its margin fields null, not
// a 0% margin that would rank it below a source with real losses. Every money figure here names the
// subset it was computed over, so a number can never quietly speak for deals it never saw.
//
// Cross-module by necessity (contracts / tenders / projects), so this file defines the MINIMAL
// shapes it reads rather than importing those modules — the same discipline attention.ts uses.

/** What the walk needs from a Lead: where it came from, and what it became. */
export interface FunnelLead {
  id: string;
  source: string | null;
  convertedOpportunityId: string | null;
}

/** What the walk needs from an Opportunity. */
export interface FunnelOpportunity {
  id: string;
  leadId: string | null;
  /** The deal's own source — used when there is no lead behind it (direct sales). */
  source: string | null;
  stage: string;
  value: number;
}

/** Tender created from an opportunity — one hop on the tender path to a contract. */
export interface FunnelTender {
  id: string;
  sourceOpportunityId: string | null;
}

/** Quotation — the direct-sale path; `convertedContractId` links straight to the contract. */
export interface FunnelQuotation {
  sourceOpportunityId: string | null;
  convertedContractId: string | null;
}

/** Commercial baseline — the R3 path: an approved quote's locked price becomes the contract. */
export interface FunnelBaseline {
  id: string;
  sourceOpportunityId: string | null;
}

export interface FunnelContract {
  id: string;
  tenderId: string | null;
  commercialBaselineId: string | null;
  value: number;
}

export interface FunnelProject {
  id: string;
  contractId: string | null;
  status: string;
}

/** Recorded cost against a project (CBS `actualAmount`, summed by the caller). */
export interface FunnelProjectCost {
  projectId: string;
  actualCost: number;
  /** False when the project has no CBS rows at all — no cost recorded is NOT zero cost. */
  hasCostRecord: boolean;
}

export interface SourceMargin {
  source: string;
  /** Every opportunity attributed to this source. */
  opportunities: number;
  pipelineValue: number;
  won: number;
  wonValue: number;
  lost: number;
  open: number;
  /** won / (won + lost), whole percent. Null while nothing has been decided — an undecided
   * source has no win rate, which is different from a 0% one. */
  winRate: number | null;
  /** Awarded value of the contracts actually traced back to this source's wins. */
  contractValue: number;
  /** How many of this source's wins reached a contract. The gap between `won` and this is
   * attribution reality, not failure — a deal won yesterday has no contract yet. */
  contracted: number;
  /**
   * How many contracted wins have a project with recorded cost. **Every margin field below is
   * computed over exactly these deals and no others.**
   */
  measured: number;
  /** Contract value of the measured subset — the revenue the margin is actually a margin ON. */
  measuredRevenue: number;
  actualCost: number | null;
  /** measuredRevenue − actualCost. Null when nothing is measured yet. */
  actualMargin: number | null;
  /** Margin as a whole percent of measuredRevenue. Null when nothing is measured yet. */
  marginPercent: number | null;
  /** Why the margin is null / partial, in words — so the reader never has to guess. */
  measurementNote: string;
}

export interface SourceFunnelInput {
  leads: FunnelLead[];
  opportunities: FunnelOpportunity[];
  tenders: FunnelTender[];
  quotations: FunnelQuotation[];
  baselines: FunnelBaseline[];
  contracts: FunnelContract[];
  projects: FunnelProject[];
  costs: FunnelProjectCost[];
}

export interface SourceFunnel {
  sources: SourceMargin[];
  totals: {
    opportunities: number;
    won: number;
    wonValue: number;
    contractValue: number;
    measured: number;
    measuredRevenue: number;
    actualCost: number | null;
    actualMargin: number | null;
    marginPercent: number | null;
  };
  /** Deals whose margin cannot be spoken for yet, counted once at the top so the page can say so
   * out loud instead of implying the funnel is complete. */
  coverage: {
    wonNotContracted: number;
    contractedNotMeasured: number;
    /** measured / won, whole percent — how much of the win story the margin actually covers. */
    measuredPercent: number | null;
  };
}

/** Matches the Lead Center's vocabulary (G7) — one word for "we don't know" across the CRM. */
export const UNATTRIBUTED = 'unknown';

const pct = (num: number, den: number): number | null =>
  den > 0 ? Math.round((num / den) * 100) : null;

/**
 * The origin wins over the copy. When a deal came from a lead, the LEAD's source is where it
 * actually came from; the opportunity's own `source` is a later, editable restatement of it and
 * would let the same deal be attributed two ways. A deal with no lead behind it (direct sale) has
 * only its own source, and that is the fact.
 */
function sourceOf(opp: FunnelOpportunity, leadsById: Map<string, FunnelLead>): string {
  const lead = opp.leadId ? leadsById.get(opp.leadId) : undefined;
  const fromLead = lead?.source?.trim();
  if (fromLead) return fromLead;
  return opp.source?.trim() || UNATTRIBUTED;
}

/**
 * Walk source → margin. Pure: same facts ⇒ same funnel.
 *
 * The opportunity→contract hop has three legal paths and a deal may take any of them: the tender
 * path (contract.tenderId → tender.sourceOpportunityId), the direct-sale path (a quotation
 * converted straight to a contract) and the R3 baseline path (contract.commercialBaselineId →
 * baseline.sourceOpportunityId). All three are walked; a contract reached by more than one is
 * still one contract, counted once.
 */
export function sourceToMarginFunnel(input: SourceFunnelInput): SourceFunnel {
  const leadsById = new Map(input.leads.map((l) => [l.id, l]));

  // opportunityId → the contracts traceable to it, by any of the three paths.
  const contractsByOpp = new Map<string, Set<string>>();
  const link = (oppId: string | null | undefined, contractId: string): void => {
    if (!oppId) return;
    const set = contractsByOpp.get(oppId);
    if (set) set.add(contractId);
    else contractsByOpp.set(oppId, new Set([contractId]));
  };

  const tenderOpp = new Map(input.tenders.map((t) => [t.id, t.sourceOpportunityId]));
  const baselineOpp = new Map(input.baselines.map((b) => [b.id, b.sourceOpportunityId]));
  for (const c of input.contracts) {
    if (c.tenderId) link(tenderOpp.get(c.tenderId) ?? null, c.id);
    if (c.commercialBaselineId) link(baselineOpp.get(c.commercialBaselineId) ?? null, c.id);
  }
  for (const q of input.quotations) {
    if (q.convertedContractId) link(q.sourceOpportunityId, q.convertedContractId);
  }

  const contractsById = new Map(input.contracts.map((c) => [c.id, c]));
  const projectsByContract = new Map<string, FunnelProject[]>();
  for (const p of input.projects) {
    if (!p.contractId) continue;
    const arr = projectsByContract.get(p.contractId);
    if (arr) arr.push(p);
    else projectsByContract.set(p.contractId, [p]);
  }
  const costByProject = new Map(input.costs.map((c) => [c.projectId, c]));

  interface Acc {
    opportunities: number; pipelineValue: number; won: number; wonValue: number; lost: number;
    contracts: Set<string>; contracted: number; measuredContracts: Set<string>; measured: number;
    actualCost: number;
  }
  const acc = new Map<string, Acc>();
  const blank = (): Acc => ({
    opportunities: 0, pipelineValue: 0, won: 0, wonValue: 0, lost: 0,
    contracts: new Set(), contracted: 0, measuredContracts: new Set(), measured: 0, actualCost: 0,
  });

  for (const opp of input.opportunities) {
    const key = sourceOf(opp, leadsById);
    const a = acc.get(key) ?? blank();
    acc.set(key, a);

    a.opportunities += 1;
    a.pipelineValue += opp.value;
    if (opp.stage === 'lost') { a.lost += 1; continue; }
    if (opp.stage !== 'won') continue;

    a.won += 1;
    a.wonValue += opp.value;

    const contractIds = [...(contractsByOpp.get(opp.id) ?? [])];
    if (contractIds.length === 0) continue; // won, not yet contracted — real, and not a failure.
    a.contracted += 1;

    let anyMeasured = false;
    for (const cid of contractIds) {
      a.contracts.add(cid);
      // Cost is only real when a project recorded it. No CBS rows ⇒ unmeasured, never zero cost.
      const measuredHere = (projectsByContract.get(cid) ?? []).some(
        (p) => costByProject.get(p.id)?.hasCostRecord === true,
      );
      if (!measuredHere) continue;
      anyMeasured = true;
      if (a.measuredContracts.has(cid)) continue;
      a.measuredContracts.add(cid);
      for (const p of projectsByContract.get(cid) ?? []) {
        const cost = costByProject.get(p.id);
        if (cost?.hasCostRecord) a.actualCost += cost.actualCost;
      }
    }
    if (anyMeasured) a.measured += 1;
  }

  const sumValue = (ids: Set<string>): number =>
    [...ids].reduce((s, id) => s + (contractsById.get(id)?.value ?? 0), 0);

  const sources: SourceMargin[] = [...acc.entries()]
    .map(([source, a]) => {
      const contractValue = sumValue(a.contracts);
      const measuredRevenue = sumValue(a.measuredContracts);
      const measured = a.measured;
      const actualCost = measured > 0 ? a.actualCost : null;
      const actualMargin = actualCost === null ? null : measuredRevenue - actualCost;
      const decided = a.won + a.lost;

      let note: string;
      if (a.won === 0) note = 'no wins yet — nothing to measure';
      else if (measured === 0 && a.contracted === 0) note = `${a.won} win(s) not yet contracted — margin unknown`;
      else if (measured === 0) note = `${a.contracted} contract(s) with no recorded cost — margin unknown`;
      else if (measured < a.won) note = `margin covers ${measured} of ${a.won} win(s); the rest are not delivered or costed yet`;
      else note = `margin covers all ${a.won} win(s)`;

      return {
        source,
        opportunities: a.opportunities,
        pipelineValue: a.pipelineValue,
        won: a.won,
        wonValue: a.wonValue,
        lost: a.lost,
        open: a.opportunities - a.won - a.lost,
        winRate: pct(a.won, decided),
        contractValue,
        contracted: a.contracted,
        measured,
        measuredRevenue,
        actualCost,
        actualMargin,
        marginPercent: actualMargin === null ? null : pct(actualMargin, measuredRevenue),
        measurementNote: note,
      };
    })
    // Biggest measured margin first; sources with nothing measured sort under those that have,
    // by won value — an unmeasured source is not a bad source, it just cannot be ranked on margin.
    .sort((x, y) => (y.actualMargin ?? -Infinity) - (x.actualMargin ?? -Infinity) || y.wonValue - x.wonValue);

  const t = sources.reduce(
    (s, r) => ({
      opportunities: s.opportunities + r.opportunities,
      won: s.won + r.won,
      wonValue: s.wonValue + r.wonValue,
      contractValue: s.contractValue + r.contractValue,
      measured: s.measured + r.measured,
      measuredRevenue: s.measuredRevenue + r.measuredRevenue,
      actualCost: s.actualCost + (r.actualCost ?? 0),
      contracted: s.contracted + r.contracted,
    }),
    { opportunities: 0, won: 0, wonValue: 0, contractValue: 0, measured: 0, measuredRevenue: 0, actualCost: 0, contracted: 0 },
  );

  const totalCost = t.measured > 0 ? t.actualCost : null;
  const totalMargin = totalCost === null ? null : t.measuredRevenue - totalCost;

  return {
    sources,
    totals: {
      opportunities: t.opportunities,
      won: t.won,
      wonValue: t.wonValue,
      contractValue: t.contractValue,
      measured: t.measured,
      measuredRevenue: t.measuredRevenue,
      actualCost: totalCost,
      actualMargin: totalMargin,
      marginPercent: totalMargin === null ? null : pct(totalMargin, t.measuredRevenue),
    },
    coverage: {
      wonNotContracted: t.won - t.contracted,
      contractedNotMeasured: t.contracted - t.measured,
      measuredPercent: pct(t.measured, t.won),
    },
  };
}
