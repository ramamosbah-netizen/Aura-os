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
  'account', 'bank-guarantee', 'bank-transaction', 'budget', 'cost-center',
  'fx', 'journal', 'payment', 'petty-cash', 'post-dated-cheque', 'profit-center',
  'revenue-recognition', 'statement', 'tax-code', 'tax-summary', 'vat-return',
] as const;

/**
 * `customer-invoice` and `invoice` are NOT in the list above, and that is the point.
 *
 * Enumerating `finance.*` entity by entity removed one wildcard and left sixteen smaller ones. Three
 * of the acts SEC-01 is about live behind two of them: `customer-invoice.issue` (sending a claim to a
 * customer), `customer-invoice.cancel` (withdrawing one they have already seen) and the two
 * `.post` acts (writing FX revaluation journals). `finance.customer-invoice.*` re-granted all of
 * them to the same role that raises the invoice in the first place.
 *
 * So the two invoice entities are spelled out act by act. AR is day-to-day work and stays with
 * Finance: raise it, read it, correct a draft, send it, take money against it. The CORRECTIONS —
 * voiding a receivable, deleting or restoring one, and posting revaluation journals at period end —
 * sit with the Finance Controller, alongside the period close it already owns.
 */
const FINANCE_AR_OPERATIONS = [
  'finance.customer-invoice.create', 'finance.customer-invoice.read', 'finance.customer-invoice.update',
  'finance.customer-invoice.issue', 'finance.customer-invoice.receipts',
  'finance.invoice.create', 'finance.invoice.read', 'finance.invoice.update',
  'finance.invoice.status', 'finance.invoice.tax-lines',
  // Approving a SUPPLIER invoice for payment, which `finance.invoice.*` used to cover. It is asserted
  // in InvoiceService rather than derived from a route, so no route audit would have missed it — the
  // finance-authority fitness test did, the moment the wildcard was enumerated. Left with Finance,
  // whose description already reads "within approval limits"; whether it needs its own separation is
  // a SEC-01 question that has not been asked yet, and pretending otherwise would be worse.
  'finance.invoice.approve',
] as const;
/** The corrections and the period-end postings. Held by the controller, not by AR. */
const FINANCE_INVOICE_CORRECTIONS = [
  'finance.customer-invoice.cancel', 'finance.customer-invoice.delete', 'finance.customer-invoice.restore',
  'finance.customer-invoice.post', 'finance.invoice.post',
] as const;
export const FINANCE_OPERATION_ENTITIES: readonly string[] = FINANCE_ENTITIES;
const FINANCE_OPERATIONS = FINANCE_ENTITIES.map((entity) => `finance.${entity}.*`);

/**
 * PROCUREMENT, split by JOB rather than by verb shape.
 *
 * The Buyer held `procurement.*.read`, `procurement.*.create` and `procurement.*.update`. Those are
 * middle wildcards, and they define authority by the SHAPE OF THE VERB rather than by what the act
 * is — so the Buyer could create anything in the module and could not perform a single act whose
 * verb was something else. Measured against the running API: a Buyer, whose whole job is running the
 * enquiry cycle, WAS REFUSED `PATCH procurement/rfqs/:id/send`. Sending the enquiry out is the job.
 * Drawing down against a framework agreement was refused for the same reason.
 *
 * Meanwhile the Procurement Manager held `procurement.*`, which covered both the routine work and
 * the acts that commit the business — activating a blanket agreement up to its ceiling among them.
 *
 * So: the Buyer gets the enquiry cycle by name, including SEND and CALL-OFF, and the Manager keeps
 * the acts that commit or end a standing commitment. The split is the same one SUP-13/SUP-14 already
 * made for the sourcing decision, which this deliberately does not touch — ADR-0022 fixes what each
 * of those four acts may do, and they are closed to new scope.
 */
const PROCUREMENT_BUYER = [
  // TWO VOCABULARIES FOR THE SAME ENTITIES. The routes derive `purchase-request` and `purchase-order`
  // from their paths; the services assert `pr` and `po`. `procurement.*.create` covered both at once,
  // so nobody had to notice. Both are listed until one of them is retired — dropping the `pr.*` names
  // here refuses the Buyer a purchase request, which is how this was found.
  'procurement.purchase-request.read', 'procurement.purchase-request.create', 'procurement.purchase-request.update',
  'procurement.pr.read', 'procurement.pr.create', 'procurement.pr.update',
  'procurement.rfq.read', 'procurement.rfq.create', 'procurement.rfq.update',
  // THE ENQUIRY GOES OUT. Refused to the Buyer before, because `send` is not `create` or `update`.
  'procurement.rfq.send', 'procurement.rfq.quotes',
  'procurement.supplier.read', 'procurement.supplier.create', 'procurement.supplier.update',
  'procurement.framework-agreement.read', 'procurement.framework-agreement.create',
  // Drawing down against an ACTIVE agreement, inside a ceiling somebody else authorised. Routine
  // buying, bounded by a limit the Buyer cannot raise.
  'procurement.framework-agreement.call-offs',
  'procurement.spend-analytic.read', 'procurement.three-way-match.read',
] as const;

