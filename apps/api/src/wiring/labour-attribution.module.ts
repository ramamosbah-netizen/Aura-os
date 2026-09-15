import { Global, Module } from '@nestjs/common';
import { LABOUR_SPENT_PROVIDER } from '@aura/projects';
import { SiteModule } from '@aura/site';
import { LabourSpentFromSite } from '../projects/labour-spent.provider';

/**
 * App-layer wiring for the recorded-labour port (ADR-0004), in the shape FinanceWiringModule
 * established and ResourceAvailabilityModule repeated: the port is declared where the answer is
 * needed, the adapter lives where the answering module is already known, and `@Global` is what lets
 * it resolve into ProjectsModule's services without Projects importing Site.
 *
 * This is the binding that makes the second half of productivity real. With it, a plan can say
 * whether the metres that went in cost the hours they were priced to cost. Without it — and unbound
 * remains a legitimate composition — the pace half of PLN-11 is entirely unaffected and every
 * package's labour productivity reads UNKNOWN, which is exactly what such a composition knows.
 */
@Global()
@Module({
  imports: [SiteModule],
  providers: [
    LabourSpentFromSite,
    { provide: LABOUR_SPENT_PROVIDER, useExisting: LabourSpentFromSite },
  ],
  exports: [LABOUR_SPENT_PROVIDER],
})
export class LabourAttributionModule {}
