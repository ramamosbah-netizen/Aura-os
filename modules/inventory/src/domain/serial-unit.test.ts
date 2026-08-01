import { describe, it, expect } from 'vitest';
import { makeSerialUnit, issue, install, returnToStock, markFaulty, type SerialUnit } from './serial-unit';

const make = (): SerialUnit =>
  makeSerialUnit({ tenantId: 't', serialNumber: 'SN-001', itemCode: 'CAM-4MP', itemName: '4MP Dome Camera' });

describe('serial-unit domain', () => {
  it('registers in_stock', () => {
    const u = make();
    expect(u.status).toBe('in_stock');
    expect(u.serialNumber).toBe('SN-001');
  });

  it('issue → issued and links the project', () => {
    const u = issue(make(), { projectId: 'p1', projectName: 'Tower A' });
    expect(u.status).toBe('issued');
    expect(u.projectId).toBe('p1');
  });

  it('install only from issued, starts the warranty clock', () => {
    expect(() => install(make(), {})).toThrow(/only an issued/i);
    const u = install(issue(make(), { projectId: 'p1' }), { location: 'L3 corridor', warrantyMonths: 24 });
    expect(u.status).toBe('installed');
    expect(u.warrantyMonths).toBe(24);
    expect(u.warrantyStartDate).toBeTruthy();
    expect(u.installedAt).toBeTruthy();
  });

  it('returnToStock clears the project link', () => {
    const u = returnToStock(issue(make(), { projectId: 'p1', projectName: 'Tower A' }));
    expect(u.status).toBe('in_stock');
    expect(u.projectId).toBeNull();
  });

  it('cannot return a unit that is already in stock', () => {
    expect(() => returnToStock(make())).toThrow(/already in stock/i);
  });

  it('a faulty unit must be returned before re-issue', () => {
    const faulty = markFaulty(make(), 'DOA — no power');
    expect(faulty.status).toBe('faulty');
    expect(() => issue(faulty, { projectId: 'p1' })).toThrow(/faulty/i);
    expect(returnToStock(faulty).status).toBe('in_stock');
  });
});
