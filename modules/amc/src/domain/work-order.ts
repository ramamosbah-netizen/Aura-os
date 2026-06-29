// ============================================================
// AMC Domain: Work Order
// ============================================================

export type WorkOrderPriority = 'low' | 'medium' | 'high' | 'critical';
export type WorkOrderType = 'preventive' | 'corrective' | 'inspection';
export type WorkOrderStatus = 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';

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
  location?: GeoCoordinate;
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
    this.assignedTo = technicianId;
    this.status = 'assigned';
    this.updatedAt = new Date();
  }

  startWork(): void {
    this.status = 'in_progress';
    this.updatedAt = new Date();
  }

  complete(): void {
    this.status = 'completed';
    this.completedDate = new Date();
    this.updatedAt = new Date();
  }

  cancel(): void {
    this.status = 'cancelled';
    this.updatedAt = new Date();
  }
}
