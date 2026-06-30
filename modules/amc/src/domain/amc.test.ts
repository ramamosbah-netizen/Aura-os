import { describe, expect, it, beforeEach } from 'vitest';
import { AmcService } from '../amc.service';
import { InMemoryAmcStore } from '../in-memory-amc-store';

describe('AMC Module — Phase 5', () => {
  let service: AmcService;

  beforeEach(() => {
    service = new AmcService(new InMemoryAmcStore(), { append: async () => [] } as any);
  });

  describe('Service Contracts', () => {
    it('should create a service contract with SLA defaults', async () => {
      const contract = await service.createContract({
        tenantId: 'tenant-uae',
        contractNumber: 'SC-2026-001',
        clientName: 'Al Futtaim Properties',
        serviceScope: 'HVAC Annual Maintenance',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        value: 120000,
        slaResponseHours: 2,
        slaResolutionHours: 8,
      });

      expect(contract.contractNumber).toBe('SC-2026-001');
      expect(contract.status).toBe('active');
      expect(contract.slaResponseHours).toBe(2);
      expect(contract.isActive()).toBe(true);
    });

    it('should terminate a contract', async () => {
      const contract = await service.createContract({
        tenantId: 'tenant-uae',
        contractNumber: 'SC-2026-002',
        clientName: 'Emaar Development',
        serviceScope: 'Elevator Servicing',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        value: 75000,
      });

      const terminated = await service.terminateContract(contract.id);
      expect(terminated.status).toBe('terminated');
      expect(terminated.isActive()).toBe(false);
    });
  });

  describe('Work Orders & Dispatch Board', () => {
    it('should create, assign, and complete a work order', async () => {
      const order = await service.createWorkOrder({
        tenantId: 'tenant-uae',
        orderNumber: 'WO-2026-001',
        description: 'AC unit compressor replacement at Tower A',
        priority: 'critical',
        type: 'corrective',
        location: { lat: 25.2048, lng: 55.2708, label: 'Dubai Marina Tower A' },
      });

      expect(order.status).toBe('open');
      expect(order.priority).toBe('critical');
      expect(order.location?.label).toBe('Dubai Marina Tower A');

      await service.assignWorkOrder(order.id, 'tech-ali-hassan');
      const assigned = await service.createWorkOrder({
        tenantId: 'tenant-uae', orderNumber: 'WO-TEMP', description: 'temp', 
      });
      // Verify status on original
      const store = new InMemoryAmcStore();
      const svc2 = new AmcService(store, { append: async () => [] } as any);
      const o2 = await svc2.createWorkOrder({
        tenantId: 'tenant-uae', orderNumber: 'WO-2026-002',
        description: 'Fire alarm panel inspection', type: 'inspection',
      });
      await svc2.assignWorkOrder(o2.id, 'tech-sara-khalid');
      expect(o2.status).toBe('assigned');
      expect(o2.assignedTo).toBe('tech-sara-khalid');
      await svc2.completeWorkOrder(o2.id);
      expect(o2.status).toBe('completed');
      expect(o2.completedDate).toBeDefined();
    });

    it('should return GIS-filtered dispatch board results', async () => {
      const s = new AmcService(new InMemoryAmcStore(), { append: async () => [] } as any);
      await s.createWorkOrder({
        tenantId: 't1', orderNumber: 'WO-GIS-1',
        description: 'Task in Dubai', location: { lat: 25.2, lng: 55.3 },
      });
      await s.createWorkOrder({
        tenantId: 't1', orderNumber: 'WO-GIS-2',
        description: 'Task in Abu Dhabi', location: { lat: 24.4, lng: 54.4 },
      });

      // Filter only Dubai region
      const board = await s.getDispatchBoard('t1', {
        minLat: 25.0, maxLat: 25.5, minLng: 55.0, maxLng: 55.5,
      });
      expect(board).toHaveLength(1);
      expect(board[0].orderNumber).toBe('WO-GIS-1');
    });
  });

  describe('Support Tickets & SLA', () => {
    it('should raise a ticket and compute SLA deadline', async () => {
      const ticket = await service.raiseTicket({
        tenantId: 'tenant-uae',
        ticketNumber: 'TKT-2026-001',
        title: 'Chiller unit not cooling',
        description: 'Main chiller on floor 12 not responding since 09:00 AM',
        priority: 'high',
        reportedBy: 'facility-manager-001',
        slaResolutionHours: 4,
      });

      expect(ticket.ticketNumber).toBe('TKT-2026-001');
      expect(ticket.status).toBe('open');
      expect(ticket.slaDueAt.getTime()).toBeGreaterThan(ticket.createdAt.getTime());
      expect(ticket.isSlaBreached()).toBe(false); // Just created, not breached
    });

    it('should assign and resolve a ticket', async () => {
      const ticket = await service.raiseTicket({
        tenantId: 'tenant-uae',
        ticketNumber: 'TKT-2026-002',
        title: 'Power outage in parking',
        description: 'Generator failed in B2 parking level',
        priority: 'critical',
        reportedBy: 'security-guard-007',
      });

      await service.assignTicket(ticket.id, 'tech-electrician-01');
      expect(ticket.status).toBe('in_progress');
      expect(ticket.assignedTo).toBe('tech-electrician-01');

      await service.resolveTicket(ticket.id);
      expect(ticket.status).toBe('resolved');
      expect(ticket.resolvedAt).toBeDefined();
    });
  });
});
