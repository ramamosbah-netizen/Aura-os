import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type AccessTarget, assertSameTenant, CRM_EVENT, CRM_OPPORTUNITY_DEPTH_EVENT, elvSystemLabel, type Id, type IdentityMatch, type IdentityResolution, type Lead, makeDealMember, makeEvent, makeOpportunity, type MatchConfidence, type Opportunity, type OpportunityDealMember, type OpportunityStage, type OrgLevel, resolveIdentity } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TenantContext, TX_RUNNER, type TxRunner, UsersService } from '@aura/core';
import { CRM_LEAD_STORE, type LeadStore } from './lead-store';
import { CRM_ACCOUNT_STORE, type AccountStore } from './account-store';
import { CRM_CONTACT_STORE, type ContactStore } from './contact-store';
import { CRM_OPPORTUNITY_STORE, type OpportunityStore } from './opportunity-store';
import { makeAccount, CRM_EVENT as CRM_ACCOUNT_EVENT } from './domain/account';
import { makeContact, CRM_CONTACT_EVENT } from './domain/contact';
import { makeRequirement, PREAWARD_EVENT } from './domain/solution-scope';
import { CRM_PRE_AWARD_STORE, type PreAwardStore } from './pre-award-store';
import { CRM_ACTIVITY_STORE, type ActivityStore } from './activity-store';
import { CRM_OPPORTUNITY_DEPTH_STORE, type OpportunityDepthStore } from './opportunity-depth-store';
import { CRM_ACTIVITY_EVENT, makeActivity, type Activity } from './domain/activity';

export interface PreSalesAssignmentInput {
  assigneeId: Id;
  reviewerId: Id;
  dueDate: string;
  inputRevision: string;
  deliverables: string[];
}

export interface ConvertLeadInput {
  actorId?: Id | null;
  /** Link to this exact account (skips resolution). */
  accountId?: Id | null;
  /** Force a new account even when a match exists (user chose "not a duplicate"). */
  createNewAccount?: boolean;
  /** Link to this exact contact (skips resolution). */
  contactId?: Id | null;
  createNewContact?: boolean;
  /** Opportunity shape overrides — otherwise derived from the lead. */
  opportunity?: {
    title?: string;
    value?: number;
    stage?: OpportunityStage;
    requiresTender?: boolean;
    closeDate?: string | null;
    ownerId?: Id | null;
  };
  /** Optional for compatibility with existing integrations; the primary UI always supplies it. */
  preSalesAssignment?: PreSalesAssignmentInput;
}

export interface IdentityLink {
  action: 'linked' | 'created';
  id: Id;
  /** How the link was chosen when resolved (absent for explicit id / created). */
  confidence?: MatchConfidence;
  /** Candidate matches considered (for transparency / later merge). */
  matches?: IdentityMatch[];
}

export interface ConvertLeadResult {
  /** True when the lead was already converted — no new records were created. */
  idempotentReplay: boolean;
  lead: Lead;
  opportunity: Opportunity;
  account: IdentityLink;
  contact: IdentityLink | null;
  preSalesAssignment: { member: OpportunityDealMember; reviewerMember: OpportunityDealMember; activity: Activity } | null;
}

export interface ConvertPreview {
  lead: Lead;
  alreadyConverted: boolean;
  account: IdentityResolution;
  contact: IdentityResolution;
}

/** One resolved possible-duplicate, enriched with the record's display name for the capture UI. */
export interface DraftDuplicateMatch { id: string; name: string; confidence: 'EXACT' | 'PROBABLE' | 'POSSIBLE'; reasons: string[] }
export interface DraftDuplicateGroup { best: MatchConfidence; matches: DraftDuplicateMatch[] }
export interface DraftDuplicatePreview {
  account: DraftDuplicateGroup;
  contact: DraftDuplicateGroup;
  lead: DraftDuplicateGroup;
}
export interface LeadDraftInput { name?: string | null; companyName?: string | null; email?: string | null; phone?: string | null }

