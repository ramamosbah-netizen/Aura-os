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

@Injectable()
export class EngineeringService {
  private readonly logger = new Logger('Engineering');

  constructor(
    @Inject(DRAWING_STORE) private readonly drawingStore: DrawingStore,
    @Inject(RFI_STORE) private readonly rfiStore: RfiStore,
    @Inject(SUBMITTAL_STORE) private readonly submittalStore: SubmittalStore,
    @Inject(TECHNICAL_QUERY_STORE) private readonly tqStore: TechnicalQueryStore,
    @Inject(BIM_MODEL_STORE) private readonly bimStore: BimModelStore,
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
