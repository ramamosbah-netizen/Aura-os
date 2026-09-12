import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, type Page, type PageParams, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';

import {
  type Transmittal,
  makeTransmittal,
  sendTransmittal,
  receiveTransmittal,
  acknowledgeTransmittal as ackTransmittalDomain,
} from './domain/transmittal';
import { makeTransmittalAcknowledgement, type TransmittalAcknowledgement } from './domain/transmittal-acknowledgement';
import { TRANSMITTAL_STORE, TRANSMITTAL_ACK_STORE, type TransmittalStore, type TransmittalAcknowledgementStore, type DocListFilter } from './store.interface';

import {
  type DocumentRevision,
  makeDocumentRevision,
  submitDocument,
  startReviewDocument,
  approveDocument,
  rejectDocument,
  issueDocument,
  supersedeDocument,
  createNextRevision,
} from './domain/document-revision';
import { DOCUMENT_REVISION_STORE, type DocumentRevisionStore } from './store.interface';

import { type Correspondence, makeCorrespondence } from './domain/correspondence';
import { CORRESPONDENCE_STORE, type CorrespondenceStore } from './store.interface';

import { type Submittal, type ReviewCode, makeSubmittal, submitForReview, returnWithCode } from './domain/submittal';
import { SUBMITTAL_STORE, type SubmittalStore } from './store.interface';

import { type DrawingRegisterEntry, type NewDrawingRegisterEntry, type RegisterStatus, makeDrawingRegisterEntry, reviseRegisterEntry } from './domain/drawing-register';
import { DRAWING_REGISTER_STORE, type DrawingRegisterStore } from './store.interface';

import { type RevisionHistoryRow, type TransmittalItem, type TransmittalPurpose, makeTransmittalItem } from './domain/transmittal-item';
import { TRANSMITTAL_ITEM_STORE, type TransmittalItemStore } from './store.interface';

export const DOCCONTROL_EVENT = {
  transmittalCreated: 'doccontrol.transmittal.created',
  transmittalSent: 'doccontrol.transmittal.sent',
  transmittalReceived: 'doccontrol.transmittal.received',
  transmittalAcknowledged: 'doccontrol.transmittal.acknowledged',
  correspondenceLogged: 'doccontrol.correspondence.logged',
  submittalSubmitted: 'doccontrol.submittal.submitted',
  submittalReturned: 'doccontrol.submittal.returned',
  documentCreated: 'doccontrol.document.created',
  documentSubmitted: 'doccontrol.document.submitted',
  documentReviewStarted: 'doccontrol.document.review_started',
  documentApproved: 'doccontrol.document.approved',
  documentRejected: 'doccontrol.document.rejected',
  documentIssued: 'doccontrol.document.issued',
  documentRevised: 'doccontrol.document.revised',
};

@Injectable()
export class DocControlService {
  private readonly logger = new Logger('DocControl');

