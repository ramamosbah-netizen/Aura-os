import type { Role } from '@aura/shared';

/**
 * The one canonical catalog of roles supplied with AURA for an ELV/MEP contractor.
 *
 * These are capability bundles only. Registering a role never grants it to a person; an
 * administrator must still bind it at tenant or project scope. Project membership therefore
 * remains an AND condition with the functional permissions below.
 */
export interface StandardElvRole extends Role {
  description: string;
  /** Where this role is normally assigned. It does not alter access evaluation. */
  assignmentScope: 'tenant' | 'project' | 'tenant-or-project';
}

// Every employee needs their own tasks, alerts, inbox, communication and authorized documents.
// DMS still applies its document-level access resolver after this functional permission.
const STAFF_BASE = ['comms.*', 'work-items.*', 'notifications.*', 'inbox.*', 'documents.*.read'] as const;
const PROJECT_RESPONSIBILITY_WORK = 'projects.responsibility.update';
const readOnly = (module: string): string => `${module}.*.read`;
/**
 * EVERY FINANCE ENTITY EXCEPT `period` — the operational half of the module.
 *
 * `r-finance` carried `finance.*`, so declaring `finance.period.close` and `.reopen` on the routes
 * would have changed nothing: a wildcard matches every name in the module, including the two acts
 * that lock and unlock the ledger. Running the department and closing the books were the same
 * permission, and reopening the books needed no more authority than raising an invoice.
 *
 * So the wildcard is spelled out, minus `period`. `finance.period.read` is granted back separately —
 * Finance must see which periods are closed in order to work inside them; it is closing and
 * REOPENING them that belongs to the controller.
 *
 * KEEPING THIS COMPLETE IS ENFORCED, not remembered: apps/api/src/finance-authority.fitness.test.ts
 * compares this list against every finance entity the API actually routes and fails on a new one. A
 * list like this that silently goes stale locks the Finance role out of a feature, which is how a
 * wildcard gets put back.
 */
const FINANCE_ENTITIES = [
  'account', 'bank-guarantee', 'bank-transaction', 'budget', 'cost-center', 'customer-invoice',
  'fx', 'invoice', 'journal', 'payment', 'petty-cash', 'post-dated-cheque', 'profit-center',
  'revenue-recognition', 'statement', 'tax-code', 'tax-summary', 'vat-return',
] as const;
export const FINANCE_OPERATION_ENTITIES: readonly string[] = FINANCE_ENTITIES;
const FINANCE_OPERATIONS = FINANCE_ENTITIES.map((entity) => `finance.${entity}.*`);

const salesOpportunityPermissions = [
  'crm.opportunity.read',
  'crm.opportunity.create',
  'crm.opportunity.update',
  'crm.opportunity.start-tender',
  'crm.opportunity.convert-to-quotation',
  'crm.opportunity.qualification',
  'crm.opportunity.win-plan',
  'crm.opportunity.forecast',
  'crm.opportunity.pursuit',
  'crm.opportunity.stakeholders',
  'crm.opportunity.deal-team',
  'crm.opportunity.commitments',
  'crm.opportunity.fulfil',
  'crm.opportunity.transition',
  'crm.opportunity.register',
  'crm.opportunity.resolve',
  'crm.opportunity.risks',
  'crm.opportunity.status',
] as const;

