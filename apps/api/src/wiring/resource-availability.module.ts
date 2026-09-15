import { Global, Module } from '@nestjs/common';
import { RESOURCE_AVAILABILITY_PROVIDER } from '@aura/projects';
import { HrModule } from '@aura/hr';
import { FleetModule } from '@aura/fleet';
import { AssetsModule } from '@aura/assets';
import { ResourceAvailabilityFromRegisters } from '../projects/resource-availability.provider';

/**
 * App-layer wiring for §22's availability port (ADR-0004), in the shape FinanceWiringModule
 * established: the port is declared in the module that needs the answer, the adapter lives where
 * the answering modules are already known, and `@Global` is what lets it resolve into
 * ProjectsModule's own services without Projects importing HR, Fleet or Assets.
 *
 * This is the binding that makes the second half of the temporal invariant real: with it, an
 * approved leave or a scheduled service turns a standing commitment into a visible conflict;
 * without it — and unbound remains a legitimate composition — §22 behaves exactly as it did
 * before, governed by its own declared capacity alone.
 */
@Global()
@Module({
  imports: [HrModule, FleetModule, AssetsModule],
  providers: [
    ResourceAvailabilityFromRegisters,
    { provide: RESOURCE_AVAILABILITY_PROVIDER, useExisting: ResourceAvailabilityFromRegisters },
  ],
  exports: [RESOURCE_AVAILABILITY_PROVIDER],
})
export class ResourceAvailabilityModule {}
