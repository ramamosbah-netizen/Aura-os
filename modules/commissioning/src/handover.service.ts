import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EVENT_STORE, type EventStore } from '@aura/core';
import { makeEvent } from '@aura/shared';
import { COMMISSIONING_STORE, type CommissioningStore } from './store.interface';
import {
  type HandoverPackage,
  type HandoverChecklist,
  makeHandoverPackage,
  updateChecklist,
  submit,
  accept,
  reject,
} from './domain/handover';
import { assessHandoverReadiness, type HandoverReadiness } from './domain/handover-readiness';
import {
  type OmItem, type OmDeliverable, type OmItemState, OM_DELIVERABLES,
  makeOmItem, advanceOmItem, setOmRequired,
} from './domain/om-package';
import {
  type TrainingSession, makeTrainingSession, completeTraining, acknowledgeTraining,
} from './domain/client-training';
import {
  type SpareItem, makeSpareItem, handOverSpare, acknowledgeSpare, setSpareRequired,
} from './domain/spares';
import { resolveDocumentReference, type ResolvedDocument } from './domain/document-reference';
import {
  type DossierItem, type DossierView, assembleDossier, captureDossier, conveyableLines, groupIssues,
} from './domain/dossier';
import { CommissioningService } from './commissioning.service';
import {
  DOC_CONTROL, DOC_CONTROL_ISSUE,
  type DocControlPort, type DocControlIssuePort, type SnagFact, type TransmittalFact,
} from './ports';

/**
 * A handover package enriched with the live commissioning status of its project — the
 * lifecycle link (stage 11 → 12): you should not hand a project over until its systems are
 * commissioned, so the package always shows how many of the project's systems are done.
 */
export type HandoverView = HandoverPackage & {
  systemsTotal: number;
  systemsCommissioned: number;
  /**
   * Readiness, PROJECTED from the domains that own the evidence (TC-GATE-4). Two of the six items
   * are derived and cannot be ticked; the other four are still assertions and say so.
   */
  readiness: HandoverReadiness;
};

@Injectable()
export class HandoverService {
  private readonly logger = new Logger('HandoverService');

  constructor(
    @Inject(COMMISSIONING_STORE) private readonly store: CommissioningStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    // Same module, so this is a direct call rather than a port: handover reads T&C's OWN readiness
    // calculation, the one the T&C workspace shows and the sign-off guard uses. Two calculations of
    // "is this system ready" would be the drift this whole arrangement exists to prevent.
    private readonly commissioning: CommissioningService,
    // Document control is another context, so it comes through a port (TC-GATE-6). It answers two
    // questions: is there an as-built in this project's register, and is the document each O&M
    // deliverable was accepted against actually there.
    //
    // This REPLACED an Engineering port, and the replacement was a bug fix, not a preference:
    // Engineering's `DrawingStatus` has no as-built value, so the as-built gate it fed could never
    // reach READY on real data. See the note in domain/handover-readiness.ts.
    //
    // Absent or throwing ⇒ null ⇒ UNKNOWN ⇒ blocked. Never a pass.
    @Optional() @Inject(DOC_CONTROL) private readonly docControl?: DocControlPort,
    // Asking document control to open a transmittal for what this package is issuing (TC-GATE-14).
    // The first port here that WRITES, and it is still DocControl doing the writing: it assigns the
    // code, applies its own permission check and owns every state that follows. Absent means the
    // manifest is captured without a conveyance — an unwired port blocks proof, never work.
    @Optional() @Inject(DOC_CONTROL_ISSUE) private readonly docControlIssue?: DocControlIssuePort,
  ) {}

