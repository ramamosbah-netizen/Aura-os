import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, type Page, type PageParams, makeEvent } from '@aura/shared';
import { ProjectResolverRegistry, AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';

import {
  type Transmittal,
  makeTransmittal,
  sendTransmittal,
  receiveTransmittal,
  acknowledgeTransmittal as ackTransmittalDomain,
} from './domain/transmittal';
import { makeTransmittalAcknowledgement, type TransmittalAcknowledgement } from './domain/transmittal-acknowledgement';
import {
  acknowledgeAsRecipient,
  makeTransmittalRecipient,
  receiptOf,
  recipientFor,
  type TransmittalParty,
  type TransmittalReceipt,
  type TransmittalRecipient,
} from './domain/transmittal-recipient';
import { TRANSMITTAL_RECIPIENT_STORE, type TransmittalRecipientStore } from './transmittal-recipient-store';
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
    // POSITION MATTERS: several suites construct this service positionally, so inserting a
    // dependency anywhere but the end silently rebinds every later one. Added here rather than
    // appended because it belongs beside the other transmittal stores, and the call sites were
    // updated with it.
    @Inject(TRANSMITTAL_RECIPIENT_STORE) private readonly transmittalRecipientStore: TransmittalRecipientStore,
    @Inject(DOCUMENT_REVISION_STORE) private readonly revisionStore: DocumentRevisionStore,
    @Inject(CORRESPONDENCE_STORE) private readonly correspondenceStore: CorrespondenceStore,
    @Inject(SUBMITTAL_STORE) private readonly submittalStore: SubmittalStore,
    @Inject(DRAWING_REGISTER_STORE) private readonly registerStore: DrawingRegisterStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly access: AccessService,
    @Optional() @Inject(ProjectResolverRegistry) private readonly projectScope: ProjectResolverRegistry | null = null,
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
    purpose?: string;
    createdBy?: string;
  }): Promise<Transmittal> {
    await this.projectScope?.requireProject(input.tenantId, input.projectId);
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      const target: AccessTarget = { permission: 'doccontrol.transmittal.create', orgPath, resource: { type: 'project', id: input.projectId } };
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
      this.access.assert(actorId, { permission, orgPath, resource: { type: 'project', id: transmittal.projectId } });
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
  /**
   * Address a conveyance to a named person, in the capacity they receive in.
   *
   * Recipients are added while it is still a DRAFT. After `sent` the distribution is what was
   * conveyed, and quietly adding somebody afterwards would leave a receipt list that no longer
   * matches the act it records.
   */
  async addTransmittalRecipient(input: {
    tenantId: Id; actorId: Id | null; transmittalId: Id; userId: Id; party?: TransmittalParty | string | null;
  }): Promise<TransmittalRecipient> {
    const transmittal = await this.transmittalStore.findById(input.transmittalId, input.tenantId);
    if (!transmittal) throw new Error(`Transmittal with ID ${input.transmittalId} not found`);
    if (transmittal.status !== 'draft') {
      // "can only" classifies as a 409 state conflict in the API error taxonomy.
      throw new Error(`recipients can only be added to a draft transmittal; ${transmittal.code} is already ${transmittal.status}`);
    }
    if (input.actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (transmittal.companyId) orgPath.push({ level: 'company', id: transmittal.companyId });
      this.access.assert(input.actorId, { permission: 'doccontrol.transmittal.update', orgPath, resource: { type: 'project', id: transmittal.projectId } });
    }
    const existing = await this.transmittalRecipientStore.listByTransmittal(transmittal.id, input.tenantId);
    if (existing.some((r) => r.userId === input.userId)) {
      throw new Error(`${input.userId} is already a recipient of ${transmittal.code}`);
    }
    const recipient = makeTransmittalRecipient({
      tenantId: input.tenantId, companyId: transmittal.companyId, projectId: transmittal.projectId,
      transmittalId: transmittal.id, userId: input.userId, party: input.party ?? null,
    });
    await this.transmittalRecipientStore.save(recipient);
    return recipient;
  }

  /** Where the distribution stands: who was addressed, who has answered, who has not. */
  async transmittalReceipt(tenantId: Id, transmittalId: Id): Promise<TransmittalReceipt> {
    return receiptOf(await this.transmittalRecipientStore.listByTransmittal(transmittalId, tenantId));
  }

  /**
   * Acknowledge receipt — as YOURSELF, for a conveyance that was sent to you.
   *
   * TWO conditions, and only one of them used to exist. The permission says you are the kind of
   * person who acknowledges conveyances; being ON the distribution says this one was sent to you.
   * Without the second, any holder could sign for a document addressed to somebody else and the
   * register would read as delivered.
   *
   * PARTIAL RECEIPT IS NOT RECEIPT. The transmittal advances to `acknowledged` only once EVERY
   * named recipient has answered; until then it stays where it is, and the per-person receipts are
   * the truth. One person confirming must never report that three people have it.
   *
   * A conveyance with NO named recipients keeps the previous behaviour, where the permission alone
   * decides: historical records carry no distribution to check against, and refusing them all would
   * rewrite the past rather than govern the present.
   */
  async acknowledgeTransmittal(tenantId: Id, actorId: Id | null, id: Id, note?: string): Promise<Transmittal> {
    const transmittal = await this.transmittalStore.findById(id, tenantId);
    if (!transmittal) throw new Error(`Transmittal with ID ${id} not found`);
    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (transmittal.companyId) orgPath.push({ level: 'company', id: transmittal.companyId });
      this.access.assert(actorId, { permission: 'doccontrol.transmittal.acknowledge', orgPath, resource: { type: 'project', id: transmittal.projectId } });
    }

    const named = await this.transmittalRecipientStore.listByTransmittal(transmittal.id, tenantId);
    let mine: TransmittalRecipient | null = null;
    if (named.length > 0) {
      const found = recipientFor(named, actorId);
      if (!found) {
        throw new Error(
          `this transmittal was not sent to ${actorId ?? 'an unidentified caller'}; only a named recipient can acknowledge it`,
        );
      }
      mine = acknowledgeAsRecipient(found, { note });
    }

    const after = named.map((r) => (mine && r.id === mine.id ? mine : r));
    const receipt = receiptOf(after);
    const advance = named.length === 0 || receipt.fullyAcknowledged;
    const updated = advance ? ackTransmittalDomain(transmittal) : transmittal;

    const ack = makeTransmittalAcknowledgement({
      tenantId, companyId: transmittal.companyId, transmittalId: transmittal.id,
      transmittalCode: transmittal.code, acknowledgedBy: actorId, note,
    });
    const event = makeEvent({
      type: DOCCONTROL_EVENT.transmittalAcknowledged,
      tenantId, companyId: transmittal.companyId, actorId,
      aggregateType: 'doccontrol.transmittal', aggregateId: transmittal.id,
      payload: {
        code: transmittal.code, status: updated.status, projectId: transmittal.projectId,
        // Where the distribution stands after this answer, so a reader of the log is never left to
        // infer whether the document has actually landed everywhere it was sent.
        acknowledgedCount: receipt.acknowledgedCount, recipientCount: receipt.recipients.length,
        outstanding: receipt.outstanding.map((r) => r.userId),
      },
    });
    await this.tx.run(async (handle) => {
      if (mine) await this.transmittalRecipientStore.save(mine, handle);
      if (advance) await this.transmittalStore.save(updated, handle);
      await this.transmittalAckStore.save(ack, handle);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(
      `Transmittal acknowledged by ${actorId ?? 'unknown'}: ${transmittal.code} (${receipt.acknowledgedCount}/${receipt.recipients.length})`,
    );
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
    await this.projectScope?.requireProject(input.tenantId, input.projectId);
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'doccontrol.correspondence.create', orgPath, resource: { type: 'project', id: input.projectId } });
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
      this.access.assert(actorId, { permission: 'doccontrol.correspondence.close', orgPath, resource: { type: 'project', id: correspondence.projectId } });
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
    await this.projectScope?.requireProject(input.tenantId, input.projectId);
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'doccontrol.submittal.create', orgPath, resource: { type: 'project', id: input.projectId } });
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
    await this.projectScope?.requireProject(input.tenantId, input.projectId);
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'doccontrol.register.create', orgPath, resource: { type: 'project', id: input.projectId } });
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

  private assertDocPerm(actorId: Id | null, tenantId: Id, companyId: string | null, permission: string, projectId: Id): void {
    if (!actorId) return;
    const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
    if (companyId) orgPath.push({ level: 'company', id: companyId });
    this.access.assert(actorId, { permission, orgPath, resource: { type: 'project', id: projectId } });
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
    this.assertDocPerm(actorId, rev.tenantId, rev.companyId, 'doccontrol.document.submit', rev.projectId);
    return this.saveRevisionWithEvent(submitDocument(rev, actorId), actorId, DOCCONTROL_EVENT.documentSubmitted);
  }

  /** submitted → under_review. */
  async startReviewDocument(tenantId: Id, actorId: Id | null, revisionId: Id): Promise<DocumentRevision> {
    const rev = await this.loadRevision(tenantId, revisionId);
    this.assertDocPerm(actorId, rev.tenantId, rev.companyId, 'doccontrol.document.review', rev.projectId);
    return this.saveRevisionWithEvent(startReviewDocument(rev, actorId), actorId, DOCCONTROL_EVENT.documentReviewStarted);
  }

  /** under_review → approved. */
  async approveDocument(tenantId: Id, actorId: Id | null, revisionId: Id, comments?: string): Promise<DocumentRevision> {
    const rev = await this.loadRevision(tenantId, revisionId);
    this.assertDocPerm(actorId, rev.tenantId, rev.companyId, 'doccontrol.document.approve', rev.projectId);
    return this.saveRevisionWithEvent(approveDocument(rev, actorId, comments), actorId, DOCCONTROL_EVENT.documentApproved);
  }

  /** under_review → rejected. Reason is mandatory. */
  async rejectDocument(tenantId: Id, actorId: Id | null, revisionId: Id, reason: string): Promise<DocumentRevision> {
    const rev = await this.loadRevision(tenantId, revisionId);
    this.assertDocPerm(actorId, rev.tenantId, rev.companyId, 'doccontrol.document.approve', rev.projectId);
    return this.saveRevisionWithEvent(rejectDocument(rev, actorId, reason), actorId, DOCCONTROL_EVENT.documentRejected);
  }

  /**
   * approved → issued. Updates the register header to this revision (status for_construction) and
   * supersedes the previously-issued revision of the same document (kept immutable in history).
   */
  async issueDocument(tenantId: Id, actorId: Id | null, revisionId: Id): Promise<DocumentRevision> {
    const rev = await this.loadRevision(tenantId, revisionId);
    this.assertDocPerm(actorId, rev.tenantId, rev.companyId, 'doccontrol.document.issue', rev.projectId);
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
    this.assertDocPerm(actorId, source.tenantId, source.companyId, 'doccontrol.document.revise', source.projectId);
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
