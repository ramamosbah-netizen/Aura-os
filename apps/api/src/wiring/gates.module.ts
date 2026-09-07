import { Global, Module } from '@nestjs/common';
import { QualityModule, QualityService } from '@aura/quality';
import { CommissioningModule, CommissioningService } from '@aura/commissioning';
import { DocControlModule, DocControlService } from '@aura/doccontrol';
import { QUALITY_GATE } from '@aura/procurement';
import { ITP_GATE, QUALITY_READINESS, COMMISSIONING_READINESS, DOCUMENTS_READINESS, COMMISSIONING_LIFECYCLE } from '@aura/projects';

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
 *
 * ── Closeout readiness (§27) ──────────────────────────────────────────────────────────────────
 *
 * The same shape, for the question "may this project be closed?". Projects declares three ports and
 * each owning domain implements the one about itself. The assembly and its binding into
 * `CloseoutService.finalize` live inside ProjectsModule, where the stores it reads are provided —
 * only these three cross-module readings need the composition root.
 *
 * These bindings are what make the gate ANSWERABLE. Projects treats an absent port as UNKNOWN and
 * refuses the close, so forgetting a wire here fails loudly and safely rather than silently
 * approving: optional dependency, never optional evidence.
 */
@Global()
@Module({
  imports: [QualityModule, CommissioningModule, DocControlModule],
  providers: [
    { provide: QUALITY_GATE, useExisting: QualityService },
    { provide: ITP_GATE, useExisting: QualityService },

    { provide: QUALITY_READINESS, useExisting: QualityService },
    { provide: COMMISSIONING_READINESS, useExisting: CommissioningService },
    { provide: DOCUMENTS_READINESS, useExisting: DocControlService },

    // ── Lifecycle (§2) ───────────────────────────────────────────────────────────────────────
    // `active → testing` needs to know something is registered to test, and `→ handover` that
    // every system is signed off. Commissioning owns both facts. Same reading as
    // COMMISSIONING_READINESS above, asked by a different gate — bound separately so either can
    // change without dragging the other with it.
    { provide: COMMISSIONING_LIFECYCLE, useExisting: CommissioningService },
  ],
  exports: [QUALITY_GATE, ITP_GATE, QUALITY_READINESS, COMMISSIONING_READINESS, DOCUMENTS_READINESS, COMMISSIONING_LIFECYCLE],
})
export class GatesModule {}
