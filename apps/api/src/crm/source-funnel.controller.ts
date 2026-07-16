import { Controller, Get } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { ContractService } from '@aura/contracts';
import { CbsService, ProjectService } from '@aura/projects';
import { TenderService } from '@aura/tendering';
import {
  LeadService,
  OpportunityService,
  QuotationService,
  sourceToMarginFunnel,
  type SourceFunnel,
} from '@aura/crm';

// C5 / G15 (§29) — Source → Wins → Contract Value → Actual Margin.
//
// The attribution chain already existed; this is the read that finally walks it end to end. It
// spans four modules, so the composition happens here (the same place the activity command centre
// composes accounts + opportunities) while the rules stay pure in @aura/crm.

@Controller('crm/source-funnel')
export class SourceFunnelController {
  constructor(
    private readonly leads: LeadService,
    private readonly opportunities: OpportunityService,
    private readonly quotations: QuotationService,
    private readonly tenders: TenderService,
    private readonly contracts: ContractService,
    private readonly projects: ProjectService,
    private readonly cbs: CbsService,
    private readonly tenant: TenantContext,
  ) {}

  @Get()
  async funnel(): Promise<SourceFunnel> {
    const tenantId = this.tenant.get().tenantId;
    const limit = 5000;

    const [leads, opportunities, quotations, baselines, tenders, contracts, projects] = await Promise.all([
      this.leads.list({ tenantId, limit }),
      this.opportunities.list({ tenantId, limit }),
      this.quotations.list({ tenantId, limit }),
      this.quotations.listBaselines(tenantId, limit),
      this.tenders.list({ tenantId, limit }),
      this.contracts.list({ tenantId, limit }),
      this.projects.list({ tenantId, limit }),
    ]);

    // Cost lives in the project's CBS, which is filtered by project — never by tenant (it relies on
    // RLS). Every id below therefore comes from the tenant-scoped project list above, so the fan-out
    // can only ever read this tenant's projects. Only projects attached to a contract can carry a
    // deal's margin, so the rest are not worth a query.
    const relevant = projects.filter((p) => p.contractId);
    const costs = await Promise.all(
      relevant.map(async (p) => {
        // getSummary, NOT a sum over cbs.list: the CBS is a tree that rolls child costs UP into
        // their parents, so adding every node's actualAmount counts the same dirham once per level
        // of the hierarchy. getSummary sums leaves only — one source of truth for project cost.
        const nodes = await this.cbs.list({ projectId: p.id });
        const summary = await this.cbs.getSummary(p.id);
        return {
          projectId: p.id,
          actualCost: summary.totalActual,
          // No CBS rows at all ⇒ cost was never recorded. That is not a cost of zero, and the
          // funnel must not read it as a 100% margin.
          hasCostRecord: nodes.length > 0,
        };
      }),
    );

    return sourceToMarginFunnel({
      leads: leads.map((l) => ({
        id: l.id,
        source: l.source,
        convertedOpportunityId: l.convertedOpportunityId,
      })),
      opportunities: opportunities.map((o) => ({
        id: o.id,
        leadId: o.leadId,
        source: o.source,
        stage: o.stage,
        value: o.value,
      })),
      tenders: tenders.map((t) => ({ id: t.id, sourceOpportunityId: t.sourceOpportunityId })),
      quotations: quotations.map((q) => ({
        sourceOpportunityId: q.sourceOpportunityId,
        convertedContractId: q.convertedContractId,
      })),
      // The R3 baseline path is a SECOND route home, not a duplicate of the quotation one: the
      // convert route creates the contract and links the quotation back to it in two separate
      // writes. If the second one is ever lost, the contract still points at its baseline, and the
      // baseline still remembers the deal — so the money stays attributed instead of silently
      // dropping out of the funnel.
      baselines: baselines.map((b) => ({ id: b.id, sourceOpportunityId: b.sourceOpportunityId })),
      contracts: contracts.map((c) => ({
        id: c.id,
        tenderId: c.tenderId,
        commercialBaselineId: c.commercialBaselineId,
        value: c.value,
      })),
      projects: projects.map((p) => ({ id: p.id, contractId: p.contractId, status: p.status })),
      costs,
    });
  }
}