  private async withStats(pkg: HandoverPackage): Promise<HandoverView> {
    const [workspace, documents, omItems, trainingSessions, asBuiltLinks, quality, spares] = await Promise.all([
      this.commissioning.readWorkspace(pkg.tenantId, pkg.projectId),
      this.readDocuments(pkg.tenantId, pkg.projectId),
      // Handover's own two authorities (TC-GATE-5) — no port needed, these are its own tables.
      this.store.listOmItems(pkg.tenantId, pkg.projectId),
      this.store.listTrainingSessions(pkg.tenantId, pkg.projectId),
      // T&C's as-built links (TC-GATE-8) — same module, so a direct store read.
      this.store.listAsBuiltLinksForProject(pkg.tenantId, pkg.projectId),
      // Quality's snags (TC-GATE-9), through the port T&C already declares. Null when Quality
      // cannot be read, which the assessment renders as UNKNOWN — never as "no snags".
      this.commissioning.readQualityEvidence(pkg.tenantId, pkg.projectId),
      // Handover's own spares record (TC-GATE-16) — the last readiness item to get an authority.
      this.store.listSpareItems(pkg.tenantId, pkg.projectId),
    ]);

    const notReady = workspace.systems.filter((s) => !s.readiness.commissioningReady);
    const readiness = assessHandoverReadiness({
      systemsTotal: workspace.systems.length,
      systemsCommissioningReady: workspace.systems.length - notReady.length,
      // The blocker in the words T&C itself used, so the two screens say the same thing.
      notReadyReasons: notReady.map((s) => {
        const first = s.readiness.gates.find((g) => g.state === 'BLOCKED' || g.state === 'UNKNOWN');
        return `${s.record.code}: ${first ? first.reason : 'not ready'}`;
      }),
      documents,
      omItems: omItems.map((i) => ({
        commissioningId: i.commissioningId,
        deliverable: i.deliverable,
        required: i.required,
        state: i.state,
        documentId: i.documentId,
      })),
      trainingSessions: trainingSessions.map((s) => ({ commissioningId: s.commissioningId, state: s.state })),
      asBuiltLinks: asBuiltLinks.map((l) => ({ commissioningId: l.commissioningId, documentId: l.documentId })),
      snags: quality?.snags ?? null,
      systemIds: workspace.systems.map((s) => s.record.id),
      // TC-GATE-16: nothing is asserted any more. Spares was the last of the six, and the package's
      // stored checklist now has nothing left that anybody reads.
      spares: spares.map((s) => ({
        commissioningId: s.commissioningId,
        required: s.required,
        quantityRequired: s.quantityRequired,
        quantityHandedOver: s.quantityHandedOver,
        acknowledgedBy: s.acknowledgedBy,
      })),
    });

    return {
      ...pkg,
      systemsTotal: workspace.systems.length,
      systemsCommissioned: workspace.systems.filter((s) => s.commissioned).length,
      readiness,
    };
  }

  /**
   * Both defect authorities for a project, side by side (TC-GATE-9).
   *
   * Quality owns snags; T&C owns punch items. They are different records with different scopes,
   * different severity scales and different lifecycles, and this MERGES NEITHER — it returns each
   * under its own name so the surface can say who owns what. Handover writes neither: a third
   * writer for a defect is the last thing this repository needs.
   */
  async readDefects(tenantId: string, projectId: string): Promise<{
    snags: SnagFact[] | null;
    punch: Awaited<ReturnType<CommissioningStore['listPunchItemsForProject']>>;
  }> {
    const [quality, punch] = await Promise.all([
      this.commissioning.readQualityEvidence(tenantId, projectId),
      this.store.listPunchItemsForProject(tenantId, projectId),
    ]);
    return { snags: quality?.snags ?? null, punch };
  }

