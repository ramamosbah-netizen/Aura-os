import { Inject, Injectable, Logger } from '@nestjs/common';
import { AmcStore, AMC_STORE } from './store.interface';
import { ServiceContract, ContractStatus } from './domain/service-contract';
import { WorkOrder, WorkOrderPriority, WorkOrderType, GeoCoordinate } from './domain/work-order';
import { SupportTicket, TicketPriority } from './domain/support-ticket';

let idCounter = 1;
const genId = () => `amc-${(idCounter++).toString().padStart(5, '0')}`;

@Injectable()
export class AmcService {
  private readonly logger = new Logger('AmcService');

  constructor(@Inject(AMC_STORE) private readonly store: AmcStore) {}

  // ── Service Contracts ────────────────────────────────────────

  async createContract(params: {
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
    slaResponseHours?: number;
    slaResolutionHours?: number;
  }): Promise<ServiceContract> {
    const contract = new ServiceContract({ id: genId(), ...params });
    await this.store.saveContract(contract);
    this.logger.log(`[AMC] Service contract created: ${contract.contractNumber} for ${contract.clientName}`);
    return contract;
  }

  async listContracts(tenantId: string): Promise<ServiceContract[]> {
    return this.store.listContracts(tenantId);
  }

  async findContract(id: string): Promise<ServiceContract | null> {
    return this.store.findContract(id);
  }

  async listTickets(tenantId: string, contractId?: string): Promise<SupportTicket[]> {
    return this.store.listTickets(tenantId, contractId);
  }

  async findTicket(id: string): Promise<SupportTicket | null> {
    return this.store.findTicket(id);
  }

  async listWorkOrders(tenantId: string, contractId?: string): Promise<WorkOrder[]> {
    return this.store.listWorkOrders(tenantId, contractId);
  }

  async terminateContract(id: string): Promise<ServiceContract> {
    const contract = await this.store.findContract(id);
    if (!contract) throw new Error(`Contract ${id} not found`);
    contract.terminate();
    await this.store.saveContract(contract);
    this.logger.log(`[AMC] Contract terminated: ${contract.contractNumber}`);
    return contract;
  }

  // ── Work Orders ──────────────────────────────────────────────

  async createWorkOrder(params: {
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
  }): Promise<WorkOrder> {
    const order = new WorkOrder({ id: genId(), ...params });
    await this.store.saveWorkOrder(order);
    this.logger.log(`[AMC] Work order created: ${order.orderNumber} (${order.type}/${order.priority})`);
    return order;
  }

  async assignWorkOrder(id: string, technicianId: string): Promise<WorkOrder> {
    const order = await this.store.findWorkOrder(id);
    if (!order) throw new Error(`Work order ${id} not found`);
    order.assign(technicianId);
    await this.store.saveWorkOrder(order);
    this.logger.log(`[AMC] Work order ${order.orderNumber} assigned to ${technicianId}`);
    return order;
  }

  async completeWorkOrder(id: string): Promise<WorkOrder> {
    const order = await this.store.findWorkOrder(id);
    if (!order) throw new Error(`Work order ${id} not found`);
    order.complete();
    await this.store.saveWorkOrder(order);
    this.logger.log(`[AMC] Work order ${order.orderNumber} completed`);
    return order;
  }

  // ── Tickets & SLA ────────────────────────────────────────────

  async raiseTicket(params: {
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
  }): Promise<SupportTicket> {
    const ticket = new SupportTicket({ id: genId(), ...params });
    await this.store.saveTicket(ticket);
    this.logger.log(`[AMC] Ticket raised: ${ticket.ticketNumber} — "${ticket.title}" (SLA due: ${ticket.slaDueAt.toISOString()})`);
    return ticket;
  }

  async assignTicket(id: string, technicianId: string): Promise<SupportTicket> {
    const ticket = await this.store.findTicket(id);
    if (!ticket) throw new Error(`Ticket ${id} not found`);
    ticket.assign(technicianId);
    await this.store.saveTicket(ticket);
    this.logger.log(`[AMC] Ticket ${ticket.ticketNumber} assigned to ${technicianId}`);
    return ticket;
  }

  async resolveTicket(id: string): Promise<SupportTicket> {
    const ticket = await this.store.findTicket(id);
    if (!ticket) throw new Error(`Ticket ${id} not found`);
    ticket.resolve();
    await this.store.saveTicket(ticket);
    this.logger.log(`[AMC] Ticket ${ticket.ticketNumber} resolved`);
    return ticket;
  }

  // ── Dispatch Board ────────────────────────────────────────────
  // Returns all open/assigned work orders for a given tenant, 
  // optionally filtered by GIS bounding box, for scheduling boards.

  async getDispatchBoard(tenantId: string, bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number }): Promise<WorkOrder[]> {
    const orders = await this.store.listWorkOrders(tenantId);
    const active = orders.filter((o) => o.status === 'open' || o.status === 'assigned' || o.status === 'in_progress');

    if (!bounds) return active;

    return active.filter((o) => {
      if (!o.location) return true; // No location filter if no coordinates
      return (
        o.location.lat >= bounds.minLat &&
        o.location.lat <= bounds.maxLat &&
        o.location.lng >= bounds.minLng &&
        o.location.lng <= bounds.maxLng
      );
    });
  }
}