export const STANDARD_ELV_ROLES: readonly StandardElvRole[] = [
  {
    id: 'r-sales',
    name: 'Sales',
    description: 'Owns enquiries, leads, opportunities, follow-ups and approved customer offer submission.',
    assignmentScope: 'tenant',
    permissions: [
      'crm.lead.*', 'crm.lead-assignment.receive', ...salesOpportunityPermissions, 'crm.activity.*', 'crm.signal.*',
      // Captured customer requirements (J1-07). This is an AUTHORITY CHANGE, not a rename: the capture
      // routes previously derived `crm.opportunity.requirements`, which no role named, so recording what
      // the customer asked for was reachable only by a wildcard holder — a Sales Manager or an admin.
      // The role whose description begins "owns enquiries, leads, opportunities, follow-ups" could not
      // write down the enquiry. It can now.
      'crm.requirement.create', 'crm.requirement.read', 'crm.requirement.update',
      'crm.quotation.create', 'crm.quotation.read', 'crm.quotation.update', 'crm.quotation.send',
      readOnly('tendering'), readOnly('contracts'), readOnly('projects'), ...STAFF_BASE,
    ],
  },
  {
    id: 'r-sales-manager',
    name: 'Sales Manager',
    description: 'Reviews the pipeline, approves commercial offers and governs tender Bid/No-Bid amendments.',
    assignmentScope: 'tenant',
    permissions: [
      'crm.*', 'tendering.*', 'contracts.contract.create', readOnly('contracts'),
      readOnly('projects'), readOnly('finance'), ...STAFF_BASE,
    ],
  },
  {
    id: 'r-pre-sales',
    name: 'Pre-Sales Engineer',
    description: 'Receives qualified opportunities and prepares the technical study and canonical solution scope.',
    assignmentScope: 'tenant-or-project',
    permissions: [
      'crm.lead.read', 'crm.opportunity.read', 'crm.activity.*',
      'crm.study.read', 'crm.study.create', 'crm.study.update',
      'crm.scope.read', 'crm.scope.create', 'crm.scope.update',
      // READ only. Scope Assist derives proposed scope lines from the captured requirements, so a
      // scope author who cannot read them is writing blind; capturing them stays with Sales, who had
      // the conversation.
      'crm.requirement.read',
      'tendering.study.read', 'tendering.study.create', 'tendering.study.update',
      'tendering.takeoff.read', 'tendering.takeoff.create', 'tendering.takeoff.update',
      readOnly('tendering'), readOnly('doccontrol'), ...STAFF_BASE,
    ],
  },
  {
    id: 'r-estimator',
    name: 'Estimator',
    description: 'Builds quantities, costs, pricing revisions and the estimate handed to commercial review.',
    assignmentScope: 'tenant-or-project',
    permissions: [
      'crm.opportunity.read', 'crm.study.read', 'crm.scope.read',
      'crm.estimate.create', 'crm.estimate.read', 'crm.estimate.update',
      'crm.quotation.create', 'crm.quotation.read', 'crm.quotation.update',
      'crm.pricing-sheet.*',
      'crm.internal-pricing.access',
      'tendering.takeoff.read', 'tendering.takeoff.create', 'tendering.takeoff.update', 'tendering.takeoff.project',
      'tendering.estimate.*', 'tendering.internal-pricing.access', 'tendering.tender.read', 'procurement.rfq.read',
      readOnly('doccontrol'), ...STAFF_BASE,
    ],
  },
  {
    id: 'r-technical-engineer',
    name: 'Design / Technical Engineer',
    description: 'Produces drawings, RFIs, submittals, technical queries and design revisions for assigned work.',
    assignmentScope: 'tenant-or-project',
    permissions: [
      'engineering.*.read', 'engineering.*.create', 'engineering.*.update',
      'engineering.drawing.submit', 'engineering.drawing.revise', 'engineering.drawing.transmit',
      // Raises technical queries and CLOSES them once the answer is adequate to build to — but does
      // NOT hold `engineering.tq.respond`. The design decision is the Technical Manager's to give;
      // judging it good enough belongs to whoever has to build to it, and one person holding both
      // turns the whole exchange into a note they wrote to themselves.
      'engineering.tq.close',
      // PROPOSES a material for approval and never decides one (ENG-04). Raising a Material Approval
      // Request is engineering authorship — this is the product the engineer intends to install;
      // `quality.material-approval.review` is deliberately absent, because the whole value of the
      // request is that somebody else answers it.
      'quality.material-approval.create', 'quality.material-approval.submit',
      'quality.material-approval.read', 'quality.material-approval.revise',
      readOnly('projects'), PROJECT_RESPONSIBILITY_WORK, readOnly('doccontrol'), ...STAFF_BASE,
    ],
  },
  {
    id: 'r-site-engineer',
    name: 'Site Engineer',
    description: 'Records site execution, labour, plant, progress and inspection requests for an assigned project.',
    assignmentScope: 'project',
    permissions: [
      'site.*', 'quality.inspection-request.create', readOnly('quality'), readOnly('projects'), PROJECT_RESPONSIBILITY_WORK,
      readOnly('engineering'), readOnly('hse'), readOnly('inventory'), ...STAFF_BASE,
    ],
  },
  {
    id: 'r-planning-engineer',
    name: 'Planning Engineer',
    description: 'Builds WBS and schedules, runs planning scenarios and maintains baselines and forecasts.',
    assignmentScope: 'project',
    permissions: [
      'projects.schedule.read', 'projects.schedule.plan', 'projects.resource-booking.*', 'projects.wb.*', PROJECT_RESPONSIBILITY_WORK,
      // Authors and maintains milestones as part of the programme — but NOT `milestone.achieve`.
      // Declaring a milestone MET is a statement to the client about what has been delivered, not a
      // planning act, and it sits with the Project Manager for the same reason
      // `schedule.progress-override` does: the person who maintains the figure must not also be the
      // one who declares it true.
      'projects.milestone.read', 'projects.milestone.create',
      'projects.delay.*', readOnly('site'), readOnly('engineering'), readOnly('procurement'), ...STAFF_BASE,
    ],
  },
  {
    id: 'r-project-engineer',
    name: 'Project Engineer',
    description: 'Coordinates technical, site, quality and material work inside an assigned project.',
    assignmentScope: 'project',
    permissions: [
      'projects.*.read', 'projects.issue.*', 'projects.risk.*', PROJECT_RESPONSIBILITY_WORK,
      // Also on the raising side of a technical query: accepts an answer as adequate, never gives one.
      'engineering.*.read', 'engineering.rfi.*', 'engineering.tq.close', 'site.*.read', 'quality.*.read',
      // Also on the proposing side of a material approval; decides none.
      'quality.material-approval.create', 'quality.material-approval.submit', 'quality.material-approval.revise',
      'procurement.*.read', 'commissioning.*.read', ...STAFF_BASE,
    ],
  },
  {
    id: 'r-pm',
    name: 'Project Manager',
    description: 'Owns project delivery, risk, programme, cost control, variations and delivery approvals.',
    assignmentScope: 'project',
    permissions: [
      'projects.*', 'contracts.certificate.create', 'contracts.certificate.update',
      readOnly('contracts'), readOnly('site'), readOnly('engineering'), readOnly('procurement'),
      readOnly('quality'), readOnly('commissioning'), readOnly('finance'), ...STAFF_BASE,
    ],
  },
  {
    id: 'r-technical-manager',
    name: 'Technical Manager',
    description: 'Independently reviews pre-award studies and governs engineering technical decisions.',
    assignmentScope: 'tenant-or-project',
    permissions: [
      // `crm.scope.approve` was already here and `crm.scope.read` was not — this role could sign off a
      // scope it had no permission to open. The reviewer also reads the requirements, because
      // "does this scope answer what the customer asked for" is the review.
      'crm.opportunity.read', 'crm.study.read', 'crm.study.approve',
      'crm.scope.read', 'crm.scope.approve', 'crm.requirement.read',
      'tendering.study.read', 'tendering.study.approve',
      'tendering.takeoff.read', 'tendering.takeoff.approve',
      'engineering.*', 'projects.resource-pool.*', 'projects.resource-capacity.*', 'projects.resource-conflict.*',
      // DECIDES a material approval (ENG-04). The engineer who proposed the product must not be the
      // one who approves it, so this sits with the internal technical authority — alongside QA/QC,
      // which owns the register itself and holds `quality.*`.
      'quality.material-approval.review', 'quality.material-approval.read',
      readOnly('tendering'), readOnly('projects'), PROJECT_RESPONSIBILITY_WORK, readOnly('doccontrol'), ...STAFF_BASE,
    ],
  },
  {
    id: 'r-commercial-manager',
    name: 'Commercial Manager / QS',
    description: 'Governs estimates, quotations, contracts, variations, claims and payment applications.',
    assignmentScope: 'tenant-or-project',
    permissions: [
      'crm.estimate.read', 'crm.estimate.approve', 'crm.quotation.*', 'crm.internal-pricing.access',
      'tendering.internal-pricing.access',
      'contracts.*', 'projects.variation.*', 'projects.eot-claim.*', 'projects.cb.*', PROJECT_RESPONSIBILITY_WORK,
      readOnly('tendering'), readOnly('projects'), readOnly('procurement'), readOnly('finance'), ...STAFF_BASE,
    ],
  },
  {
    id: 'r-procurement',
    name: 'Buyer',
    description: 'Prepares purchase requests, RFQs, comparisons and purchase orders without approving their own order.',
    assignmentScope: 'tenant-or-project',
    permissions: [
      'procurement.*.read', 'procurement.*.create', 'procurement.*.update',
      /**
       * The Buyer PREPARES. `issue`, `cancel` and `close` are deliberately absent (J3-01): sending a
       * commitment to a supplier, undoing one, and declaring an order finished are not editing it,
       * and until each became its own permission the Buyer could do all three through a generic
       * status update. The role description already said "without approving their own order" — this
       * is that sentence becoming true.
       */
      'procurement.po.view', 'procurement.po.create', 'procurement.po.update', 'procurement.po.submit',
      readOnly('inventory'), readOnly('projects'), PROJECT_RESPONSIBILITY_WORK, readOnly('subcontracts'), ...STAFF_BASE,
    ],
  },
  {
    id: 'r-procurement-manager',
    name: 'Procurement Manager',
    description: 'Reviews sourcing exposure and approves governed supplier awards and purchase orders.',
    assignmentScope: 'tenant',
    permissions: ['procurement.*', readOnly('inventory'), readOnly('projects'), readOnly('finance'), ...STAFF_BASE],
  },
  {
    id: 'r-store',
    name: 'Storekeeper',
    description: 'Receives, identifies, stores and issues material while retaining purchase-order context.',
    assignmentScope: 'tenant-or-project',
    permissions: ['inventory.*', 'procurement.po.view', readOnly('procurement'), readOnly('projects'), PROJECT_RESPONSIBILITY_WORK, readOnly('assets'), ...STAFF_BASE],
  },
  {
    id: 'r-qa-qc',
    name: 'QA / QC',
    description: 'Owns inspections, ITP evidence, material approvals, NCRs and quality closeout.',
    assignmentScope: 'project',
    permissions: ['quality.*', readOnly('commissioning'), readOnly('engineering'), readOnly('site'), readOnly('projects'), PROJECT_RESPONSIBILITY_WORK, ...STAFF_BASE],
  },
  {
    id: 'r-hse',
    name: 'HSE',
    description: 'Owns permits, incidents, risk assessments, toolbox talks and corrective actions.',
    assignmentScope: 'project',
    permissions: ['hse.*', readOnly('site'), readOnly('projects'), PROJECT_RESPONSIBILITY_WORK, readOnly('engineering'), readOnly('hr'), ...STAFF_BASE],
  },
  {
    id: 'r-finance',
    name: 'Finance',
    description: 'Owns invoices, receipts, payments, cash, accounting and certification within approval limits.',
    assignmentScope: 'tenant',
    permissions: [
      // `finance.*` USED TO BE HERE, and declaring the two period permissions would have changed
      // nothing while it was: a wildcard matches every name in the module, including the ones nobody
      // chose to grant. Running the department and closing the books were one permission.
      ...FINANCE_OPERATIONS,
      'finance.period.read', // sees which periods are closed; cannot close or reopen one
      'contracts.certificate.certify', readOnly('contracts'), readOnly('projects'),
      readOnly('procurement'), readOnly('subcontracts'), readOnly('crm'), ...STAFF_BASE,
    ],
  },
  {
    /**
     * The authority that closes and reopens the books. ONE role, several people — maker/checker comes
     * from the domain refusing the same person both halves, not from inventing a second job title.
     *
     * It holds the two acts and the operational finance reads it needs to decide whether a period is
     * ready, and no operational finance WRITES: a controller who could also post the journals would
     * be signing off their own work, which is the arrangement the separation exists to prevent.
     */
    id: 'r-finance-controller',
    name: 'Finance Controller',
    description: 'Closes and reopens fiscal periods. Independent of day-to-day finance operations, which post into them.',
    assignmentScope: 'tenant',
    permissions: [
      'finance.period.close', 'finance.period.reopen', 'finance.period.read',
      readOnly('finance'), readOnly('contracts'), readOnly('projects'), ...STAFF_BASE,
    ],
  },
  {
    id: 'r-commissioning-engineer',
    name: 'T&C Engineer',
    description: 'Executes system-specific pre-commissioning, tests, defects, retests and evidence capture.',
    assignmentScope: 'project',
    permissions: ['commissioning.record.*', readOnly('quality'), readOnly('engineering'), readOnly('site'), readOnly('projects'), PROJECT_RESPONSIBILITY_WORK, readOnly('doccontrol'), ...STAFF_BASE],
  },
  {
    id: 'r-handover-fm',
    name: 'Handover / FM',
    description: 'Prepares O&M, training, spares, dossier and handover readiness records for acceptance.',
    assignmentScope: 'project',
    permissions: ['commissioning.handover.*', readOnly('commissioning'), readOnly('projects'), PROJECT_RESPONSIBILITY_WORK, readOnly('assets'), readOnly('amc'), readOnly('doccontrol'), ...STAFF_BASE],
  },
  {
    id: 'r-executive',
    name: 'Senior Management / CEO',
    description: 'Reads portfolio, pipeline, delivery, exposure, margin and cash evidence for governed decisions.',
    assignmentScope: 'tenant',
    permissions: [
      readOnly('crm'), 'crm.internal-pricing.access', readOnly('tendering'), 'tendering.internal-pricing.access', readOnly('contracts'), readOnly('projects'),
      readOnly('engineering'), readOnly('procurement'), readOnly('inventory'), readOnly('site'),
      readOnly('quality'), readOnly('hse'), readOnly('finance'), readOnly('commissioning'),
      readOnly('assets'), readOnly('amc'), readOnly('doccontrol'), 'intelligence.*.read', ...STAFF_BASE,
    ],
  },
  {
    id: 'r-admin',
    name: 'System Administrator',
    description: 'Administers the platform, users, configuration and access.',
    assignmentScope: 'tenant',
    permissions: ['*'],
  },
  {
    id: 'r-client',
    name: 'Client (external)',
    description: 'Reads only the customer records explicitly placed within the granted account or project scope.',
    assignmentScope: 'tenant-or-project',
    permissions: [
      readOnly('projects'), readOnly('contracts'), readOnly('commissioning'),
      'finance.invoice.read', 'documents.*.read',
    ],
  },
] as const;

export const STANDARD_ELV_ROLE_IDS = STANDARD_ELV_ROLES.map((role) => role.id);

/** Roles that may be bound to one project by the Project Team workspace. */
export const PROJECT_DELIVERY_ROLE_IDS = [
  'r-technical-engineer',
  'r-site-engineer',
  'r-planning-engineer',
  'r-project-engineer',
  'r-pm',
  'r-technical-manager',
  'r-commercial-manager',
  'r-procurement',
  'r-store',
  'r-qa-qc',
  'r-hse',
  'r-commissioning-engineer',
  'r-handover-fm',
] as const satisfies readonly (typeof STANDARD_ELV_ROLE_IDS)[number][];