  /**
   * Ask document control to open a transmittal for the controlled documents this issue carries.
   *
   * Returns null — and the submission still goes through — in three cases, none of them a failure:
   * the port is not wired, the register could not be read, or the dossier cites nothing that IS a
   * controlled document. A package of evidence packs and training records with no registered
   * documents has nothing for a transmittal to carry, and inventing an empty one would put a hollow
   * conveyance in the register.
   *
   * A DocControl failure is caught and logged rather than raised: refusing the submission because
   * the conveyance could not be opened would let one domain's outage block another's decision. The
   * manifest still records what was sent; it records no transmittal, and the surface says so.
   */
  private async openTransmittalFor(
    pkg: HandoverPackage,
    view: DossierView,
    issueNo: number,
    actorId: string | null,
  ): Promise<{ id: string; code: string } | null> {
    if (!this.docControlIssue) return null;
    const documents = await this.readDocuments(pkg.tenantId, pkg.projectId);
    const items = conveyableLines(view, documents);
    if (items.length === 0) return null;
    try {
      return await this.docControlIssue.openTransmittal(pkg.tenantId, {
        projectId: pkg.projectId,
        projectName: pkg.projectName,
        code: `TR-${pkg.code}-${issueNo}`,
        title: `${pkg.title} — handover dossier issue ${issueNo}`,
        items,
        actorId,
      });
    } catch (error) {
      this.logger.warn(`[Handover] transmittal could not be opened for ${pkg.code}: ${error}`);
      return null;
    }
  }

  /**
   * Read the project register, or say plainly that it could not be read.
   *
   * Null here is not an error state to be smoothed over: it travels into the readiness assessment
   * and comes out as UNKNOWN, which blocks. A register we cannot see must never look like a register
   * that agreed with us.
   */
  private async readDocuments(tenantId: string, projectId: string) {
    if (!this.docControl) return null;
    try {
      return await this.docControl.readProjectDocuments(tenantId, projectId);
    } catch (error) {
      this.logger.warn(`[Handover] Document control could not be read: ${error}`);
      return null;
    }
  }

  /**
   * The dossier: what the client receives, assembled from the domains that own it (TC-GATE-7).
   *
   * `view` is derived on every read and is always "what would go out today". `issues` are the
   * manifests actually SENT, captured at submission and never rewritten — so a package that went out
   * in March still lists what March contained, whatever has moved since.
   */
  async readDossier(id: string, tenantId: string): Promise<{
    package: HandoverPackage;
    view: DossierView;
    issues: Array<ReturnType<typeof groupIssues>[number] & { transmittal: TransmittalFact | null }>;
  } | null> {
    const pkg = await this.store.findHandover(id, tenantId);
    if (!pkg) return null;
    const [view, items, transmittals] = await Promise.all([
      this.assembleFor(pkg),
      this.store.listDossierItems(pkg.id, tenantId),
      this.readTransmittals(pkg.tenantId, pkg.projectId),
    ]);

    // TC-GATE-15: the id TC-GATE-14 stored becomes an ANSWER. A stored reference nobody resolves is
    // what TC-GATE-6 removed from the O&M pack — it looks like evidence and proves nothing. Null
    // here means either no conveyance was opened, or document control could not be read; the surface
    // distinguishes the two rather than showing one silence for both.
    const byId = new Map((transmittals ?? []).map((t) => [t.id, t]));
    return {
      package: pkg,
      view,
      issues: groupIssues(items).map((issue) => ({
        ...issue,
        transmittal: issue.transmittalId ? byId.get(issue.transmittalId) ?? null : null,
      })),
    };
  }

  /** The project's transmittals, or null when document control could not be read. */
  private async readTransmittals(tenantId: string, projectId: string): Promise<TransmittalFact[] | null> {
    if (!this.docControl) return null;
    try {
      return await this.docControl.readProjectTransmittals(tenantId, projectId);
    } catch (error) {
      this.logger.warn(`[Handover] transmittals could not be read: ${error}`);
      return null;
    }
  }

