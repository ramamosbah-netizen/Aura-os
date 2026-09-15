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
  it('seeds the complete ELV/MEP operating roles with canonical unique ids', () => {
    const ids = ELV_ROLE_MATRIX.map((r) => r.id);
    expect(ids).toHaveLength(22);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('r-'))).toBe(true);
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
    expect(wildcarded).toEqual(['r-admin']);
  });
});

// The point of the matrix: each role can do its own work and cannot authorise its own chain.
// These assert against permissions derived from the REAL controller routes, so a route rename
// that breaks the taxonomy breaks this test too.
describe('ELV role matrix — segregation of duties', () => {
  it('Pre-Sales authors a study but Technical Management performs the independent review', () => {
    expect(roleFor('r-pre-sales').permissions.some((p) => permissionMatches(p, 'crm.study.update'))).toBe(true);
    expect(roleFor('r-pre-sales').permissions.some((p) => permissionMatches(p, 'crm.study.approve'))).toBe(false);
    expect(roleFor('r-technical-manager').permissions.some((p) => permissionMatches(p, 'crm.study.approve'))).toBe(true);
  });

  it('gives every internal employee their task, alert, inbox, communication and authorized-document baseline', () => {
    for (const role of ELV_ROLE_MATRIX.filter((candidate) => candidate.id !== 'r-client')) {
      for (const permission of ['work-items.work-item.read', 'notifications.notification.read', 'inbox.inbox.read', 'comms.channel.read', 'documents.document.read']) {
        expect(role.permissions.some((pattern) => permissionMatches(pattern, permission)), `${role.id} → ${permission}`).toBe(true);
      }
    }
  });

  it('Planning prepares scenarios while the Project Manager accepts a governed plan', () => {
    expect(roleFor('r-planning-engineer').permissions.some((p) => permissionMatches(p, 'projects.schedule.plan'))).toBe(true);
    expect(roleFor('r-planning-engineer').permissions.some((p) => permissionMatches(p, 'projects.schedule.accept'))).toBe(false);
    expect(roleFor('r-pm').permissions.some((p) => permissionMatches(p, 'projects.schedule.accept'))).toBe(true);
    expect(roleFor('r-planning-engineer').permissions.some((p) => permissionMatches(p, 'projects.resource-booking.create'))).toBe(true);
    expect(roleFor('r-planning-engineer').permissions.some((p) => permissionMatches(p, 'projects.resource-booking.release'))).toBe(true);
  });

  it('Planning authors the programme; claiming progress against the measurement is the Manager’s act', () => {
    // PLN-12. Writing a plan and stating that the site is further along than the Quantity Ledger
    // says are different acts by different people: the first is programme authorship, the second
    // is a claim about physical work that the ledger has not yet confirmed. The route carries
    // `projects.schedule.progress-override` explicitly for exactly this reason, and it is the one
    // permission a Planning Engineer's working set does not include.
    expect(roleFor('r-planning-engineer').permissions.some((p) => permissionMatches(p, 'projects.schedule.progress-override'))).toBe(false);
    expect(roleFor('r-pm').permissions.some((p) => permissionMatches(p, 'projects.schedule.progress-override'))).toBe(true);
    // Reading what was measured is nobody's privilege to withhold from the planner.
    expect(roleFor('r-planning-engineer').permissions.some((p) => permissionMatches(p, 'projects.schedule.read'))).toBe(true);
  });

  it('Technical management governs organization resource pools and capacity', () => {
    expect(roleFor('r-technical-manager').permissions.some((p) => permissionMatches(p, 'projects.resource-pool.create'))).toBe(true);
    expect(roleFor('r-technical-manager').permissions.some((p) => permissionMatches(p, 'projects.resource-capacity.create'))).toBe(true);
    expect(roleFor('r-planning-engineer').permissions.some((p) => permissionMatches(p, 'projects.resource-pool.create'))).toBe(false);
  });

  it('Sales prepares quotations but cannot approve one', () => {
    expect(can('r-sales', 'POST', 'crm/quotations')).toBe(true);
    expect(can('r-sales', 'PATCH', 'crm/quotations', ':id')).toBe(true);
    expect(can('r-sales', 'POST', 'crm/quotations', ':id/send')).toBe(true);
    expect(can('r-sales', 'POST', 'crm/quotations', ':id/approve')).toBe(false);
  });

  it('Sales Manager can approve a quotation', () => {
    expect(can('r-sales-manager', 'POST', 'crm/quotations', ':id/approve')).toBe(true);
  });

  it('Commercial Management can assemble a Tender offer without becoming a technical approver', () => {
    const role = roleFor('r-commercial-manager');
    expect(role.permissions.some((p) => permissionMatches(p, 'tendering.study.read'))).toBe(true);
    expect(role.permissions.some((p) => permissionMatches(p, 'tendering.internal-pricing.access'))).toBe(true);
    expect(role.permissions.some((p) => permissionMatches(p, 'crm.quotation.read'))).toBe(true);
    expect(role.permissions.some((p) => permissionMatches(p, 'tendering.study.approve'))).toBe(false);
  });

  it('keeps Tender cost workbooks inside Estimation, Commercial Management and Executive roles', () => {
    for (const roleId of ['r-estimator', 'r-commercial-manager', 'r-executive']) {
      expect(roleFor(roleId).permissions.some((p) => permissionMatches(p, 'tendering.internal-pricing.access'))).toBe(true);
    }
    for (const roleId of ['r-sales', 'r-pre-sales', 'r-technical-manager', 'r-finance']) {
      expect(roleFor(roleId).permissions.some((p) => permissionMatches(p, 'tendering.internal-pricing.access'))).toBe(false);
    }
  });

  it('lets Estimation prepare a draft offer for independent Commercial approval', () => {
    const estimator = roleFor('r-estimator');
    for (const permission of [
      'tendering.estimate.update', 'tendering.internal-pricing.access',
      'crm.quotation.create', 'crm.quotation.update',
      'crm.pricing-sheet.create', 'crm.pricing-sheet.update', 'crm.pricing-sheet.freeze', 'crm.pricing-sheet.generate',
    ]) {
      expect(estimator.permissions.some((p) => permissionMatches(p, permission)), permission).toBe(true);
    }
    expect(estimator.permissions.some((p) => permissionMatches(p, 'crm.quotation.approve'))).toBe(false);
  });

  it('separates Tender quantity preparation, technical approval and BOQ projection', () => {
    for (const roleId of ['r-pre-sales', 'r-estimator']) {
      expect(roleFor(roleId).permissions.some((p) => permissionMatches(p, 'tendering.takeoff.create'))).toBe(true);
      expect(roleFor(roleId).permissions.some((p) => permissionMatches(p, 'tendering.takeoff.update'))).toBe(true);
      expect(roleFor(roleId).permissions.some((p) => permissionMatches(p, 'tendering.takeoff.approve'))).toBe(false);
    }
    expect(roleFor('r-estimator').permissions.some((p) => permissionMatches(p, 'tendering.takeoff.project'))).toBe(true);
    expect(roleFor('r-pre-sales').permissions.some((p) => permissionMatches(p, 'tendering.takeoff.project'))).toBe(false);
    expect(roleFor('r-technical-manager').permissions.some((p) => permissionMatches(p, 'tendering.takeoff.approve'))).toBe(true);
    expect(roleFor('r-technical-manager').permissions.some((p) => permissionMatches(p, 'tendering.takeoff.update'))).toBe(false);
    expect(roleFor('r-technical-manager').permissions.some((p) => permissionMatches(p, 'tendering.takeoff.project'))).toBe(false);
  });

  it('quotation lifecycle routes are covered by the permissions they actually derive', () => {
    // The status/terms/revise handlers intentionally override route-derived action names with the
    // shared quotation update capability; conversion has its own explicit capability.
    expect(roleFor('r-sales').permissions.some((p) => permissionMatches(p, 'crm.quotation.update'))).toBe(true);
    expect(roleFor('r-sales').permissions.some((p) => permissionMatches(p, 'contracts.contract.create'))).toBe(false);
    expect(roleFor('r-sales-manager').permissions.some((p) => permissionMatches(p, 'contracts.contract.create'))).toBe(true);
  });

  it('a PM raises a payment certificate but does not certify it — Finance does', () => {
    expect(can('r-pm', 'POST', 'contracts/certificates')).toBe(true);
    expect(can('r-pm', 'POST', 'contracts/certificates', ':id/certify')).toBe(false);
    expect(can('r-finance', 'POST', 'contracts/certificates', ':id/certify')).toBe(true);
  });

  it('Store receives stock but cannot approve a purchase order', () => {
    expect(can('r-store', 'POST', 'inventory/grns')).toBe(true);
    expect(roleFor('r-store').permissions.some((p) => permissionMatches(p, 'procurement.po.view'))).toBe(true);
    expect(can('r-store', 'POST', 'procurement', 'purchase-orders/:id/approve')).toBe(false);
    expect(can('r-procurement', 'POST', 'procurement', 'purchase-orders/:id/approve')).toBe(false);
    expect(can('r-procurement-manager', 'POST', 'procurement', 'purchase-orders/:id/approve')).toBe(true);
  });

  it('a Site Engineer raises an inspection request; QA/QC decides it', () => {
    expect(can('r-site-engineer', 'POST', 'quality', 'inspection-requests')).toBe(true);
    expect(can('r-site-engineer', 'POST', 'quality', 'inspection-requests/:id/approve')).toBe(false);
    expect(can('r-qa-qc', 'POST', 'quality', 'inspection-requests/:id/approve')).toBe(true);
  });

  it('Sales cannot touch finance, HSE cannot touch procurement', () => {
    expect(can('r-sales', 'POST', 'finance', 'invoices')).toBe(false);
    expect(can('r-hse', 'POST', 'procurement', 'purchase-orders')).toBe(false);
  });

  it('CEO visibility is read-only and cannot mutate operational truth', () => {
    expect(can('r-executive', 'GET', 'projects', 'projects/portfolio')).toBe(true);
    expect(can('r-executive', 'PATCH', 'projects', 'projects/:id')).toBe(false);
    expect(can('r-executive', 'POST', 'finance', 'invoices/:id/approve')).toBe(false);
  });

  it('T&C and Handover roles hold their own functional capability only', () => {
    expect(can('r-commissioning-engineer', 'PUT', 'commissioning/records', ':id/test')).toBe(true);
    expect(can('r-commissioning-engineer', 'PUT', 'commissioning/handovers', ':id/accept')).toBe(false);
    expect(can('r-handover-fm', 'POST', 'commissioning/handovers', 'om-items')).toBe(true);
    expect(can('r-handover-fm', 'PUT', 'commissioning/records', ':id/test')).toBe(false);
  });
});

describe('ELV role matrix — the external Client role', () => {
  it('reads its own project, contract, commissioning and invoice records', () => {
    expect(can('r-client', 'GET', 'projects', 'projects/:id')).toBe(true);
    expect(can('r-client', 'GET', 'contracts/contracts', ':id')).toBe(true);
    expect(can('r-client', 'GET', 'commissioning/handovers', '')).toBe(true);
    expect(can('r-client', 'GET', 'finance', 'invoices')).toBe(true);
  });

  it('is strictly read-only — no create, update or authorise anywhere', () => {
    expect(can('r-client', 'POST', 'projects', 'projects')).toBe(false);
    expect(can('r-client', 'PATCH', 'contracts/contracts', ':id')).toBe(false);
    expect(can('r-client', 'POST', 'finance', 'invoices/:id/approve')).toBe(false);
    expect(can('r-client', 'POST', 'crm/quotations')).toBe(false);

    const nonRead = roleFor('r-client').permissions.filter((p) => !p.endsWith('.read'));
    expect(nonRead, 'every client permission must end in .read').toEqual([]);
  });
});