/**
 * The acts that COMMIT or END a standing commitment, or admit a supplier to the master. Held by the
 * Procurement Manager, and not by the Buyer who negotiates the agreement — the domain then refuses
 * the person who created one from activating it, because one manager doing both is a real and
 * permitted arrangement that no permission can see.
 */
const PROCUREMENT_AUTHORITY = [
  'procurement.framework-agreement.activate', 'procurement.framework-agreement.terminate',
  // Admitting, suspending or blacklisting a supplier. The Buyer creates the record; whether that
  // vendor may be traded with is somebody else's call.
  'procurement.supplier.status',
  // The purchase-order lifecycle (J3-01) and the requisition approval (BUY-01). These were covered by
  // `procurement.*` and had to be written down when it was removed — enumerating a wildcard drops
  // whatever nobody remembers, which is exactly how `finance.invoice.approve` was nearly lost.
  'procurement.po.approve', 'procurement.po.issue', 'procurement.po.cancel', 'procurement.po.close',
  'procurement.po.create', 'procurement.po.update', 'procurement.po.submit',
  'procurement.pr.approve', 'procurement.config.manage',
] as const;

/**
 * TENDERING, split so that a new act is not granted by accident.
 *
 * Unlike the three waves before it, nothing here was BROKEN: both governed transitions already record
 * their actor, `won` is already refused on the generic status route (ADR-0021), and `submitted` is
 * already routed through `submit()` so the invariant "submitted implies a submission record" holds by
 * construction. The service comments say so and the code does it.
 *
 * What was wrong is narrower and still worth fixing: NO ROLE NAMED ANY TENDERING ACT. The Sales
 * Manager held `tendering.*`, one pattern covering preparation, Q&A traffic, PUTTING A PRICED OFFER
 * IN FRONT OF A CUSTOMER, and RECORDING AN AWARD that auto-creates a Contract and closes the source
 * Opportunity as Won. Those are not the same kind of act, and under a module wildcard every act added
 * to this module in future is granted to that role the moment it exists — which is the whole SEC-01
 * thesis, not a hypothetical.
 *
 * NO NEW SEPARATION IS INVENTED HERE, deliberately. Submission is already gated on three approvals
 * held by other people — an approved technical study, an approved quantity take-off and an internally
 * approved commercial offer — and that is a stronger control than a second signature. Recording the
 * customer's award is capturing an external fact, not approving one's own work, and the Contract it
 * creates inherits a commercial baseline that was approved upstream. Adding a gate at either point
 * would be inventing a control rather than closing a hole.
 */
const TENDERING_PREPARATION = [
  'tendering.tender.read', 'tendering.tender.create', 'tendering.tender.update',
  'tendering.tender.clarifications', 'tendering.tender.answer',
  'tendering.bid-score.read', 'tendering.bid-score.create', 'tendering.bid-score.amend',
  'tendering.outcome.read', 'tendering.outcome.create',
  'tendering.estimate.*', 'tendering.study.*', 'tendering.takeoff.*',
] as const;

/**
 * The two acts that face the customer, plus the remaining lifecycle transitions. Named, so that
 * granting them is a decision somebody made rather than a side effect of the module they live in.
 */
const TENDERING_OFFER = [
  'tendering.tender.submit', 'tendering.tender.award', 'tendering.tender.status',
] as const;

/**
 * CONTRACTS, named rather than granted by the module they live in.
 *
 * `contracts.*` on the Commercial Manager covered the day-to-day — clauses, revisions, negotiation,
 * amendments, obligations — and also COMPLETING a contract, CANCELLING one, DISPATCHING a revision to
 * the client, and moving a payment certificate's status. Those are terminal or outward-facing acts,
 * and under a module wildcard every act added to this module in future is granted the moment it
 * exists.
 *
 * As with tendering, no new separation is invented: the Commercial Manager IS the contracts authority
 * and there is no second role in the catalogue whose job any of these is. What changes is that
 * holding them is now a decision rather than a side effect, and adding one is too.
 */
const CONTRACTS_COMMERCIAL = [
  'contracts.contract.create', 'contracts.contract.update', 'contracts.contract.revisions',
  'contracts.contract.negotiation', 'contracts.contract.amendments',
  'contracts.contract.submit-approval', 'contracts.contract.client-shares',
  'contracts.clause.create', 'contracts.clause.update',
  'contracts.obligation.create', 'contracts.obligation.status',
  'contracts.bond.create', 'contracts.bond.status',
  'contracts.certificate.create', 'contracts.certificate.update', 'contracts.certificate.lines',
  // Asserted in the services rather than derived from a route, so no route audit would ever see
  // them — the permission-vocabulary guard did, on its fourth catch of this exact shape.
  // `ipc` is a third vocabulary for the payment certificate, after `certificate`; listed, not
  // renamed, for the same reason `pr`/`purchase-request` and `leave.approve`/`leave.resolve` are.
  'contracts.contract.sign', 'contracts.ipc.create',
] as const;

