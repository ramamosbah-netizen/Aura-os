import 'reflect-metadata';
import { PERMISSIONS_KEY } from '@aura/core';
import { classifyDomainMessage } from '../common/all-exceptions.filter';
import { permissionMatches } from '@aura/shared';
import { describe, expect, it, vi } from 'vitest';
import { ELV_ROLE_MATRIX } from '../auth/elv-roles';
import { CrmQuotationsController } from './crm-quotations.controller';

const permissionOf = (handler: keyof CrmQuotationsController): string[] | undefined =>
  Reflect.getMetadata(PERMISSIONS_KEY, CrmQuotationsController.prototype[handler]);

describe('CRM quotation authorization contract', () => {
  it('maps authoring and lifecycle actions to explicit business capabilities', () => {
    expect(permissionOf('create')).toEqual(['crm.quotation.create']);
    expect(permissionOf('updateTerms')).toEqual(['crm.quotation.update']);
    expect(permissionOf('changeStatus')).toEqual(['crm.quotation.update']);
    expect(permissionOf('revise')).toEqual(['crm.quotation.update']);
    // Conversion is a contract-creation capability, not a derived quotation route grant.
    expect(permissionOf('convertToContract')).toEqual(['contracts.contract.create']);
  });

  it('keeps all quotation reads on the tenant-scoped read capability', () => {
    for (const handler of [
      'list', 'priceHistory', 'paged', 'revisions', 'getPricing',
      'pricingAdvice', 'get', 'baseline',
    ] as Array<keyof CrmQuotationsController>) {
      expect(permissionOf(handler), `${String(handler)} must declare crm.quotation.read`).toEqual(['crm.quotation.read']);
    }
  });

  it('does not grant quotation lifecycle mutations to a read-only role', () => {
    const client = ELV_ROLE_MATRIX.find((role) => role.id === 'client')!;
    expect(client.permissions.some((permission) => permissionMatches(permission, 'crm.quotation.create'))).toBe(false);
    expect(client.permissions.some((permission) => permissionMatches(permission, 'crm.quotation.update'))).toBe(false);
    expect(client.permissions.some((permission) => permissionMatches(permission, 'contracts.contract.create'))).toBe(false);
  });

  it('passes the authenticated tenant into revision lookup', async () => {
    const listRevisions = vi.fn().mockResolvedValue([]);
    const controller = {
      quotations: { listRevisions },
      tenant: { get: () => ({ tenantId: 'tenant-b' }) },
    } as unknown as CrmQuotationsController;

    await CrmQuotationsController.prototype.revisions.call(controller, 'quotation-from-tenant-a');
    expect(listRevisions).toHaveBeenCalledWith('tenant-b', 'quotation-from-tenant-a');
  });

  it('passes the authenticated actor to the canonical approval command', async () => {
    const changeStatus = vi.fn().mockResolvedValue({ id: 'q-1', status: 'approved' });
    const controller = {
      quotations: { changeStatus },
      tenant: { get: () => ({ tenantId: 'tenant-a', actorId: 'approver-a' }) },
    } as unknown as CrmQuotationsController;

    await CrmQuotationsController.prototype.changeStatus.call(controller, 'q-1', { action: 'approve' });

    expect(changeStatus).toHaveBeenCalledWith('q-1', 'approve', 'approver-a');
  });

  it('rejects unknown lifecycle actions before reaching the mutation service', async () => {
    const changeStatus = vi.fn();
    const controller = {
      quotations: { changeStatus },
      tenant: { get: () => ({ tenantId: 'tenant-a', actorId: 'approver-a' }) },
    } as unknown as CrmQuotationsController;

    await expect(
      CrmQuotationsController.prototype.changeStatus.call(controller, 'q-1', { action: 'delete' as never }),
    ).rejects.toThrow(/action must be one of/i);
    expect(changeStatus).not.toHaveBeenCalled();
  });

  it('keeps readiness failures machine-readable as conflicts', () => {
    expect(classifyDomainMessage('quotation QT-1 approval blocked: readiness checklist is not configured'))
      .toMatchObject({ status: 409, code: 'CONFLICT' });
  });
});
