import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { assertSameTenant, type Id, makeEvent } from '@aura/shared';
import {
  AccessService, EVENT_STORE, type EventStore, TenantContext, TX_RUNNER, type TxRunner,
} from '@aura/core';
import type { ProjectRisk } from './domain/project-risk';
import { type MaterialiseInput, type ProjectIssue, materialiseRiskAsIssue } from './domain/project-issue';
import { PROJECT_RISK_STORE, type ProjectRiskStore } from './project-risk-store';
import { PROJECT_ISSUE_STORE, type ProjectIssueStore } from './project-issue-store';
import { PROJECT_STORE, type ProjectStore } from './project-store';
import { assertProjectWriteAllowed } from './project-write-guard';

/**
 * §21 — the one command that spans both registers, and the only writer that may.
 *
 * A risk occurred. Two things must become true together: a live issue exists, and the risk is
 * retired as MATERIALISED rather than RESOLVED. Neither register service can do this — by design,
 * they hold one store each — so this command holds both, and it is a named authority rather than a
 * convenience method, because it retires an exposure AND creates a live problem.
 *
 * IT REQUIRES BOTH PERMISSIONS. Someone allowed to raise issues but not to move risks must not be
 * able to close a risk through this door, and vice versa.
 *
 * ATOMICITY. `TX_RUNNER` gives one BEGIN…COMMIT with the tenant GUC bound transaction-locally, so
 * RLS applies inside it. Any failure rolls both writes back: no orphan issue, no risk marked as
 * landed with nothing to point at.
 *
 * WHAT THE DATABASE STILL GUARANTEES ON ITS OWN, in case a future writer forgets this path:
 *   UNIQUE (origin_risk_id)                       — a risk materialises at most once
 *   FK (tenant_id, project_id, origin_risk_id)    — provenance cannot cross a project or a tenant
 * Postgres cannot express "risk.status = MATERIALISED ⇔ some issue points at it" without a trigger,
 * and a trigger is not worth it while this is the only writer. The invariant therefore rests on:
 * this transaction, those two constraints, and the domain's refusal to let any other code path
 * produce MATERIALISED.
 */
@Injectable()
export class ProjectRiskMaterialisationService {
  private readonly logger = new Logger('ProjectRiskMaterialisationService');

  constructor(
    @Inject(PROJECT_RISK_STORE) private readonly risks: ProjectRiskStore,
    @Inject(PROJECT_ISSUE_STORE) private readonly issues: ProjectIssueStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
    @Optional() @Inject(PROJECT_STORE) private readonly projects: ProjectStore | null = null,
    @Optional() @Inject(AccessService) private readonly access: AccessService | null = null,
  ) {}

  async materialise(
    riskId: Id,
    input: MaterialiseInput = {},
  ): Promise<{ risk: ProjectRisk; issue: ProjectIssue }> {
    const existing = assertSameTenant(
      await this.risks.get(riskId), this.tenant?.boundTenantId(), 'Risk', riskId,
    );

    // Both permissions, checked before anything is computed. This command does two governed things
    // and holding one of the two is not authority to do both.
    for (const permission of ['projects.risk.update', 'projects.issue.create']) {
      await assertProjectWriteAllowed(
        { projects: this.projects, access: this.access },
        { projectId: existing.projectId, tenantId: existing.tenantId, actorId: input.actorId, permission },
      );
    }

    // Pure: decides the pair, writes nothing. Throws if the risk is not a live exposure, or if the
    // caller named a project this risk does not belong to.
    const { risk, issue } = materialiseRiskAsIssue(existing, input);

    await this.tx.run(async (handle) => {
      // Issue FIRST. `origin_risk_id` is a foreign key into the risks table and the risk carries no
      // pointer back, so this order has no circular dependency — and on the no-database path, where
      // the handle is null and the writes are sequential rather than atomic, a failure after the
      // first write leaves an issue naming its origin risk rather than a risk claiming to have
      // landed into nothing. Visible, and recoverable.
      await this.issues.createWithClient(handle, issue);
      await this.risks.updateWithClient(handle, risk);
      await this.events.appendWithClient(handle, [
        makeEvent({
          type: 'projects.risk.materialised',
          tenantId: risk.tenantId, companyId: null, actorId: input.actorId ?? null,
          aggregateType: 'projects.risk', aggregateId: risk.id,
          payload: {
            projectId: risk.projectId, issueId: issue.id,
            riskSeverity: risk.severity, issueSeverity: issue.severity,
          },
        }),
        makeEvent({
          type: 'projects.issue.raised',
          tenantId: issue.tenantId, companyId: null, actorId: input.actorId ?? null,
          aggregateType: 'projects.issue', aggregateId: issue.id,
          payload: {
            projectId: issue.projectId, title: issue.title, area: issue.area,
            severity: issue.severity, originRiskId: risk.id,
          },
        }),
      ]);
    });

    this.logger.log(`Risk ${risk.id} materialised into issue ${issue.id} on ${risk.projectId}`);
    return { risk, issue };
  }
}