/** Terminal and outward-facing: ending a contract, and sending one to the client. */
const CONTRACTS_AUTHORITY = [
  'contracts.contract.complete', 'contracts.contract.cancel',
  'contracts.contract.status', 'contracts.contract.dispatch',
  'contracts.certificate.status',
  // Certifying an interim payment certificate — money owed to a subcontractor or claimed from a
  // client. Asserted in PaymentCertificateService under the `ipc` name.
  'contracts.ipc.certify',
] as const;

/**
 * HSE, split by who does the work and who authorises it.
 *
 * `hse.*` on r-hse covered everything: raising an incident, writing a risk assessment AND approving
 * it, creating a permit, requesting one, approving it, rejecting it, closing it, completing a CAPA.
 * Nobody else in the catalogue held a single HSE write permission — the Site Engineer who has to do
 * the hot work held `hse.*.read`.
 *
 * THAT IS WHY THE PERMIT'S OWN TWO-PERSON RULE WAS WEAKER THAN IT LOOKED. The service has always
 * refused the requester their own approval, and the record holds `requestedBy` separately from
 * `createdBy` so the check is possible — measured against the running API, the refusal fires. But
 * with only one role able to request, every permit was requested and authorised inside the HSE
 * function, and the rule separated two officers rather than the worker from the authoriser.
 *
 * So the people who do the work can now RAISE an incident and REQUEST a permit, and HSE authorises.
 * The existing rule becomes an organisational separation instead of a personal one.
 */
const HSE_SITE_PARTICIPATION = [
  // Anyone on site can report what happened. A near miss nobody can raise is a near miss nobody hears.
  'hse.incident.create',
  // …and ask for permission to do the work. Requesting is not authorising: `hse.ptw.approve` is not
  // here, and the domain refuses the requester their own approval on top of that.
  'hse.ptw.create', 'hse.ptw.request',
  'hse.toolbox-talk.create',
] as const;

/** The HSE function: authorising work, closing findings, and approving what authorises a permit. */
const HSE_AUTHORITY = [
  'hse.ptw.approve', 'hse.ptw.reopen', 'hse.ptw.expire', 'hse.ptw.close',
  'hse.incident.investigate', 'hse.incident.close', 'hse.incident.reopen',
  'hse.capa.create', 'hse.capa.complete',
  'hse.risk-assessment.create', 'hse.risk-assessment.approve',
  'hse.training.create',
  // FOUR VOCABULARIES IN ONE MODULE. The routes derive `capa.create`, `toolbox-talk.create`,
  // `training.create` and `risk-assessment.create`; the services assert `capa.raise`,
  // `toolbox.record`, `training.record` and `risk_assessment.create` — note the underscore. Listed
  // rather than renamed, as in procurement (`pr`/`purchase-request`), HR (`leave.approve`/
  // `leave.resolve`) and contracts (`ipc`/`certificate`): a permission rename is its own change with
  // its own blast radius. The permission-vocabulary guard is what found all four.
  'hse.capa.raise', 'hse.toolbox.record', 'hse.training.record', 'hse.risk_assessment.create',
] as const;

/**
 * DOCUMENT CONTROL, split Author → Technical Authority → External Release Authority.
 *
 * NO SHIPPED ROLE HELD A SINGLE `doccontrol` WRITE PERMISSION. All 24 roles held `doccontrol.*.read`
 * or `documents.*.read` and nothing else, so 19 mutating routes and seven governing verbs were
 * reachable only through r-admin, and there was NO DOCUMENT CONTROLLER ROLE AT ALL.
 *
 * The record was never the problem: `createdBy`, `submittedBy`, `reviewedBy`, `decidedBy` and
 * `issuedBy` are five separate columns, the state machine forbids shortcuts, and an issued revision
 * is superseded rather than overwritten. What no rule connected was WHO may stand in each column.
 * Measured, one principal: submit, start-review, approve, issue — all 201, all the same person.
 *
 * APPROVE IS NOT ISSUE. Approving a revision is an internal technical judgement; issuing it releases
 * the document outside the business. The Technical Manager approves and does NOT hold
 * `doccontrol.revision.issue`; the Document Controller issues and holds no approval. One permission
 * never does both.
 */
const DOCCONTROL_AUTHOR = [
  'doccontrol.revision.submit', 'doccontrol.submittal.create', 'doccontrol.submittal.submit',
] as const;

/** The technical decision. Review and approve/reject — and no release. */
const DOCCONTROL_TECHNICAL_AUTHORITY = [
  'doccontrol.revision.start-review', 'doccontrol.revision.approve',
  'doccontrol.submittal.return',
] as const;

/**
 * The registry and the release. Everything that leaves the building goes through this role, and it
 * approves nothing that goes.
 */
