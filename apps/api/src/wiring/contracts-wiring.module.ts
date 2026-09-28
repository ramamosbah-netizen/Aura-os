import { Global, Module } from '@nestjs/common';
import { IPC_VALUATION_SOURCE } from '@aura/contracts';
import { IpcValuationAdapter } from './ipc-valuation.adapter';

/**
 * App-layer wiring for Contracts' cross-context port (ADR-0004, J5-02).
 *
 * **IPC_VALUATION_SOURCE** → Projects + the Quantity Ledger: what a payment certificate on an awarded
 * contract may claim, at the frozen awarded rate. It imports nothing — the adapter reaches Projects
 * through `ModuleRef` at call time, so this module cannot close a loop with Contracts or Projects
 * (see `ProcurementWiringModule` for the hang that avoids).
 */
@Global()
@Module({
  providers: [
    IpcValuationAdapter,
    { provide: IPC_VALUATION_SOURCE, useExisting: IpcValuationAdapter },
  ],
  exports: [IPC_VALUATION_SOURCE],
})
export class ContractsWiringModule {}
