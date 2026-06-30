import { ServiceContract } from './domain/service-contract';
import { WorkOrder } from './domain/work-order';
import { SupportTicket } from './domain/support-ticket';
import { PpmSchedule } from './domain/ppm-schedule';

export const AMC_STORE = Symbol('AMC_STORE');

export interface AmcStore {
  // Service Contracts
  saveContract(contract: ServiceContract): Promise<void>;
  findContract(id: string): Promise<ServiceContract | null>;
  listContracts(tenantId: string): Promise<ServiceContract[]>;

  // Work Orders
  saveWorkOrder(order: WorkOrder): Promise<void>;
  findWorkOrder(id: string): Promise<WorkOrder | null>;
  listWorkOrders(tenantId: string, contractId?: string): Promise<WorkOrder[]>;

  // Tickets
  saveTicket(ticket: SupportTicket): Promise<void>;
  findTicket(id: string): Promise<SupportTicket | null>;
  listTickets(tenantId: string, contractId?: string): Promise<SupportTicket[]>;

  // PPM Schedules
  savePpm(schedule: PpmSchedule): Promise<void>;
  findPpm(id: string): Promise<PpmSchedule | null>;
  listPpms(tenantId: string, contractId?: string): Promise<PpmSchedule[]>;
}
