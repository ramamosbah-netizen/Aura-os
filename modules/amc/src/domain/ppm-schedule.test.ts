import { describe, it, expect } from 'vitest';
import { PpmSchedule, addMonths } from './ppm-schedule';

const base = () => new PpmSchedule({
  id: 'ppm-1',
  tenantId: 't1',
  contractId: 'contract-1',
  taskDescription: 'Quarterly chiller service',
  frequency: 'quarterly',
  startDate: new Date('2026-01-15T00:00:00Z'),
});

describe('addMonths', () => {
  it('adds whole months', () => {
    expect(addMonths(new Date('2026-01-15T00:00:00Z'), 3).toISOString().slice(0, 10)).toBe('2026-04-15');
  });
  it('clamps day-of-month (Jan 31 + 1mo → Feb 28)', () => {
    expect(addMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-02-28');
  });
});

describe('PpmSchedule', () => {
  it('starts active with nextDueDate = startDate', () => {
    const s = base();
    expect(s.active).toBe(true);
    expect(s.nextDueDate.toISOString().slice(0, 10)).toBe('2026-01-15');
    expect(s.visitsGenerated).toBe(0);
  });

  it('validates contract, task, frequency', () => {
    expect(() => new PpmSchedule({ id: 'x', tenantId: 't', contractId: '', taskDescription: 'a', frequency: 'monthly', startDate: new Date() })).toThrow('contractId is required');
    expect(() => new PpmSchedule({ id: 'x', tenantId: 't', contractId: 'c', taskDescription: ' ', frequency: 'monthly', startDate: new Date() })).toThrow('taskDescription is required');
    expect(() => new PpmSchedule({ id: 'x', tenantId: 't', contractId: 'c', taskDescription: 'a', frequency: 'weekly' as never, startDate: new Date() })).toThrow('frequency must be one of');
  });

  it('isDue when asOf reaches nextDueDate', () => {
    const s = base();
    expect(s.isDue(new Date('2026-01-14T00:00:00Z'))).toBe(false);
    expect(s.isDue(new Date('2026-01-15T00:00:00Z'))).toBe(true);
  });

  it('advance() moves nextDueDate by the frequency and counts visits', () => {
    const s = base();
    s.advance();
    expect(s.nextDueDate.toISOString().slice(0, 10)).toBe('2026-04-15'); // +3 months
    expect(s.visitsGenerated).toBe(1);
    s.advance();
    expect(s.nextDueDate.toISOString().slice(0, 10)).toBe('2026-07-15');
    expect(s.visitsGenerated).toBe(2);
  });

  it('is not due once deactivated', () => {
    const s = base();
    s.deactivate();
    expect(s.isDue(new Date('2026-06-01T00:00:00Z'))).toBe(false);
  });
});
