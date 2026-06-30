import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';
import {
  CERTIFICATE_EVENT,
  type CertificateStatus,
  type CertificateSummary,
  type PaymentCertificate,
  certificateSummary,
  makePaymentCertificate,
  priorCertifiedNet,
} from './domain/payment-certificate';
import { PAYMENT_CERTIFICATE_STORE, type CertificateFilter, type PaymentCertificateStore } from './payment-certificate-store';
import { ContractService } from './contract.service';

/** What a caller supplies to raise an IPC — the service fills the contract snapshot, sequence, and prior-net. */
export interface CreateCertificateInput {
  tenantId: Id;
  companyId?: Id | null;
  contractId: Id;
  periodStart?: string | null;
  periodEnd?: string | null;
  cumulativeWorkDone: number;
  materialsOnSite?: number;
  retentionPercent?: number;
  retentionCapPercent?: number;
  advanceRecoveredToDate?: number;
  reference?: string | null;
  createdBy?: Id | null;
}

/**
 * Payment Certificates (IPC) service — progress billing against a main contract. Owns
 * `aura_contracts_payment_certificates`, goes through the access seam, and emits
 * `contracts.ipc.*` on the spine. Each certificate references the contract + CRM account by
 * id + snapshot (no join), so finance can raise the client AR invoice off the `certified` event.
 *
 * Writes are atomic (TX_RUNNER + createWithClient/updateWithClient + appendWithClient) so the row
 * and its outbox event commit together, matching the Contracts module's create handler.
 */
@Injectable()
export class PaymentCertificateService {
  private readonly logger = new Logger('PaymentCertificates');

  constructor(
    @Inject(PAYMENT_CERTIFICATE_STORE) private readonly store: PaymentCertificateStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly contracts: ContractService,
    private readonly access: AccessService,
  ) {}

  async create(input: CreateCertificateInput): Promise<PaymentCertificate> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      const target: AccessTarget = { permission: 'contracts.ipc.create', orgPath };
      this.access.assert(input.createdBy, target);
    }

    const contract = await this.contracts.get(input.contractId);
    if (!contract) throw new Error(`contract ${input.contractId} not found`);

    // Sequence + paid-to-date baseline are derived from this contract's existing certificates.
    const existing = await this.store.list({ tenantId: input.tenantId, contractId: input.contractId, limit: 500 });
    const sequence = existing.length + 1;
    const previousCertifiedNet = priorCertifiedNet(existing);

    const cert = makePaymentCertificate({
      tenantId: input.tenantId,
      companyId: input.companyId ?? contract.companyId,
      contractId: contract.id,
      contractTitle: contract.title,
      contractValue: contract.value,
      accountId: contract.accountId,
      accountName: contract.accountName,
      sequence,
      reference: input.reference ?? null,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      cumulativeWorkDone: input.cumulativeWorkDone,
      materialsOnSite: input.materialsOnSite,
      retentionPercent: input.retentionPercent,
      retentionCapPercent: input.retentionCapPercent,
      advanceRecoveredToDate: input.advanceRecoveredToDate,
      previousCertifiedNet,
      createdBy: input.createdBy ?? null,
    });

    const event = makeEvent({
      type: CERTIFICATE_EVENT.created,
      tenantId: cert.tenantId,
      companyId: cert.companyId,
      actorId: cert.createdBy,
      aggregateType: 'contracts.ipc',
      aggregateId: cert.id,
      payload: {
        contractId: cert.contractId,
        sequence: cert.sequence,
        reference: cert.reference,
        grossToDate: cert.grossToDate,
        netThisCertificate: cert.netThisCertificate,
      },
    });

    await this.tx.run(async (handle) => {
      await this.store.createWithClient(handle, cert);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`IPC raised: ${cert.reference} on contract ${cert.contractId} net=${cert.netThisCertificate}`);
    return cert;
  }

  /**
   * Transition a certificate's status. `certified` stamps the certifier and emits the AR trigger
   * (`contracts.ipc.certified`) carrying the net + account snapshot so finance can bill the client.
   */
  async changeStatus(id: Id, status: CertificateStatus, actorId?: Id): Promise<PaymentCertificate> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`payment certificate ${id} not found`);
    const certifying = status === 'certified';
    const updated: PaymentCertificate = {
      ...existing,
      status,
      certifiedBy: certifying ? (actorId ?? existing.certifiedBy) : existing.certifiedBy,
      certifiedAt: certifying ? new Date().toISOString() : existing.certifiedAt,
    };

    const eventType =
      status === 'submitted' ? CERTIFICATE_EVENT.submitted
      : status === 'certified' ? CERTIFICATE_EVENT.certified
      : status === 'paid' ? CERTIFICATE_EVENT.paid
      : status === 'rejected' ? CERTIFICATE_EVENT.rejected
      : CERTIFICATE_EVENT.created;

    const event = makeEvent({
      type: eventType,
      tenantId: updated.tenantId,
      companyId: updated.companyId,
      actorId: actorId ?? null,
      aggregateType: 'contracts.ipc',
      aggregateId: updated.id,
      payload: {
        contractId: updated.contractId,
        sequence: updated.sequence,
        reference: updated.reference,
        status,
        netThisCertificate: updated.netThisCertificate,
        account: updated.accountId ? { id: updated.accountId, name: updated.accountName } : null,
      },
    });

    await this.tx.run(async (handle) => {
      await this.store.updateWithClient(handle, updated);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`IPC ${updated.reference} (${updated.id}) → ${status}`);
    return updated;
  }

  get(id: Id): Promise<PaymentCertificate | null> {
    return this.store.get(id);
  }

  list(filter?: CertificateFilter): Promise<PaymentCertificate[]> {
    return this.store.list(filter);
  }

  /** Contract billing summary: the certificate register + work-done / retention / net to date. */
  async getContractSummary(
    tenantId: Id,
    contractId: Id,
  ): Promise<{ contract: { id: Id; title: string; value: number } | null; certificates: PaymentCertificate[]; summary: CertificateSummary }> {
    const [contract, certificates] = await Promise.all([
      this.contracts.get(contractId),
      this.store.list({ tenantId, contractId, limit: 500 }),
    ]);
    const contractValue = contract?.value ?? 0;
    return {
      contract: contract ? { id: contract.id, title: contract.title, value: contract.value } : null,
      certificates,
      summary: certificateSummary(contractValue, certificates),
    };
  }
}
