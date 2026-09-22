import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AccessService, DocumentAccessResolver, type AccessContextProvider } from '@aura/core';
import type { Document, DocumentActor, DocumentPermissionLevel } from '@aura/shared';
import { SiteService } from '@aura/site';

/**
 * A DAY'S EVIDENCE BELONGS TO THE REPORT, NOT TO WHOEVER HELD THE CAMERA.
 *
 * DMS access is decided by the document's own engine — owner, direct share, team, role, company,
 * and entity-inherited context — and it deliberately ignores the global permission wildcard, so
 * reaching the route is not the same as being allowed the file. A site photograph is created by
 * `DmsService` with no shares, which leaves the uploader as its only reader. Measured against the
 * running API, with the site engineer as the author:
 *
 *   u-e2e-site   200   the author
 *   u-e2e-pm     403   the PM, who REVIEWS AND APPROVES that very daily report
 *   u-e2e-qaqc   403
 *   u-admin      403
 *
 * All three of the refused could already SEE the evidence row on the report — description,
 * category, location — and could not open the photograph it named. A diary that backs progress
 * claims and delay evidence is worth nothing if the person approving it cannot look at what it
 * shows, and "the reviewer sees a mention" is the same defect as "the photo was never saved"
 * one step further along.
 *
 * ## The rule, and why it is this one
 *
 * Whoever may READ the daily report may open its evidence. Not "anyone on the project", which
 * would be wider than the report itself; not "the author", which is where it started. The
 * document inherits the reachability of the record it is filed against, which is what the
 * `context` source exists for and what CRM already does for a lead and an account.
 *
 * VIEW and DOWNLOAD only. EDIT is not granted: replacing the photograph on somebody else's
 * signed day is not a review action, and the author keeps that through ownership.
 */
@Injectable()
export class SiteEvidenceDocumentAccessProvider implements AccessContextProvider, OnModuleInit {
  /** Recorded on the `context` source, so a surface can say where the access came from. */
  readonly entity = 'site.daily-report';

  constructor(
    private readonly resolver: DocumentAccessResolver,
    private readonly site: SiteService,
    private readonly access: AccessService,
  ) {}

  onModuleInit(): void {
    this.resolver.registerContextProvider(this);
  }

  async grantsFor(document: Document, actor: DocumentActor): Promise<DocumentPermissionLevel[]> {
    if (document.aggregateType !== 'site.daily-report') return [];

    // Tenant check over RLS, as the other providers do: a cross-tenant id must never resolve to
    // access even if some store is not filtering.
    const report = await this.site.getDailyReport(actor.tenantId, document.aggregateId);
    if (!report || report.tenantId !== actor.tenantId) return [];

    // The same permission the report's own read route is governed by. Asked of AccessService so
    // this cannot drift from what actually opens the report: if someone may not read the day,
    // they may not read what the day is evidenced by.
    const decision = this.access.can(actor.userId, {
      permission: 'site.daily-report.read',
      orgPath: [{ level: 'tenant', id: actor.tenantId }],
    });
    return decision.allowed ? ['VIEW', 'DOWNLOAD'] : [];
  }
}
