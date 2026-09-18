import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, type Page, type PageParams, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore } from '@aura/core';
import { type Subcontract, type SubcontractStatus, makeSubcontract, SUBCONTRACT_EVENT } from './domain/subcontract';
import { type Claim, type ClaimStatus, makeClaim, certifyClaim, certificationSeparation, payClaim, CLAIM_EVENT } from './domain/claim';
import { type SubcontractVariation, type VariationType, makeSubcontractVariation, approveVariation, rejectVariation, signedAmount, VARIATION_EVENT } from './domain/variation';
import { type BackCharge, type BackChargeStatus, type BackChargeCategory, makeBackCharge, applyRecovery, BACK_CHARGE_EVENT } from './domain/back-charge';
import { SUBCONTRACT_STORE, type SubcontractFilter, type ClaimFilter, type VariationFilter, type BackChargeFilter, type SubcontractStore } from './subcontract-store';

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
    cbsNodeId?: Id | null;
    title: string;
    subcontractorName: string;
    value: number;
    retentionPercentage?: number;
    createdBy?: Id | null;
  }): Promise<Subcontract> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      // Named in THIS module's vocabulary. Every assertion in this service used to borrow one
      // from somewhere else — `projects.project.update` or `finance.invoice.approve` — which is
      // how a subcontractor payment certificate came to require an invoice-approval authority.
      const target: AccessTarget = { permission: 'subcontracts.subcontract.create', orgPath };
      this.access.assert(input.createdBy, target);
    }

    const subcontract = makeSubcontract({
      tenantId: input.tenantId,
      projectId: input.projectId,
      projectName: input.projectName,
      cbsNodeId: input.cbsNodeId,
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
      // Named in THIS module's vocabulary. Every assertion in this service used to borrow one
      // from somewhere else — `projects.project.update` or `finance.invoice.approve` — which is
      // how a subcontractor payment certificate came to require an invoice-approval authority.
      const target: AccessTarget = { permission: 'subcontracts.subcontract.status', orgPath };
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
        // Carried so the cost engine can accrue COMMITTED cost when the subcontract goes active
        // (a positive ledger entry on this cost line) — mirrors PO create → committed.
        payload: { status, projectId: updated.projectId, cbsNodeId: updated.cbsNodeId, value: updated.value, title: updated.title },
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

  async listSubcontractsPaged(filter: SubcontractFilter, page: PageParams): Promise<Page<Subcontract>> {
    return this.store.listSubcontractsPaged(filter, page);
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
      // WHO RAISED IT, on the record. `createdBy` already travelled this far and was dropped here,
      // so the claim could never say who applied for the money it asks for — which is what made the
      // maker/checker rule unwritable rather than merely absent.
      createdBy: input.createdBy ?? null,
    }, subcontract.retentionPercentage);

    await this.store.createClaim(claim);
    this.logger.log(`Subcontractor Claim #${claim.claimNumber} created: Gross=$${claim.thisPeriodGrossValue}, Retention=$${claim.retentionWithheld}, Net=$${claim.netCertifiedValue}, Release=${claim.isRetentionRelease ? 'Yes' : 'No'}`);

    return claim;
  }

  /**
   * Certify a subcontractor's application — the act that turns it into a sum this business owes.
   *
   * IT USED TO ASSERT `finance.invoice.approve`. Certifying a subcontractor's WORK ON SITE is a
   * quantity-surveying judgement, not an invoice approval, and the assertion was unreachable anyway:
   * the route guard refused Finance before the service could run it. The route now declares
   * `subcontracts.claim.certify`, a name the QS role holds, and the rules that matter — already
   * certified, the raiser certifying their own application, and over-certification — live in the
   * domain where the record can be read.
   */
  async certifyClaim(id: Id, certifierId: Id): Promise<Claim> {
    const existing = await this.store.getClaim(id);
    if (!existing) throw new Error(`Claim ${id} not found`);

    // The ceiling is the subcontract's OWN value, which approving a variation already adds its signed
    // amount to. Read here rather than recomputed, so there is one figure and not two that can differ.
    const subcontractForCeiling = await this.store.getSubcontract(existing.subcontractId);
    if (!subcontractForCeiling) throw new Error(`Subcontract ${existing.subcontractId} not found`);

    // Its own permission, asserted here as well as at the route. The service used to assert
    // `finance.invoice.approve` for this, which is a different question about a different document.
    if (certifierId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: existing.tenantId }];
      this.access.assert(certifierId, { permission: 'subcontracts.claim.certify', orgPath });
    }

    const updated = certifyClaim(existing, certifierId, subcontractForCeiling.value);

    await this.store.updateClaim(updated);
    this.logger.log(`Claim #${updated.claimNumber} certified by ${certifierId} for net amount $${updated.netCertifiedValue}`);

    const subcontract = await this.store.getSubcontract(updated.subcontractId);
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
          // Gross work done this period = the ACTUAL cost incurred (retention is withheld payment,
          // not a cost reduction). Carried with the cost line so the engine posts actual on certify.
          thisPeriodGrossValue: updated.thisPeriodGrossValue,
          retentionWithheld: updated.retentionWithheld,
          isRetentionRelease: updated.isRetentionRelease,
          retentionReleased: updated.retentionReleased,
          subcontractId: updated.subcontractId,
          subcontractor: subcontract?.subcontractorName ?? null,
          subcontractTitle: subcontract?.title ?? null,
          projectId: subcontract?.projectId ?? null,
          projectName: subcontract?.projectName ?? null,
          cbsNodeId: subcontract?.cbsNodeId ?? null,
        },
      }),
    ]);

    return updated;
  }

  /**
   * Release a certified claim for payment — the money actually leaving.
   *
   * The status guard already existed; the row recorded NOBODY, and the certifier could pay against
   * their own certificate. Certifying says the work is worth this; paying says the money goes now.
   */
  async payClaim(id: Id, actorId?: Id): Promise<Claim> {
    const existing = await this.store.getClaim(id);
    if (!existing) throw new Error(`Claim ${id} not found`);

    const updated = payClaim(existing, actorId ?? null);

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

  // ── VARIATIONS ───────────────────────────────────────────────────────────

  async createVariation(input: {
    tenantId: Id;
    subcontractId: Id;
    reference: string;
    type: VariationType;
    amount: number;
    description?: string;
    createdBy?: Id | null;
  }): Promise<SubcontractVariation> {
    const subcontract = await this.store.getSubcontract(input.subcontractId);
    if (!subcontract) throw new Error(`Subcontract ${input.subcontractId} not found`);

    const variation = makeSubcontractVariation(input);
    await this.store.createVariation(variation);
    await this.events.append([
      makeEvent({
        type: VARIATION_EVENT.created,
        tenantId: variation.tenantId, companyId: null, actorId: input.createdBy ?? null,
        aggregateType: 'subcontracts.variation', aggregateId: variation.id,
        payload: { subcontractId: variation.subcontractId, type: variation.type, amount: variation.amount },
      }),
    ]);
    this.logger.log(`Subcontract variation ${variation.reference} created (${variation.type} ${variation.amount})`);
    return variation;
  }

  /** Approve a variation and apply its signed amount to the subcontract value. */
  async approveVariation(id: Id, actorId?: Id | null): Promise<SubcontractVariation> {
    const existing = await this.store.getVariation(id);
    if (!existing) throw new Error(`Variation ${id} not found`);

    // IT USED TO ASSERT `projects.project.update` — a PROJECTS permission, to approve a SUBCONTRACT
    // variation that changes what this business owes a subcontractor. Same wrong-authority shape as
    // the claim certification asserting `finance.invoice.approve`, and unreachable for the same
    // reason. The route now declares `subcontracts.variation.approve`.
    //
    // A variation raises or lowers the subcontract value, which is the ceiling every certification is
    // measured against — so the person who RAISED it may not be the one who approves it.
    const updated = approveVariation(existing, actorId ?? '00000000-0000-0000-0000-000000000000');
    if (actorId && existing.createdBy && actorId === existing.createdBy) {
      throw new Error(
        'the person who raised this variation may not approve their own instruction — it changes what the subcontract is worth',
      );
    }
    const subcontract = await this.store.getSubcontract(existing.subcontractId);
    if (!subcontract) throw new Error(`Subcontract ${existing.subcontractId} not found`);
    const revised: Subcontract = { ...subcontract, value: subcontract.value + signedAmount(updated) };

    await this.store.updateVariation(updated);
    await this.store.updateSubcontract(revised);
    await this.events.append([
      makeEvent({
        type: VARIATION_EVENT.approved,
        tenantId: updated.tenantId, companyId: null, actorId: actorId ?? null,
        aggregateType: 'subcontracts.variation', aggregateId: updated.id,
        payload: { subcontractId: updated.subcontractId, signedAmount: signedAmount(updated), revisedValue: revised.value },
      }),
    ]);
    this.logger.log(`Variation ${updated.reference} approved → subcontract value ${subcontract.value} → ${revised.value}`);
    return updated;
  }

  async rejectVariation(id: Id, actorId?: Id): Promise<SubcontractVariation> {
    const existing = await this.store.getVariation(id);
    if (!existing) throw new Error(`Variation ${id} not found`);
    const updated = rejectVariation(existing, actorId ?? null);
    await this.store.updateVariation(updated);
    return updated;
  }

  async listVariations(filter?: VariationFilter): Promise<SubcontractVariation[]> {
    return this.store.listVariations(filter);
  }

  // ── BACK-CHARGES (contra-charges) ────────────────────────────────────────

  async createBackCharge(input: {
    tenantId: Id;
    subcontractId: Id;
    category?: BackChargeCategory;
    description: string;
    grossAmount: number;
    markupPercent?: number;
    createdBy?: Id | null;
  }): Promise<BackCharge> {
    const subcontract = await this.store.getSubcontract(input.subcontractId);
    if (!subcontract) throw new Error(`Subcontract ${input.subcontractId} not found`);

    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      // Named in THIS module's vocabulary. Every assertion in this service used to borrow one
      // from somewhere else — `projects.project.update` or `finance.invoice.approve` — which is
      // how a subcontractor payment certificate came to require an invoice-approval authority.
      const target: AccessTarget = { permission: 'subcontracts.back-charge.create', orgPath };
      this.access.assert(input.createdBy, target);
    }

    // Sequential reference per subcontract: BC-001, BC-002, …
    const existing = await this.store.listBackCharges({ subcontractId: input.subcontractId });
    const reference = `BC-${String(existing.length + 1).padStart(3, '0')}`;

    const backCharge = makeBackCharge({
      tenantId: input.tenantId,
      subcontractId: input.subcontractId,
      subcontractorName: subcontract.subcontractorName,
      reference,
      category: input.category,
      description: input.description,
      grossAmount: input.grossAmount,
      markupPercent: input.markupPercent,
    });

    await this.store.createBackCharge(backCharge);
    this.logger.log(`Back-charge ${backCharge.reference} raised vs ${backCharge.subcontractorName}: gross=$${backCharge.grossAmount}, recoverable=$${backCharge.recoverableAmount}`);

    await this.events.append([
      makeEvent({
        type: BACK_CHARGE_EVENT.raised,
        tenantId: backCharge.tenantId,
        companyId: null,
        actorId: input.createdBy ?? null,
        aggregateType: 'subcontracts.backcharge',
        aggregateId: backCharge.id,
        payload: {
          reference: backCharge.reference,
          subcontractId: backCharge.subcontractId,
          subcontractor: backCharge.subcontractorName,
          category: backCharge.category,
          recoverableAmount: backCharge.recoverableAmount,
        },
      }),
    ]);

    return backCharge;
  }

  async changeBackChargeStatus(id: Id, status: BackChargeStatus, actorId?: Id): Promise<BackCharge> {
    const existing = await this.store.getBackCharge(id);
    if (!existing) throw new Error(`Back-charge ${id} not found`);

    if (existing.status === 'recovered') {
      throw new Error('A fully recovered back-charge cannot change status');
    }

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: existing.tenantId }];
      // Named in THIS module's vocabulary. Every assertion in this service used to borrow one
      // from somewhere else — `projects.project.update` or `finance.invoice.approve` — which is
      // how a subcontractor payment certificate came to require an invoice-approval authority.
      const target: AccessTarget = { permission: 'subcontracts.back-charge.status', orgPath };
      this.access.assert(actorId, target);
    }

    const updated: BackCharge = {
      ...existing,
      status,
      agreedAt: status === 'agreed' && !existing.agreedAt ? new Date().toISOString() : existing.agreedAt,
      updatedAt: new Date().toISOString(),
    };

    await this.store.updateBackCharge(updated);
    this.logger.log(`Back-charge ${updated.reference} status changed to ${status}`);

    await this.events.append([
      makeEvent({
        type: BACK_CHARGE_EVENT.statusChanged,
        tenantId: updated.tenantId,
        companyId: null,
        actorId: actorId ?? null,
        aggregateType: 'subcontracts.backcharge',
        aggregateId: updated.id,
        payload: { reference: updated.reference, status },
      }),
    ]);

    return updated;
  }

  async recoverBackCharge(id: Id, amount: number, actorId?: Id): Promise<BackCharge> {
    const existing = await this.store.getBackCharge(id);
    if (!existing) throw new Error(`Back-charge ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: existing.tenantId }];
      // Named in THIS module's vocabulary. Every assertion in this service used to borrow one
      // from somewhere else — `projects.project.update` or `finance.invoice.approve` — which is
      // how a subcontractor payment certificate came to require an invoice-approval authority.
      const target: AccessTarget = { permission: 'subcontracts.back-charge.recover', orgPath };
      this.access.assert(actorId, target);
    }

    const updated = applyRecovery(existing, amount); // throws if not agreed / over-recovered
    await this.store.updateBackCharge(updated);
    this.logger.log(`Back-charge ${updated.reference} recovered +$${amount} (outstanding $${updated.outstandingAmount})`);

    await this.events.append([
      makeEvent({
        type: BACK_CHARGE_EVENT.recovered,
        tenantId: updated.tenantId,
        companyId: null,
        actorId: actorId ?? null,
        aggregateType: 'subcontracts.backcharge',
        aggregateId: updated.id,
        payload: {
          reference: updated.reference,
          subcontractId: updated.subcontractId,
          subcontractor: updated.subcontractorName,
          amount: Number(amount),
          recoveredAmount: updated.recoveredAmount,
          outstandingAmount: updated.outstandingAmount,
          status: updated.status,
        },
      }),
    ]);

    return updated;
  }

  async getBackCharge(id: Id): Promise<BackCharge | null> {
    return this.store.getBackCharge(id);
  }

  async listBackCharges(filter?: BackChargeFilter): Promise<BackCharge[]> {
    return this.store.listBackCharges(filter);
  }
}
