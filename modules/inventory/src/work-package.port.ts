/**
 * Validating a work-package destination, without Inventory knowing what a work package IS.
 *
 * `BUY-07` records the work package a movement was delivered to. The work-package structure belongs
 * to Projects and Inventory does not import it (ADR-0004), so Inventory declares what it needs to
 * ask and the composition root binds the answer — the same shape as `ISSUED_POSITION`.
 *
 * WHAT THIS PORT IS FOR, AND WHAT IT IS NOT FOR.
 *
 * It answers one question: does this node exist, is it a WORK PACKAGE, and does it belong to THIS
 * project. The kind is part of the question rather than a detail — without it a cost node passed as
 * a destination would be accepted purely for belonging to the right project, and the movement would
 * carry a cost code in the field a work package is read from.
 *
 * It is deliberately NOT a lookup. There is no "find the work package for this BOQ item" method, and
 * there must never be one: resolving a destination by matching `boq_item_id` would convert a missing
 * destination into a manufactured one, and is wrong outright once two packages measure against the
 * same BOQ item. A destination is recorded when the material is issued, or it is UNKNOWN.
 *
 * Storing a validated reference does not transfer ownership. Inventory already stores `project_id`
 * the same way.
 */
export const WORK_PACKAGE = Symbol('WORK_PACKAGE');

export interface WorkPackage {
  /**
   * True when `wbsNodeId` is a work package of that tenant's project.
   *
   * A false answer refuses the movement. An UNBOUND port refuses it too — see `stock.service.ts`:
   * an unverifiable destination is not a destination, and this is the direction where being wrong
   * writes a provenance nobody checked. Optional dependency, never optional evidence.
   */
  belongsToProject(tenantId: string, projectId: string, wbsNodeId: string): Promise<boolean>;

  /**
   * WHO OWNS SITE EXECUTION FOR THIS WORK PACKAGE — the recipient `BUY-07`'s receipt is signed by.
   *
   * This is NOT the reverse lookup this port refuses to provide. It does not resolve a destination;
   * it asks who is accountable for a destination already declared on the movement.
   *
   * NULL means NOBODY holds it, and that is an answer. The handoff refuses rather than falling back
   * to a project-wide assignee or to whoever happens to hold a site role — inheriting accountability
   * that nobody assigned is the same failure as inferring provenance, one layer up.
   */
  siteRecipientFor(tenantId: string, projectId: string, wbsNodeId: string): Promise<string | null>;
}
