import { describe, it, expect } from 'vitest';
import { makeMaintenanceRecord } from './maintenance';
import { makeFuelLog } from './fuel-log';

describe('fleet maintenance + fuel domain', () => {
  it('a maintenance record defaults to scheduled with zero cost and a trimmed description', () => {
    const m = makeMaintenanceRecord({ tenantId: 't', vehicleId: 'v', date: '2026-02-01', description: '  oil change  ' });
    expect(m.status).toBe('scheduled');
    expect(m.cost).toBe(0);
    expect(m.description).toBe('oil change');
  });

  it('a completed maintenance record keeps the given status and cost', () => {
    const m = makeMaintenanceRecord({ tenantId: 't', vehicleId: 'v', date: '2026-02-01', description: 'brake pads', cost: 350, status: 'completed' });
    expect(m.status).toBe('completed');
    expect(m.cost).toBe(350);
  });

  it('a fuel log captures liters, cost and odometer', () => {
    const f = makeFuelLog({ tenantId: 't', vehicleId: 'v', date: '2026-02-01', liters: 45, cost: 135, odometer: 81234 });
    expect(f.liters).toBe(45);
    expect(f.cost).toBe(135);
    expect(f.odometer).toBe(81234);
    expect(f.vehicleId).toBe('v');
  });
});
