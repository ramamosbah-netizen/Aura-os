import { describe, expect, it, vi } from 'vitest';
import type { EventStore } from '@aura/core';
import { BondService } from './bond.service';
import { ObligationService } from './obligation.service';
import type { ContractService } from './contract.service';
import type { BondStore } from './bond-store';
import type { ObligationStore } from './obligation-store';

const events = { append: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;

describe('contract child relationship ownership', () => {
  it('rejects a bond whose contract belongs to another tenant before persistence', async () => {
    const store = { save: vi.fn() } as unknown as BondStore;
    const contracts = { get: vi.fn().mockResolvedValue({ id: 'contract-1', tenantId: 'tenant-a' }) } as unknown as ContractService;
    const service = new BondService(store, events, contracts);

    await expect(service.create({
      tenantId: 'tenant-b', contractId: 'contract-1', kind: 'performance', reference: 'PB-1', amount: 100,
    })).rejects.toThrow(/belongs to another tenant/);
    expect(store.save).not.toHaveBeenCalled();
  });

  it('rejects an obligation whose contract cannot be resolved before persistence', async () => {
    const store = { save: vi.fn() } as unknown as ObligationStore;
    const contracts = { get: vi.fn().mockResolvedValue(null) } as unknown as ContractService;
    const service = new ObligationService(store, events, contracts);

    await expect(service.create({
      tenantId: 'tenant-a', contractId: 'contract-missing', title: 'Submit programme', dueDate: '2026-09-30',
    })).rejects.toThrow(/contract contract-missing not found/);
    expect(store.save).not.toHaveBeenCalled();
  });
});
