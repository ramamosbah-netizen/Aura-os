import { describe, expect, it } from 'vitest';
import { PROJECT_EVENT, makeProject } from './project';

describe('projects project model', () => {
  it('creates a project with sane defaults and trimmed fields', () => {
    const p = makeProject({ tenantId: 't1', title: '  Tower CCTV Rollout  ' });
    expect(p.title).toBe('Tower CCTV Rollout');
    expect(p.status).toBe('planned');
    expect(p.value).toBe(0);
    expect(p.reference).toBeNull();
    expect(p.contractId).toBeNull();
    expect(p.accountId).toBeNull();
    expect(p.id).toBeTruthy();
    expect(p.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('carries the contract + account references and snapshots down the chain', () => {
    const p = makeProject({
      tenantId: 't1',
      title: 'Mall ELV Rollout',
      reference: 'PRJ-2026-001',
      contractId: 'ctr-9',
      contractTitle: 'Mall ELV Delivery',
      accountId: 'acc-9',
      accountName: 'Globex MEP',
      status: 'active',
      value: 1250000,
    });
    expect(p.contractId).toBe('ctr-9');
    expect(p.contractTitle).toBe('Mall ELV Delivery');
    expect(p.accountId).toBe('acc-9');
    expect(p.accountName).toBe('Globex MEP');
    expect(p.reference).toBe('PRJ-2026-001');
    expect(p.status).toBe('active');
    expect(p.value).toBe(1250000);
  });

  it('coerces a missing/garbage value to 0', () => {
    expect(makeProject({ tenantId: 't1', title: 'X' }).value).toBe(0);
    expect(makeProject({ tenantId: 't1', title: 'X', value: Number.NaN }).value).toBe(0);
  });

  it('exposes the spine event type', () => {
    expect(PROJECT_EVENT.created).toBe('projects.project.created');
  });
});
