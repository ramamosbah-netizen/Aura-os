import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { PostgresAmcStore } from './postgres-amc-store';
import { ServiceContract } from './domain/service-contract';
import { WorkOrder } from './domain/work-order';
import { SupportTicket } from './domain/support-ticket';
import { PpmSchedule } from './domain/ppm-schedule';

// Mock-pool unit tests for the AMC Postgres adapter — proving the class rehydration
// (construct + Object.assign of persisted/read-only state) and the upsert SQL, without
// needing a live database. Mirrors the repo's templates.service.test.ts pattern.
function mockPool(rows: any[] = []) {
  const calls: { sql: string; params: any[] }[] = [];
  const pool = {
    query: vi.fn(async (sql: string, params: any[]) => {
      calls.push({ sql, params });
      return { rows, rowCount: rows.length };
    }),
  } as unknown as Pool;
  return { pool, calls };
}

describe('PostgresAmcStore', () => {
  it('rehydrates a ServiceContract with persisted status + timestamps', async () => {
    const { pool } = mockPool([{
      id: 'c-1', tenant_id: 't1', company_id: null, contract_number: 'AMC-1', client_name: 'Emaar',
      asset_id: null, service_scope: 'HVAC', start_date: '2026-01-01', end_date: '2026-12-31',
      value: '1200000', currency: 'AED', status: 'terminated', sla_response_hours: 2,
      sla_resolution_hours: 8, created_at: new Date('2026-01-01T00:00:00Z'), updated_at: new Date('2026-02-01T00:00:00Z'),
    }]);
    const c = await new PostgresAmcStore(pool).findContract('c-1');
    expect(c).toBeInstanceOf(ServiceContract);
    expect(c!.status).toBe('terminated'); // persisted status, not the constructor default 'active'
    expect(c!.value).toBe(1200000);
    expect(c!.slaResponseHours).toBe(2);
    expect(c!.createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('rehydrates a WorkOrder including geo-location and completed status', async () => {
    const { pool } = mockPool([{
      id: 'wo-1', tenant_id: 't1', company_id: null, contract_id: 'c-1', order_number: 'WO-1',
      asset_id: null, description: 'Fix valve', priority: 'critical', type: 'corrective',
      status: 'completed', assigned_to: 'tech-9', scheduled_date: '2026-03-01', completed_date: '2026-03-02',
      location_lat: '25.197200', location_lng: '55.279700', location_label: 'Dubai Mall',
      created_at: new Date('2026-03-01T00:00:00Z'), updated_at: new Date('2026-03-02T00:00:00Z'),
    }]);
    const wo = await new PostgresAmcStore(pool).findWorkOrder('wo-1');
    expect(wo).toBeInstanceOf(WorkOrder);
    expect(wo!.status).toBe('completed'); // constructor forces 'open' — proves Object.assign override
    expect(wo!.assignedTo).toBe('tech-9');
    expect(wo!.location).toEqual({ lat: 25.1972, lng: 55.2797, label: 'Dubai Mall' });
    expect(wo!.completedDate?.toISOString().slice(0, 10)).toBe('2026-03-02');
  });

  it('rehydrates a SupportTicket with the persisted sla_due_at', async () => {
    const { pool } = mockPool([{
      id: 'tk-1', tenant_id: 't1', company_id: null, contract_id: 'c-1', ticket_number: 'TKT-1',
      title: 'Leak', description: 'pipe', category: 'general', priority: 'high', status: 'resolved',
      reported_by: 'ops', assigned_to: 'tech-3', sla_response_hours: 4, sla_resolution_hours: 24,
      sla_due_at: new Date('2026-04-02T00:00:00Z'), resolved_at: new Date('2026-04-01T12:00:00Z'),
      created_at: new Date('2026-04-01T00:00:00Z'), updated_at: new Date('2026-04-01T12:00:00Z'),
    }]);
    const t = await new PostgresAmcStore(pool).findTicket('tk-1');
    expect(t).toBeInstanceOf(SupportTicket);
    expect(t!.status).toBe('resolved');
    expect(t!.slaDueAt.toISOString()).toBe('2026-04-02T00:00:00.000Z'); // persisted, not recomputed
    expect(t!.resolvedAt?.toISOString()).toBe('2026-04-01T12:00:00.000Z');
  });

  it('rehydrates a PpmSchedule preserving nextDueDate + visitsGenerated', async () => {
    const { pool } = mockPool([{
      id: 'ppm-1', tenant_id: 't1', company_id: null, contract_id: 'c-1', asset_id: null,
      task_description: 'Quarterly chiller service', frequency: 'quarterly',
      start_date: '2026-01-01', next_due_date: '2026-07-01', active: false, visits_generated: 2,
      created_at: new Date('2026-01-01T00:00:00Z'), updated_at: new Date('2026-04-01T00:00:00Z'),
    }]);
    const p = await new PostgresAmcStore(pool).findPpm('ppm-1');
    expect(p).toBeInstanceOf(PpmSchedule);
    expect(p!.active).toBe(false); // constructor defaults true — proves override
    expect(p!.visitsGenerated).toBe(2);
    expect(p!.nextDueDate.toISOString().slice(0, 10)).toBe('2026-07-01');
  });

  it('upserts a contract with the right id + status params', async () => {
    const { pool, calls } = mockPool();
    const c = new ServiceContract({
      id: 'c-9', tenantId: 't1', contractNumber: 'AMC-9', clientName: 'X', serviceScope: 'Y',
      startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'), value: 500,
    });
    c.terminate();
    await new PostgresAmcStore(pool).saveContract(c);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('INSERT INTO public.aura_amc_service_contracts');
    expect(calls[0].sql).toContain('ON CONFLICT (id) DO UPDATE');
    expect(calls[0].params[0]).toBe('c-9');
    expect(calls[0].params[11]).toBe('terminated'); // status column position
  });

  it('filters work orders by contract when provided', async () => {
    const { pool, calls } = mockPool();
    await new PostgresAmcStore(pool).listWorkOrders('t1', 'c-1');
    expect(calls[0].sql).toContain('contract_id = $2');
    expect(calls[0].params).toEqual(['t1', 'c-1']);
  });
});
