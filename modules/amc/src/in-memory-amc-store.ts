import { Injectable } from '@nestjs/common';
import type { Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import { AmcStore } from './store.interface';
import { ServiceContract } from './domain/service-contract';
import { WorkOrder } from './domain/work-order';
import { SupportTicket } from './domain/support-ticket';
import { PpmSchedule } from './domain/ppm-schedule';

@Injectable()
export class InMemoryAmcStore implements AmcStore {
  private readonly contracts = new Map<string, ServiceContract>();
  private readonly workOrders = new Map<string, WorkOrder>();
  private readonly tickets = new Map<string, SupportTicket>();
  private readonly ppms = new Map<string, PpmSchedule>();

  constructor() {
    this.seed();
  }

  private seed() {
    const tenantId = 'dev-tenant';

    // Seed Contracts
    const c1 = new ServiceContract({
      id: 'contract-1',
      tenantId,
      contractNumber: 'AMC-2026-001',
      clientName: 'Emaar Properties PJSC',
      serviceScope: 'HVAC & Chiller preventive maintenance at Burj Khalifa',
      startDate: new Date(Date.now() - 30 * 86400000),
      endDate: new Date(Date.now() + 335 * 86400000),
      value: 1200000,
      slaResponseHours: 2,
      slaResolutionHours: 8,
    });
    const c2 = new ServiceContract({
      id: 'contract-2',
      tenantId,
      contractNumber: 'AMC-2026-002',
      clientName: 'Jumeirah Group',
      serviceScope: 'ELV systems & fire alarm system SLA coverage',
      startDate: new Date(Date.now() - 60 * 86400000),
      endDate: new Date(Date.now() + 305 * 86400000),
      value: 850000,
      slaResponseHours: 4,
      slaResolutionHours: 24,
    });
    this.contracts.set(c1.id, c1);
    this.contracts.set(c2.id, c2);

    // Seed Support Tickets with SLA dues
    const t1 = new SupportTicket({
      id: 'ticket-1',
      tenantId,
      contractId: 'contract-1',
      ticketNumber: 'TKT-9912',
      title: 'AC cooling unit leakage',
      description: 'Chilled water pipe dripping on floor 44, corridor B.',
      priority: 'critical',
      reportedBy: 'Burj Security Control',
      slaResponseHours: 2,
      slaResolutionHours: 8,
    });
    const t2 = new SupportTicket({
      id: 'ticket-2',
      tenantId,
      contractId: 'contract-2',
      ticketNumber: 'TKT-9913',
      title: 'CCTV Camera feed loss',
      description: 'Loss of visual stream from camera CAM-209 on North Pier gate.',
      priority: 'high',
      reportedBy: 'Pier Operations Manager',
      slaResponseHours: 4,
      slaResolutionHours: 24,
    });
    this.tickets.set(t1.id, t1);
    this.tickets.set(t2.id, t2);

    // Seed Work Orders with coordinates
    const wo1 = new WorkOrder({
      id: 'wo-1',
      tenantId,
      contractId: 'contract-1',
      orderNumber: 'WO-8871',
      description: 'Replace cooling valve gasket Burj Khalifa',
      priority: 'critical',
      type: 'corrective',
      location: { lat: 25.1972, lng: 55.2797, label: 'Dubai Mall Area' },
      scheduledDate: new Date(),
    });
    const wo2 = new WorkOrder({
      id: 'wo-2',
      tenantId,
      contractId: 'contract-2',
      orderNumber: 'WO-8872',
      description: 'Recalibrate gate barrier sensor Pier 3',
      priority: 'high',
      type: 'inspection',
      location: { lat: 25.1412, lng: 55.1856, label: 'Jumeirah Beach' },
      scheduledDate: new Date(),
    });
    this.workOrders.set(wo1.id, wo1);
    this.workOrders.set(wo2.id, wo2);
  }

  // --- Service Contracts ---
  async saveContract(contract: ServiceContract): Promise<void> {
    this.contracts.set(contract.id, contract);
  }
  async findContract(id: string): Promise<ServiceContract | null> {
    return this.contracts.get(id) ?? null;
  }
  async listContracts(tenantId: string): Promise<ServiceContract[]> {
    return Array.from(this.contracts.values()).filter((c) => c.tenantId === tenantId);
  }

  // --- Work Orders ---
  async saveWorkOrder(order: WorkOrder): Promise<void> {
    this.workOrders.set(order.id, order);
  }
  async findWorkOrder(id: string): Promise<WorkOrder | null> {
    return this.workOrders.get(id) ?? null;
  }
  async listWorkOrders(tenantId: string, contractId?: string): Promise<WorkOrder[]> {
    return Array.from(this.workOrders.values()).filter(
      (o) => o.tenantId === tenantId && (!contractId || o.contractId === contractId)
    );
  }
  async listWorkOrdersPaged(tenantId: string, page: PageParams, contractId?: string): Promise<Page<WorkOrder>> {
    const all = await this.listWorkOrders(tenantId, contractId);
    all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return paginate(all, page);
  }

  // --- Tickets ---
  async saveTicket(ticket: SupportTicket): Promise<void> {
    this.tickets.set(ticket.id, ticket);
  }
  async findTicket(id: string): Promise<SupportTicket | null> {
    return this.tickets.get(id) ?? null;
  }
  async listTickets(tenantId: string, contractId?: string): Promise<SupportTicket[]> {
    return Array.from(this.tickets.values()).filter(
      (t) => t.tenantId === tenantId && (!contractId || t.contractId === contractId)
    );
  }
  async listTicketsPaged(tenantId: string, page: PageParams, contractId?: string): Promise<Page<SupportTicket>> {
    const all = await this.listTickets(tenantId, contractId);
    all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return paginate(all, page);
  }

  // --- PPM Schedules ---
  async savePpm(schedule: PpmSchedule): Promise<void> {
    this.ppms.set(schedule.id, schedule);
  }
  async findPpm(id: string): Promise<PpmSchedule | null> {
    return this.ppms.get(id) ?? null;
  }
  async listPpms(tenantId: string, contractId?: string): Promise<PpmSchedule[]> {
    return Array.from(this.ppms.values()).filter(
      (p) => p.tenantId === tenantId && (!contractId || p.contractId === contractId)
    );
  }
}
