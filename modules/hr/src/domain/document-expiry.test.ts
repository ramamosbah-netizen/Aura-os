import { describe, it, expect } from 'vitest';
import { documentExpiryReport } from './document-expiry';
import type { Employee } from './employee';

const emp = (over: Partial<Employee>): Employee => ({
  id: over.id ?? 'e1',
  tenantId: 't1',
  companyId: null,
  firstName: over.firstName ?? 'Test',
  lastName: over.lastName ?? 'Worker',
  email: null,
  phone: null,
  role: over.role ?? 'Labourer',
  department: over.department ?? 'Site',
  status: over.status ?? 'active',
  joinedDate: '2024-01-01',
  visaExpiry: over.visaExpiry ?? null,
  permitExpiry: over.permitExpiry ?? null,
  laborCamp: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
});

describe('employee document-expiry report', () => {
  const asOf = '2026-06-29';

  it('buckets by days to expiry (expired / critical / warning / ok)', () => {
    const r = documentExpiryReport(
      [
        emp({ id: 'a', visaExpiry: '2026-06-01' }), // expired (-28)
        emp({ id: 'b', visaExpiry: '2026-07-15' }), // critical (16)
        emp({ id: 'c', visaExpiry: '2026-08-30' }), // warning (62)
        emp({ id: 'd', visaExpiry: '2027-06-29' }), // ok (365)
      ],
      { asOf },
    );
    expect(r.counts).toEqual({ expired: 1, critical: 1, warning: 1, ok: 1, total: 4 });
    expect(r.items[0].employeeId).toBe('a'); // most urgent first
    expect(r.items[0].bucket).toBe('expired');
    expect(r.items[0].daysToExpiry).toBe(-28);
  });

  it('emits one item per present document (visa + permit)', () => {
    const r = documentExpiryReport([emp({ id: 'a', visaExpiry: '2026-07-10', permitExpiry: '2026-07-05' })], { asOf });
    expect(r.items).toHaveLength(2);
    expect(r.items.map((i) => i.documentType)).toEqual(['Labour Permit', 'Residence Visa']); // permit sooner → first
  });

  it('excludes terminated employees and documents with no expiry', () => {
    const r = documentExpiryReport(
      [
        emp({ id: 'a', status: 'terminated', visaExpiry: '2026-07-01' }),
        emp({ id: 'b', visaExpiry: null, permitExpiry: null }),
        emp({ id: 'c', visaExpiry: '2026-07-01' }),
      ],
      { asOf },
    );
    expect(r.counts.total).toBe(1);
    expect(r.items[0].employeeId).toBe('c');
  });

  it('honours custom critical/warning horizons', () => {
    const r = documentExpiryReport([emp({ id: 'a', visaExpiry: '2026-07-15' })], { asOf, criticalDays: 7, warningDays: 60 });
    expect(r.items[0].bucket).toBe('warning'); // 16 days > critical 7, ≤ warning 60
  });

  it('uses calendar-day math with no timezone drift', () => {
    const r = documentExpiryReport([emp({ id: 'a', visaExpiry: '2026-06-30' })], { asOf: '2026-06-29' });
    expect(r.items[0].daysToExpiry).toBe(1);
  });
});
