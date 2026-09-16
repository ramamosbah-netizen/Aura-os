import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { assertSameTenant, type Id } from '@aura/shared';
import { TenantContext } from '@aura/core';
import { PR_LINE_STORE, type PurchaseRequestLineStore } from './purchase-request-line-store';
import { PURCHASE_REQUEST_STORE, type PurchaseRequestStore } from './purchase-request-store';
import {
  governingValue,
  makePurchaseRequestLine,
  mayEditLines,
  nextLineNo,
  type PurchaseRequestLine,
  readyToSubmit,
  renumber,
  requisitionTotal,
  type RequisitionTotal,
} from './domain/purchase-request-line';

/**
 * Resolving a material for a requisition line.
 *
 * Procurement does not import Inventory. It states the fact it needs — "give me this material's
 * identity and the description to copy" — and the application wires Inventory's implementation in,
 * the same way the quality gate is wired. The port returns BOTH halves together so a caller cannot
 * take the identity without the description, or assemble a description of its own.
 */
export const MATERIAL_CATALOGUE = Symbol('MATERIAL_CATALOGUE');

export interface MaterialCitation {
  materialId: Id;
  materialCode: string;
  materialName: string;
  specification: string | null;
  manufacturer: string | null;
  model: string | null;
  uom: string;
}

export interface MaterialCatalogue {
  /**
   * Resolve one reference (id or code) for a line that is about to cite it.
   * Throws when nothing matches, or when the material may not be named on new demand.
   */
  citeMaterial(reference: string, tenantId: string): Promise<MaterialCitation>;
}

/** Canonical project coding, validated against the requisition's own project (AWD-05's rule). */
export const PROJECT_CODING = Symbol('PROJECT_CODING');

export interface ProjectCoding {
  /**
   * True when this node exists, is that KIND of node, and belongs to that project.
   *
   * The kind is part of the question, not a detail: without it a WBS node id passed as a cost code
   * would be accepted purely because it belongs to the right project, and the line would carry a
   * work package in the field where a cost code is read.
   */
  nodeBelongsToProject(
    tenantId: string, projectId: string, nodeId: string, kind: 'wbs' | 'cbs',
  ): Promise<boolean>;
}

export interface NewLineInput {
  prId: Id;
  /** An id or a code — whatever the person or the caller had. */
  material: string;
  quantity: number;
  needByDate?: string | null;
  estimatedUnitCost?: number | null;
  wbsNodeId?: Id | null;
  cbsNodeId?: Id | null;
  notes?: string | null;
}

export interface LineEdit {
  quantity?: number;
  needByDate?: string | null;
  estimatedUnitCost?: number | null;
  wbsNodeId?: Id | null;
  cbsNodeId?: Id | null;
  notes?: string | null;
}

/**
 * Material requisition lines — where procurement demand starts (`BUY-01`, gap record `J3-05`).
 */
@Injectable()
export class PurchaseRequestLineService {
  private readonly logger = new Logger('Procurement');

  constructor(
    @Inject(PR_LINE_STORE) private readonly lines: PurchaseRequestLineStore,
    @Inject(PURCHASE_REQUEST_STORE) private readonly requests: PurchaseRequestStore,
    @Inject(MATERIAL_CATALOGUE) private readonly catalogue: MaterialCatalogue,
    @Optional() @Inject(PROJECT_CODING) private readonly coding: ProjectCoding | null = null,
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
  ) {}

  private tenantId(): string | undefined {
    // `boundTenantId()` answers null when nothing is bound; `assertSameTenant` reads undefined as
    // "no tenant to check against", and null would be a different, unhandled third state.
    return this.tenant?.boundTenantId() ?? undefined;
  }

  /** The requisition, scoped to the caller's tenant, or a refusal naming it. */
  private async requisition(prId: Id) {
    const pr = assertSameTenant(await this.requests.get(prId), this.tenantId(), 'purchase request', prId);
    return pr;
  }