  /** The dossier as it stands now, from the four owning domains. Reads only; stores nothing. */
  private async assembleFor(pkg: HandoverPackage): Promise<DossierView> {
    const [workspace, documents, omItems, trainingSessions, asBuiltLinks] = await Promise.all([
      this.commissioning.readWorkspace(pkg.tenantId, pkg.projectId),
      this.readDocuments(pkg.tenantId, pkg.projectId),
      this.store.listOmItems(pkg.tenantId, pkg.projectId),
      this.store.listTrainingSessions(pkg.tenantId, pkg.projectId),
      this.store.listAsBuiltLinksForProject(pkg.tenantId, pkg.projectId),
    ]);
    return assembleDossier({
      systems: workspace.systems.map((s) => ({
        id: s.record.id,
        code: s.record.code,
        title: s.record.title,
        commissioned: s.commissioned,
        witnessedBy: s.record.witnessedBy ?? null,
        pointsPassed: s.pointsPassed,
        pointsTotal: s.pointsTotal,
        certificate: s.certificate
          ? {
              documentNumber: s.certificate.documentNumber,
              revision: s.certificate.revision,
              current: s.certificate.current,
              note: s.certificate.note,
            }
          : null,
      })),
      omItems: omItems.map((i) => ({
        id: i.id, commissioningId: i.commissioningId, deliverable: i.deliverable,
        required: i.required, state: i.state, documentId: i.documentId,
      })),
      trainingSessions: trainingSessions.map((s) => ({
        id: s.id, title: s.title, state: s.state, acknowledgedBy: s.acknowledgedBy,
      })),
      asBuiltLinks: asBuiltLinks.map((l) => ({ id: l.id, commissioningId: l.commissioningId, documentId: l.documentId })),
      documents,
    });
  }

  async create(params: {
    tenantId: string;
    companyId?: string | null;
    projectId: string;
    projectName?: string | null;
    code: string;
    title: string;
    createdBy?: string | null;
  }): Promise<HandoverView> {
    const pkg = makeHandoverPackage(params);
    await this.store.saveHandover(pkg);
    this.logger.log(`[Handover] created ${pkg.code} for project ${pkg.projectId}`);
    return this.withStats(pkg);
  }

  async get(id: string, tenantId: string): Promise<HandoverView | null> {
    const pkg = await this.store.findHandover(id, tenantId);
    return pkg ? this.withStats(pkg) : null;
  }

  async list(tenantId: string, projectId?: string): Promise<HandoverView[]> {
    const pkgs = await this.store.listHandovers(tenantId, projectId);
    return Promise.all(pkgs.map((p) => this.withStats(p)));
  }

  /**
   * Tick one of the items nobody owns yet.
   *
   * NOTHING IS TICKABLE ANY MORE (TC-GATE-16).
   *
   * This method began as the writer for six booleans. Each gate took one away as its evidence found
   * an owner, and spares was the last. Every key is now refused, and the method is kept rather than
   * deleted so an existing caller gets a refusal that explains itself instead of a 404 — and so the
   * refusal is a testable claim rather than an absence.
   */
  async updateChecklist(id: string, tenantId: string, patch: Partial<HandoverChecklist>): Promise<HandoverView> {
    const derived = (['testCertificates', 'asBuilts', 'omManuals', 'training', 'warrantyDocs', 'spares'] as const)
      .filter((key) => key in patch);
    if (derived.length > 0) {
      throw new Error(
        `only an item without an owning authority can be ticked by hand — ${derived.join(', ')} ` +
          "is derived from Testing & Commissioning, document control, and this workspace's own O&M, training and spares records",
      );
    }
    const next = updateChecklist(await this.mustFind(id, tenantId), patch);
    await this.store.saveHandover(next);
    return this.withStats(next);
  }

