import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AccessService, DocumentAccessResolver, type AccessContextProvider } from '@aura/core';
import type { Document, DocumentActor, DocumentPermissionLevel } from '@aura/shared';
import { OpportunityService } from '@aura/crm';

/**
 * The kinds the direct pre-award evidence route files against an opportunity — the study's
 * drawings, specifications, requirements, survey sheets and references. Nothing else filed on an
 * opportunity is opened by this rule.
 */
export const OPPORTUNITY_STUDY_EVIDENCE_KINDS: readonly string[] = [
  'drawing', 'client_specification', 'client_requirement', 'authority_requirement', 'site_survey', 'technical_reference',
];

/**
 * Read access to a DIRECT opportunity's technical-study evidence, the counterpart of the tender's
 * rule (TenderStudyDocumentAccessProvider): it follows the persisted opportunity and the actor's
 * functional permission to read the study.
 *
 * Measured before it existed (STU-02, 2026-09-26): no rule covered documents filed on an
 * opportunity, so a study's evidence was readable by its uploader alone — the Technical Manager
 * assigned to review the study was refused the survey sheet he was approving ("Access denied").
 * Authors keep edit rights from the DMS creator rule.
 */
@Injectable()
export class OpportunityStudyDocumentAccessProvider implements AccessContextProvider, OnModuleInit {
  readonly entity = 'crm.opportunity';

  constructor(
    private readonly resolver: DocumentAccessResolver,
    private readonly opportunities: OpportunityService,
    private readonly access: AccessService,
  ) {}

  onModuleInit(): void {
    this.resolver.registerContextProvider(this);
  }

  async grantsFor(document: Document, actor: DocumentActor): Promise<DocumentPermissionLevel[]> {
    if (document.aggregateType !== 'crm.opportunity' || !OPPORTUNITY_STUDY_EVIDENCE_KINDS.includes(document.kind)) return [];
    const opportunity = await this.opportunities.get(document.aggregateId);
    if (!opportunity || opportunity.tenantId !== actor.tenantId) return [];
    const allowed = this.access.can(actor.userId, {
      permission: 'crm.study.read',
      orgPath: [
        { level: 'tenant', id: opportunity.tenantId },
        ...(opportunity.companyId ? [{ level: 'company' as const, id: opportunity.companyId }] : []),
      ],
    }).allowed;
    return allowed ? ['VIEW', 'DOWNLOAD'] : [];
  }
}