  /** Lines may only be authored or changed while the requisition is a draft. */
  private assertDraft(status: string): void {
    const verdict = mayEditLines(status);
    if (!verdict.allowed) throw new Error(verdict.reason);
  }

  /**
   * Canonical coding belongs to the requisition's own project.
   *
   * A null resolver is NOT a pass: when the coding authority is unavailable, a node that was asked
   * for cannot be confirmed to belong anywhere, and accepting it would record an unverified link.
   * Asking for no node at all stays legitimate.
   */
  private async assertCoding(
    projectId: string | null, nodeId: Id | null | undefined, kind: 'wbs' | 'cbs',
  ): Promise<void> {
    if (!nodeId) return;
    const label = kind === 'wbs' ? 'WBS' : 'cost';
    if (!projectId) {
      throw new Error(`a ${label} node requires the requisition to belong to a project first`);
    }
    if (!this.coding) {
      throw new Error(`cannot verify the ${label} node belongs to this project — the project coding authority is unavailable`);
    }
    const ok = await this.coding.nodeBelongsToProject(this.tenantId() ?? '', projectId, nodeId, kind);
    if (!ok) throw new Error(`${label} node ${nodeId} does not belong to this requisition's project`);
  }

  /**
   * Keep the persisted header in step with the lines.
   *
   * Once a requisition has lines, the header is no longer an independent figure — programme rule 3,
   * no business truth copied into a convenient duplicate field. Without this the list would show
   * the authored header (usually 0, sometimes a stale guess) beside a panel showing what the lines
   * actually add up to: two totals that disagree, in front of the same person.
   *
   * While any line is unpriced the governing value is NULL, and 0 is what a NOT NULL column can say
   * for "nothing established yet". That is safe precisely because such a requisition cannot be
   * submitted or approved — the readiness rule refuses it — so nothing acts on the zero, and the
   * panel says in words why there is no value.
   */
  private async syncHeader(prId: Id): Promise<void> {
    const pr = await this.requisition(prId);
    const lines = await this.lines.listForRequest(pr.id, pr.tenantId);
    if (lines.length === 0) return;
    const { value } = governingValue(pr.value, lines);
    const next = value ?? 0;
    if (pr.value === next) return;
    await this.requests.update({ ...pr, value: next });
  }

  async addLine(input: NewLineInput): Promise<PurchaseRequestLine> {
    const pr = await this.requisition(input.prId);
    this.assertDraft(pr.status);

    // The material is resolved BEFORE anything is written: a line that could not name a real
    // catalogue material must not exist even briefly.
    const cited = await this.catalogue.citeMaterial(input.material, pr.tenantId);
    await this.assertCoding(pr.projectId, input.wbsNodeId, 'wbs');
    await this.assertCoding(pr.projectId, input.cbsNodeId, 'cbs');

    const existing = await this.lines.listForRequest(pr.id, pr.tenantId);
    const line = makePurchaseRequestLine({
      tenantId: pr.tenantId,
      companyId: pr.companyId,
      prId: pr.id,
      lineNo: nextLineNo(existing),
      materialId: cited.materialId,
      snapshot: {
        materialCode: cited.materialCode,
        materialName: cited.materialName,
        specification: cited.specification,
        manufacturer: cited.manufacturer,
        model: cited.model,
        uom: cited.uom,
      },
      quantity: input.quantity,
      needByDate: input.needByDate,
      estimatedUnitCost: input.estimatedUnitCost,
      wbsNodeId: input.wbsNodeId,
      cbsNodeId: input.cbsNodeId,
      notes: input.notes,
      createdBy: this.tenant?.get().actorId ?? null,
    });
    await this.lines.save(line);
    await this.syncHeader(pr.id);
    this.logger.log(`PR ${pr.id} line ${line.lineNo}: ${line.quantity} ${line.uom} of ${line.materialCode}`);
    return line;
  }

