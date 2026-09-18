import { Global, Module } from '@nestjs/common';
import { PO_POSITION_PORT } from '@aura/procurement';
import { InventoryModule } from '@aura/inventory';
import { PoPositionAdapter } from './po-position.adapter';

/**
 * App-layer wiring for Procurement's cross-context port (ADR-0004, J3-01).
 *
 * **PO_POSITION_PORT** → Inventory + Finance: what has already happened against a purchase order,
 * which decides how much of it may still be cancelled and whether it may be closed at all. It is the
 * mirror image of `PO_MATCH_PORT` — Finance asking Procurement what an order committed — and lives
 * in its own module rather than beside it for a reason worth recording.
 *
 * IT IMPORTS NEITHER PROCUREMENT NOR ANYTHING THAT IMPORTS IT, and that is the whole design. A
 * wiring module which both imports `ProcurementModule` and provides a port `ProcurementModule`
 * consumes is a loop, and Nest resolves a loop by hanging in `NestFactory.create` with nothing to
 * read — every e2e suite timing out in a `beforeAll` and no error anywhere. The port takes the order
 * line ids as an argument for exactly this reason: the caller has them. Finance is reached through
 * `ModuleRef` at call time rather than imported, because importing it closes the loop the other way
 * round — see the adapter, where that circle is drawn out in full.
 */
@Global()
@Module({
  imports: [InventoryModule],
  providers: [
    PoPositionAdapter,
    { provide: PO_POSITION_PORT, useExisting: PoPositionAdapter },
  ],
  exports: [PO_POSITION_PORT],
})
export class ProcurementWiringModule {}
