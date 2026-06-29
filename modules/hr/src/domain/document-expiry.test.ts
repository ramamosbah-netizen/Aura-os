import { describe, it, expect } from 'vitest';
import { buildDocumentExpiryReport, daysUntil } from './document-expiry';
import type { Employee } from './employee';

function emp(over: Partial<Employee>): Employee {
  return {
    id: Math.random().toString(36).slice(2),
    tenantId: 't1', companyId: null,
    firstName: 'Test', lastName: 'User', email: null, phone: null,
    role: 'Worker', department: 'Site', status: 'active',
    joinedDate: '2024-01-01', visaExpiry: null, permitExpiry: null, laborCamp: null,
    createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
    ...over,
  };
}

describe('daysUntil', () => {
  it('is positive before, negative after expiry', () => {
    expect(daysUntil('2026-07-10', '2026-06-10')).toBe(30);
    expect(daysUntil('2026-06-01', '2026-06-10')).toBe(-9);
  });
});

describe('buildDocumentExpiryReport', () => {
  it('flags expired and expiring docs, omits far-off ones', () => {
    const r = buildDocumentExpiryReport(
      [
        emp({ id: 'e1', firstName: 'Ali', lastName: 'H', visaExpiry: '2026-05-01' }),  // expired (asOf 2026-06-10)
        emp({ id: 'e2', firstName: 'Sara', lastName: 'K', permitExpiry: '2026-07-01' }), // 21 days → expiring
        emp({ id: 'e3', firstName: 'Far', lastName: 'O', visaExpiry: '2027-01-01' }),  // far off → omitted
      ],
      '2026-06-10',
      90,
    );
    expect(r.expiredCount).toBe(1);
    expect(r.expiringCount).toBe(1);
    expect(r.items).toHaveLength(2);
    // sorted soonest/most-overdue first → the expired visa leads
    expect(r.items[0].employeeId).toBe('e1');
    expect(r.items[0].status).toBe('expired');
    expect(r.items[1].documentType).toBe('work_permit');
    expect(r.items[1].status).toBe('expiring');
  });

  it('reports both documents for one employee when both lapse', () => {
    const r = buildDocumentExpiryReport([emp({ id: 'e1', visaExpiry: '2026-06-05', permitExpiry: '2026-06-20' })], '2026-06-10', 90);
    expect(r.items).toHaveLength(2);
    expect(r.items.map((i) => i.documentType).sort()).toEqual(['visa', 'work_permit']);
  });

  it('excludes non-active employees', () => {
    const r = buildDocumentExpiryReport([emp({ status: 'terminated', visaExpiry: '2026-05-01' })], '2026-06-10', 90);
    expect(r.items).toHaveLength(0);
  });

  it('ignores null / malformed dates', () => {
    const r = buildDocumentExpiryReport([emp({ visaExpiry: null, permitExpiry: 'soon' })], '2026-06-10', 90);
    expect(r.items).toHaveLength(0);
  });

  it('respects a custom window', () => {
    const within = buildDocumentExpiryReport([emp({ visaExpiry: '2026-08-01' })], '2026-06-10', 90); // 52 days
    expect(within.items).toHaveLength(1);
    const tight = buildDocumentExpiryReport([emp({ visaExpiry: '2026-08-01' })], '2026-06-10', 30);
    expect(tight.items).toHaveLength(0);
  });
});