  /**
   * Submit to the client — and capture what was sent (TC-GATE-7).
   *
   * The manifest is written AFTER the domain guard accepts the transition, so a refused submission
   * leaves no phantom issue behind, and BEFORE the package is saved as submitted, so a package can
   * never read "submitted" with no record of what it contained.
   *
   * A resubmission after a rejection is issue #2. Issue #1 stays exactly as it went out: the history
   * is the record, not the latest version of it — the same rule the test-run lineage follows.
   */
  async submit(id: string, tenantId: string, actorId?: string | null): Promise<HandoverView> {
    const pkg = await this.mustFind(id, tenantId);
    // Assess first, then gate on the assessment: the commissioning and as-built items are derived,
    // so a tick cannot buy a submission the evidence does not support.
    const { readiness } = await this.withStats(pkg);
    const next = submit(pkg, readiness);

    const existing = await this.store.listDossierItems(pkg.id, tenantId);
    const issueNo = existing.reduce((max, i) => Math.max(max, i.issueNo), 0) + 1;
    const view = await this.assembleFor(pkg);

    // The conveyance is opened BEFORE the manifest is captured, so its id exists when the rows are
    // written. The manifest table has no UPDATE policy and does not gain one: an issued manifest
    // records what was sent, and that includes how it was sent.
    const transmittal = await this.openTransmittalFor(pkg, view, issueNo, actorId ?? pkg.createdBy);

    const manifest: DossierItem[] = captureDossier(view, pkg, issueNo, actorId ?? pkg.createdBy, transmittal?.id ?? null);
    if (manifest.length > 0) await this.store.appendDossierItems(manifest);

    await this.store.saveHandover(next);
    this.logger.log(
      `[Handover] ${next.code} submitted — dossier issue ${issueNo}, ${manifest.length} item(s) cited` +
        (transmittal ? `, conveyed by transmittal ${transmittal.code}` : ', no controlled conveyance'),
    );
    return this.withStats(next);
  }

  async accept(
    id: string,
    tenantId: string,
    patch: { clientRepresentative: string; warrantyStartDate?: string; warrantyMonths?: number },
  ): Promise<HandoverView> {
    const next = accept(await this.mustFind(id, tenantId), patch);
    await this.store.saveHandover(next);
    // Client acceptance closes delivery and starts the warranty/DLP clock — the trigger for AMC.
    // A reactor turns this into a service contract (deliver → maintain).
    await this.events.append([
      makeEvent({
        type: 'commissioning.handover.accepted',
        tenantId: next.tenantId,
        companyId: next.companyId,
        actorId: next.createdBy,
        aggregateType: 'commissioning.handover',
        aggregateId: next.id,
        payload: {
          projectId: next.projectId,
          projectName: next.projectName,
          clientRepresentative: next.clientRepresentative,
          warrantyStartDate: next.warrantyStartDate,
          warrantyMonths: next.warrantyMonths,
        },
      }),
    ]);
    this.logger.log(`[Handover] ${next.code} accepted by ${patch.clientRepresentative} — warranty starts ${next.warrantyStartDate}`);
    return this.withStats(next);
  }

  async reject(id: string, tenantId: string, reason: string): Promise<HandoverView> {
    const next = reject(await this.mustFind(id, tenantId), reason);
    await this.store.saveHandover(next);
    return this.withStats(next);
  }

  // ── O&M deliverables (TC-GATE-5) ─────────────────────────────────────────────────────────────

  /**
   * Put a deliverable on a system's O&M pack.
   *
   * The system must exist — a pack hanging off nothing would count towards readiness for a system
   * nobody is handing over.
   */
  async addOmItem(
    tenantId: string,
    input: { commissioningId: string; deliverable: OmDeliverable; required?: boolean; notes?: string | null; createdBy?: string | null },
  ): Promise<OmItem> {
    const system = await this.commissioning.get(input.commissioningId, tenantId);
    if (!system) throw new Error(`not found: commissioning record ${input.commissioningId}`);
    const item = makeOmItem({
      tenantId,
      companyId: system.companyId,
      projectId: system.projectId,
      commissioningId: system.id,
      deliverable: input.deliverable,
      required: input.required,
      notes: input.notes,
      createdBy: input.createdBy,
    });
    await this.store.saveOmItem(item);
    return item;
  }

  /** Seed the standard pack for a system — every deliverable a client expects, all still required. */
  async seedOmPack(tenantId: string, commissioningId: string, createdBy?: string | null): Promise<OmItem[]> {
    const existing = (await this.store.listOmItems(tenantId)).filter((i) => i.commissioningId === commissioningId);
    const missing = OM_DELIVERABLES.filter((d) => !existing.some((i) => i.deliverable === d));
    const created: OmItem[] = [];
    for (const deliverable of missing) {
      created.push(await this.addOmItem(tenantId, { commissioningId, deliverable, createdBy }));
    }
    return created;
  }

