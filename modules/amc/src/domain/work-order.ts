// ============================================================
// AMC Domain: Work Order
// ============================================================

export type WorkOrderPriority = 'low' | 'medium' | 'high' | 'critical';
export type WorkOrderType = 'preventive' | 'corrective' | 'inspection';
export type WorkOrderStatus = 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';

/**
 * Allowed transitions. A work order is the record of a visit that actually happened, so it cannot
 * be completed straight from `open`: closing out a job nobody was ever assigned is how phantom
 * visits get billed. `completed` and `cancelled` are terminal — a finished visit is not re-opened,
 * a follow-up visit is raised.
 *
 *   open ─assign→ assigned ─start→ in_progress ─complete→ completed
 *                    └──────────── complete ───────────────┘
 *     └───────────────┴───────────────┴──cancel→ cancelled
 *
 * `assigned → completed` is deliberately allowed. Marking a job "in progress" is bookkeeping a
 * technician may skip, and the SLA outcome is measured from raising to completion, so requiring it
 * would block real close-outs to enforce a step that carries no information. The guard that earns
 * its keep is the one on `open`.
 */
export const WORK_ORDER_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  open: ['assigned', 'cancelled'],
  assigned: ['in_progress', 'completed', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export class WorkOrderTransitionError extends Error {
  constructor(from: WorkOrderStatus, to: WorkOrderStatus) {
    // "can only" so the API error taxonomy classifies this 409 CONFLICT, not 500.
    super(`a work order in '${from}' can only advance to an allowed next state (attempted → '${to}')`);
    this.name = 'WorkOrderTransitionError';
  }
}

export function canTransitionWorkOrder(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return WORK_ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertWorkOrderTransition(from: WorkOrderStatus, to: WorkOrderStatus): void {
  if (!canTransitionWorkOrder(from, to)) throw new WorkOrderTransitionError(from, to);
}

export interface GeoCoordinate {
  lat: number;
  lng: number;
  label?: string;
}

export class WorkOrder {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId?: string;
  readonly contractId?: string;
  readonly orderNumber: string;
  readonly assetId?: string;
  readonly description: string;
  readonly priority: WorkOrderPriority;
  readonly type: WorkOrderType;
  status: WorkOrderStatus;
  assignedTo?: string;
  scheduledDate?: Date;
  completedDate?: Date;
  /** Billable amount captured on completion; drives the AMC → AR invoice reactor. */
  cost?: number;
  location?: GeoCoordinate;
  /** When work actually started — the clock the SLA outcome is measured against. */
  startedDate?: Date;
  /**
   * SLA outcome, stamped at completion from the governing contract's resolution window.
   * Held on the work order rather than recomputed on read: the contract's SLA terms can change,
   * and what matters afterwards is whether THIS visit met the SLA that applied at the time.
   */
  slaResolutionHours?: number;
  resolutionHours?: number;
  slaMet?: boolean;
  readonly createdAt: Date;
  updatedAt: Date;

  constructor(params: {
    id: string;
    tenantId: string;
    companyId?: string;
    contractId?: string;
    orderNumber: string;
    assetId?: string;
    description: string;
    priority?: WorkOrderPriority;
    type?: WorkOrderType;
    location?: GeoCoordinate;
    scheduledDate?: Date;
  }) {
    this.id = params.id;
    this.tenantId = params.tenantId;
    this.companyId = params.companyId;
    this.contractId = params.contractId;
    this.orderNumber = params.orderNumber;
    this.assetId = params.assetId;
    this.description = params.description;
    this.priority = params.priority ?? 'medium';
    this.type = params.type ?? 'corrective';
    this.status = 'open';
    this.location = params.location;
    this.scheduledDate = params.scheduledDate;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  assign(technicianId: string): void {
    if (!technicianId?.trim()) throw new Error('a technician is required to assign a work order');
    assertWorkOrderTransition(this.status, 'assigned');
    this.assignedTo = technicianId;
    this.status = 'assigned';
    this.updatedAt = new Date();
  }

  startWork(at: Date = new Date()): void {
    assertWorkOrderTransition(this.status, 'in_progress');
    this.status = 'in_progress';
    this.startedDate = at;
    this.updatedAt = new Date();
  }

  /**
   * Close out the visit. `slaResolutionHours` comes from the governing contract; when supplied the
   * elapsed time from raising to completion is measured against it and the outcome is stamped on
   * the order. That is what makes an AMC contract's core promise auditable after the fact rather
   * than a number in a dashboard that recomputes itself into compliance.
   */
  complete(cost?: number, slaResolutionHours?: number, at: Date = new Date()): void {
    assertWorkOrderTransition(this.status, 'completed');
    this.status = 'completed';
    this.completedDate = at;
    if (cost !== undefined) this.cost = cost;
    if (slaResolutionHours !== undefined) {
      const elapsedHours = (at.getTime() - this.createdAt.getTime()) / 3_600_000;
      this.slaResolutionHours = slaResolutionHours;
      this.resolutionHours = Math.round(elapsedHours * 100) / 100;
      this.slaMet = elapsedHours <= slaResolutionHours;
    }
    this.updatedAt = new Date();
  }

  cancel(): void {
    assertWorkOrderTransition(this.status, 'cancelled');
    this.status = 'cancelled';
    this.updatedAt = new Date();
  }
}