  /**
   * Change a line's demand. The material and its snapshot are not editable here — a line that
   * should name something else is removed and re-added, so the description always matches the
   * material that was actually resolved.
   */
  async editLine(id: Id, edit: LineEdit): Promise<PurchaseRequestLine> {
    const line = assertSameTenant(await this.lines.find(id, this.tenantId() ?? ''), this.tenantId(), 'requisition line', id);
    const pr = await this.requisition(line.prId);
    this.assertDraft(pr.status);
    await this.assertCoding(pr.projectId, edit.wbsNodeId, 'wbs');
    await this.assertCoding(pr.projectId, edit.cbsNodeId, 'cbs');

    // Re-made through the domain so quantity and cost face the same rules they did on creation.
    const next = makePurchaseRequestLine({
      tenantId: line.tenantId,
      companyId: line.companyId,
      prId: line.prId,
      lineNo: line.lineNo,
      materialId: line.materialId,
      snapshot: {
        materialCode: line.materialCode, materialName: line.materialName,
        specification: line.specification, manufacturer: line.manufacturer,
        model: line.model, uom: line.uom,
      },
      quantity: edit.quantity ?? line.quantity,
      needByDate: edit.needByDate === undefined ? line.needByDate : edit.needByDate,
      estimatedUnitCost: edit.estimatedUnitCost === undefined ? line.estimatedUnitCost : edit.estimatedUnitCost,
      wbsNodeId: edit.wbsNodeId === undefined ? line.wbsNodeId : edit.wbsNodeId,
      cbsNodeId: edit.cbsNodeId === undefined ? line.cbsNodeId : edit.cbsNodeId,
      notes: edit.notes === undefined ? line.notes : edit.notes,
      createdBy: line.createdBy,
    });
    const saved: PurchaseRequestLine = { ...next, id: line.id, createdAt: line.createdAt };
    await this.lines.save(saved);
    await this.syncHeader(pr.id);
    return saved;
  }

  async removeLine(id: Id): Promise<void> {
    const line = assertSameTenant(await this.lines.find(id, this.tenantId() ?? ''), this.tenantId(), 'requisition line', id);
    const pr = await this.requisition(line.prId);
    this.assertDraft(pr.status);
    await this.lines.remove(id, line.tenantId);
    // Close the gap, so line numbers stay the positions people refer to rather than a history of
    // what was deleted.
    const remaining = await this.lines.listForRequest(pr.id, pr.tenantId);
    for (const renumbered of renumber(remaining)) {
      if (remaining.find((r) => r.id === renumbered.id)?.lineNo !== renumbered.lineNo) {
        await this.lines.save(renumbered);
      }
    }
    await this.syncHeader(pr.id);
  }

  listLines(prId: Id): Promise<PurchaseRequestLine[]> {
    return this.lines.listForRequest(prId, this.tenantId() ?? '');
  }

  /** What the requisition adds up to, and whether that sum is the whole story. */
  async total(prId: Id): Promise<RequisitionTotal> {
    return requisitionTotal(await this.lines.listForRequest(prId, this.tenantId() ?? ''));
  }

  /**
   * The value that governs this requisition — derived from its lines where it has them, and the
   * authored header figure where it does not.
   */
  async governingValue(prId: Id): Promise<{ value: number | null; derived: boolean }> {
    const pr = await this.requisition(prId);
    const lines = await this.lines.listForRequest(pr.id, pr.tenantId);
    return governingValue(pr.value, lines);
  }

  /** Whether this requisition may be sent for a decision, and why not when it may not. */
  async submissionReadiness(prId: Id): Promise<{ ready: boolean; reason?: string }> {
    const pr = await this.requisition(prId);
    const lines = await this.lines.listForRequest(pr.id, pr.tenantId);
    // A requisition raised before lines existed keeps its previous behaviour: it carries a header
    // figure and nothing else, and refusing it now would invalidate historical records rather than
    // improve any of them.
    if (lines.length === 0) return { ready: true };
    return readyToSubmit(lines);
  }
}
