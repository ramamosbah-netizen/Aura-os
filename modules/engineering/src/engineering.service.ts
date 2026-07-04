import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';

import { type Drawing, type NewDrawing, makeDrawing, ENGINEERING_EVENT } from './domain/drawing';
import { DRAWING_STORE, type DrawingFilter, type DrawingStore } from './drawing-store';

import { type Rfi, type NewRfi, makeRfi } from './domain/rfi';
import { RFI_STORE, type RfiFilter, type RfiStore } from './rfi-store';

import { type Submittal, type NewSubmittal, makeSubmittal } from './domain/submittal';
import { SUBMITTAL_STORE, type SubmittalFilter, type SubmittalStore } from './submittal-store';

import { type TechnicalQuery, type NewTechnicalQuery, makeTechnicalQuery, respondToQuery } from './domain/technical-query';
import { TECHNICAL_QUERY_STORE, type TqFilter, type TechnicalQueryStore } from './technical-query-store';

import { type BimModel, type NewBimModel, type ModelStatus, makeBimModel, bumpModelVersion, BIM_MODEL_EVENT } from './domain/bim-model';
import { BIM_MODEL_STORE, type BimModelFilter, type BimModelStore } from './bim-model-store';

import { type DesignChange, type NewDesignChange, type DesignChangeStatus, makeDesignChange, decideDesignChange, triggersVariation, DESIGN_CHANGE_EVENT } from './domain/design-change';
import { DESIGN_CHANGE_STORE, type DesignChangeFilter, type DesignChangeStore } from './design-change-store';

import { type EngineeringDocument, type NewEngineeringDocument, type DocumentStatus, makeEngineeringDocument, transitionDocument, ENGINEERING_DOCUMENT_EVENT } from './domain/engineering-document';
import { ENGINEERING_DOCUMENT_STORE, type EngineeringDocumentFilter, type EngineeringDocumentStore } from './engineering-document-store';

@Injectable()
export class EngineeringService {
  private readonly logger = new Logger('Engineering');

  constructor(
    @Inject(DRAWING_STORE) private readonly drawingStore: DrawingStore,
    @Inject(RFI_STORE) private readonly rfiStore: RfiStore,
    @Inject(SUBMITTAL_STORE) private readonly submittalStore: SubmittalStore,
    @Inject(TECHNICAL_QUERY_STORE) private readonly tqStore: TechnicalQueryStore,
    @Inject(BIM_MODEL_STORE) private readonly bimStore: BimModelStore,
    @Inject(DESIGN_CHANGE_STORE) private readonly designChangeStore: DesignChangeStore,
    @Inject(ENGINEERING_DOCUMENT_STORE) private readonly docStore: EngineeringDocumentStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly access: AccessService,
  ) {}

  // ── Shop Drawings ──────────────────────────────────────────────────────────

