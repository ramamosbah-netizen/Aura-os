import { Injectable } from '@nestjs/common';
import type { Id } from '@aura/shared';
import type { ContractCapPort, ContractCapSnapshot } from '@aura/finance';
import { ContractService, PaymentCertificateService, RetentionReleaseService } from '@aura/contracts';

/**
 * App-layer adapter for Finance's CONTRACT_CAP_PORT (ADR-0004) — the composition root is where a
 * bounded context may read another's data. Supplies the approved contract value and the net
 * certified to date; the **cap rule** stays in Finance (`domain/contract-cap.ts`).
 *
 * `contractRef` on a customer invoice is a free-text reference that the deal-chain reactors happen
 * to fill with a contract id. It is also filled with an *AMC* contract id by the AMC billing
 * reactor. A miss therefore means "not a project contract", not "bad data" — so it resolves to
 * `contractExists: false` and the cap is skipped rather than blocking AMC invoicing.
 */
@Injectable()
export class ContractCapAdapter implements ContractCapPort {
  constructor(
    private readonly contracts: ContractService,
    private readonly certificates: PaymentCertificateService,
    private readonly retention: RetentionReleaseService,
  ) {}

  async getSnapshot(tenantId: Id, contractId: Id): Promise<ContractCapSnapshot> {
    const contract = await this.contracts.get(contractId).catch(() => null);
    if (!contract) return { contractExists: false, contractValue: 0, netCertifiedToDate: null, retentionReleased: 0 };

    const [summary, retentionReleased] = await Promise.all([
      this.certificates.getContractSummary(tenantId, contractId).catch(() => null),
      this.retention.releasedTotal(tenantId, contractId).catch(() => 0),
    ]);
    // No certificates → the certified bound does not apply (milestone-billed contracts are normal).
    const netCertifiedToDate =
      summary && summary.certificates.length > 0 ? summary.summary.netCertifiedToDate : null;

    return { contractExists: true, contractValue: contract.value, netCertifiedToDate, retentionReleased };
  }
}