  constructor(
    @Inject(TRANSMITTAL_STORE) private readonly transmittalStore: TransmittalStore,
    @Inject(TRANSMITTAL_ITEM_STORE) private readonly transmittalItemStore: TransmittalItemStore,
    @Inject(TRANSMITTAL_ACK_STORE) private readonly transmittalAckStore: TransmittalAcknowledgementStore,
    @Inject(DOCUMENT_REVISION_STORE) private readonly revisionStore: DocumentRevisionStore,
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

    const transmittal = makeTransmittal(input); // starts as `draft` — items are attached before it is sent
    const event = makeEvent({
      type: DOCCONTROL_EVENT.transmittalCreated,
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

    this.logger.log(`Transmittal created (draft): ${transmittal.code} (${transmittal.id})`);
    return transmittal;
  }

  /** Move a transmittal along its enforced conveyance lifecycle. */
  private async transitionTransmittal(
    tenantId: Id,
    actorId: Id | null,
    id: Id,
    apply: (t: Transmittal) => Transmittal,
    permission: string,
    eventType: string,
  ): Promise<Transmittal> {
    const transmittal = await this.transmittalStore.findById(id, tenantId);
    if (!transmittal) throw new Error(`Transmittal with ID ${id} not found`);
    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (transmittal.companyId) orgPath.push({ level: 'company', id: transmittal.companyId });
      this.access.assert(actorId, { permission, orgPath });
    }
    const updated = apply(transmittal); // enforces the transition (throws 409 on illegal)
    const event = makeEvent({
      type: eventType,
      tenantId, companyId: transmittal.companyId, actorId,
      aggregateType: 'doccontrol.transmittal', aggregateId: transmittal.id,
      payload: { code: transmittal.code, status: updated.status, projectId: transmittal.projectId },
    });
    await this.tx.run(async (handle) => {
      await this.transmittalStore.save(updated, handle);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Transmittal ${transmittal.code} → ${updated.status}`);
    return updated;
  }

  /** draft → sent. */
  sendTransmittal(tenantId: Id, actorId: Id | null, id: Id): Promise<Transmittal> {
    return this.transitionTransmittal(tenantId, actorId, id, sendTransmittal, 'doccontrol.transmittal.send', DOCCONTROL_EVENT.transmittalSent);
  }

  /** sent → received. */
  receiveTransmittal(tenantId: Id, actorId: Id | null, id: Id): Promise<Transmittal> {
    return this.transitionTransmittal(tenantId, actorId, id, receiveTransmittal, 'doccontrol.transmittal.receive', DOCCONTROL_EVENT.transmittalReceived);
  }

  /** sent|received → acknowledged. Writes an immutable acknowledgement record (who/when/note). */
  async acknowledgeTransmittal(tenantId: Id, actorId: Id | null, id: Id, note?: string): Promise<Transmittal> {
    const transmittal = await this.transmittalStore.findById(id, tenantId);
    if (!transmittal) throw new Error(`Transmittal with ID ${id} not found`);
    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (transmittal.companyId) orgPath.push({ level: 'company', id: transmittal.companyId });
      this.access.assert(actorId, { permission: 'doccontrol.transmittal.acknowledge', orgPath });
    }
    const updated = ackTransmittalDomain(transmittal); // enforces sent|received → acknowledged
    const ack = makeTransmittalAcknowledgement({
      tenantId, companyId: transmittal.companyId, transmittalId: transmittal.id, transmittalCode: transmittal.code, acknowledgedBy: actorId, note,
    });
    const event = makeEvent({
      type: DOCCONTROL_EVENT.transmittalAcknowledged,
      tenantId, companyId: transmittal.companyId, actorId,
      aggregateType: 'doccontrol.transmittal', aggregateId: transmittal.id,
      payload: { code: transmittal.code, status: updated.status, projectId: transmittal.projectId },
    });
    await this.tx.run(async (handle) => {
      await this.transmittalStore.save(updated, handle);
      await this.transmittalAckStore.save(ack, handle);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Transmittal acknowledged: ${transmittal.code} (${transmittal.id})`);
    return updated;
  }

  listTransmittalAcknowledgements(tenantId: Id, transmittalId: Id) {
    return this.transmittalAckStore.listByTransmittal(transmittalId, tenantId);
  }

  listTransmittals(tenantId: Id): Promise<Transmittal[]> {
    return this.transmittalStore.findAll(tenantId);
  }

  listTransmittalsPaged(filter: DocListFilter, page: PageParams): Promise<Page<Transmittal>> {
    return this.transmittalStore.listPaged(filter, page);
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

  listCorrespondencePaged(filter: DocListFilter, page: PageParams): Promise<Page<Correspondence>> {
    return this.correspondenceStore.listPaged(filter, page);
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

  listSubmittalsPaged(filter: DocListFilter, page: PageParams): Promise<Page<Submittal>> {
    return this.submittalStore.listPaged(filter, page);
  }

  // ── Drawing / Document Register (distribution matrix) ───────────────────────

  /**
   * Create a controlled document (register header) AND its first governed revision (draft). The
   * revision is what walks the approval lifecycle; the register holds the current/issued state.
   */
  async createRegisterEntry(input: NewDrawingRegisterEntry): Promise<DrawingRegisterEntry> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'doccontrol.register.create', orgPath });
    }
    const entry = makeDrawingRegisterEntry(input);
    const revision = makeDocumentRevision({
      tenantId: entry.tenantId,
      companyId: entry.companyId,
      registerEntryId: entry.id,
      documentNumber: entry.documentNumber,
      projectId: entry.projectId,
      revision: entry.currentRevision,
      status: 'draft',
      createdBy: entry.createdBy,
    });
    const event = makeEvent({
      type: DOCCONTROL_EVENT.documentCreated,
      tenantId: entry.tenantId, companyId: entry.companyId, actorId: entry.createdBy,
      aggregateType: 'doccontrol.document', aggregateId: entry.id,
      payload: { documentNumber: entry.documentNumber, revision: entry.currentRevision, projectId: entry.projectId },
    });
    await this.tx.run(async (handle) => {
      await this.registerStore.save(entry, handle);
      await this.revisionStore.save(revision, handle);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Document created: ${entry.documentNumber} rev ${entry.currentRevision} (draft)`);
    return entry;
  }

  // ── Governed document-approval lifecycle (on the immutable DocumentRevision) ──

  private async loadRevision(tenantId: Id, id: Id): Promise<DocumentRevision> {
    const rev = await this.revisionStore.findById(id, tenantId);
    if (!rev) throw new Error(`document revision ${id} not found`);
    return rev;
  }

  private assertDocPerm(actorId: Id | null, tenantId: Id, companyId: string | null, permission: string): void {
    if (!actorId) return;
    const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
    if (companyId) orgPath.push({ level: 'company', id: companyId });
    this.access.assert(actorId, { permission, orgPath });
  }

  private async saveRevisionWithEvent(rev: DocumentRevision, actorId: Id | null, type: string): Promise<DocumentRevision> {
    const event = makeEvent({
      type, tenantId: rev.tenantId, companyId: rev.companyId, actorId,
      aggregateType: 'doccontrol.document', aggregateId: rev.registerEntryId,
      payload: { documentNumber: rev.documentNumber, revision: rev.revision, status: rev.status, projectId: rev.projectId },
    });
    await this.tx.run(async (handle) => {
      await this.revisionStore.save(rev, handle);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Document ${rev.documentNumber} rev ${rev.revision} → ${rev.status}`);
    return rev;
  }

  /** draft → submitted. */
  async submitDocument(tenantId: Id, actorId: Id | null, revisionId: Id): Promise<DocumentRevision> {
    const rev = await this.loadRevision(tenantId, revisionId);
    this.assertDocPerm(actorId, tenantId, rev.companyId, 'doccontrol.document.submit');
    return this.saveRevisionWithEvent(submitDocument(rev, actorId), actorId, DOCCONTROL_EVENT.documentSubmitted);
  }

  /** submitted → under_review. */
  async startReviewDocument(tenantId: Id, actorId: Id | null, revisionId: Id): Promise<DocumentRevision> {
    const rev = await this.loadRevision(tenantId, revisionId);
    this.assertDocPerm(actorId, tenantId, rev.companyId, 'doccontrol.document.review');
    return this.saveRevisionWithEvent(startReviewDocument(rev, actorId), actorId, DOCCONTROL_EVENT.documentReviewStarted);
  }

  /** under_review → approved. */
  async approveDocument(tenantId: Id, actorId: Id | null, revisionId: Id, comments?: string): Promise<DocumentRevision> {
    const rev = await this.loadRevision(tenantId, revisionId);
    this.assertDocPerm(actorId, tenantId, rev.companyId, 'doccontrol.document.approve');
    return this.saveRevisionWithEvent(approveDocument(rev, actorId, comments), actorId, DOCCONTROL_EVENT.documentApproved);
  }

  /** under_review → rejected. Reason is mandatory. */
  async rejectDocument(tenantId: Id, actorId: Id | null, revisionId: Id, reason: string): Promise<DocumentRevision> {
    const rev = await this.loadRevision(tenantId, revisionId);
    this.assertDocPerm(actorId, tenantId, rev.companyId, 'doccontrol.document.approve');
    return this.saveRevisionWithEvent(rejectDocument(rev, actorId, reason), actorId, DOCCONTROL_EVENT.documentRejected);
  }

  /**
   * approved → issued. Updates the register header to this revision (status for_construction) and
   * supersedes the previously-issued revision of the same document (kept immutable in history).
   */
  async issueDocument(tenantId: Id, actorId: Id | null, revisionId: Id): Promise<DocumentRevision> {
    const rev = await this.loadRevision(tenantId, revisionId);
    this.assertDocPerm(actorId, tenantId, rev.companyId, 'doccontrol.document.issue');
    const issued = issueDocument(rev, actorId);

    const entry = await this.registerStore.findById(rev.registerEntryId, tenantId);
    const siblings = await this.revisionStore.listByRegisterEntry(rev.registerEntryId, tenantId);
    const priorIssued = siblings.find((s) => s.id !== rev.id && s.status === 'issued');

    const event = makeEvent({
      type: DOCCONTROL_EVENT.documentIssued,
      tenantId, companyId: rev.companyId, actorId,
      aggregateType: 'doccontrol.document', aggregateId: rev.registerEntryId,
      payload: { documentNumber: rev.documentNumber, revision: rev.revision, projectId: rev.projectId },
    });
    await this.tx.run(async (handle) => {
      await this.revisionStore.save(issued, handle);
      if (priorIssued) await this.revisionStore.save(supersedeDocument(priorIssued), handle);
      if (entry) {
        await this.registerStore.save(
          { ...entry, currentRevision: issued.revision, status: 'for_construction', revisionDate: new Date().toISOString().slice(0, 10), updatedAt: new Date().toISOString() },
          handle,
        );
      }
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Document issued: ${rev.documentNumber} rev ${rev.revision}${priorIssued ? ` (superseded ${priorIssued.revision})` : ''}`);
    return issued;
  }

  /** Raise the next revision (draft) of a rejected/issued document. The source stays immutable. */
  async createRevision(tenantId: Id, actorId: Id | null, revisionId: Id, reason: string, revision?: string): Promise<DocumentRevision> {
    const source = await this.loadRevision(tenantId, revisionId);
    this.assertDocPerm(actorId, tenantId, source.companyId, 'doccontrol.document.revise');
    const next = createNextRevision(source, { reason, revision, actorId });
    return this.saveRevisionWithEvent(next, actorId, DOCCONTROL_EVENT.documentRevised);
  }

  getDocumentRevision(tenantId: Id, id: Id): Promise<DocumentRevision | null> {
    return this.revisionStore.findById(id, tenantId);
  }

  listDocumentRevisions(tenantId: Id, registerEntryId: Id): Promise<DocumentRevision[]> {
    return this.revisionStore.listByRegisterEntry(registerEntryId, tenantId);
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

  listRegisterPaged(filter: DocListFilter, page: PageParams): Promise<Page<DrawingRegisterEntry>> {
    return this.registerStore.listPaged(filter, page);
  }

  /**
   * Document control's answer to "may this project close?".
   *
   * Implements `DocumentsReadinessPort` for Projects.
   *
   * `asBuiltsApproved` is TRI-STATE, and the null case is the important one. `RegisterStatus`
   * carries an explicit `as_built`, so this domain can say yes or no — but only about drawings it
   * holds. A project whose register contains no as-built entry at all has not failed the check; the
   * check has not been answerable. Returning `false` there would tell a project manager to go fix
   * something that may not be theirs to fix, and returning `true` would close a project on a
   * document nobody ever produced.
   *
   * `for_review` is the pending state: a drawing sitting in review is a controlled document without
   * an approval, which is exactly what the closeout question asks about.
   */
  async readProjectDocumentReadiness(
    tenantId: Id,
    projectId: Id,
  ): Promise<{ pendingApprovals: number; asBuiltsApproved: boolean | null }> {
    const register = await this.listRegisterByProject(tenantId, projectId);
    const asBuilts = register.filter((entry) => entry.status === 'as_built');
    return {
      pendingApprovals: register.filter((entry) => entry.status === 'for_review').length,
      // No as-built in the register is "not answerable", never "approved" and never "missing".
      asBuiltsApproved: register.length === 0 ? null : asBuilts.length > 0 ? true : null,
    };
  }

  /**
   * The project's register, for a domain that REFERENCES documents without owning them (TC-GATE-6).
   *
   * Implements `DocControlPort` for Handover, whose O&M pack points at controlled documents and
   * whose as-built gate asks whether an as-built exists. Both are questions only this register can
   * answer — `RegisterStatus` carries `as_built`, and the register is where a document number
   * becomes a real thing with a revision.
   *
   * The whole register in one call, not a lookup per reference: a pack of nine deliverables across
   * ten systems would otherwise be ninety round trips to answer one screen.
   *
   * Deliberately a projection, not the row. The caller gets what it needs to resolve a reference and
   * nothing more — no custodian, no distribution list. A consumer that cannot see the distribution
   * matrix cannot come to depend on it, and this register stays free to change shape.
   */
  async readProjectDocuments(
    tenantId: Id,
    projectId: Id,
  ): Promise<Array<{ id: string; documentNumber: string; title: string; revision: string; status: string; discipline: string; docType: string }>> {
    const register = await this.listRegisterByProject(tenantId, projectId);
    return register.map((entry) => ({
      id: entry.id,
      documentNumber: entry.documentNumber,
      title: entry.title,
      revision: entry.currentRevision,
      status: entry.status as string,
      discipline: entry.discipline as string,
      docType: entry.docType as string,
    }));
  }

  /**
   * Open a DRAFT transmittal conveying documents another domain is issuing (TC-GATE-14).
   *
   * Implements `DocControlIssuePort` for Handover, whose dossier cites controlled documents it does
   * not own. The caller supplies the list and a title; everything that makes this a controlled
   * conveyance stays here — the permission check, the event, the code on the items, and every state
   * the transmittal moves through afterwards.
   *
   * DRAFT, not sent. Sending needs a recipient, and a handover package does not know the client's
   * document controller. A person completes and sends it here, where transmittals are sent.
   */
  async openTransmittal(
    tenantId: Id,
    request: {
      projectId: Id;
      projectName: string | null;
      code: string;
      title: string;
      items: { registerEntryId: string; revision: string }[];
      actorId?: string | null;
    },
  ): Promise<{ id: string; code: string }> {
    const transmittal = await this.createTransmittal({
      tenantId,
      code: request.code,
      title: request.title,
      projectId: request.projectId,
      projectName: request.projectName ?? undefined,
      createdBy: request.actorId ?? undefined,
    });
    if (request.items.length > 0) {
      // 'for_information': a handover dossier conveys the record, it does not ask for a review.
      await this.addTransmittalItems(
        tenantId,
        transmittal.id,
        request.items.map((i) => ({ registerEntryId: i.registerEntryId, revision: i.revision, purpose: 'for_information' as const })),
      );
    }
    return { id: transmittal.id, code: transmittal.code };
  }

  /**
   * The project's transmittals, for a domain that opened one and needs to know what became of it
   * (TC-GATE-15).
   *
   * Implements the read half of DocControlPort. The acknowledgement is resolved here rather than
   * handed over as a raw record: the transmittal head holds the current status, and the immutable
   * acknowledgement holds who and when, and a consumer should not have to know that they are two
   * tables to answer one question.
   *
   * A projection, not the row — no owner, no distribution list. A consumer that cannot see them
   * cannot come to depend on them.
   */
  async readProjectTransmittals(
    tenantId: Id,
    projectId: Id,
  ): Promise<Array<{
    id: string; code: string; status: string; recipient: string | null;
    sentAt: string | null; receivedAt: string | null; acknowledgedAt: string | null; acknowledgedBy: string | null;
  }>> {
    const transmittals = (await this.listTransmittals(tenantId)).filter((t) => t.projectId === projectId);
    return Promise.all(
      transmittals.map(async (t) => {
        // Only an acknowledged transmittal has an acknowledgement to read, so only it is asked for.
        const acks: TransmittalAcknowledgement[] =
          t.status === 'acknowledged' ? await this.transmittalAckStore.listByTransmittal(t.id, tenantId) : [];
        const latest = acks.reduce<TransmittalAcknowledgement | null>(
          (newest, a) => (newest && newest.acknowledgedAt >= a.acknowledgedAt ? newest : a),
          null,
        );
        return {
          id: t.id,
          code: t.code,
          status: t.status as string,
          recipient: t.recipient,
          sentAt: t.sentAt,
          receivedAt: t.receivedAt,
          acknowledgedAt: t.acknowledgedAt ?? latest?.acknowledgedAt ?? null,
          acknowledgedBy: latest?.acknowledgedBy ?? null,
        };
      }),
    );
  }

  listRegisterByProject(tenantId: Id, projectId: Id): Promise<DrawingRegisterEntry[]> {
    return this.registerStore.findByProject(projectId, tenantId);
  }
}
