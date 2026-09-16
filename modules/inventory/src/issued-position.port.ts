/**
 * How much of a material is currently issued to a project's BOQ item.
 *
 * Inventory owns what is in the warehouse; the QUANTITY POSITION of a BOQ item belongs to Projects,
 * and Inventory does not import it (ADR-0004). It states the fact it needs and the application
 * binds the implementation, exactly as the material catalogue is bound for Procurement.
 */
export const ISSUED_POSITION = Symbol('ISSUED_POSITION');

export interface IssuedPosition {
  /**
   * Issues minus returns already recorded for this BOQ item, or NULL when the position cannot be
   * read. Null is never a pass — see `mayReturnFromProject`.
   */
  netIssued(tenantId: string, projectId: string, boqItemId: string): Promise<number | null>;
}
