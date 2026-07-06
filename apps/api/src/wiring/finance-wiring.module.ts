import { Global, Module } from '@nestjs/common';
import { PO_MATCH_PORT } from '@aura/finance';
import { ProcurementModule } from '@aura/procurement';
import { InventoryModule } from '@aura/inventory';
import { PoMatchAdapter } from './po-match.adapter';

/**
 * App-layer wiring for Finance's cross-context ports (ADR-0004). Binds PO_MATCH_PORT to an adapter
 * over Procurement + Inventory at the composition root, so Finance no longer imports those modules.
 * `@Global` so the port resolves into FinanceModule's InvoiceService. Paid down the
 * finance→procurement and finance→inventory edges from the ADR-0004 debt baseline.
 */
@Global()
@Module({
  imports: [ProcurementModule, InventoryModule],
  providers: [PoMatchAdapter, { provide: PO_MATCH_PORT, useExisting: PoMatchAdapter }],
  exports: [PO_MATCH_PORT],
})
export class FinanceWiringModule {}
