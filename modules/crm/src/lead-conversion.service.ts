import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type AccessTarget, type Id, type OrgLevel, makeEvent,
  CRM_EVENT, type Lead, type Opportunity, type OpportunityStage, makeOpportunity,
  resolveIdentity, type IdentityResolution, type MatchConfidence, type IdentityMatch,
} from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';
import { CRM_LEAD_STORE, type LeadStore } from './lead-store';
import { CRM_ACCOUNT_STORE, type AccountStore } from './account-store';
import { CRM_CONTACT_STORE, type ContactStore } from './contact-store';
import { CRM_OPPORTUNITY_STORE, type OpportunityStore } from './opportunity-store';
import { makeAccount, CRM_EVENT as CRM_ACCOUNT_EVENT } from './domain/account';
import { makeContact, CRM_CONTACT_EVENT } from './domain/contact';

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
}

export interface ConvertPreview {
  lead: Lead;
  alreadyConverted: boolean;
  account: IdentityResolution;
  contact: IdentityResolution;
}

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
  ) {}

  /** Dry run: what would convert link or create? Drives the "possible duplicate" UI. */
  async preview(leadId: Id): Promise<ConvertPreview> {
    const lead = await this.leads.get(leadId);
    if (!lead) throw new Error(`Lead ${leadId} not found`);
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

  async convert(leadId: Id, input: ConvertLeadInput = {}): Promise<ConvertLeadResult> {
    const lead = await this.leads.get(leadId);
    if (!lead) throw new Error(`Lead ${leadId} not found`);

    if (input.actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: lead.tenantId }];
      if (lead.companyId) orgPath.push({ level: 'company', id: lead.companyId });
      const target: AccessTarget = { permission: 'crm.account.create', orgPath };
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
      };
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
      title: input.opportunity?.title?.trim() || (lead.companyName ? `${lead.companyName} — ${lead.name}` : lead.name),
      value: input.opportunity?.value,
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
    ];

    await this.tx.run(async (handle) => {
      if (newAccount) await this.accounts.createWithClient(handle, newAccount);
      if (newContact) await this.contacts.saveWithClient(handle, newContact);
      await this.opportunities.createWithClient(handle, opp);
      await this.leads.updateWithClient(handle, convertedLead);
      await this.events.appendWithClient(handle, evs);
    });

    this.logger.log(`Lead converted: ${lead.name} (${lead.id}) → opportunity ${opp.id} (account ${accountLink.action} ${accountId})`);
    return { idempotentReplay: false, lead: convertedLead, opportunity: opp, account: accountLink, contact: contactLink };
  }
}
