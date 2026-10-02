import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS_KEY, STANDARD_ELV_ROLES, derivePermissionFromRoute } from '@aura/core';
import { permissionMatches } from '@aura/shared';
import { ExecutiveCrmController } from './executive-crm.controller';

const permissionOf = (handler: 'read' | 'records'): string[] | undefined =>
  Reflect.getMetadata(PERMISSIONS_KEY, ExecutiveCrmController.prototype[handler]) as string[] | undefined;

describe('Executive CRM — who may read it (F-06 / MGT-01)', () => {
  it('the read and its drilldown are one permission, the one the guard would derive anyway', () => {
    expect(permissionOf('read')).toEqual(['crm.executive.read']);
    expect(permissionOf('records')).toEqual(['crm.executive.read']);
    expect(derivePermissionFromRoute('GET', 'crm/executive', 'records')).toBe('crm.executive.read');
  });

  it('is held by sales management, finance and senior management — not by a sales rep, pre-sales or an estimator', () => {
    const holders = STANDARD_ELV_ROLES.filter((r) => r.permissions.some((p) => permissionMatches(p, 'crm.executive.read'))).map((r) => r.id).sort();
    expect(holders).toEqual(['r-admin', 'r-executive', 'r-finance', 'r-sales-manager']);
  });

  it('everyone who can open the figures can open the deals behind them', () => {
    for (const role of STANDARD_ELV_ROLES.filter((r) => r.permissions.some((p) => permissionMatches(p, 'crm.executive.read')))) {
      expect(role.permissions.some((p) => permissionMatches(p, 'crm.opportunity.read')), role.id).toBe(true);
    }
  });
});
