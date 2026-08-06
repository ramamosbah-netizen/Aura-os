import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore } from '@aura/core';
import {
  RETENTION_EVENT,
  type RetentionPosition,
  type RetentionRelease,
  type RetentionReleaseKind,
  assertReleasable,
  assertRetentionReleaseTransition,
  makeRetentionRelease,
  retentionPosition,
  suggestedReleaseAmount,
} from './domain/retention-release';
import { RETENTION_RELEASE_STORE, type RetentionReleaseFilter, type RetentionReleaseStore } from './retention-release-store';
import { PaymentCertificateService } from './payment-certificate.service';
import { ContractService } from './contract.service';

export interface CreateRetentionReleaseInput {
  tenantId: Id;
  companyId?: Id | null;
  contractId: Id;
  kind?: RetentionReleaseKind;
  amount: number;
  releaseDate?: string | null;
  notes?: string | null;
  createdBy?: Id | null;
}

/**
 * Retention release service — the way retention withheld on interim certificates gets back to the
 * contractor. Owns `aura_contract_retention_releases`, emits `contracts.retention.*`.
 *
 * The position it releases against is derived, never stored: retention held comes from the IPC
 * register (the latest issued certificate's cumulative `retentionToDate`), and draft releases
 * reserve against it so two drafts cannot each claim the whole balance.
 *
 * Approval is the money event. It carries the same two controls as certifying an IPC — the
 * preparer may not approve their own release, and the approver's grant must cover the amount —
 * and emits `contracts.retention.released`, which finance turns into the client AR invoice.
 */
@Injectable()
export class RetentionReleaseService {
  private readonly logger = new Logger('Contracts');

  constructor(
    @Inject(RETENTION_RELEASE_STORE) private readonly store: RetentionReleaseStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly certificates: PaymentCertificateService,
    private readonly contracts: ContractService,
    private readonly access: AccessService,
  ) {}

  /** Retention held / released / pending / releasable for a contract, plus its release register. */
  async position(
    tenantId: Id,
    contractId: Id,
  ): Promise<RetentionPosition & { releases: RetentionRelease[]; suggested: { practicalCompletion: number; defectsLiability: number } }> {
    const [summary, releases] = await Promise.all([
      this.certificates.getContractSummary(tenantId, contractId),
      this.store.list({ tenantId, contractId, limit: 200 }),
    ]);
    const position = retentionPosition(summary.summary.retentionHeld, releases);
    return {
      ...position,
      releases,
      suggested: {
        practicalCompletion: suggestedReleaseAmount(position, 'practical_completion'),
        defectsLiability: suggestedReleaseAmount(position, 'defects_liability'),
      },
    };
  }

  async create(input: CreateRetentionReleaseInput): Promise<RetentionRelease> {
    const contract = await this.contracts.get(input.contractId);
    if (!contract) throw new Error(`contract ${input.contractId} not found`);

    const existing = await this.store.list({ tenantId: input.tenantId, contractId: input.contractId, limit: 200 });
    const summary = await this.certificates.getContractSummary(input.tenantId, input.contractId);
    const position = retentionPosition(summary.summary.retentionHeld, existing);
    // You cannot hand back money that was never withheld — and drafts already reserve their share.
    assertReleasable(position, input.amount);

    const release = makeRetentionRelease({
      tenantId: input.tenantId,
      companyId: input.companyId ?? contract.companyId,
      contractId: contract.id,
      contractTitle: contract.title,
      accountId: contract.accountId,
      accountName: contract.accountName,
      sequence: existing.length + 1,
      kind: input.kind,
      amount: input.amount,
      releaseDate: input.releaseDate ?? null,
      notes: input.notes ?? null,
      createdBy: input.createdBy ?? null,
    });

    await this.store.save(release);
    await this.events.append([
      makeEvent({
        type: RETENTION_EVENT.raised,
        tenantId: release.tenantId,
        companyId: release.companyId,
        actorId: release.createdBy,
        aggregateType: 'contracts.retention',
        aggregateId: release.id,
        payload: { contractId: release.contractId, reference: release.reference, kind: release.kind, amount: release.amount },
      }),
    ]);
    this.logger.log(`Retention release raised: ${release.reference} ${release.amount} (${release.kind}) on contract ${release.contractId}`);
    return release;
  }

  /**
   * Approve or reject a release. Approval bills the client, so it is terminal and carries the
   * IPC-grade controls; the releasable check runs again at approval time because the position can
   * have moved since the draft was raised.
   */
  async decide(id: Id, status: 'approved' | 'rejected', actorId?: Id): Promise<RetentionRelease> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`retention release ${id} not found`);
    assertRetentionReleaseTransition(existing.status, status, existing.reference);

    if (status === 'approved') {
      // Segregation of duties: the preparer may not approve their own release.
      if (actorId && existing.createdBy && actorId === existing.createdBy) {
        throw new Error(
          `access denied: the preparer of retention release ${existing.reference} cannot approve it — segregation of duties requires a different approver`,
        );
      }
      if (actorId) {
        this.access.assertApprovalAuthority(
          actorId,
          { permission: 'contracts.ipc.certify', orgPath: [{ level: 'tenant', id: existing.tenantId }], amount: existing.amount },
          `retention release ${existing.reference} approval`,
        );
      }
      // Re-check against the live position, excluding this draft's own reservation.
      const [summary, all] = await Promise.all([
        this.certificates.getContractSummary(existing.tenantId, existing.contractId),
        this.store.list({ tenantId: existing.tenantId, contractId: existing.contractId, limit: 200 }),
      ]);
      const others = all.filter((r) => r.id !== existing.id);
      assertReleasable(retentionPosition(summary.summary.retentionHeld, others), existing.amount);
    }

    const updated: RetentionRelease = {
      ...existing,
      status,
      approvedBy: status === 'approved' ? (actorId ?? null) : existing.approvedBy,
      approvedAt: status === 'approved' ? new Date().toISOString() : existing.approvedAt,
    };
    await this.store.save(updated);
    await this.events.append([
      makeEvent({
        type: status === 'approved' ? RETENTION_EVENT.released : RETENTION_EVENT.rejected,
        tenantId: updated.tenantId,
        companyId: updated.companyId,
        actorId: actorId ?? null,
        aggregateType: 'contracts.retention',
        aggregateId: updated.id,
        payload: {
          contractId: updated.contractId,
          reference: updated.reference,
          kind: updated.kind,
          amount: updated.amount,
          account: updated.accountId ? { id: updated.accountId, name: updated.accountName } : null,
        },
      }),
    ]);
    this.logger.log(`Retention release ${updated.reference} → ${status} (${updated.amount})`);
    return updated;
  }

  get(id: Id): Promise<RetentionRelease | null> {
    return this.store.get(id);
  }

  list(filter?: RetentionReleaseFilter): Promise<RetentionRelease[]> {
    return this.store.list(filter);
  }

  /** Total approved (billed) retention on a contract — the AR cap's allowance above net certified. */
  async releasedTotal(tenantId: Id, contractId: Id): Promise<number> {
    const releases = await this.store.list({ tenantId, contractId, status: 'approved', limit: 200 });
    return retentionPosition(0, releases).released;
  }
}