const DOCCONTROL_RELEASE_AUTHORITY = [
  'doccontrol.register.create', 'doccontrol.register.revise',
  'doccontrol.revision.issue',
  'doccontrol.transmittal.create', 'doccontrol.transmittal.send',
  'doccontrol.transmittal.recipients', 'doccontrol.transmittal.items',
  // Asserted in the service for adding a recipient while the route derives `.recipients` — two names
  // for one act, as in procurement (`pr`/`purchase-request`), HR (`leave.approve`/`leave.resolve`),
  // contracts (`ipc`/`certificate`) and HSE (`capa.raise`/`capa.create`). Listed, not renamed.
  'doccontrol.transmittal.update',
  'doccontrol.transmittal.receive', 'doccontrol.transmittal.acknowledge',
  'doccontrol.correspondence.create', 'doccontrol.correspondence.close',
  'doccontrol.submittal.create',
] as const;

/**
 * WHAT A SITE ENGINEER DOES: records the day and the work in it. `site.*` used to sit on this role,
 * which meant the person who prepared and submitted the daily report also reviewed and approved it.
 * Measured against the running API as one principal, every step returned success and
 * `preparedBy = submittedBy = reviewedBy = approvedBy`.
 */
const SITE_EXECUTION = [
  'site.daily-report.create', 'site.daily-report.submit', 'site.daily-report.update',
  // The line items that make up a day. Each is a separate route and all are draft-only.
  'site.daily-report.labour', 'site.daily-report.plant', 'site.daily-report.progress',
  'site.daily-report.delays', 'site.daily-report.evidence',
  'site.labour.log', 'site.labour.create', 'site.plant.create', 'site.installation.create',
  'site.material-consumption.create', 'site.consumption.log',
  'site.delay.log', 'site.delay-log.create', 'site.survey.create',
  // ACKNOWLEDGES an instruction — the contractor's word that it was received — and neither issues
  // nor closes one. Issuing carries cost and time; closing says it was carried out.
  'site.instruction.acknowledge',
] as const;

/**
 * THE SECOND PAIR OF EYES ON SITE. Reviewing and approving the day, issuing and closing an
 * instruction, and resolving a delay: the acts that judge the work rather than perform it.
 * `site.daily-report.approve` covers reject as well — they are one decision with two outcomes, as
 * in document control.
 */
const SITE_SUPERVISION = [
  'site.daily-report.review', 'site.daily-report.approve',
  'site.instruction.issue', 'site.instruction.close',
  'site.delay.resolve', 'site.delay-log.resolve',
] as const;

/**
 * THE QUALITY REGISTER, enumerated out of `quality.*`.
 *
 * QA/QC genuinely owns nearly all of this, so the narrowing is not about taking work away — it is
 * that a wildcard cannot say which acts exist, and two of them turned out not to work properly
 * behind it: a snag had no state machine at all (measured: closed → resolved went BACKWARDS) and an
 * ITP was activated and closed with no actor and no service-side check.
 */
const QUALITY_REGISTER = [
  'quality.ir.create', 'quality.ir.request', 'quality.ir.start-inspection', 'quality.ir.resolve',
  'quality.ir.approve', 'quality.ir.raise-ncr',
  'quality.ncr.create', 'quality.ncr.plan', 'quality.ncr.correct', 'quality.ncr.verify', 'quality.ncr.close',
  'quality.snag.create', 'quality.snag.resolve', 'quality.snag.close',
  'quality.itp.create', 'quality.itp.activate', 'quality.itp.points', 'quality.itp.close',
  'quality.audit.create', 'quality.audit.checklist', 'quality.audit.ncr',
  'quality.calibration.create',
  // The register itself is QA/QC's; the DECISION on a material approval is the Technical Manager's
  // (ENG-04) and is listed on that role. QA/QC reviewing one is existing behaviour, kept — along
  // with raising and revising one, which it also had under `quality.*`.
  'quality.material-approval.create', 'quality.material-approval.submit',
  'quality.material-approval.revise', 'quality.material-approval.review', 'quality.material-approval.read',
  // TWO NAMES FOR ONE REGISTER. The routes live at `quality/irs/*` and derive `quality.ir.*`, while
  // the role vocabulary and some callers say `inspection-request`. Both are listed rather than
  // renamed, as with `doccontrol.transmittal.update` — and the alias is not cosmetic: the Site
  // Engineer NAMED `quality.inspection-request.create` and the route derives `quality.ir.create`,
  // so the one capability that role was given in this module did not reach the route behind it.
  'quality.inspection-request.create', 'quality.inspection-request.approve',
] as const;

/**
 * DELIVERING A HANDOVER versus ACCEPTING ONE. `commissioning.handover.*` sat on Handover/FM alone,
 * so the party that receives the handover was also the only party that could submit it — measured,
 * the PROJECT MANAGER was refused with "no grant satisfies commissioning.handover.submit".
 *
 * Submitting is ours: assembling the dossier and issuing it. Accepting is the client's side, which
 * Handover/FM records on their behalf, and it starts the warranty clock.
 */
/**
 * THE T&C REGISTER, enumerated out of `commissioning.record.*` for the same reason the quality one
 * was: a wildcard cannot say which acts exist, and one of these — closing a punch item — is a
 * governing act that no role NAMED.
 */
