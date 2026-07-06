import { Global, Module } from '@nestjs/common';
import { QualityModule, QualityService } from '@aura/quality';
import { QUALITY_GATE } from '@aura/procurement';
import { ITP_GATE } from '@aura/projects';

/**
 * App-layer wiring for cross-module gates (ADR-0004: modules don't import each other; the
 * composition root does). Procurement defines the `QUALITY_GATE` port and Projects the `ITP_GATE`
 * port — each depends only on its own interface (`@Optional() @Inject`). Here, at the app layer,
 * we bind both ports to the Quality module's service. `@Global` so the bindings resolve into the
 * providers of Procurement/Projects without those modules importing Quality.
 *
 * Behaviour is identical to the previous in-module wiring — the only change is *where* the wire is
 * made. Paid down the `procurement→quality` and `projects→quality` edges from the ADR-0004 debt
 * baseline (see architecture.fitness.test.ts).
 */
@Global()
@Module({
  imports: [QualityModule],
  providers: [
    { provide: QUALITY_GATE, useExisting: QualityService },
    { provide: ITP_GATE, useExisting: QualityService },
  ],
  exports: [QUALITY_GATE, ITP_GATE],
})
export class GatesModule {}
