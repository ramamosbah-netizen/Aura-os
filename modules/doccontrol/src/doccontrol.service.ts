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

import { type RevisionHistoryRow, type TransmittalItem, type TransmittalPurpose, makeTransmittalItem } from './domain/transmittal-item';
import { TRANSMITTAL_ITEM_STORE, type TransmittalItemStore } from './store.interface';

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
    @Inject(TRANSMITTAL_ITEM_STORE) private readonly transmittalItemStore: TransmittalItemStore,
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

  // ── Transmittal items (transmittal ↔ register revision linkage) ────────────

  /**
   * Attach register documents to a transmittal. Each item snapshots the document number,
   * title and the revision conveyed (defaults to the register's current revision). The
   * register entry must belong to the transmittal's project.
   */
  async addTransmittalItems(
    tenantId: Id,
    transmittalId: Id,
    items: Array<{ registerEntryId: string; revision?: string; purpose?: TransmittalPurpose }>,
  ): Promise<TransmittalItem[]> {
    const transmittal = await this.transmittalStore.findById(transmittalId, tenantId);
    if (!transmittal) throw new Error(`Transmittal with ID ${transmittalId} not found`);

    const created: TransmittalItem[] = [];
    for (const input of items) {
      const entry = await this.registerStore.findById(input.registerEntryId, tenantId);
      if (!entry) throw new Error(`register entry ${input.registerEntryId} not found`);
      if (entry.projectId !== transmittal.projectId) {
        throw new Error(`register entry ${entry.documentNumber} belongs to another project`);
      }
      created.push(
        makeTransmittalItem({
          tenantId,
          companyId: transmittal.companyId,
          transmittalId: transmittal.id,
          registerEntryId: entry.id,
          documentNumber: entry.documentNumber,
          title: entry.title,
          revision: input.revision ?? entry.currentRevision,
          purpose: input.purpose,
        }),
      );
    }

    await this.tx.run(async (handle) => {
      for (const item of created) await this.transmittalItemStore.save(item, handle);
    });
    this.logger.log(`Transmittal ${transmittal.code}: ${created.length} item(s) attached`);
    return created;
  }

  listTransmittalItems(tenantId: Id, transmittalId: Id): Promise<TransmittalItem[]> {
    return this.transmittalItemStore.findByTransmittal(transmittalId, tenantId);
  }

  /**
   * Revision history for a register entry: every transmittal item that conveyed it,
   * joined to the transmittal head (code, recipient, status, sent date), newest first.
   */
  async registerEntryHistory(
    tenantId: Id,
    registerEntryId: Id,
  ): Promise<{ entry: DrawingRegisterEntry; history: RevisionHistoryRow[] }> {
    const entry = await this.registerStore.findById(registerEntryId, tenantId);
    if (!entry) throw new Error(`register entry ${registerEntryId} not found`);

    const items = await this.transmittalItemStore.findByRegisterEntry(registerEntryId, tenantId);
    const heads = new Map<string, Transmittal | null>();
    for (const item of items) {
      if (!heads.has(item.transmittalId)) {
        heads.set(item.transmittalId, await this.transmittalStore.findById(item.transmittalId, tenantId));
      }
    }

    const history: RevisionHistoryRow[] = items.map((item) => {
      const head = heads.get(item.transmittalId);
      return {
        revision: item.revision,
        purpose: item.purpose,
        transmittalId: item.transmittalId,
        transmittalCode: head?.code ?? '(deleted)',
        transmittalTitle: head?.title ?? '',
        recipient: head?.recipient ?? null,
        transmittalStatus: head?.status ?? 'unknown',
        sentAt: item.createdAt,
      };
    });
    return { entry, history };
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
