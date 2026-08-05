import type { Role } from '@aura/shared';

/**
 * The standard ELV contractor role matrix (gap register **G-04**).
 *
 * Roles on this platform are *dynamic* — a name plus a `permissions[]` list, editable at
 * `/admin/access`. That flexibility is right, but it shipped with an **empty registry**, so a
 * fresh tenant had no roles at all and every deployment had to invent the same ten. These are
 * the roles an ELV/MEP contractor actually staffs, seeded at boot as a starting point. They are
 * **registered, not granted** — deciding which human holds which role stays an admin action.
 *
 * ## How a restriction is expressed
 *
 * The access model (`shared/src/identity/access.ts`) is **grant-only — there is no DENY**. A
 * decision is "allow if any grant matches", so a role cannot be given `crm.*` and then have
 * `approve` subtracted. Restrictions are therefore expressed by *not granting*, which works
 * because of how permissions are derived from routes:
 *
 * - `POST crm/quotations`            → `crm.quotation.create`
 * - `PATCH crm/quotations/:id`       → `crm.quotation.update`
 * - `POST crm/quotations/:id/approve` → `crm.quotation.**approve**`  ← its own action segment
 *
 * A mid-segment wildcard matches exactly one segment, so **`crm.*.create` covers every create in
 * CRM and matches no `approve`, `send`, `certify` or `award`**. That is the mechanism behind
 * every "can do the work, cannot authorise it" line below — the segregation of duties is
 * structural, not a special case.
 *
 * Note what this does *not* replace: the maker-checker rule (a preparer may not approve their
 * own record) and the value-threshold `approvalLimit` on a grant are enforced in the services
 * and the access layer. A role says *what kind* of thing you may authorise; those say *whose*
 * and *how large*.
 */
export interface ElvRole extends Role {
  /** Why this role exists, in the contractor's own terms. Shown in the admin UI. */
  description: string;
}

/** Every read in a module, without any create/update/authorise power. */
const readOnly = (module: string): string => `${module}.*.read`;

export const ELV_ROLE_MATRIX: ElvRole[] = [
  {
    id: 'sales',
    name: 'Sales',
    description:
      'Works the pipeline: leads, opportunities, contacts, quotations. Can prepare a quotation and send it once approved — cannot approve one.',
    permissions: [
      'crm.*.read',
      'crm.*.create',
      'crm.*.update',
      'crm.quotation.send', // sending is a sales act; the service still requires status=approved first
      readOnly('tendering'),
      readOnly('contracts'),
      readOnly('projects'),
    ],
  },
  {
    id: 'salesManager',
    name: 'Sales Manager',
    description:
      'Everything Sales does, plus the authority to approve a quotation — subject to the value threshold on their grant.',
    permissions: [
      'crm.*.read',
      'crm.*.create',
      'crm.*.update',
      'crm.*.approve',
      'crm.*.send',
      readOnly('tendering'),
      readOnly('contracts'),
      readOnly('projects'),
      readOnly('finance'),
    ],
  },
  {
    id: 'projectManager',
    name: 'Project Manager',
    description:
      'Owns delivery: projects, WBS/CBS, variations, schedule. Raises payment certificates (IPCs) but cannot certify them — that is Finance.',
    permissions: [
      'projects.*',
      'contracts.certificate.create',
      'contracts.certificate.update',
      readOnly('contracts'),
      readOnly('site'),
      readOnly('engineering'),
      readOnly('procurement'),
      readOnly('quality'),
      readOnly('commissioning'),
    ],
  },
  {
    id: 'siteEngineer',
    name: 'Site Engineer',
    description:
      'The field: daily reports, labour and plant returns, site instructions. Raises inspection requests; QA/QC decides them.',
    permissions: [
      'site.*',
      'quality.*.read',
      'quality.*.create',
      readOnly('projects'),
      readOnly('engineering'),
      readOnly('hse'),
      readOnly('inventory'),
    ],
  },
  {
    id: 'qaqc',
    name: 'QA / QC',
    description:
      'Owns quality: approves or rejects inspection requests, raises and closes NCRs and snags, runs ITPs and material approvals.',
    permissions: ['quality.*', readOnly('commissioning'), readOnly('engineering'), readOnly('site'), readOnly('projects')],
  },
  {
    id: 'hse',
    name: 'HSE',
    description:
      'Owns safety: incidents, permits to work, CAPAs, toolbox talks, risk assessments.',
    permissions: ['hse.*', readOnly('site'), readOnly('projects'), readOnly('engineering'), readOnly('hr')],
  },
  {
    id: 'procurement',
    name: 'Procurement',
    description:
      'Runs the buy cycle: purchase requests, RFQs, suppliers, purchase orders. PO approval is granted here but capped by the approval matrix on the grant.',
    permissions: ['procurement.*', readOnly('inventory'), readOnly('projects'), readOnly('subcontracts')],
  },
  {
    id: 'store',
    name: 'Store / Warehouse',
    description:
      'Receives and moves stock: GRNs, transfers, locations, serialised equipment. Can see purchase orders but cannot approve one.',
    permissions: ['inventory.*', readOnly('procurement'), readOnly('projects'), readOnly('assets')],
  },
  {
    id: 'finance',
    name: 'Finance',
    description:
      'Owns the money cycle: invoices, payments, GL, budgets, period close. Certifies payment certificates raised by the PM.',
    permissions: [
      'finance.*',
      'contracts.certificate.certify',
      readOnly('contracts'),
      readOnly('projects'),
      readOnly('procurement'),
      readOnly('subcontracts'),
      readOnly('crm'),
    ],
  },
  {
    id: 'admin',
    name: 'Administrator',
    description: 'Full platform access, including the Admin Center.',
    permissions: ['*'],
  },
  {
    id: 'client',
    name: 'Client (external)',
    description:
      'Read-only external access for a customer: their projects, contracts, commissioning status, handover packages and invoices. Grant this scoped to the account — never at tenant level (gap G-05).',
    permissions: [
      readOnly('projects'),
      readOnly('contracts'),
      readOnly('commissioning'),
      'finance.invoice.read',
      'documents.*.read',
    ],
  },
];