  async createDrawing(input: NewDrawing): Promise<Drawing> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      const target: AccessTarget = { permission: 'engineering.drawing.create', orgPath };
      this.access.assert(input.createdBy, target);
    }

    const drawing = makeDrawing(input);
    const event = makeEvent({
      type: ENGINEERING_EVENT.drawingCreated,
      tenantId: drawing.tenantId,
      companyId: drawing.companyId,
      actorId: drawing.createdBy,
      aggregateType: 'engineering.drawing',
      aggregateId: drawing.id,
      payload: { code: drawing.code, title: drawing.title, revision: drawing.revision, projectId: drawing.projectId },
    });

    await this.tx.run(async (handle) => {
      await this.drawingStore.createWithClient(handle, drawing);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Drawing created: ${drawing.code} - Rev ${drawing.revision} (${drawing.id})`);
    return drawing;
  }

  async reviseDrawing(tenantId: Id, actorId: Id | null, id: Id, input: { revision: string; title?: string }): Promise<Drawing> {
    const drawing = await this.drawingStore.get(id);
    if (!drawing) throw new Error(`Drawing with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (drawing.companyId) orgPath.push({ level: 'company', id: drawing.companyId });
      this.access.assert(actorId, { permission: 'engineering.drawing.update', orgPath });
    }

    const oldRev = drawing.revision;
    drawing.revision = input.revision;
    if (input.title) drawing.title = input.title;
    drawing.updatedAt = new Date().toISOString();

    const event = makeEvent({
      type: ENGINEERING_EVENT.drawingRevised,
      tenantId,
      companyId: drawing.companyId,
      actorId,
      aggregateType: 'engineering.drawing',
      aggregateId: drawing.id,
      payload: { code: drawing.code, title: drawing.title, oldRevision: oldRev, newRevision: drawing.revision },
    });

    await this.tx.run(async (handle) => {
      await this.drawingStore.updateWithClient(handle, drawing);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Drawing revised: ${drawing.code} - Rev ${drawing.revision} (${drawing.id})`);
    return drawing;
  }

  async approveDrawing(tenantId: Id, actorId: Id | null, id: Id): Promise<Drawing> {
    const drawing = await this.drawingStore.get(id);
    if (!drawing) throw new Error(`Drawing with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (drawing.companyId) orgPath.push({ level: 'company', id: drawing.companyId });
      this.access.assert(actorId, { permission: 'engineering.drawing.approve', orgPath });
    }

    drawing.status = 'approved';
    drawing.updatedAt = new Date().toISOString();

    await this.tx.run(async (handle) => {
      await this.drawingStore.updateWithClient(handle, drawing);
    });

    this.logger.log(`Drawing approved: ${drawing.code} (${drawing.id})`);
    return drawing;
  }

  getDrawing(id: Id): Promise<Drawing | null> {
    return this.drawingStore.get(id);
  }

  listDrawings(filter?: DrawingFilter): Promise<Drawing[]> {
    return this.drawingStore.list(filter);
  }

  listDrawingsPaged(filter: DrawingFilter, page: import('@aura/shared').PageParams) {
    return this.drawingStore.listPaged(filter, page);
  }

  // ── RFIs (Request For Information) ─────────────────────────────────────────

  async createRfi(input: NewRfi): Promise<Rfi> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'engineering.rfi.create', orgPath });
    }

    const rfi = makeRfi(input);
    const event = makeEvent({
      type: ENGINEERING_EVENT.rfiRaised,
      tenantId: rfi.tenantId,
      companyId: rfi.companyId,
      actorId: rfi.createdBy,
      aggregateType: 'engineering.rfi',
      aggregateId: rfi.id,
      payload: { code: rfi.code, title: rfi.title, projectId: rfi.projectId },
    });

    await this.tx.run(async (handle) => {
      await this.rfiStore.createWithClient(handle, rfi);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`RFI raised: ${rfi.code} (${rfi.id})`);
    return rfi;
  }

  async answerRfi(tenantId: Id, actorId: Id | null, id: Id, answer: string): Promise<Rfi> {
    const rfi = await this.rfiStore.get(id);
    if (!rfi) throw new Error(`RFI with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (rfi.companyId) orgPath.push({ level: 'company', id: rfi.companyId });
      this.access.assert(actorId, { permission: 'engineering.rfi.answer', orgPath });
    }

    rfi.answer = answer;
    rfi.status = 'answered';
    rfi.updatedAt = new Date().toISOString();

    const event = makeEvent({
      type: ENGINEERING_EVENT.rfiAnswered,
      tenantId,
      companyId: rfi.companyId,
      actorId,
      aggregateType: 'engineering.rfi',
      aggregateId: rfi.id,
      payload: { code: rfi.code, status: rfi.status },
    });

    await this.tx.run(async (handle) => {
      await this.rfiStore.updateWithClient(handle, rfi);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`RFI answered: ${rfi.code} (${rfi.id})`);
    return rfi;
  }

  getRfi(id: Id): Promise<Rfi | null> {
    return this.rfiStore.get(id);
  }

  listRfis(filter?: RfiFilter): Promise<Rfi[]> {
    return this.rfiStore.list(filter);
  }

  listRfisPaged(filter: RfiFilter, page: import('@aura/shared').PageParams) {
    return this.rfiStore.listPaged(filter, page);
  }

  // ── Technical/Material Submittals ──────────────────────────────────────────

  async createSubmittal(input: NewSubmittal): Promise<Submittal> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'engineering.submittal.create', orgPath });
    }

    const submittal = makeSubmittal(input);
    const event = makeEvent({
      type: ENGINEERING_EVENT.submittalCreated,
      tenantId: submittal.tenantId,
      companyId: submittal.companyId,
      actorId: submittal.createdBy,
      aggregateType: 'engineering.submittal',
      aggregateId: submittal.id,
      payload: { code: submittal.code, title: submittal.title, submittalType: submittal.submittalType, projectId: submittal.projectId },
    });

    await this.tx.run(async (handle) => {
      await this.submittalStore.createWithClient(handle, submittal);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Submittal created: ${submittal.code} (${submittal.id})`);
    return submittal;
  }

  async updateSubmittalStatus(tenantId: Id, actorId: Id | null, id: Id, status: Submittal['status']): Promise<Submittal> {
    const submittal = await this.submittalStore.get(id);
    if (!submittal) throw new Error(`Submittal with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (submittal.companyId) orgPath.push({ level: 'company', id: submittal.companyId });
      this.access.assert(actorId, { permission: 'engineering.submittal.update_status', orgPath });
    }

    const oldStatus = submittal.status;
    submittal.status = status;
    submittal.updatedAt = new Date().toISOString();

    const event = makeEvent({
      type: ENGINEERING_EVENT.submittalStatusChanged,
      tenantId,
      companyId: submittal.companyId,
      actorId,
      aggregateType: 'engineering.submittal',
      aggregateId: submittal.id,
      payload: { code: submittal.code, oldStatus, newStatus: submittal.status },
    });

    await this.tx.run(async (handle) => {
      await this.submittalStore.updateWithClient(handle, submittal);
      await this.events.appendWithClient(handle, [event]);

      // Submittal-to-Drawing Link: Automated drawing revisions when submittals are approved
      if (status === 'approved' && submittal.submittalType === 'drawing') {
        const latestDrawing = await this.drawingStore.getLatestByCode(tenantId, submittal.projectId, submittal.code);
        if (latestDrawing) {
          // Increment revision
          let newRevision = '1';
          const currentRev = latestDrawing.revision;
          if (/^\d+$/.test(currentRev)) {
            newRevision = String(Number(currentRev) + 1);
          } else if (/^[A-Za-z]$/.test(currentRev)) {
            newRevision = String.fromCharCode(currentRev.charCodeAt(0) + 1);
          } else {
            newRevision = `${currentRev}_rev`;
          }

          // Create revised drawing entity
          const revisedDrawing = makeDrawing({
            tenantId,
            companyId: latestDrawing.companyId,
            code: latestDrawing.code,
            title: submittal.title, // Use approved submittal's title
            revision: newRevision,
            status: 'approved',
            projectId: latestDrawing.projectId,
            projectName: latestDrawing.projectName,
            ownerId: latestDrawing.ownerId,
            createdBy: actorId,
          });

          await this.drawingStore.createWithClient(handle, revisedDrawing);
        } else {
          // Create initial approved drawing
          const initialDrawing = makeDrawing({
            tenantId,
            companyId: submittal.companyId,
            code: submittal.code,
            title: submittal.title,
            revision: '1',
            status: 'approved',
            projectId: submittal.projectId,
            projectName: submittal.projectName,
            ownerId: submittal.ownerId,
            createdBy: actorId,
          });

          await this.drawingStore.createWithClient(handle, initialDrawing);
        }
      }
    });

    this.logger.log(`Submittal status changed: ${submittal.code} -> ${submittal.status} (${submittal.id})`);
    return submittal;
  }

  getSubmittal(id: Id): Promise<Submittal | null> {
    return this.submittalStore.get(id);
  }

  listSubmittals(filter?: SubmittalFilter): Promise<Submittal[]> {
    return this.submittalStore.list(filter);
  }

  listSubmittalsPaged(filter: SubmittalFilter, page: import('@aura/shared').PageParams) {
    return this.submittalStore.listPaged(filter, page);
  }

  // ── Technical Queries (TQ) ──────────────────────────────────────────────────

  async createTechnicalQuery(input: NewTechnicalQuery): Promise<TechnicalQuery> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'engineering.tq.create', orgPath });
    }
    const tq = makeTechnicalQuery(input);
    const event = makeEvent({
      type: ENGINEERING_EVENT.tqRaised,
      tenantId: tq.tenantId, companyId: tq.companyId, actorId: tq.createdBy,
      aggregateType: 'engineering.tq', aggregateId: tq.id,
      payload: { code: tq.code, title: tq.title, discipline: tq.discipline, projectId: tq.projectId },
    });
    await this.tx.run(async (handle) => {
      await this.tqStore.createWithClient(handle, tq);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`TQ raised: ${tq.code} (${tq.id})`);
    return tq;
  }

  async respondTechnicalQuery(tenantId: Id, actorId: Id | null, id: Id, response: string): Promise<TechnicalQuery> {
    const tq = await this.tqStore.get(id);
    if (!tq) throw new Error(`technical query ${id} not found`);
    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (tq.companyId) orgPath.push({ level: 'company', id: tq.companyId });
      this.access.assert(actorId, { permission: 'engineering.tq.respond', orgPath });
    }
    const updated = respondToQuery(tq, response);
    const event = makeEvent({
      type: ENGINEERING_EVENT.tqResponded,
      tenantId, companyId: tq.companyId, actorId,
      aggregateType: 'engineering.tq', aggregateId: tq.id,
      payload: { code: tq.code, status: updated.status },
    });
    await this.tx.run(async (handle) => {
      await this.tqStore.updateWithClient(handle, updated);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`TQ responded: ${tq.code} (${tq.id})`);
    return updated;
  }

  getTechnicalQuery(id: Id): Promise<TechnicalQuery | null> {
    return this.tqStore.get(id);
  }

  listTechnicalQueries(filter?: TqFilter): Promise<TechnicalQuery[]> {
    return this.tqStore.list(filter);
  }

  listTechnicalQueriesPaged(filter: TqFilter, page: import('@aura/shared').PageParams) {
    return this.tqStore.listPaged(filter, page);
  }

  // ── Design Changes (engineering-originated; approval → commercial Variation) ──

  async createDesignChange(input: NewDesignChange): Promise<DesignChange> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'engineering.design_change.create', orgPath });
    }
    const dc = makeDesignChange(input);
    const event = makeEvent({
      type: DESIGN_CHANGE_EVENT.raised,
      tenantId: dc.tenantId, companyId: dc.companyId, actorId: dc.createdBy,
      aggregateType: 'engineering.design_change', aggregateId: dc.id,
      payload: { code: dc.code, title: dc.title, discipline: dc.discipline, projectId: dc.projectId, changeType: dc.changeType, costImpact: dc.costImpact },
    });
    await this.tx.run(async (handle) => {
      await this.designChangeStore.createWithClient(handle, dc);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Design change raised: ${dc.code} (${dc.id})`);
    return dc;
  }

  /**
   * Decide a design change. On approval WITH a cost impact this emits
   * `engineering.design_change.approved` carrying the value snapshot — the cross-module reactor
   * turns that into a draft Variation in Projects (never a direct cross-module call).
   */
  async decideDesignChange(tenantId: Id, actorId: Id | null, id: Id, status: DesignChangeStatus): Promise<DesignChange> {
    const dc = await this.designChangeStore.get(id);
    if (!dc) throw new Error(`design change ${id} not found`);
    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (dc.companyId) orgPath.push({ level: 'company', id: dc.companyId });
      this.access.assert(actorId, { permission: 'engineering.design_change.decide', orgPath });
    }
    const updated = decideDesignChange(dc, status, actorId);
    const type = status === 'approved' ? DESIGN_CHANGE_EVENT.approved
      : status === 'rejected' ? DESIGN_CHANGE_EVENT.rejected
      : DESIGN_CHANGE_EVENT.raised;
    const event = makeEvent({
      type,
      tenantId: updated.tenantId, companyId: updated.companyId, actorId,
      aggregateType: 'engineering.design_change', aggregateId: updated.id,
      payload: {
        code: updated.code, title: updated.title, status: updated.status,
        projectId: updated.projectId, projectName: updated.projectName,
        changeType: updated.changeType, costImpact: updated.costImpact,
        estimatedValue: updated.estimatedValue,
        // explicit flag so the reactor need not re-derive the trigger rule
        triggersVariation: triggersVariation(updated),
      },
    });
    await this.tx.run(async (handle) => {
      await this.designChangeStore.updateWithClient(handle, updated);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Design change ${updated.code} (${updated.id}) → ${status}${triggersVariation(updated) ? ' [triggers variation]' : ''}`);
    return updated;
  }

  getDesignChange(id: Id): Promise<DesignChange | null> {
    return this.designChangeStore.get(id);
  }

  listDesignChanges(filter?: DesignChangeFilter): Promise<DesignChange[]> {
    return this.designChangeStore.list(filter);
  }

  listDesignChangesPaged(filter: DesignChangeFilter, page: import('@aura/shared').PageParams) {
    return this.designChangeStore.listPaged(filter, page);
  }

  // ── Engineering Documents (one aggregate, many docTypes; ADR-0011 point-6) ────

  async createDocument(input: NewEngineeringDocument): Promise<EngineeringDocument> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'engineering.document.create', orgPath });
    }
    const doc = makeEngineeringDocument(input);
    const event = makeEvent({
      type: ENGINEERING_DOCUMENT_EVENT.created,
      tenantId: doc.tenantId, companyId: doc.companyId, actorId: doc.createdBy,
      aggregateType: 'engineering.document', aggregateId: doc.id,
      payload: { code: doc.code, title: doc.title, docType: doc.docType, ownerModule: doc.ownerModule, discipline: doc.discipline, projectId: doc.projectId },
    });
    await this.tx.run(async (handle) => {
      await this.docStore.createWithClient(handle, doc);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Engineering document created: ${doc.code} (${doc.docType}, owner=${doc.ownerModule})`);
    return doc;
  }

  /**
   * Move a document along its shared lifecycle. `submitted` on an HSE-owned doc (a risk assessment)
   * is the hand-off from Engineering (origin) to HSE (owner) — the emitted event carries ownerModule
   * so a future HSE reactor can route it into HSE's review queue (ADR-0011 event composition).
   */
  async transitionDocument(tenantId: Id, actorId: Id | null, id: Id, status: DocumentStatus): Promise<EngineeringDocument> {
    const doc = await this.docStore.get(id);
    if (!doc) throw new Error(`engineering document ${id} not found`);
    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (doc.companyId) orgPath.push({ level: 'company', id: doc.companyId });
      this.access.assert(actorId, { permission: 'engineering.document.transition', orgPath });
    }
    const updated = transitionDocument(doc, status, actorId);
    const type = status === 'submitted' ? ENGINEERING_DOCUMENT_EVENT.submitted
      : status === 'approved' ? ENGINEERING_DOCUMENT_EVENT.approved
      : status === 'rejected' ? ENGINEERING_DOCUMENT_EVENT.rejected
      : ENGINEERING_DOCUMENT_EVENT.created;
    const event = makeEvent({
      type,
      tenantId: updated.tenantId, companyId: updated.companyId, actorId,
      aggregateType: 'engineering.document', aggregateId: updated.id,
      payload: { code: updated.code, docType: updated.docType, ownerModule: updated.ownerModule, status: updated.status, projectId: updated.projectId },
    });
    await this.tx.run(async (handle) => {
      await this.docStore.updateWithClient(handle, updated);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Engineering document ${updated.code} (${updated.docType}) → ${status}`);
    return updated;
  }

  getDocument(id: Id): Promise<EngineeringDocument | null> {
    return this.docStore.get(id);
  }

  listDocuments(filter?: EngineeringDocumentFilter): Promise<EngineeringDocument[]> {
    return this.docStore.list(filter);
  }

  listDocumentsPaged(filter: EngineeringDocumentFilter, page: import('@aura/shared').PageParams) {
    return this.docStore.listPaged(filter, page);
  }

  // ── BIM / model registry (viewer backbone) ──────────────────────────────────

  async registerBimModel(input: NewBimModel): Promise<BimModel> {
    if (input.uploadedBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.uploadedBy, { permission: 'engineering.bim_model.register', orgPath });
    }
    const model = makeBimModel(input);
    const event = makeEvent({
      type: BIM_MODEL_EVENT.registered,
      tenantId: model.tenantId, companyId: model.companyId, actorId: model.uploadedBy,
      aggregateType: 'engineering.bim_model', aggregateId: model.id,
      payload: { code: model.code, discipline: model.discipline, format: model.format, projectId: model.projectId },
    });
    await this.tx.run(async (handle) => {
      await this.bimStore.save(model);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`BIM model registered: ${model.code} (${model.format}, ${model.discipline})`);
    return model;
  }

  async newBimModelVersion(
    tenantId: Id,
    id: Id,
    patch: { revision: string; storageKey?: string | null; fileUrl?: string | null; fileSizeBytes?: number | null; status?: ModelStatus },
  ): Promise<BimModel> {
    const model = await this.bimStore.get(id);
    if (!model || model.tenantId !== tenantId) throw new Error(`BIM model ${id} not found`);
    const updated = bumpModelVersion(model, patch);
    const event = makeEvent({
      type: BIM_MODEL_EVENT.versioned,
      tenantId, companyId: model.companyId, actorId: null,
      aggregateType: 'engineering.bim_model', aggregateId: id,
      payload: { code: model.code, version: updated.version, revision: updated.revision },
    });
    await this.tx.run(async (handle) => {
      await this.bimStore.save(updated);
      await this.events.appendWithClient(handle, [event]);
    });
    return updated;
  }

  getBimModel(id: Id): Promise<BimModel | null> {
    return this.bimStore.get(id);
  }

  listBimModels(filter?: BimModelFilter): Promise<BimModel[]> {
    return this.bimStore.list(filter);
  }

  listBimModelsPaged(filter: BimModelFilter, page: import('@aura/shared').PageParams) {
    return this.bimStore.listPaged(filter, page);
  }
}
