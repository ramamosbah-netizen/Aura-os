import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';

import { type Transmittal, makeTransmittal } from './domain/transmittal';
import { TRANSMITTAL_STORE, type TransmittalStore } from './store.interface';

import { type Correspondence, makeCorrespondence } from './domain/correspondence';
import { CORRESPONDENCE_STORE, type CorrespondenceStore } from './store.interface';

import { type Submittal, type ReviewCode, makeSubmittal, submitForReview, returnWithCode } from './domain/submittal';
import { SUBMITTAL_STORE, type SubmittalStore } from './store.interface';

import { type DrawingRegisterEntry, type NewDrawingRegisterEntry, type RegisterStatus, makeDrawingRegisterEntry, reviseRegisterEntry } from './domain/drawing-register';
import { DRAWING_REGISTER_STORE, type DrawingRegisterStore } from './store.interface';

export const DOCCONTROL_EVENT = {
  transmittalSent: 'doccontrol.transmittal.sent',
  correspondenceLogged: 'doccontrol.correspondence.logged',
  submittalSubmitted: 'doccontrol.submittal.submitted',
  submittalReturned: 'doccontrol.submittal.returned',
};

@Injectable()
export class DocControlService {
  private readonly logger = new Logger('DocControl');

  constructor(
    @Inject(TRANSMITTAL_STORE) private readonly transmittalStore: TransmittalStore,
    @Inject(CORRESPONDENCE_STORE) private readonly correspondenceStore: CorrespondenceStore,
    @Inject(SUBMITTAL_STORE) private readonly submittalStore: SubmittalStore,
    @Inject(DRAWING_REGISTER_STORE) private readonly registerStore: DrawingRegisterStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly access: AccessService,
  ) {}

  // ── Transmittals ──────────────────────────────────────────────────────────

