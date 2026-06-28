import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore } from '@aura/core';
import { type Subcontract, type SubcontractStatus, makeSubcontract, SUBCONTRACT_EVENT } from './domain/subcontract';
import { type Claim, type ClaimStatus, makeClaim, CLAIM_EVENT } from './domain/claim';
import { SUBCONTRACT_STORE, type SubcontractFilter, type ClaimFilter, type SubcontractStore } from './subcontract-store';

@Injectable()
export class SubcontractsService {
  private readonly logger = new Logger('SubcontractsService');

  constructor(
    @Inject(SUBCONTRACT_STORE) private readonly store: SubcontractStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly access: AccessService,
  ) {}

  // ── SUBCONTRACTS ─────────────────────────────────────────────────────────

  async createSubcontract(input: {
    tenantId: Id;
    projectId: Id;
    projectName?: string | null;
    title: string;
    subcontractorName: string;
    value: number;
    retentionPercentage?: number;
    createdBy?: Id | null;
  }): Promise<Subcontract> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      const target: AccessTarget = { permission: 'projects.project.update', orgPath };
      this.access.assert(input.createdBy, target);
    }

    const subcontract = makeSubcontract({
      tenantId: input.tenantId,
      projectId: input.projectId,
      projectName: input.projectName,
      title: input.title,
      subcontractorName: input.subcontractorName,
      value: input.value,
      retentionPercentage: input.retentionPercentage,
    });

    await this.store.createSubcontract(subcontract);
    this.logger.log(`Subcontract created: "${subcontract.title}" with ${subcontract.subcontractorName} value=$${subcontract.value}`);

    await this.events.append([
      makeEvent({
        type: SUBCONTRACT_EVENT.created,
        tenantId: subcontract.tenantId,
        companyId: null,
        actorId: input.createdBy ?? null,
        aggregateType: 'subcontracts.subcontract',
        aggregateId: subcontract.id,
        payload: {
          title: subcontract.title,
          subcontractor: subcontract.subcontractorName,
          value: subcontract.value,
        },
      }),
    ]);

    return subcontract;
  }

  async changeSubcontractStatus(id: Id, status: SubcontractStatus, actorId?: Id): Promise<Subcontract> {
    const existing = await this.store.getSubcontract(id);
    if (!existing) throw new Error(`Subcontract ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: existing.tenantId }];
      const target: AccessTarget = { permission: 'projects.project.update', orgPath };
      this.access.assert(actorId, target);
    }

    const updated: Subcontract = { ...existing, status };
    await this.store.updateSubcontract(updated);
    this.logger.log(`Subcontract ${existing.title} status changed to ${status}`);

    await this.events.append([
      makeEvent({
        type: SUBCONTRACT_EVENT.statusChanged,
        tenantId: updated.tenantId,
        companyId: null,
        actorId: actorId ?? null,
        aggregateType: 'subcontracts.subcontract',
        aggregateId: updated.id,
        payload: { status },
      }),
    ]);

    return updated;
  }

  async getSubcontract(id: Id): Promise<Subcontract | null> {
    return this.store.getSubcontract(id);
  }

  async listSubcontracts(filter?: SubcontractFilter): Promise<Subcontract[]> {
    return this.store.listSubcontracts(filter);
  }

  // ── CLAIMS / Interim Payment Certificates (IPCs) ─────────────────────────

  async createClaim(input: {
    tenantId: Id;
    subcontractId: Id;
    workCompletedValue: number;
    isRetentionRelease?: boolean;
    retentionReleased?: number;
    createdBy?: Id | null;
  }): Promise<Claim> {
    const subcontract = await this.store.getSubcontract(input.subcontractId);
    if (!subcontract) throw new Error(`Subcontract ${input.subcontractId} not found`);

    if (subcontract.status !== 'active') {
      throw new Error(`Cannot submit claim against inactive subcontract (current status: ${subcontract.status})`);
    }

    // List prior claims to find next claim number and previously certified gross value
    const priorClaims = await this.store.listClaims({ subcontractId: input.subcontractId });
    const claimNumber = priorClaims.length + 1;

    // Previously certified is the workCompletedValue of the latest certified/paid claim, or 0 if none
    const certifiedClaims = priorClaims.filter(c => c.status === 'certified' || c.status === 'paid');
    const previouslyCertified = certifiedClaims.length > 0
      ? Math.max(...certifiedClaims.map(c => c.workCompletedValue))
      : 0;

    const claim = makeClaim({
      tenantId: input.tenantId,
      subcontractId: input.subcontractId,
      claimNumber,
      workCompletedValue: input.workCompletedValue,
      previouslyCertifiedValue: previouslyCertified,
      isRetentionRelease: input.isRetentionRelease,
      retentionReleased: input.retentionReleased,
    }, subcontract.retentionPercentage);

    await this.store.createClaim(claim);
    this.logger.log(`Subcontractor Claim #${claim.claimNumber} created: Gross=$${claim.thisPeriodGrossValue}, Retention=$${claim.retentionWithheld}, Net=$${claim.netCertifiedValue}, Release=${claim.isRetentionRelease ? 'Yes' : 'No'}`);

    return claim;
  }

  async certifyClaim(id: Id, certifierId: Id): Promise<Claim> {
    const existing = await this.store.getClaim(id);
    if (!existing) throw new Error(`Claim ${id} not found`);

    const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: existing.tenantId }];
    const target: AccessTarget = { permission: 'finance.invoice.approve', orgPath };
    this.access.assert(certifierId, target);

    const updated: Claim = {
      ...existing,
      status: 'certified',
      certifiedAt: new Date().toISOString(),
      certifiedBy: certifierId,
    };

    await this.store.updateClaim(updated);
    this.logger.log(`Claim #${updated.claimNumber} certified by ${certifierId} for net amount $${updated.netCertifiedValue}`);

    await this.events.append([
      makeEvent({
        type: CLAIM_EVENT.statusChanged,
        tenantId: updated.tenantId,
        companyId: null,
        actorId: certifierId,
        aggregateType: 'subcontracts.claim',
        aggregateId: updated.id,
        payload: {
          status: updated.status,
          claimNumber: updated.claimNumber,
          netCertifiedValue: updated.netCertifiedValue,
          retentionWithheld: updated.retentionWithheld,
        },
      }),
    ]);

    return updated;
  }

  async payClaim(id: Id, actorId?: Id): Promise<Claim> {
    const existing = await this.store.getClaim(id);
    if (!existing) throw new Error(`Claim ${id} not found`);

    if (existing.status !== 'certified') {
      throw new Error(`Only certified claims can be marked as paid (current status: ${existing.status})`);
    }

    const updated: Claim = {
      ...existing,
      status: 'paid',
    };

    await this.store.updateClaim(updated);
    this.logger.log(`Claim #${updated.claimNumber} paid`);

    await this.events.append([
      makeEvent({
        type: CLAIM_EVENT.statusChanged,
        tenantId: updated.tenantId,
        companyId: null,
        actorId: actorId ?? null,
        aggregateType: 'subcontracts.claim',
        aggregateId: updated.id,
        payload: {
          status: updated.status,
          claimNumber: updated.claimNumber,
          netCertifiedValue: updated.netCertifiedValue,
        },
      }),
    ]);

    return updated;
  }

  async getClaim(id: Id): Promise<Claim | null> {
    return this.store.getClaim(id);
  }

  async listClaims(filter?: ClaimFilter): Promise<Claim[]> {
    return this.store.listClaims(filter);
  }
}