/**
 * Lead → Opportunity **Qualify & Convert** — a controlled business operation, not a status edit.
 * Guarantees the S2 invariants:
 *   • lineage preserved (opportunity carries leadId + the lead's source; lead records the opp)
 *   • cannot convert twice (a converted lead replays idempotently, creating nothing)
 *   • duplicate protection (Account/Contact resolved by shared identity rules; auto-link on EXACT)
 * Everything runs in one transaction so a failure leaves neither a half-linked account nor a
 * lead marked converted without its opportunity.
 */
@Injectable()
export class LeadConversionService {
  private readonly logger = new Logger('CRM-LeadConvert');

  constructor(
    @Inject(CRM_LEAD_STORE) private readonly leads: LeadStore,
    @Inject(CRM_ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(CRM_CONTACT_STORE) private readonly contacts: ContactStore,
    @Inject(CRM_OPPORTUNITY_STORE) private readonly opportunities: OpportunityStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly access: AccessService,
    // @Optional() @Inject(...) explicitly: a union-typed ctor param emits `Object` for
    // design:paramtypes and Nest injects null silently, which would make the guards inert.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
    @Optional() @Inject(CRM_PRE_AWARD_STORE) private readonly preAward: PreAwardStore | null = null,
    @Optional() @Inject(CRM_ACTIVITY_STORE) private readonly activityStore: ActivityStore | null = null,
    @Optional() @Inject(CRM_OPPORTUNITY_DEPTH_STORE) private readonly depthStore: OpportunityDepthStore | null = null,
    @Optional() @Inject(UsersService) private readonly users: UsersService | null = null,
  ) {}

  /** Dry run: what would convert link or create? Drives the "possible duplicate" UI. */
  async preview(leadId: Id): Promise<ConvertPreview> {
    const lead = assertSameTenant(await this.leads.get(leadId), this.tenant?.boundTenantId(), 'Lead', leadId);
    const [accounts, contacts] = await Promise.all([
      this.accounts.list({ tenantId: lead.tenantId, limit: 5000 }),
      this.contacts.list({ tenantId: lead.tenantId, limit: 5000 }),
    ]);
    return {
      lead,
      alreadyConverted: lead.convertedOpportunityId !== null,
      account: resolveIdentity(
        { name: lead.companyName ?? lead.name, email: lead.email, phone: lead.phone },
        accounts.map((a) => ({ id: a.id, name: a.name, email: a.email, phone: a.phone })),
      ),
      contact: resolveIdentity(
        { name: lead.name, email: lead.email, phone: lead.phone },
        contacts.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone })),
        { personMode: true },
      ),
    };
  }

  /**
   * Capture-time duplicate preview for a NOT-yet-saved lead (drives the "+ New Lead" warning). Runs
   * the SAME `resolveIdentity` engine as convert, so the heads-up at capture matches the resolution
   * at conversion — one source of truth for identity, never a second matcher in React.
   */
  async previewDraft(input: LeadDraftInput): Promise<DraftDuplicatePreview> {
    const tenantId = this.tenant?.boundTenantId();
    if (!tenantId) throw new Error('tenant context is required for a duplicate check');
    const [accounts, contacts, leads] = await Promise.all([
      this.accounts.list({ tenantId, limit: 5000 }),
      this.contacts.list({ tenantId, limit: 5000 }),
      this.leads.list({ tenantId, limit: 5000 }),
    ]);
    const nameOf = new Map<string, string>([
      ...accounts.map((a) => [a.id, a.name] as const),
      ...contacts.map((c) => [c.id, c.name] as const),
      ...leads.map((l) => [l.id, l.companyName ?? l.name] as const),
    ]);
    const enrich = (res: IdentityResolution): DraftDuplicateGroup => ({
      best: res.best,
      matches: res.matches.map((m) => ({ id: m.id, name: nameOf.get(m.id) ?? '', confidence: m.confidence, reasons: m.reasons })),
    });
    const companyName = input.companyName ?? input.name ?? '';
    const person = input.name ?? '';
    return {
      account: enrich(resolveIdentity(
        { name: companyName, email: input.email ?? null, phone: input.phone ?? null },
        accounts.map((a) => ({ id: a.id, name: a.name, email: a.email, phone: a.phone })),
      )),
      contact: enrich(resolveIdentity(
        { name: person, email: input.email ?? null, phone: input.phone ?? null },
        contacts.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone })),
        { personMode: true },
      )),
      lead: enrich(resolveIdentity(
        { name: companyName || person, email: input.email ?? null, phone: input.phone ?? null },
        leads.map((l) => ({ id: l.id, name: l.companyName ?? l.name, email: l.email, phone: l.phone })),
      )),
    };
  }

  async convert(leadId: Id, input: ConvertLeadInput = {}): Promise<ConvertLeadResult> {
    const lead = assertSameTenant(await this.leads.get(leadId), this.tenant?.boundTenantId(), 'Lead', leadId);

    if (input.actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: lead.tenantId }];
      if (lead.companyId) orgPath.push({ level: 'company', id: lead.companyId });
      const target: AccessTarget = { permission: 'crm.lead.convert', orgPath };
      this.access.assert(input.actorId, target);
    }

    // Invariant: cannot convert twice — a converted lead replays idempotently (creates nothing).
    if (lead.convertedOpportunityId) {
      const existing = await this.opportunities.get(lead.convertedOpportunityId);
      if (!existing) throw new Error(`Lead ${leadId} is already converted but its opportunity is missing`);
      return {
        idempotentReplay: true,
        lead,
        opportunity: existing,
        account: { action: 'linked', id: existing.accountId ?? '' },
        contact: null,
        preSalesAssignment: null,
      };
    }

    // Eligibility: only a QUALIFIED lead may be converted. Enforced in the backend (not just the
    // UI) so a direct POST /convert cannot skip the New → Contacted → Qualifying → Qualified
    // lifecycle. State-transition guard → 409 via the error taxonomy.
    if (lead.status !== 'qualified') {
      throw new Error(`only a qualified lead can be converted (current status: ${lead.status})`);
    }

    // --- Resolve the Account (party) ---
    const accountsList = await this.accounts.list({ tenantId: lead.tenantId, limit: 5000 });
    const accountRes = resolveIdentity(
      { name: lead.companyName ?? lead.name, email: lead.email, phone: lead.phone },
      accountsList.map((a) => ({ id: a.id, name: a.name, email: a.email, phone: a.phone })),
    );

    let accountLink: IdentityLink;
    let newAccount: ReturnType<typeof makeAccount> | null = null;
    if (input.accountId) {
      const linked = await this.accounts.get(input.accountId);
      if (!linked || linked.tenantId !== lead.tenantId) throw new Error(`Account ${input.accountId} not found`);
      accountLink = { action: 'linked', id: linked.id };
    } else if (!input.createNewAccount && accountRes.best === 'EXACT') {
      accountLink = { action: 'linked', id: accountRes.matches[0].id, confidence: 'EXACT', matches: accountRes.matches };
    } else {
      newAccount = makeAccount({
        tenantId: lead.tenantId,
        companyId: lead.companyId,
        name: lead.companyName ?? lead.name,
        status: 'prospect',
        email: lead.email,
        phone: lead.phone,
        source: lead.source,
        ownerId: lead.assignedTo,
        createdBy: input.actorId ?? null,
      });
      accountLink = { action: 'created', id: newAccount.id, matches: accountRes.matches };
    }
    const accountId = accountLink.id;
    const resolvedAccount = newAccount ?? accountsList.find((a) => a.id === accountId) ?? null;
    const accountName = resolvedAccount?.name ?? lead.companyName ?? lead.name;

    // --- Resolve the Contact (person) ---
    const contactsList = await this.contacts.list({ tenantId: lead.tenantId, limit: 5000 });
    const contactRes = resolveIdentity(
      { name: lead.name, email: lead.email, phone: lead.phone },
      contactsList.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone })),
      { personMode: true },
    );
    let contactLink: IdentityLink | null = null;
    let newContact: ReturnType<typeof makeContact> | null = null;
    if (input.contactId) {
      const linked = await this.contacts.get(input.contactId);
      if (!linked || linked.tenantId !== lead.tenantId) throw new Error(`Contact ${input.contactId} not found`);
      contactLink = { action: 'linked', id: linked.id };
    } else if (!input.createNewContact && contactRes.best === 'EXACT') {
      contactLink = { action: 'linked', id: contactRes.matches[0].id, confidence: 'EXACT', matches: contactRes.matches };
    } else {
      newContact = makeContact({
        tenantId: lead.tenantId,
        companyId: lead.companyId,
        accountId,
        accountName,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        isPrimary: true,
        ownerId: lead.assignedTo,
        createdBy: input.actorId ?? null,
      });
      contactLink = { action: 'created', id: newContact.id, matches: contactRes.matches };
    }

    // --- Build the Opportunity (lineage: leadId + the lead's originating source) ---
    const opp = makeOpportunity({
      tenantId: lead.tenantId,
      companyId: lead.companyId,
      leadId: lead.id,
      accountId,
      accountName,
      // G4: a lead that names its project titles the opportunity after it — "Marina Hotel — CCTV"
      // is what people call the deal, not "Emaar — Layla Hassan".
      title:
        input.opportunity?.title?.trim() ||
        (lead.projectName ? `${lead.projectName}${lead.systems?.length ? ` — ${lead.systems.map(elvSystemLabel).join(' + ')}` : ''}` : null) ||
        (lead.companyName ? `${lead.companyName} — ${lead.name}` : lead.name),
      // G4: the lead's estimate seeds the opportunity value when the converter did not state one.
      // It is an ESTIMATE becoming a starting point, never overriding an explicit decision.
      value: input.opportunity?.value ?? lead.estimatedValue ?? undefined,
      stage: input.opportunity?.stage ?? 'qualification',
      requiresTender: input.opportunity?.requiresTender ?? true,
      closeDate: input.opportunity?.closeDate ?? null,
      ownerId: input.opportunity?.ownerId ?? lead.assignedTo,
      source: lead.source, // attribution flows Signal→Lead→Opportunity unbroken
    });

    const now = new Date().toISOString();
    const convertedLead: Lead = {
      ...lead,
      status: 'converted',
      convertedOpportunityId: opp.id,
      convertedAt: now,
      firstRespondedAt: lead.firstRespondedAt ?? now,
      updatedAt: now,
    };
    // The customer's words are the first technical input. Preserve them as an opportunity
    // requirement in the SAME transaction as conversion so Pre-Sales receives the exact enquiry
    // instead of retyping it or finding an empty study workspace.
    const seededRequirement = this.preAward && lead.requirement?.trim()
      ? makeRequirement({
          tenantId: lead.tenantId,
          opportunityId: opp.id,
          title: lead.requirement,
          detail: `Captured from enquiry ${lead.id}`,
          priority: 'must',
        })
      : null;

    const assignmentInput = input.preSalesAssignment;
    let assignmentMember: OpportunityDealMember | null = null;
    let reviewerMember: OpportunityDealMember | null = null;
    let assignmentActivity: Activity | null = null;
    if (assignmentInput) {
      if (!input.actorId) throw new Error('actor is required to assign Pre-Sales work');
      if (!this.activityStore || !this.depthStore || !this.users) {
        throw new Error('Pre-Sales assignment services are unavailable');
      }
      const deliverables = [...new Set(assignmentInput.deliverables.map((item) => item.trim()).filter(Boolean))];
      if (!assignmentInput.assigneeId?.trim()) throw new Error('Pre-Sales assignee is required');
      if (!assignmentInput.reviewerId?.trim()) throw new Error('technical reviewer is required');
      if (assignmentInput.assigneeId === assignmentInput.reviewerId) throw new Error('technical reviewer must be independent from the Pre-Sales assignee');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(assignmentInput.dueDate)) throw new Error('Pre-Sales due date is required');
      if (!assignmentInput.inputRevision?.trim()) throw new Error('input revision is required');
      if (deliverables.length === 0) throw new Error('at least one Pre-Sales deliverable is required');

      this.access.assert(input.actorId, {
        permission: 'crm.activity.create',
        orgPath: [{ level: 'tenant', id: lead.tenantId }, ...(lead.companyId ? [{ level: 'company' as const, id: lead.companyId }] : [])],
      });
      await this.users.ensureTenant(lead.tenantId);
      const assignee = this.users.get(lead.tenantId, assignmentInput.assigneeId);
      const reviewer = this.users.get(lead.tenantId, assignmentInput.reviewerId);
      if (!assignee?.active) throw new Error('Pre-Sales assignee must be an active workspace user');
      if (!reviewer?.active) throw new Error('technical reviewer must be an active workspace user');

      const responsibility = `Study ${deliverables.join(', ')} from input revision ${assignmentInput.inputRevision.trim()}; reviewer ${assignmentInput.reviewerId}`;
      assignmentMember = makeDealMember({
        tenantId: lead.tenantId,
        opportunityId: opp.id,
        userId: assignmentInput.assigneeId,
        userName: assignee.displayName,
        role: 'PRESALES',
        responsibility,
      });
      // The reviewer is part of the same canonical deal team. This is also the persisted relation
      // used by DMS to grant read-only access to the original Sales intake documents; no copied file
      // or caller-supplied opportunity id is trusted later.
      reviewerMember = makeDealMember({
        tenantId: lead.tenantId,
        opportunityId: opp.id,
        userId: assignmentInput.reviewerId,
        userName: reviewer.displayName,
        role: 'TECHNICAL_REVIEWER',
        responsibility: `Review the Pre-Sales study based on input revision ${assignmentInput.inputRevision.trim()}`,
      });
      assignmentActivity = makeActivity({
        tenantId: lead.tenantId,
        companyId: lead.companyId,
        type: 'task',
        subject: `Complete Pre-Sales study — ${opp.title}`,
        notes: [
          `Deliverables: ${deliverables.join(', ')}`,
          `Input revision: ${assignmentInput.inputRevision.trim()}`,
          `Technical reviewer: ${reviewer.displayName} (${assignmentInput.reviewerId})`,
          `Source enquiry: ${lead.id}`,
        ].join('\n'),
        relatedType: 'opportunity',
        relatedId: opp.id,
        relatedName: opp.title,
        dueDate: assignmentInput.dueDate,
        assigneeId: assignmentInput.assigneeId,
        createdBy: input.actorId,
      });
    }

    const evs = [
      ...(newAccount
        ? [makeEvent({
            type: CRM_ACCOUNT_EVENT.accountCreated, tenantId: lead.tenantId, companyId: lead.companyId,
            actorId: input.actorId ?? null, aggregateType: 'crm.account', aggregateId: newAccount.id,
            payload: { name: newAccount.name, source: 'lead-conversion', leadId: lead.id },
          })]
        : []),
      ...(newContact
        ? [makeEvent({
            type: CRM_CONTACT_EVENT.created, tenantId: lead.tenantId, companyId: lead.companyId,
            actorId: input.actorId ?? null, aggregateType: 'crm.contact', aggregateId: newContact.id,
            payload: { name: newContact.name, accountId, source: 'lead-conversion', leadId: lead.id },
          })]
        : []),
      makeEvent({
        type: CRM_EVENT.opportunityCreated, tenantId: lead.tenantId, companyId: lead.companyId,
        actorId: input.actorId ?? null, aggregateType: 'crm.opportunity', aggregateId: opp.id,
        payload: { title: opp.title, value: opp.value, stage: opp.stage, accountId, accountName, leadId: lead.id },
      }),
      makeEvent({
        type: CRM_EVENT.leadConverted, tenantId: lead.tenantId, companyId: lead.companyId,
        actorId: input.actorId ?? null, aggregateType: 'crm.lead', aggregateId: lead.id,
        payload: { opportunityId: opp.id, accountId, contactId: contactLink?.id ?? null, source: lead.source },
      }),
      ...(seededRequirement
        ? [makeEvent({
            type: PREAWARD_EVENT.requirementAdded,
            tenantId: lead.tenantId,
            companyId: lead.companyId,
            actorId: input.actorId ?? null,
            aggregateType: 'crm.opportunity',
            aggregateId: opp.id,
            payload: { requirementId: seededRequirement.id, title: seededRequirement.title, priority: seededRequirement.priority, sourceLeadId: lead.id },
          })]
        : []),
      ...(assignmentMember
        ? [makeEvent({
            type: CRM_OPPORTUNITY_DEPTH_EVENT.dealMemberAdded,
            tenantId: lead.tenantId,
            companyId: lead.companyId,
            actorId: input.actorId ?? null,
            aggregateType: 'crm.opportunity',
            aggregateId: opp.id,
            payload: { memberId: assignmentMember.id, userId: assignmentMember.userId, role: assignmentMember.role },
          })]
        : []),
      ...(reviewerMember
        ? [makeEvent({
            type: CRM_OPPORTUNITY_DEPTH_EVENT.dealMemberAdded,
            tenantId: lead.tenantId,
            companyId: lead.companyId,
            actorId: input.actorId ?? null,
            aggregateType: 'crm.opportunity',
            aggregateId: opp.id,
            payload: { memberId: reviewerMember.id, userId: reviewerMember.userId, role: reviewerMember.role },
          })]
        : []),
      ...(assignmentActivity
        ? [makeEvent({
            type: CRM_ACTIVITY_EVENT.created,
            tenantId: lead.tenantId,
            companyId: lead.companyId,
            actorId: input.actorId ?? null,
            aggregateType: 'crm.activity',
            aggregateId: assignmentActivity.id,
            payload: { type: assignmentActivity.type, subject: assignmentActivity.subject, relatedType: assignmentActivity.relatedType, relatedId: assignmentActivity.relatedId },
          })]
        : []),
    ];

    await this.tx.run(async (handle) => {
      if (newAccount) await this.accounts.createWithClient(handle, newAccount);
      if (newContact) await this.contacts.saveWithClient(handle, newContact);
      await this.opportunities.createWithClient(handle, opp);
      if (seededRequirement) await this.preAward!.saveRequirementWithClient(handle, seededRequirement);
      if (assignmentMember) await this.depthStore!.saveDealMemberWithClient(handle, assignmentMember);
      if (reviewerMember) await this.depthStore!.saveDealMemberWithClient(handle, reviewerMember);
      if (assignmentActivity) await this.activityStore!.saveWithClient(handle, assignmentActivity);
      await this.leads.updateWithClient(handle, convertedLead);
      await this.events.appendWithClient(handle, evs);
    });

    this.logger.log(`Lead converted: ${lead.name} (${lead.id}) → opportunity ${opp.id} (account ${accountLink.action} ${accountId})`);
    return {
      idempotentReplay: false,
      lead: convertedLead,
      opportunity: opp,
      account: accountLink,
      contact: contactLink,
      preSalesAssignment: assignmentMember && reviewerMember && assignmentActivity
        ? { member: assignmentMember, reviewerMember, activity: assignmentActivity }
        : null,
    };
  }
}
