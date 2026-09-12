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
    const [workspace, drawings] = await Promise.all([
      this.commissioning.readWorkspace(pkg.tenantId, pkg.projectId),
      this.engineering
        ? this.engineering.readProjectDrawingRelease(pkg.tenantId, pkg.projectId).catch((error) => {
            this.logger.warn(`[Handover] Engineering could not be read: ${error}`);
            return null;
          })
        : Promise.resolve(null),
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
      asserted: {
        omManuals: pkg.checklist.omManuals,
        warrantyDocs: pkg.checklist.warrantyDocs,
        training: pkg.checklist.training,
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
    const derived = (['testCertificates', 'asBuilts'] as const).filter((key) => key in patch);
    if (derived.length > 0) {
      throw new Error(
        `only an item without an owning authority can be ticked by hand — ${derived.join(' and ')} ` +
          'is derived from Testing & Commissioning and Engineering',
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

  private async mustFind(id: string, tenantId: string): Promise<HandoverPackage> {
    const pkg = await this.store.findHandover(id, tenantId);
    if (!pkg) throw new Error(`not found: handover package ${id}`);
    return pkg;
  }
}
