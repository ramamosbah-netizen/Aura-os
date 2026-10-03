/**
 * Validating a COST LINE a movement is coded to, without Inventory knowing what a cost line IS.
 *
 * A stock issue coded to a project's cost line becomes ACTUAL cost on that line (the material cost
 * strand). The cost breakdown belongs to Projects and Inventory does not import it (ADR-0004), so
 * Inventory asks and the composition root binds the answer — the same shape as `WORK_PACKAGE`.
 *
 * COST-CODE-01: the movement used to carry whatever cost line it was sent. An issue to project A
 * naming a cost line of project B was accepted, recorded against A, and posted as actual cost onto
 * B's line — so one project's material landed on another project's books with nothing to say so.
 * The question is narrow: does this node exist as a COST LINE of this tenant's project. A work
 * package id passed as a cost line is refused for being the wrong kind, whatever project it is in.
 */
export const COST_LINE = Symbol('COST_LINE');

export interface CostLine {
  /** True when `cbsNodeId` is a cost line of that tenant's project. An UNBOUND port refuses too. */
  belongsToProject(tenantId: string, projectId: string, cbsNodeId: string): Promise<boolean>;
}