  /**
   * Move a deliverable along — and, when submitting, check the reference is real (TC-GATE-6).
   *
   * The typo is caught HERE, at the moment somebody types it, rather than surfacing days later as a
   * readiness item nobody can explain. The readiness projection checks it again on every read, which
   * is not redundant: a document can be superseded long after it was referenced.
   *
   * If document control cannot be read the write still goes through. An unwired port must not stop
   * work from being recorded — it only stops the result being called verified, which is what the
   * UNKNOWN in the readiness chain does. Optional dependency, never optional evidence.
   */
  async advanceOmItem(
    id: string,
    tenantId: string,
    to: OmItemState,
    input: { documentId?: string | null; notes?: string | null; actorId?: string | null } = {},
  ): Promise<OmItem> {
    const item = await this.store.findOmItem(id, tenantId);
    if (!item) throw new Error(`not found: O&M deliverable ${id}`);
    const next = advanceOmItem(item, to, input);
    if (to === 'submitted') {
      const resolved = resolveDocumentReference(next.documentId, await this.readDocuments(tenantId, item.projectId));
      if (resolved?.missing) {
        throw new Error(
          `validation: the document reference "${resolved.reference}" must match a controlled document ` +
            "in this project's register — by document number or id",
        );
      }
    }
    await this.store.saveOmItem(next);
    return next;
  }

  async setOmItemRequired(id: string, tenantId: string, required: boolean, notes?: string | null): Promise<OmItem> {
    const item = await this.store.findOmItem(id, tenantId);
    if (!item) throw new Error(`not found: O&M deliverable ${id}`);
    const next = setOmRequired(item, required, notes);
    await this.store.saveOmItem(next);
    return next;
  }

  /**
   * The pack, with each reference put back to the register (TC-GATE-6).
   *
   * The resolved document is attached for READING only — it is never stored. That is the difference
   * between referencing DocControl and copying it: a title shown here is the title the register has
   * right now, and a revision that moves on shows as moved on, because nothing was kept.
   */
  async listOmItems(tenantId: string, projectId?: string): Promise<Array<OmItem & { resolved: ResolvedDocument | null }>> {
    const items = await this.store.listOmItems(tenantId, projectId);
    // One register read for the whole list, not one per item.
    const byProject = new Map<string, Awaited<ReturnType<HandoverService['readDocuments']>>>();
    for (const projectKey of new Set(items.map((i) => i.projectId))) {
      byProject.set(projectKey, await this.readDocuments(tenantId, projectKey));
    }
    return items.map((i) => ({
      ...i,
      resolved: resolveDocumentReference(i.documentId, byProject.get(i.projectId) ?? null),
    }));
  }

  // ── Spares handed to the client (TC-GATE-16) ─────────────────────────────────────────────────

  /**
   * List a part the client is owed for a system.
   *
   * The system must exist, for the same reason an O&M deliverable's must: spares hanging off nothing
   * would count towards readiness for a system nobody is handing over.
   */
  async addSpareItem(
    tenantId: string,
    input: {
      commissioningId: string; description: string; stockItemId?: string | null; unit?: string | null;
      quantityRequired?: number; required?: boolean; notes?: string | null; createdBy?: string | null;
    },
  ): Promise<SpareItem> {
    const system = await this.commissioning.get(input.commissioningId, tenantId);
    if (!system) throw new Error(`not found: commissioning record ${input.commissioningId}`);
    const item = makeSpareItem({
      tenantId,
      companyId: system.companyId,
      projectId: system.projectId,
      commissioningId: system.id,
      description: input.description,
      stockItemId: input.stockItemId,
      unit: input.unit,
      quantityRequired: input.quantityRequired,
      required: input.required,
      notes: input.notes,
      createdBy: input.createdBy,
    });
    await this.store.saveSpareItem(item);
    return item;
  }

