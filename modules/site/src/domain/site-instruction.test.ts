import { describe, it, expect } from 'vitest';
import { makeSiteInstruction, acknowledgeInstruction, closeInstruction } from './site-instruction';

const base = { tenantId: 't1', projectId: 'p1', reference: 'SI-001', issuedBy: 'Consultant', date: '2026-06-29', instruction: 'Relocate the FACP to level 2 lobby' };

describe('makeSiteInstruction', () => {
  it('creates an open instruction with implication flags', () => {
    const si = makeSiteInstruction({ ...base, costImplication: true, timeImplication: true });
    expect(si.status).toBe('open');
    expect(si.costImplication).toBe(true);
    expect(si.timeImplication).toBe(true);
  });

  it('defaults implication flags to false', () => {
    const si = makeSiteInstruction(base);
    expect(si.costImplication).toBe(false);
    expect(si.timeImplication).toBe(false);
  });

  it('requires reference, issuedBy, instruction', () => {
    expect(() => makeSiteInstruction({ ...base, reference: '' })).toThrow('reference is required');
    expect(() => makeSiteInstruction({ ...base, issuedBy: ' ' })).toThrow('issuedBy is required');
    expect(() => makeSiteInstruction({ ...base, instruction: '' })).toThrow('instruction is required');
  });

  it('validates the date format', () => {
    expect(() => makeSiteInstruction({ ...base, date: '29-06-2026' })).toThrow('YYYY-MM-DD');
  });
});

describe('lifecycle', () => {
  it('open → acknowledged → closed', () => {
    let si = acknowledgeInstruction(makeSiteInstruction(base));
    expect(si.status).toBe('acknowledged');
    expect(si.acknowledgedAt).not.toBeNull();
    si = closeInstruction(si);
    expect(si.status).toBe('closed');
    expect(si.closedAt).not.toBeNull();
  });

  it('can close directly from open', () => {
    expect(closeInstruction(makeSiteInstruction(base)).status).toBe('closed');
  });

  it('cannot acknowledge a closed instruction', () => {
    const si = closeInstruction(makeSiteInstruction(base));
    expect(() => acknowledgeInstruction(si)).toThrow('cannot acknowledge');
  });

  it('cannot close twice', () => {
    const si = closeInstruction(makeSiteInstruction(base));
    expect(() => closeInstruction(si)).toThrow('already closed');
  });
});
