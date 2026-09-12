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
import { CommissioningService } from './commissioning.service';
import { ENGINEERING_RELEASE, type EngineeringReleasePort } from './ports';

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
    // Engineering is another context, so it comes through the port commissioning already declares.
    // Absent or throwing ⇒ null ⇒ UNKNOWN ⇒ blocked. Never a pass.
    @Optional() @Inject(ENGINEERING_RELEASE) private readonly engineering?: EngineeringReleasePort,
  ) {}

  private async withStats(pkg: HandoverPackage): Promise<HandoverView> {
    const [workspace, drawings, omItems, trainingSessions] = await Promise.all([
      this.commissioning.readWorkspace(pkg.tenantId, pkg.projectId),
      this.engineering
        ? this.engineering.readProjectDrawingRelease(pkg.tenantId, pkg.projectId).catch((error) => {
            this.logger.warn(`[Handover] Engineering could not be read: ${error}`);
            return null;
          })
        : Promise.resolve(null),
      // Handover's own two authorities (TC-GATE-5) — no port needed, these are its own tables.
      this.store.listOmItems(pkg.tenantId, pkg.projectId),
      this.store.listTrainingSessions(pkg.tenantId, pkg.projectId),
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
      drawings,
      omItems: omItems.map((i) => ({ commissioningId: i.commissioningId, deliverable: i.deliverable, required: i.required, state: i.state })),
      trainingSessions: trainingSessions.map((s) => ({ commissioningId: s.commissioningId, state: s.state })),
      systemIds: workspace.systems.map((s) => s.record.id),
      asserted: {
        warrantyDocs: pkg.checklist.warrantyDocs,
        spares: pkg.checklist.spares,
      },
    });

    return {
      ...pkg,
      systemsTotal: workspace.systems.length,
      systemsCommissioned: workspace.systems.filter((s) => s.commissioned).length,
      readiness,
    };
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
   * `testCertificates` and `asBuilts` are refused: since TC-GATE-4 both are derived from Testing &
   * Commissioning and Engineering, and accepting a tick for them would let the package assert
   * something the evidence does not say — exactly the behaviour this gate removed.
   */
  async updateChecklist(id: string, tenantId: string, patch: Partial<HandoverChecklist>): Promise<HandoverView> {
    const derived = (['testCertificates', 'asBuilts', 'omManuals', 'training'] as const).filter((key) => key in patch);
    if (derived.length > 0) {
      throw new Error(
        `only an item without an owning authority can be ticked by hand — ${derived.join(', ')} ` +
          'is derived from Testing & Commissioning, Engineering, the O&M pack and the client training record',
      );
    }
    const next = updateChecklist(await this.mustFind(id, tenantId), patch);
    await this.store.saveHandover(next);
    return this.withStats(next);
  }

  async submit(id: string, tenantId: string): Promise<HandoverView> {
    const pkg = await this.mustFind(id, tenantId);
    // Assess first, then gate on the assessment: the commissioning and as-built items are derived,
    // so a tick cannot buy a submission the evidence does not support.
    const { readiness } = await this.withStats(pkg);
    const next = submit(pkg, readiness);
    await this.store.saveHandover(next);
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

  async advanceOmItem(
    id: string,
    tenantId: string,
    to: OmItemState,
    input: { documentId?: string | null; notes?: string | null; actorId?: string | null } = {},
  ): Promise<OmItem> {
    const item = await this.store.findOmItem(id, tenantId);
    if (!item) throw new Error(`not found: O&M deliverable ${id}`);
    const next = advanceOmItem(item, to, input);
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

  listOmItems(tenantId: string, projectId?: string): Promise<OmItem[]> {
    return this.store.listOmItems(tenantId, projectId);
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