const COMMISSIONING_RECORD = [
  'commissioning.record.create', 'commissioning.record.delete',
  'commissioning.record.test', 'commissioning.record.test-items', 'commissioning.record.runs',
  'commissioning.record.result', 'commissioning.record.fail', 'commissioning.record.commission',
  'commissioning.record.punch', 'commissioning.record.close', 'commissioning.record.escalate',
  'commissioning.record.itp-links', 'commissioning.record.asbuilt-links', 'commissioning.record.certificate-link',
] as const;

/**
 * ASSEMBLING THE DOSSIER. O&M manuals, spares, training records, the checklist — the evidence a
 * handover is made of. Handover/FM prepares this (it is the role's whole description) and so do the
 * PM and the T&C engineer; none of it is the act of issuing anything, so it is shared.
 */
const COMMISSIONING_DOSSIER = [
  'commissioning.handover.create', 'commissioning.handover.checklist',
  'commissioning.handover.om-items', 'commissioning.handover.seed', 'commissioning.handover.required',
  'commissioning.handover.spares', 'commissioning.handover.hand-over', 'commissioning.handover.state',
  'commissioning.handover.training', 'commissioning.handover.complete',
] as const;

/** ISSUING IT TO THE CLIENT. One act, and it is not the same hands that accept it. */
const COMMISSIONING_DELIVERY = [...COMMISSIONING_DOSSIER, 'commissioning.handover.submit'] as const;

/**
 * ACCEPTING IT. The client's side of the exchange, recorded by Handover/FM on their behalf, and it
 * starts the warranty clock. Handover/FM also prepares the dossier — what it does NOT do any more
 * is submit, because the party receiving a handover cannot also be the party issuing it.
 */
const COMMISSIONING_ACCEPTANCE = [
  ...COMMISSIONING_DOSSIER,
  'commissioning.handover.accept', 'commissioning.handover.reject', 'commissioning.handover.acknowledge',
] as const;

/**
 * WHAT A PROJECT MANAGER RUNS. `projects.*` sat on this role, which is how it came to hold every
 * governing act in the module — including submitting an EOT claim and DETERMINING the same claim.
 *
 * The delivery acts stay. What moved out is the commercial preparation of a time claim: Commercial
 * /QS raises and submits it, this role records the determination that comes back, and neither does
 * both.
 */
