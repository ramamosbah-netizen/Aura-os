import { Global, Module } from '@nestjs/common';
import { QualityModule, QualityService } from '@aura/quality';
import { ElvModule, ElvDeviceService } from '@aura/elv';
import { CommissioningModule, CommissioningService, ELV_EQUIPMENT, QUALITY_EVIDENCE, ENGINEERING_RELEASE, DOC_CONTROL, DOC_CONTROL_ISSUE, INVENTORY, APPROVED_CHECKLIST } from '@aura/commissioning';
import { InventoryModule, StockService, MaterialService, ISSUED_POSITION, WORK_PACKAGE } from '@aura/inventory';
import { DocControlModule, DocControlService } from '@aura/doccontrol';
import { HseModule, HseService } from '@aura/hse';
import { EngineeringModule, EngineeringService } from '@aura/engineering';
import { QUALITY_GATE, MATERIAL_CATALOGUE, PROJECT_CODING, ProcurementModule, RfqService } from '@aura/procurement';
import { ProjectsModule, WbsService, CbsService, QuantityLedgerService, ProjectResponsibilityService } from '@aura/projects';
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
  imports: [QualityModule, CommissioningModule, DocControlModule, HseModule, EngineeringModule, ProcurementModule, ElvModule, InventoryModule,
    // ProjectsModule imports only CoreModule and consumes the tokens below through the @Global
    // registry rather than by importing this module, so this edge is one-way and adds no cycle.
    ProjectsModule],
  providers: [
    { provide: QUALITY_GATE, useExisting: QualityService },

    // ── Material identity (Wave 4) ───────────────────────────────────────────────────────────
    // A requisition line must name a canonical material, and Inventory is the authority for what a
    // material IS (migration 0304, and 0333 which separated that identity from stock position).
    // Procurement declares the `MATERIAL_CATALOGUE` port and never imports Inventory; the shapes
    // match structurally and the wire is made here.
    { provide: MATERIAL_CATALOGUE, useExisting: MaterialService },

    // ── You cannot return more than you took (BUY-06) ────────────────────────────────────────
    // Inventory owns what is in the warehouse; the QUANTITY POSITION of a BOQ item belongs to
    // Projects. Inventory declares the fact it needs — how much is currently issued — and the wire
    // is made here, so neither module reaches into the other. Unbound, a project-coded RETURN is
    // refused rather than waved through: optional dependency, never optional evidence.
    {
      provide: ISSUED_POSITION,
      inject: [QuantityLedgerService],
      useFactory: (ledger: QuantityLedgerService) => ({
        async netIssued(tenantId: string, _projectId: string, boqItemId: string) {
          const position = await ledger.position(tenantId, boqItemId);
          return typeof position?.issued === 'number' ? position.issued : null;
        },
      }),
    },

    // A stock movement can name the WORK PACKAGE it was delivered to (`BUY-07`). The work-package
    // structure is Projects'; Inventory stores a validated destination reference, exactly as it
    // already stores project_id, and asks this wire whether the reference is real.
    //
    // Deliberately only a VALIDATOR. There is no "find the work package for this BOQ item" method
    // here and there must never be one: resolving a destination by matching boq_item_id would turn a
    // missing destination into a manufactured one, and would report the same material as delivered
    // to every package measuring against that item. Unbound, a declared destination is REFUSED.
    {
      provide: WORK_PACKAGE,
      inject: [WbsService, ProjectResponsibilityService],
      useFactory: (wbs: WbsService, responsibilities: ProjectResponsibilityService) => ({
        async belongsToProject(tenantId: string, projectId: string, wbsNodeId: string) {
          const node = await wbs.get(wbsNodeId);
          return !!node && node.tenantId === tenantId && node.projectId === projectId;
        },
        // Operational ownership lives with Projects; Inventory asks who holds it rather than
        // deciding. NULL is an answer — nobody does — and the handoff refuses on it.
        siteRecipientFor(tenantId: string, projectId: string, wbsNodeId: string) {
          return responsibilities.siteRecipientFor(tenantId, projectId, wbsNodeId);
        },
      }),
    },

    // Canonical work-package and cost coding on a requisition line, each checked against the
    // requisition's OWN project — AWD-05's rule, asked by a new caller. Composed from both node
    // services because the kind is part of the question: without it a WBS id would be accepted as
    // a cost code purely for belonging to the right project.
    {
      provide: PROJECT_CODING,
      inject: [WbsService, CbsService],
      useFactory: (wbs: WbsService, cbs: CbsService) => ({
        async nodeBelongsToProject(tenantId: string, projectId: string, nodeId: string, kind: 'wbs' | 'cbs') {
          const node = kind === 'wbs' ? await wbs.get(nodeId) : await cbs.get(nodeId);
          return !!node && node.tenantId === tenantId && node.projectId === projectId;
        },
      }),
    },
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
    // The approved system checklist (TC-08/TC-09): Quality owns the revision; T&C binds a record to
    // it and executes its points. Unwired, nothing can be bound — and nothing unbound commissions.
    { provide: APPROVED_CHECKLIST, useExisting: QualityService },

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
  exports: [QUALITY_GATE, MATERIAL_CATALOGUE, PROJECT_CODING, ISSUED_POSITION, WORK_PACKAGE, ITP_GATE, QUALITY_READINESS, COMMISSIONING_READINESS, DOCUMENTS_READINESS, COMMISSIONING_LIFECYCLE, QUALITY_HEALTH, COMMISSIONING_HEALTH, HSE_HEALTH, ENGINEERING_HEALTH, PROCUREMENT_HEALTH, ELV_EQUIPMENT, QUALITY_EVIDENCE, ENGINEERING_RELEASE, DOC_CONTROL, DOC_CONTROL_ISSUE, INVENTORY, APPROVED_CHECKLIST],
})
export class GatesModule {}
