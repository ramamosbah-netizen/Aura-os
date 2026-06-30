// ============================================================
// AMC Domain: Preventive Maintenance (PPM) Schedule
// ============================================================
// A recurring plan attached to a service contract that generates preventive work-order
// visits at a fixed frequency. When a visit is generated the schedule advances its next
// due date by the frequency interval. Distinct from a one-off work order.

export type PpmFrequency = 'monthly' | 'quarterly' | 'semi_annual' | 'annual';

export const FREQUENCY_MONTHS: Record<PpmFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  semi_annual: 6,
  annual: 12,
};

/** Add whole months to a date (clamps day-of-month to the target month's length). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const targetMonth = d.getUTCMonth() + months;
  const result = new Date(Date.UTC(d.getUTCFullYear(), targetMonth, 1));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return result;
}

export class PpmSchedule {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId?: string;
  readonly contractId: string;
  readonly assetId?: string;
  readonly taskDescription: string;
  readonly frequency: PpmFrequency;
  readonly startDate: Date;
  nextDueDate: Date;
  active: boolean;
  visitsGenerated: number;
  readonly createdAt: Date;
  updatedAt: Date;

  constructor(params: {
    id: string;
    tenantId: string;
    companyId?: string;
    contractId: string;
    assetId?: string;
    taskDescription: string;
    frequency: PpmFrequency;
    startDate: Date;
  }) {
    if (!params.contractId) throw new Error('contractId is required');
    if (!params.taskDescription?.trim()) throw new Error('taskDescription is required');
    if (!FREQUENCY_MONTHS[params.frequency]) throw new Error(`frequency must be one of: ${Object.keys(FREQUENCY_MONTHS).join(', ')}`);
    this.id = params.id;
    this.tenantId = params.tenantId;
    this.companyId = params.companyId;
    this.contractId = params.contractId;
    this.assetId = params.assetId;
    this.taskDescription = params.taskDescription.trim();
    this.frequency = params.frequency;
    this.startDate = params.startDate;
    this.nextDueDate = params.startDate;
    this.active = true;
    this.visitsGenerated = 0;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  isDue(asOf: Date): boolean {
    return this.active && this.nextDueDate.getTime() <= asOf.getTime();
  }

  /** Advance the schedule one interval after a visit is generated. */
  advance(): void {
    this.nextDueDate = addMonths(this.nextDueDate, FREQUENCY_MONTHS[this.frequency]);
    this.visitsGenerated += 1;
    this.updatedAt = new Date();
  }

  deactivate(): void {
    this.active = false;
    this.updatedAt = new Date();
  }
}