  /** Record that spares were handed over. Our word — the client's comes next. */
  async handOverSpareItem(
    id: string,
    tenantId: string,
    input: { quantity: number; handedOverBy?: string | null; notes?: string | null },
  ): Promise<SpareItem> {
    const item = await this.store.findSpareItem(id, tenantId);
    if (!item) throw new Error(`not found: spare ${id}`);
    const next = handOverSpare(item, input);
    await this.store.saveSpareItem(next);
    return next;
  }

  /** The client confirms receipt. Only this satisfies readiness. */
  async acknowledgeSpareItem(id: string, tenantId: string, input: { acknowledgedBy: string }): Promise<SpareItem> {
    const item = await this.store.findSpareItem(id, tenantId);
    if (!item) throw new Error(`not found: spare ${id}`);
    const next = acknowledgeSpare(item, input);
    await this.store.saveSpareItem(next);
    this.logger.log(`[Handover] spare "${next.description}" acknowledged by ${next.acknowledgedBy}`);
    return next;
  }

  async setSpareItemRequired(id: string, tenantId: string, required: boolean, notes?: string | null): Promise<SpareItem> {
    const item = await this.store.findSpareItem(id, tenantId);
    if (!item) throw new Error(`not found: spare ${id}`);
    const next = setSpareRequired(item, required, notes);
    await this.store.saveSpareItem(next);
    return next;
  }

  listSpareItems(tenantId: string, projectId?: string): Promise<SpareItem[]> {
    return this.store.listSpareItems(tenantId, projectId);
  }

  // ── Client training and demonstration (TC-GATE-5) ────────────────────────────────────────────

  /**
   * Plan a training session for the CLIENT's people. Not HSE's worker-safety training: a different
   * authority about different people, and the two must never stand in for each other.
   */
  async planTraining(
    tenantId: string,
    input: {
      projectId: string; commissioningId?: string | null; title: string; topics?: string | null;
      trainer?: string | null; sessionDate?: string | null; durationMinutes?: number | null;
      materialDocumentId?: string | null; createdBy?: string | null;
    },
  ): Promise<TrainingSession> {
    let companyId: string | null = null;
    if (input.commissioningId) {
      const system = await this.commissioning.get(input.commissioningId, tenantId);
      if (!system || system.projectId !== input.projectId) {
        throw new Error(`not found: commissioning record ${input.commissioningId} on this project`);
      }
      companyId = system.companyId;
    }
    const session = makeTrainingSession({ tenantId, companyId, ...input });
    await this.store.saveTrainingSession(session);
    return session;
  }

  async completeTraining(
    id: string,
    tenantId: string,
    input: { attendees: string; trainer?: string | null; demonstrationCompleted?: boolean; sessionDate?: string | null },
  ): Promise<TrainingSession> {
    const session = await this.store.findTrainingSession(id, tenantId);
    if (!session) throw new Error(`not found: training session ${id}`);
    const next = completeTraining(session, input);
    await this.store.saveTrainingSession(next);
    return next;
  }

  async acknowledgeTraining(id: string, tenantId: string, input: { acknowledgedBy: string }): Promise<TrainingSession> {
    const session = await this.store.findTrainingSession(id, tenantId);
    if (!session) throw new Error(`not found: training session ${id}`);
    const next = acknowledgeTraining(session, input);
    await this.store.saveTrainingSession(next);
    this.logger.log(`[Handover] training "${next.title}" acknowledged by ${next.acknowledgedBy}`);
    return next;
  }

  listTrainingSessions(tenantId: string, projectId?: string): Promise<TrainingSession[]> {
    return this.store.listTrainingSessions(tenantId, projectId);
  }

  private async mustFind(id: string, tenantId: string): Promise<HandoverPackage> {
    const pkg = await this.store.findHandover(id, tenantId);
    if (!pkg) throw new Error(`not found: handover package ${id}`);
    return pkg;
  }
}
