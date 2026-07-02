// ============================================================
// AMC Domain: Support Ticket with SLA tracking
// ============================================================

export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
/** SLA health: on_track · at_risk (≤25% of the window remaining) · breached (past due, unresolved). */
export type SlaStatus = 'on_track' | 'at_risk' | 'breached';

export class SupportTicket {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId?: string;
  readonly contractId?: string;
  readonly ticketNumber: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly priority: TicketPriority;
  status: TicketStatus;
  readonly reportedBy: string;
  assignedTo?: string;
  readonly slaResponseHours: number;
  readonly slaResolutionHours: number;
  readonly slaDueAt: Date;          // Computed from contract SLA + createdAt
  resolvedAt?: Date;
  /** Escalation tier — bumped each time an unresolved breach is swept (0 = never escalated). */
  escalationLevel = 0;
  readonly createdAt: Date;
  updatedAt: Date;

  constructor(params: {
    id: string;
    tenantId: string;
    companyId?: string;
    contractId?: string;
    ticketNumber: string;
    title: string;
    description: string;
    category?: string;
    priority?: TicketPriority;
    reportedBy: string;
    slaResponseHours?: number;
    slaResolutionHours?: number;
  }) {
    this.id = params.id;
    this.tenantId = params.tenantId;
    this.companyId = params.companyId;
    this.contractId = params.contractId;
    this.ticketNumber = params.ticketNumber;
    this.title = params.title;
    this.description = params.description;
    this.category = params.category ?? 'general';
    this.priority = params.priority ?? 'medium';
    this.status = 'open';
    this.reportedBy = params.reportedBy;
    this.slaResponseHours = params.slaResponseHours ?? 4;
    this.slaResolutionHours = params.slaResolutionHours ?? 24;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    // SLA deadline = creation time + resolution hours
    this.slaDueAt = new Date(this.createdAt.getTime() + this.slaResolutionHours * 60 * 60 * 1000);
  }

  assign(technicianId: string): void {
    this.assignedTo = technicianId;
    this.status = 'in_progress';
    this.updatedAt = new Date();
  }

  resolve(): void {
    this.status = 'resolved';
    this.resolvedAt = new Date();
    this.updatedAt = new Date();
  }

  close(): void {
    this.status = 'closed';
    this.updatedAt = new Date();
  }

  isSlaBreached(now: Date = new Date()): boolean {
    return this.status !== 'resolved' && this.status !== 'closed' && now > this.slaDueAt;
  }

  /** SLA health as of `now`: breached (past due), at_risk (≤25% of window left), else on_track. */
  slaStatus(now: Date = new Date()): SlaStatus {
    if (this.status === 'resolved' || this.status === 'closed') return 'on_track';
    if (now > this.slaDueAt) return 'breached';
    const windowMs = this.slaResolutionHours * 60 * 60 * 1000;
    const remainingMs = this.slaDueAt.getTime() - now.getTime();
    return remainingMs <= windowMs * 0.25 ? 'at_risk' : 'on_track';
  }

  /** Bump the escalation tier (called when an unresolved breach is swept). */
  escalate(): void {
    this.escalationLevel += 1;
    this.updatedAt = new Date();
  }
}
