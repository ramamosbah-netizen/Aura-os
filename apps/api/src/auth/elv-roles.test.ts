import { describe, it, expect } from 'vitest';
import { permissionMatches } from '@aura/shared';
import { derivePermissionFromRoute } from '@aura/core';
import { ELV_ROLE_MATRIX } from './elv-roles';

const roleFor = (id: string) => {
  const role = ELV_ROLE_MATRIX.find((r) => r.id === id);
  if (!role) throw new Error(`no such seeded role: ${id}`);
  return role;
};

/** Would this role be allowed through the guard for this real route? */
const can = (roleId: string, method: string, ctrl: string, handler = ''): boolean => {
  const required = derivePermissionFromRoute(method, ctrl, handler);
  if (!required) return true; // exempt route (health/auth/metrics)
  return roleFor(roleId).permissions.some((p) => permissionMatches(p, required));
};

describe('ELV role matrix — shape', () => {
  it('seeds the eleven standard roles with unique ids', () => {
    const ids = ELV_ROLE_MATRIX.map((r) => r.id);
    expect(ids).toHaveLength(11);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every role a name, a description and at least one permission', () => {
    for (const r of ELV_ROLE_MATRIX) {
      expect(r.name.length, r.id).toBeGreaterThan(0);
      expect(r.description.length, r.id).toBeGreaterThan(0);
      expect(r.permissions.length, r.id).toBeGreaterThan(0);
    }
  });

  it('grants the global wildcard to admin only', () => {
    const wildcarded = ELV_ROLE_MATRIX.filter((r) => r.permissions.includes('*')).map((r) => r.id);
    expect(wildcarded).toEqual(['admin']);
  });
});

// The point of the matrix: each role can do its own work and cannot authorise its own chain.
// These assert against permissions derived from the REAL controller routes, so a route rename
// that breaks the taxonomy breaks this test too.
describe('ELV role matrix — segregation of duties', () => {
  it('Sales prepares quotations but cannot approve one', () => {
    expect(can('sales', 'POST', 'crm/quotations')).toBe(true);
    expect(can('sales', 'PATCH', 'crm/quotations', ':id')).toBe(true);
    expect(can('sales', 'POST', 'crm/quotations', ':id/send')).toBe(true);
    expect(can('sales', 'POST', 'crm/quotations', ':id/approve')).toBe(false);
  });

  it('Sales Manager can approve a quotation', () => {
    expect(can('salesManager', 'POST', 'crm/quotations', ':id/approve')).toBe(true);
  });

  it('a PM raises a payment certificate but does not certify it — Finance does', () => {
    expect(can('projectManager', 'POST', 'contracts/certificates')).toBe(true);
    expect(can('projectManager', 'POST', 'contracts/certificates', ':id/certify')).toBe(false);
    expect(can('finance', 'POST', 'contracts/certificates', ':id/certify')).toBe(true);
  });

  it('Store receives stock but cannot approve a purchase order', () => {
    expect(can('store', 'POST', 'inventory/grns')).toBe(true);
    expect(can('store', 'GET', 'procurement', 'purchase-orders')).toBe(true);
    expect(can('store', 'POST', 'procurement', 'purchase-orders/:id/approve')).toBe(false);
    expect(can('procurement', 'POST', 'procurement', 'purchase-orders/:id/approve')).toBe(true);
  });

  it('a Site Engineer raises an inspection request; QA/QC decides it', () => {
    expect(can('siteEngineer', 'POST', 'quality', 'inspection-requests')).toBe(true);
    expect(can('siteEngineer', 'POST', 'quality', 'inspection-requests/:id/approve')).toBe(false);
    expect(can('qaqc', 'POST', 'quality', 'inspection-requests/:id/approve')).toBe(true);
  });

  it('Sales cannot touch finance, HSE cannot touch procurement', () => {
    expect(can('sales', 'POST', 'finance', 'invoices')).toBe(false);
    expect(can('hse', 'POST', 'procurement', 'purchase-orders')).toBe(false);
  });
});

describe('ELV role matrix — the external Client role', () => {
  it('reads its own project, contract, commissioning and invoice records', () => {
    expect(can('client', 'GET', 'projects', 'projects/:id')).toBe(true);
    expect(can('client', 'GET', 'contracts/contracts', ':id')).toBe(true);
    expect(can('client', 'GET', 'commissioning/handovers', '')).toBe(true);
    expect(can('client', 'GET', 'finance', 'invoices')).toBe(true);
  });

  it('is strictly read-only — no create, update or authorise anywhere', () => {
    expect(can('client', 'POST', 'projects', 'projects')).toBe(false);
    expect(can('client', 'PATCH', 'contracts/contracts', ':id')).toBe(false);
    expect(can('client', 'POST', 'finance', 'invoices/:id/approve')).toBe(false);
    expect(can('client', 'POST', 'crm/quotations')).toBe(false);

    const nonRead = roleFor('client').permissions.filter((p) => !p.endsWith('.read'));
    expect(nonRead, 'every client permission must end in .read').toEqual([]);
  });
});
