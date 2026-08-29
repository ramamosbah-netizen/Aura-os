import 'reflect-metadata';
import { PERMISSIONS_KEY } from '@aura/core';
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
});
