import { describe, expect, it, vi } from 'vitest';
import { ContractsController } from './contracts.controller';
import type { ContractService } from '@aura/contracts';
import type { AccountService } from '@aura/crm';
import type { TenantContext } from '@aura/core';

describe('ContractsController register tenant boundary', () => {
  it('passes the authenticated tenant into the non-paged list query', async () => {
    const contracts = { list: vi.fn().mockResolvedValue([]) } as unknown as ContractService;
    const accounts = {} as AccountService;
    const tenant = { get: () => ({ tenantId: 'tenant-a' }) } as unknown as TenantContext;
    const controller = new ContractsController(contracts, accounts, tenant);

    await controller.list('active', 'account-1', 'tender-1');

    expect(contracts.list).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      status: 'active',
      accountId: 'account-1',
      tenderId: 'tender-1',
      limit: 100,
    });
  });

  it('rejects an unknown lifecycle status before calling the service', async () => {
    const contracts = { get: vi.fn() } as unknown as ContractService;
    const accounts = {} as AccountService;
    const tenant = { get: () => ({ tenantId: 'tenant-a', actorId: 'u1' }) } as unknown as TenantContext;
    const controller = new ContractsController(contracts, accounts, tenant);

    await expect(controller.changeStatus('contract-1', { status: 'bogus' as never })).rejects.toThrow(/status must be one of/);
    expect(contracts.get).not.toHaveBeenCalled();
  });

  it('rejects missing manual value instead of converting UNKNOWN into zero', async () => {
    const contracts = { create: vi.fn() } as unknown as ContractService;
    const accounts = { } as AccountService;
    const tenant = { get: () => ({ tenantId: 'tenant-a', actorId: 'u1' }) } as unknown as TenantContext;
    const controller = new ContractsController(contracts, accounts, tenant);

    await expect(controller.create({ title: 'Manual contract' })).rejects.toThrow(/value is required/);
    expect(contracts.create).not.toHaveBeenCalled();
  });

  it('passes the contract URL identity into revision transitions', async () => {
    const contracts = {} as ContractService;
    const accounts = {} as AccountService;
    const tenant = { get: () => ({ tenantId: 'tenant-a', actorId: 'u1' }) } as unknown as TenantContext;
    const revisions = { transitionForContract: vi.fn().mockResolvedValue({ id: 'r1', status: 'internal_review' }) } as unknown as import('@aura/contracts').ContractRevisionService;
    const controller = new ContractsController(contracts, accounts, tenant, revisions);

    await controller.revisionsStatus('contract-a', 'revision-1', { status: 'internal_review' });
    expect(revisions.transitionForContract).toHaveBeenCalledWith('contract-a', 'revision-1', 'internal_review', 'u1');
  });

  it('routes closeout through explicit governed commands', async () => {
    const contracts = { changeStatus: vi.fn().mockResolvedValue({ id: 'c1', status: 'completed' }) } as unknown as ContractService;
    const tenant = { get: () => ({ tenantId: 'tenant-a', actorId: 'u-closer' }) } as unknown as TenantContext;
    const controller = new ContractsController(contracts, {} as AccountService, tenant);

    await expect(controller.complete('c1')).resolves.toMatchObject({ status: 'completed' });
    await expect(controller.cancel('c1')).resolves.toMatchObject({ status: 'completed' });
    expect(contracts.changeStatus).toHaveBeenNthCalledWith(1, 'c1', 'completed', 'u-closer');
    expect(contracts.changeStatus).toHaveBeenNthCalledWith(2, 'c1', 'cancelled', 'u-closer');
  });

  it('uses the URL contract as the parent boundary for approval decisions', async () => {
    const contracts = {} as ContractService;
    const accounts = {} as AccountService;
    const tenant = { get: () => ({ tenantId: 'tenant-a', actorId: 'u-approver' }) } as unknown as TenantContext;
    const revisions = { decideApprovalForContract: vi.fn().mockResolvedValue({ id: 'r1', status: 'approved' }) } as unknown as import('@aura/contracts').ContractRevisionService;
    const controller = new ContractsController(contracts, accounts, tenant, revisions);

    await controller.revisionsStatus('contract-a', 'revision-1', { status: 'approved' });
    expect(revisions.decideApprovalForContract).toHaveBeenCalledWith('contract-a', 'revision-1', 'approved', 'u-approver');
  });
});