const PROJECTS_DELIVERY = [
  'projects.project.create', 'projects.project.update', 'projects.project.cancel',
  'projects.milestone.*', 'projects.schedule.*', 'projects.task.*', 'projects.wbs.*', 'projects.wb.*',
  'projects.cbs.*', 'projects.cb.*', 'projects.closeout.*', 'projects.issue.*', 'projects.risk.*',
  'projects.delay.*', 'projects.delay-log.*', 'projects.resource-booking.*', 'projects.resource-pool.*',
  'projects.resource-capacity.*', 'projects.resource-conflict.*', 'projects.responsibility.*',
  'projects.planning-run.*', 'projects.quantity-ledger.*', 'projects.cost-ledger.*',
  'projects.variation.*', 'projects.progress.*', 'projects.baseline.*', 'projects.eot-claim.read',
  // Who is on the project team. Dropped by the enumeration and caught by the vocabulary guard —
  // the SEVENTH time enumerating a module wildcard has lost a real permission, which is precisely
  // the failure that guard exists for.
  'projects.member.manage',
  // DETERMINES an extension-of-time claim, and raises none. The determination moves the completion
  // date and the programme is this role's; preparing and sending the claim is Commercial/QS's.
  'projects.eot-claim.decide',
] as const;

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
      'crm.*',
      // `tendering.*` USED TO BE HERE. One pattern covering preparation, the submission of a priced
      // offer to a customer, and the capture of an award that creates a Contract — and, more to the
      // point, covering every tendering act added after it was written.
      ...TENDERING_PREPARATION, ...TENDERING_OFFER,
      'tendering.internal-pricing.access',
      'contracts.contract.create', readOnly('contracts'),
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
      'engineering.drawing.submit', 'engineering.drawing.revise',
      // RELEASE, NOT TRANSMIT. This act hands an approved drawing to the site team who take an
      // `engineering_release` responsibility for it; it conveys nothing outside the business. It was
      // called `transmit`, and its reactor produced a doccontrol transmittal marked `sent` and signed
      // by nobody — a record the register could not tell apart from one the Document Controller had
      // released to the client. Conveying a document OUT is `doccontrol.transmittal.send`, and this
      // role does not hold it. (The route path, the drawing's `transmitted` status and the
      // `engineering.drawing.transmitted` event keep their names: those are public API and persisted
      // values. The authority is what was misnamed.)
      'engineering.drawing.release',
      // Raises technical queries and CLOSES them once the answer is adequate to build to — but does
      // NOT hold `engineering.tq.respond`. The design decision is the Technical Manager's to give;
      // judging it good enough belongs to whoever has to build to it, and one person holding both
      // turns the whole exchange into a note they wrote to themselves.
      'engineering.tq.close',
      // AUTHORS a controlled document and submits it for review. Approves nothing and issues nothing:
      // `doccontrol.revision.approve` and `.issue` are deliberately absent.
      ...DOCCONTROL_AUTHOR,
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
      ...SITE_EXECUTION,
      // RAISES an inspection request and decides none. Both spellings, because the role named
      // `inspection-request` while the route derives `ir` — so this capability did not work.
      'quality.inspection-request.create', 'quality.ir.create', 'quality.ir.request',
      readOnly('site'),
      readOnly('quality'), readOnly('projects'), PROJECT_RESPONSIBILITY_WORK,
      // Raises an incident and REQUESTS a permit for the work it has to do. Authorises neither —
      // which is what turns the permit's two-person rule from a separation between HSE officers into
      // a separation between the worker and the authoriser.
      ...HSE_SITE_PARTICIPATION,
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
      // THE SECOND PAIR OF EYES ON THE DAY. The Site Engineer writes and submits the daily report and
      // no longer approves it; this role and the PM do. A daily report is what a delay claim, a
      // variation and a payment dispute are later argued from, and it was written and signed off by
      // one person. Also issues and closes a site instruction, and resolves a delay log.
      ...SITE_SUPERVISION,
      'procurement.*.read', 'commissioning.*.read', ...STAFF_BASE,
    ],
  },
  {
    id: 'r-pm',
    name: 'Project Manager',
    description: 'Owns project delivery, risk, programme, cost control, variations and delivery approvals.',
    assignmentScope: 'project',
    permissions: [
      ...PROJECTS_DELIVERY, readOnly('projects'), 'contracts.certificate.create', 'contracts.certificate.update',
      // RAISES a subcontractor application and instructs a variation for work on their own project,
      // and CERTIFIES NEITHER. That separation is the point: the person who says the work was done is
      // not the person who accepts the account of it. `subcontracts.claim.certify` and
      // `subcontracts.variation.approve` are deliberately absent — both belong to Commercial / QS.
      'subcontracts.subcontract.read', 'subcontracts.claim.create', 'subcontracts.claim.read',
      'subcontracts.variation.create', 'subcontracts.variation.read',
      // Approves the day alongside the Project Engineer. TWO roles hold this on purpose: an approval
      // only one person in the world can give is as broken as one anybody can, and a project does
      // not stop because somebody is on leave.
      ...SITE_SUPERVISION,
      // DELIVERS THE HANDOVER and does not accept it. Assembling the dossier and issuing it to the
      // client is project delivery; accepting it is the client's side, recorded by Handover/FM.
      // Measured before this: the PM was refused its own project's handover submission with
      // "no grant satisfies commissioning.handover.submit".
      ...COMMISSIONING_DELIVERY,
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
      // REVIEWS AND APPROVES a controlled document — and does not release it. `doccontrol.revision.issue`
      // is absent on purpose: approving internally and issuing externally are two acts.
      ...DOCCONTROL_TECHNICAL_AUTHORITY,
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
      // `contracts.*` USED TO BE HERE.
      ...CONTRACTS_COMMERCIAL, ...CONTRACTS_AUTHORITY,
      'projects.variation.*', 'projects.cb.*', PROJECT_RESPONSIBILITY_WORK,
      // PREPARES AND SUBMITS an extension-of-time claim, and does NOT determine it. Before this the
      // role named `projects.eot-claim.*` — both sides of the exchange — and could exercise
      // NEITHER, because the service asserted `projects.project.update` for every act in that file
      // and this role does not hold it. Measured: 403 creating a claim in its own module.
      'projects.eot-claim.create', 'projects.eot-claim.submit', 'projects.eot-claim.read',
      // Freezes the SOLD quantity a project is measured and billed against — a valuation fact, so
      // it follows the valuation authority rather than delivery. The PM keeps it too.
      'projects.quantity-ledger.baseline',
      // SUBCONTRACTOR COMMERCIAL AUTHORITY. This role’s description already said it — “governs
      // estimates, quotations, contracts, variations, CLAIMS and payment applications” — and it held
      // no `subcontracts.*` permission whatsoever. The whole module was reachable only by r-admin, so
      // in practice one administrator raised a subcontractor claim, certified it and paid it.
      //
      // Certifying is a QUANTITY-SURVEYING judgement about work done on site, which is why it sits
      // here and not with Finance: the service used to assert `finance.invoice.approve` for it, an
      // authority that belongs to a different question entirely. Paying is Finance’s, below.
      // `subcontracts.claim.pay` is deliberately absent: certifying says the work is worth this,
      // paying says the money goes now, and one signature for both is not a control.
      'subcontracts.subcontract.create', 'subcontracts.subcontract.read', 'subcontracts.subcontract.status',
      'subcontracts.claim.create', 'subcontracts.claim.read', 'subcontracts.claim.certify',
      'subcontracts.variation.create', 'subcontracts.variation.read', 'subcontracts.variation.approve',
      'subcontracts.back-charge.create', 'subcontracts.back-charge.read', 'subcontracts.back-charge.status',
      'subcontracts.back-charge.recover',
      readOnly('tendering'), readOnly('projects'), readOnly('procurement'), readOnly('finance'), ...STAFF_BASE,
    ],
  },
  {
    id: 'r-procurement',
    name: 'Buyer',
    description: 'Prepares purchase requests, RFQs, comparisons and purchase orders without approving their own order.',
    assignmentScope: 'tenant-or-project',
    permissions: [
      // `procurement.*.read/create/update` USED TO BE HERE. Three middle wildcards that defined the
      // Buyer's authority by the shape of the verb, which is why sending an RFQ — the job — was
      // refused while creating anything in the module was not.
      ...PROCUREMENT_BUYER,
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
    permissions: [
      // `procurement.*` USED TO BE HERE, covering the routine work and the acts that commit the
      // business in one pattern. The Manager reviews and authorises; it does not need to be able to
      // do the Buyer's job as well, and holding both made the maker/checker question unanswerable at
      // the authority layer.
      ...PROCUREMENT_AUTHORITY,
      // The sourcing decision (SUP-13/SUP-14), unchanged and closed to new scope by ADR-0022. The
      // decision and the award both declare `procurement.rfq.award`; the Buyer prepares, submits and
      // withdraws under `procurement.rfq.create`/`.update`, which it already names.
      'procurement.rfq.award',
      // WITHDRAWING an approved recommendation before it is awarded is the decision-maker's, and the
      // withdraw route declares `procurement.rfq.update` — the same name the SUBMIT route declares.
      // One name for two acts is an imprecision worth noting: it means holding it lets a manager also
      // submit. SUP-13's maker/checker is what keeps them apart — the submitter may not decide their
      // own recommendation — and that rule is frozen under ADR-0022, so it is left as it stands here
      // rather than renamed in passing.
      'procurement.rfq.update',
      // Reads across the module: authorising an act requires seeing what it is.
      readOnly('procurement'), 'procurement.po.view',
      readOnly('inventory'), readOnly('projects'), readOnly('finance'), ...STAFF_BASE,
    ],
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
    permissions: [
      ...QUALITY_REGISTER, readOnly('quality'),
      readOnly('commissioning'), readOnly('engineering'), readOnly('site'), readOnly('projects'),
      PROJECT_RESPONSIBILITY_WORK, ...STAFF_BASE,
    ],
  },
  {
    id: 'r-hse',
    name: 'HSE',
    description: 'Owns permits, incidents, risk assessments, toolbox talks and corrective actions.',
    assignmentScope: 'project',
    permissions: [
      // `hse.*` USED TO BE HERE, covering raising, writing, requesting, authorising and closing
      // alike — and covering every HSE act added to the module in future.
      ...HSE_SITE_PARTICIPATION, ...HSE_AUTHORITY,
      readOnly('site'), readOnly('projects'), PROJECT_RESPONSIBILITY_WORK, readOnly('engineering'), readOnly('hr'), ...STAFF_BASE,
    ],
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
      ...FINANCE_AR_OPERATIONS,
      'finance.period.read', // sees which periods are closed; cannot close or reopen one
      // RELEASES a certified subcontractor claim for payment, and certifies nothing. It already held
      // `subcontracts.*.read`; paying was reachable only through r-admin’s global wildcard.
      'subcontracts.claim.pay',
      // AND THE MONEY HR COMMITS. Paying a payroll run, reimbursing an approved expense claim and
      // disbursing an approved staff advance are cash leaving the business — Finance's act, not the
      // HR Manager's who approved the entitlement. The domain refuses the approver the payment on
      // top of this, because one person may hold both roles.
      'hr.payroll.pay', 'hr.expense-claim.reimburse', 'hr.staff-advance.disburse',
      'hr.staff-advance.repay',
      readOnly('hr'),
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
      // Voiding a receivable the customer has seen, removing one from the register, and posting the
      // period-end revaluation. Corrections and period-end acts, not day-to-day AR — and the domain
      // refuses the person who ISSUED an invoice its cancellation, whichever role they hold.
      ...FINANCE_INVOICE_CORRECTIONS,
      readOnly('finance'), readOnly('contracts'), readOnly('projects'), ...STAFF_BASE,
    ],
  },
  {
    id: 'r-commissioning-engineer',
    name: 'T&C Engineer',
    description: 'Executes system-specific pre-commissioning, tests, defects, retests and evidence capture.',
    assignmentScope: 'project',
    permissions: [
      ...COMMISSIONING_RECORD, readOnly('commissioning'),
      // Assembles and submits the handover dossier — the delivery side — and accepts nothing.
      ...COMMISSIONING_DELIVERY,
      readOnly('quality'), readOnly('engineering'), readOnly('site'), readOnly('projects'),
      PROJECT_RESPONSIBILITY_WORK, readOnly('doccontrol'), ...STAFF_BASE,
    ],
  },
  {
    id: 'r-handover-fm',
    name: 'Handover / FM',
    description: 'Prepares O&M, training, spares, dossier and handover readiness records for acceptance.',
    assignmentScope: 'project',
    permissions: [
      // ACCEPTS, AND NO LONGER SUBMITS. `commissioning.handover.*` gave this role both ends of the
      // exchange — the party receiving the handover was the only party that could issue it, which is
      // not an exchange at all, and it is why the PROJECT MANAGER was refused their own project's
      // handover (measured: "no grant satisfies commissioning.handover.submit").
      //
      // `acceptedBy` is recorded beside the free-text `clientRepresentative`: the account that
      // performed the acceptance, and the person on the client side it was accepted by. Acceptance
      // starts the warranty and defects-liability clock, and it used to record neither.
      ...COMMISSIONING_ACCEPTANCE,
      readOnly('commissioning'), readOnly('projects'), PROJECT_RESPONSIBILITY_WORK,
      readOnly('assets'), readOnly('amc'), readOnly('doccontrol'), ...STAFF_BASE,
    ],
  },
  {
    /**
     * HR OFFICER — and the module had NO ROLE AT ALL until this existed.
     *
     * Measured: no shipped role held a single `hr.*` permission except `r-hse`, which holds
     * `hr.*.read`. Payroll, expense claims, staff advances, timesheets, appraisals and end-of-service
     * were reachable only through r-admin's global wildcard. 28 mutating routes, nine of them
     * governing verbs. The subcontracts shape, at larger scale, on the department that pays people.
     *
     * This role runs the department: the employee master, leave, attendance, timesheet capture,
     * appraisals, end-of-service, and PREPARING a payroll run. It approves none of the things that
     * cost money and pays none of them — those are below.
     */
    id: 'r-hr',
    name: 'HR Officer',
    description: 'Maintains employee records, leave, attendance, timesheets and appraisals, and prepares payroll.',
    assignmentScope: 'tenant',
    permissions: [
      'hr.employee.create', 'hr.employee.update', 'hr.employee.link-account',
      'hr.leave.create', 'hr.attendance.create', 'hr.attendance.checkout',
      'hr.timesheet.create', 'hr.timesheet.submit',
      'hr.expense-claim.create', 'hr.expense-claim.submit',
      'hr.staff-advance.create',
      'hr.appraisal.create', 'hr.appraisal.acknowledge',
      'hr.payroll.create', 'hr.eosb.create', 'hr.wp.create',
      readOnly('hr'), readOnly('projects'), ...STAFF_BASE,
    ],
  },
  {
    /**
     * HR MANAGER — the approvals, and nothing that pays.
     *
     * Approving a timesheet turns hours into project cost and, through payroll, into money. Approving
     * an expense claim or a staff advance commits the business to hand an employee cash. Those three
     * are the department's governing acts and they sit here, apart from the officer who captures the
     * records and apart from Finance who releases the money.
     *
     * `hr.employee.delete` is here too: removing a person from the master is not day-to-day
     * maintenance.
     */
    id: 'r-hr-manager',
    name: 'HR Manager',
    description: 'Approves timesheets, expense claims, staff advances and appraisals; governs the employee master.',
    assignmentScope: 'tenant',
    permissions: [
      'hr.timesheet.approve', 'hr.expense-claim.approve', 'hr.staff-advance.approve',
      'hr.appraisal.submit',
      // TWO NAMES FOR ONE ACT, again: the route declares `hr.leave.resolve` and the service asserts
      // `hr.leave.approve`. Same shape as `pr`/`purchase-request` in procurement, and it is listed
      // rather than renamed because renaming a permission is a separate change with its own blast
      // radius. The permission-vocabulary guard is what found it.
      'hr.leave.resolve', 'hr.leave.approve',
      'hr.employee.delete', 'hr.employee.restore',
      readOnly('hr'), readOnly('projects'), ...STAFF_BASE,
    ],
  },
  {
    /**
     * DOCUMENT CONTROLLER — and the module had no such role until this existed.
     *
     * The EXTERNAL RELEASE AUTHORITY. It owns the register, ISSUES an approved revision, creates and
     * SENDS transmittals, and logs and closes correspondence. It APPROVES NOTHING: a document reaches
     * this role only after the Technical Manager has approved it, and `doccontrol.revision.approve`
     * is deliberately absent so that approving and releasing can never be the same permission.
     *
     * Issuing and then sending is NOT a self-approval: the approval happened elsewhere, and a
     * conveyance carries many documents. That is why no maker/checker is invented between issuer and
     * sender — inventing one would be inventing a control.
     */
    id: 'r-document-controller',
    name: 'Document Controller',
    description: 'Owns the document register, issues approved revisions and releases them externally by transmittal.',
    assignmentScope: 'tenant-or-project',
    permissions: [
      ...DOCCONTROL_RELEASE_AUTHORITY,
      readOnly('doccontrol'), readOnly('engineering'), readOnly('projects'), ...STAFF_BASE,
    ],
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
