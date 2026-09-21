// ============================================================
// AMC Domain: Service Contract
// ============================================================

export type ContractStatus = 'active' | 'expired' | 'terminated';

export class ServiceContract {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId?: string;
  readonly contractNumber: string;
  readonly clientName: string;
  readonly assetId?: string;
  readonly serviceScope: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly value: number;
  readonly currency: string;
  status: ContractStatus;
  /** Who ended the cover, when, and why. The record carried only the status. */
  terminatedBy?: string | null;
  terminatedAt?: Date;
  terminationReason?: string | null;
  readonly slaResponseHours: number;
  readonly slaResolutionHours: number;
  readonly createdAt: Date;
  updatedAt: Date;

  constructor(params: {
    id: string;
    tenantId: string;
    companyId?: string;
    contractNumber: string;
    clientName: string;
    assetId?: string;
    serviceScope: string;
    startDate: Date;
    endDate: Date;
    value: number;
    currency?: string;
    status?: ContractStatus;
    slaResponseHours?: number;
    slaResolutionHours?: number;
  }) {
    this.id = params.id;
    this.tenantId = params.tenantId;
    this.companyId = params.companyId;
    this.contractNumber = params.contractNumber;
    this.clientName = params.clientName;
    this.assetId = params.assetId;
    this.serviceScope = params.serviceScope;
    this.startDate = params.startDate;
    this.endDate = params.endDate;
    this.value = params.value;
    this.currency = params.currency ?? 'AED';
    this.status = params.status ?? 'active';
    this.slaResponseHours = params.slaResponseHours ?? 4;
    this.slaResolutionHours = params.slaResolutionHours ?? 24;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  /**
   * End the maintenance contract. It records who and why: terminating an AMC ends a client's
   * cover, and the record said only that the status had changed.
   */
  terminate(actorId: string | null = null, reason?: string): void {
    if (actorId && !reason?.trim()) throw new Error('terminating a service contract requires a reason');
    this.status = 'terminated';
    this.terminatedBy = actorId;
    this.terminatedAt = new Date();
    this.terminationReason = reason?.trim() || null;
    this.updatedAt = new Date();
  }

  isActive(): boolean {
    return this.status === 'active' && this.endDate >= new Date();
  }
}
