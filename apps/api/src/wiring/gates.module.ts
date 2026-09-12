import { Global, Module } from '@nestjs/common';
import { QualityModule, QualityService } from '@aura/quality';
import { ElvModule, ElvDeviceService } from '@aura/elv';
import { CommissioningModule, CommissioningService, ELV_EQUIPMENT, QUALITY_EVIDENCE, ENGINEERING_RELEASE, DOC_CONTROL, DOC_CONTROL_ISSUE, INVENTORY } from '@aura/commissioning';
import { InventoryModule, StockService } from '@aura/inventory';
import { DocControlModule, DocControlService } from '@aura/doccontrol';
import { HseModule, HseService } from '@aura/hse';
import { EngineeringModule, EngineeringService } from '@aura/engineering';
import { QUALITY_GATE, ProcurementModule, RfqService } from '@aura/procurement';
import { ITP_GATE, QUALITY_READINESS, COMMISSIONING_READINESS, DOCUMENTS_READINESS, COMMISSIONING_LIFECYCLE, QUALITY_HEALTH, COMMISSIONING_HEALTH, HSE_HEALTH, ENGINEERING_HEALTH, PROCUREMENT_HEALTH } from '@aura/projects';

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
  imports: [QualityModule, CommissioningModule, DocControlModule, HseModule, EngineeringModule, ProcurementModule, ElvModule, InventoryModule],
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

    // ── Cross-domain health (§24) ────────────────────────────────────────────────────────────
    // Distinct from the readiness ports above even though the same two services answer them.
    // Readiness hands Projects COUNTS for §27 to gate on; health hands it a JUDGEMENT, because
    // §24 is barred from deciding what another domain means by serious. Same fact, two questions,
    // and each domain answers the one it owns.
    //
    // HSE, Engineering and Procurement are absent on purpose — they have not declared health
    // semantics, so no provider is expected and the registry reports them UNKNOWN rather than
    // letting a project read as clear on evidence nobody supplied.
    { provide: QUALITY_HEALTH, useExisting: QualityService },
    { provide: COMMISSIONING_HEALTH, useExisting: CommissioningService },
    { provide: HSE_HEALTH, useExisting: HseService },
    { provide: ENGINEERING_HEALTH, useExisting: EngineeringService },
    { provide: PROCUREMENT_HEALTH, useExisting: RfqService },

    // ── Pre-commissioning readiness (TC-GATE-3) ──────────────────────────────────────────────
    // The mirror image of the bindings above: here COMMISSIONING is the consumer. It asks the ELV
    // register what equipment exists and whether it is installed, Engineering whether the drawings
    // are released, and Quality whether anything is open against the system.
    //
    // Forgetting one of these wires does NOT quietly pass a system: commissioning treats an absent
    // port as UNKNOWN, and UNKNOWN blocks the readiness chain. Optional dependency, never optional
    // evidence — the same rule the closeout ports above follow.
    { provide: ELV_EQUIPMENT, useExisting: ElvDeviceService },
    { provide: QUALITY_EVIDENCE, useExisting: QualityService },
    { provide: ENGINEERING_RELEASE, useExisting: EngineeringService },

    // ── Handover's document references (TC-GATE-6) ────────────────────────────────────────────
    // Handover points at controlled documents it does not own, and asks whether an as-built exists.
    // Only the register can answer either, so only the register is asked.
    //
    // This binding REPLACED Handover's use of ENGINEERING_RELEASE for as-builts, and the replacement
    // was a defect fix: Engineering has no as-built status, so the gate it fed could never pass.
    // ENGINEERING_RELEASE stays bound above — Testing & Commissioning still reads drawing release
    // for its own pre-commissioning chain, which is a different question Engineering CAN answer.
    { provide: DOC_CONTROL, useExisting: DocControlService },

    // ── The dossier's controlled conveyance (TC-GATE-14) ──────────────────────────────────────
    // The first binding here that lets one module ASK another to write. It is still DocControl that
    // writes: it assigns the transmittal code, applies its own permission check, emits its own event
    // and owns every state the transmittal moves through afterwards. Handover supplies a list of
    // register entries and a title, and cannot send, receive or acknowledge on the client's behalf.
    { provide: DOC_CONTROL_ISSUE, useExisting: DocControlService },

    // ── Spares name real parts (TC-GATE-17) ───────────────────────────────────────────────────
    // Handover's spares record points at a part it does not own. Inventory keeps everything that
    // makes a part a part — quantities, warehouse, cost, reorder policy — and hands over a
    // projection of code, name and unit. Nothing here moves stock.
    { provide: INVENTORY, useExisting: StockService },
  ],
  exports: [QUALITY_GATE, ITP_GATE, QUALITY_READINESS, COMMISSIONING_READINESS, DOCUMENTS_READINESS, COMMISSIONING_LIFECYCLE, QUALITY_HEALTH, COMMISSIONING_HEALTH, HSE_HEALTH, ENGINEERING_HEALTH, PROCUREMENT_HEALTH, ELV_EQUIPMENT, QUALITY_EVIDENCE, ENGINEERING_RELEASE, DOC_CONTROL, DOC_CONTROL_ISSUE, INVENTORY],
})
export class GatesModule {}
