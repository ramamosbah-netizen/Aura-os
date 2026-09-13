import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { ProjectResolverRegistry } from '@aura/core';
import { DRAWING_STORE, type DrawingStore } from './drawing-store';
import { RFI_STORE, type RfiStore } from './rfi-store';
import { SUBMITTAL_STORE, type SubmittalStore } from './submittal-store';
import { TECHNICAL_QUERY_STORE, type TechnicalQueryStore } from './technical-query-store';
import { BIM_MODEL_STORE, type BimModelStore } from './bim-model-store';
import { DESIGN_CHANGE_STORE, type DesignChangeStore } from './design-change-store';
import { ENGINEERING_DOCUMENT_STORE, type EngineeringDocumentStore } from './engineering-document-store';

/**
 * Engineering tells the permission guard which project each of its records belongs to.
 *
 * Twenty-one engineering routes address a record by its own id — `drawings/:id/submit`,
 * `rfis/:id/answer`, `design-changes/:id/decide` and the rest — and the guard cannot read a project
 * out of any of them. Without this it falls back to an org-wide grant, which is wrong in both
 * directions: everyone with an org grant may act on every project, and a project MEMBER may act on
 * none, because a project-scoped grant has nothing to match.
 *
 * The entity names are the SINGULAR forms the guard derives from the route (`drawings` → `drawing`),
 * so a registration and the route it serves cannot drift apart by spelling.
 *
 * This module owns its stores and the guard owns the decision; neither reaches into the other
 * (ADR-0004). All the guard receives is a project id.
 */
@Injectable()
export class EngineeringProjectResolvers implements OnModuleInit {
  constructor(
    private readonly registry: ProjectResolverRegistry,
    @Inject(DRAWING_STORE) private readonly drawings: DrawingStore,
    @Inject(RFI_STORE) private readonly rfis: RfiStore,
    @Inject(SUBMITTAL_STORE) private readonly submittals: SubmittalStore,
    @Inject(TECHNICAL_QUERY_STORE) private readonly tqs: TechnicalQueryStore,
    @Inject(BIM_MODEL_STORE) private readonly models: BimModelStore,
    @Inject(DESIGN_CHANGE_STORE) private readonly changes: DesignChangeStore,
    @Inject(ENGINEERING_DOCUMENT_STORE) private readonly documents: EngineeringDocumentStore,
  ) {}

  onModuleInit(): void {
    this.registry.register('engineering', 'drawing', async (id) => (await this.drawings.get(id))?.projectId ?? null);
    this.registry.register('engineering', 'rfi', async (id) => (await this.rfis.get(id))?.projectId ?? null);
    this.registry.register('engineering', 'submittal', async (id) => (await this.submittals.get(id))?.projectId ?? null);
    this.registry.register('engineering', 'technical-query', async (id) => (await this.tqs.get(id))?.projectId ?? null);
    this.registry.register('engineering', 'bim-model', async (id) => (await this.models.get(id))?.projectId ?? null);
    this.registry.register('engineering', 'design-change', async (id) => (await this.changes.get(id))?.projectId ?? null);
    this.registry.register('engineering', 'document', async (id) => (await this.documents.get(id))?.projectId ?? null);
  }
}
