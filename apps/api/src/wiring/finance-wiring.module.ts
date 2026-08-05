import { Global, Module } from '@nestjs/common';
import { PO_MATCH_PORT, CONTRACT_CAP_PORT } from '@aura/finance';
import { ProcurementModule } from '@aura/procurement';
import { InventoryModule } from '@aura/inventory';
import { ContractsModule } from '@aura/contracts';
import { PoMatchAdapter } from './po-match.adapter';
import { ContractCapAdapter } from './contract-cap.adapter';

/**
 * App-layer wiring for Finance's cross-context ports (ADR-0004). Binds them to adapters at the
 * composition root, so Finance imports no sibling module. `@Global` so the ports resolve into
 * FinanceModule's services.
 *
 * - **PO_MATCH_PORT** → Procurement + Inventory: the AP 3-way match (invoice ≤ PO, ≤ received GRN).
 *   Paid down the finance→procurement and finance→inventory edges from the ADR-0004 debt baseline.
 * - **CONTRACT_CAP_PORT** → Contracts: the AR billing cap (billed ≤ contract value, ≤ certified to
 *   date) — the receivable mirror of the 3-way match (gap register G-08).
 */
@Global()
@Module({
  imports: [ProcurementModule, InventoryModule, ContractsModule],
  providers: [
    PoMatchAdapter,
    { provide: PO_MATCH_PORT, useExisting: PoMatchAdapter },
    ContractCapAdapter,
    { provide: CONTRACT_CAP_PORT, useExisting: ContractCapAdapter },
  ],
  exports: [PO_MATCH_PORT, CONTRACT_CAP_PORT],
})
export class FinanceWiringModule {}