  async createTransmittal(input: {
    tenantId: string;
    companyId?: string;
    code: string;
    title: string;
    projectId: string;
    projectName?: string;
    sender?: string;
    recipient?: string;
    createdBy?: string;
  }): Promise<Transmittal> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      const target: AccessTarget = { permission: 'doccontrol.transmittal.create', orgPath };
      this.access.assert(input.createdBy, target);
    }

    const transmittal = makeTransmittal(input);
    const event = makeEvent({
      type: DOCCONTROL_EVENT.transmittalSent,
      tenantId: transmittal.tenantId,
      companyId: transmittal.companyId,
      actorId: input.createdBy || null,
      aggregateType: 'doccontrol.transmittal',
      aggregateId: transmittal.id,
      payload: { code: transmittal.code, title: transmittal.title, projectId: transmittal.projectId },
    });

    await this.tx.run(async (handle) => {
      await this.transmittalStore.save(transmittal, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Transmittal created & sent: ${transmittal.code} (${transmittal.id})`);
    return transmittal;
  }

  async acknowledgeTransmittal(tenantId: Id, actorId: Id | null, id: Id): Promise<Transmittal> {
    const transmittal = await this.transmittalStore.findById(id, tenantId);
    if (!transmittal) throw new Error(`Transmittal with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (transmittal.companyId) orgPath.push({ level: 'company', id: transmittal.companyId });
      this.access.assert(actorId, { permission: 'doccontrol.transmittal.acknowledge', orgPath });
    }

    transmittal.status = 'acknowledged';
    transmittal.updatedAt = new Date().toISOString();

    await this.tx.run(async (handle) => {
      await this.transmittalStore.save(transmittal, handle);
    });

    this.logger.log(`Transmittal acknowledged: ${transmittal.code} (${transmittal.id})`);
    return transmittal;
  }

  listTransmittals(tenantId: Id): Promise<Transmittal[]> {
    return this.transmittalStore.findAll(tenantId);
  }

  // ── Correspondence ─────────────────────────────────────────────────────────

  async createCorrespondence(input: {
    tenantId: string;
    companyId?: string;
    code: string;
    subject: string;
    projectId: string;
    projectName?: string;
    direction: 'inbound' | 'outbound';
    sender?: string;
    recipient?: string;
    createdBy?: string;
  }): Promise<Correspondence> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'doccontrol.correspondence.create', orgPath });
    }

    const correspondence = makeCorrespondence(input);
    const event = makeEvent({
      type: DOCCONTROL_EVENT.correspondenceLogged,
      tenantId: correspondence.tenantId,
      companyId: correspondence.companyId,
      actorId: input.createdBy || null,
      aggregateType: 'doccontrol.correspondence',
      aggregateId: correspondence.id,
      payload: { code: correspondence.code, subject: correspondence.subject, direction: correspondence.direction, projectId: correspondence.projectId },
    });

    await this.tx.run(async (handle) => {
      await this.correspondenceStore.save(correspondence, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Correspondence logged: ${correspondence.code} (${correspondence.id})`);
    return correspondence;
  }

  async closeCorrespondence(tenantId: Id, actorId: Id | null, id: Id): Promise<Correspondence> {
    const correspondence = await this.correspondenceStore.findById(id, tenantId);
    if (!correspondence) throw new Error(`Correspondence with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (correspondence.companyId) orgPath.push({ level: 'company', id: correspondence.companyId });
      this.access.assert(actorId, { permission: 'doccontrol.correspondence.close', orgPath });
    }

    correspondence.status = 'closed';
    correspondence.updatedAt = new Date().toISOString();

    await this.tx.run(async (handle) => {
      await this.correspondenceStore.save(correspondence, handle);
    });

    this.logger.log(`Correspondence closed: ${correspondence.code} (${correspondence.id})`);
    return correspondence;
  }

  listCorrespondence(tenantId: Id): Promise<Correspondence[]> {
    return this.correspondenceStore.findAll(tenantId);
  }

  // ── Submittals (document review register) ──────────────────────────────────

  async createSubmittal(input: {
    tenantId: string;
    companyId?: string | null;
    projectId: string;
    projectName?: string | null;
    reference: string;
    title: string;
    discipline?: Submittal['discipline'];
    revision?: number;
    createdBy?: string | null;
  }): Promise<Submittal> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'doccontrol.submittal.create', orgPath });
    }
    const submittal = makeSubmittal(input);
    await this.tx.run(async (handle) => {
      await this.submittalStore.save(submittal, handle);
    });
    this.logger.log(`Submittal created: ${submittal.reference} rev ${submittal.revision}`);
    return submittal;
  }

  async submitSubmittal(tenantId: Id, id: Id): Promise<Submittal> {
    const found = await this.submittalStore.findById(id, tenantId);
    if (!found) throw new Error(`submittal ${id} not found`);
    const updated = submitForReview(found);
    const event = makeEvent({
      type: DOCCONTROL_EVENT.submittalSubmitted,
      tenantId, companyId: found.companyId, actorId: null,
      aggregateType: 'doccontrol.submittal', aggregateId: id,
      payload: { reference: found.reference, revision: found.revision, projectId: found.projectId },
    });
    await this.tx.run(async (handle) => {
      await this.submittalStore.save(updated, handle);
      await this.events.appendWithClient(handle, [event]);
    });
    return updated;
  }

  async returnSubmittal(tenantId: Id, id: Id, reviewCode: ReviewCode, reviewComments?: string): Promise<Submittal> {
    const found = await this.submittalStore.findById(id, tenantId);
    if (!found) throw new Error(`submittal ${id} not found`);
    const updated = returnWithCode(found, reviewCode, reviewComments);
    const event = makeEvent({
      type: DOCCONTROL_EVENT.submittalReturned,
      tenantId, companyId: found.companyId, actorId: null,
      aggregateType: 'doccontrol.submittal', aggregateId: id,
      payload: { reference: found.reference, reviewCode, revision: found.revision },
    });
    await this.tx.run(async (handle) => {
      await this.submittalStore.save(updated, handle);
      await this.events.appendWithClient(handle, [event]);
    });
    return updated;
  }

  listSubmittals(tenantId: Id): Promise<Submittal[]> {
    return this.submittalStore.findAll(tenantId);
  }

  // ── Drawing / Document Register (distribution matrix) ───────────────────────

  async createRegisterEntry(input: NewDrawingRegisterEntry): Promise<DrawingRegisterEntry> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'doccontrol.register.create', orgPath });
    }
    const entry = makeDrawingRegisterEntry(input);
    await this.tx.run(async (handle) => { await this.registerStore.save(entry, handle); });
    this.logger.log(`Register entry: ${entry.documentNumber} rev ${entry.currentRevision} (${entry.status})`);
    return entry;
  }

  async reviseRegisterEntry(tenantId: Id, id: Id, revision: string, status: RegisterStatus, revisionDate?: string): Promise<DrawingRegisterEntry> {
    const entry = await this.registerStore.findById(id, tenantId);
    if (!entry) throw new Error(`register entry ${id} not found`);
    const updated = reviseRegisterEntry(entry, revision, status, revisionDate);
    await this.tx.run(async (handle) => { await this.registerStore.save(updated, handle); });
    return updated;
  }

  listRegister(tenantId: Id): Promise<DrawingRegisterEntry[]> {
    return this.registerStore.findAll(tenantId);
  }

  listRegisterByProject(tenantId: Id, projectId: Id): Promise<DrawingRegisterEntry[]> {
    return this.registerStore.findByProject(projectId, tenantId);
  }
}
