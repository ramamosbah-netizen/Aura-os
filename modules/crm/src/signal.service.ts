import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import type { Pool } from 'pg';
import { type AccessTarget, advanceSignal, CRM_EVENT, CRM_SIGNAL_EVENT, dismissSignal, type Id, type Lead, type LeadSource, makeEvent, makeLead, makeSignal, type NewSignal, type OrgLevel, promoteSignal, resolveIdentity, type Signal, type SignalStatus } from '@aura/shared';
import { AccessService, EVENT_STORE, PG_POOL, type EventStore, TenantContext, TX_RUNNER, type TxRunner, UsersService } from '@aura/core';
import { CRM_SIGNAL_STORE, type SignalFilter, type SignalStore, type SignalSummary } from './signal-store';
import { CRM_LEAD_STORE, type LeadStore } from './lead-store';
import { CRM_ACCOUNT_STORE, type AccountStore } from './account-store';
import { CRM_CONTACT_STORE, type ContactStore } from './contact-store';
import { CRM_OPPORTUNITY_STORE, type OpportunityStore } from './opportunity-store';

export interface PromoteSignalResult {
  /** True when the signal was already promoted — the existing lead is returned, nothing new created. */
  idempotentReplay: boolean;
  signal: Signal;
  lead: Lead;
}

export interface SignalPromotionMatch {
  kind: 'lead' | 'opportunity' | 'account' | 'contact';
  id: Id;
  label: string;
  exact: boolean;
}

export interface SignalPromotionPreview {
  signal: Signal;
  lead: Pick<Lead, 'name' | 'companyName' | 'source' | 'assignedTo' | 'accountId' | 'signalId' | 'requirement'>;
  matches: SignalPromotionMatch[];
}

const SIGNAL_READ = 'crm.signal.read';
const SIGNAL_CREATE = 'crm.signal.create';
const SIGNAL_UPDATE = 'crm.signal.update';
const LEAD_CREATE = 'crm.lead.create';

/** Context tables are fixed constants; request input can never become an SQL identifier. */
const CONTEXT_TABLES: Record<string, { table: string; hasAccount: boolean }> = {
  opportunity: { table: 'aura_crm_opportunities', hasAccount: true },
  quotation: { table: 'aura_crm_quotations', hasAccount: true },
  tender: { table: 'aura_tendering_tenders', hasAccount: true },
  contract: { table: 'aura_contracts_contracts', hasAccount: true },
  project: { table: 'aura_projects_projects', hasAccount: true },
  installed_base: { table: 'aura_crm_installed_base', hasAccount: true },
};

/** Map a signal source onto the (narrower) lead source enum — attribution is also carried
 * verbatim via lead.signalId, so this is only the coarse bucket the lead funnel understands. */
function leadSourceFromSignal(s: Signal): LeadSource {
  // Warm existing-relationship signals are referrals, not 'other' — they lost that fact before.
  if (s.source === 'REFERRAL' || s.source === 'RELATIONSHIP' || s.source === 'ACCOUNT_GROWTH') return 'referral';
  if (s.source === 'MARKET' || s.source === 'INTELLIGENCE' || s.source === 'TENDER_DISCOVERY') return 'campaign';
  if (s.source === 'INBOUND') return 'website';
  return 'other';
}

@Injectable()
export class SignalService {
  private readonly logger = new Logger('CRM-Signals');

  constructor(
    @Inject(CRM_SIGNAL_STORE) private readonly store: SignalStore,
    @Inject(CRM_LEAD_STORE) private readonly leads: LeadStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly access: AccessService,
    @Inject(CRM_ACCOUNT_STORE) private readonly accounts: AccountStore,
    // Keep TenantContext in its historical constructor position for existing module tests and
    // direct consumers; the new validators are appended as optional dependencies.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
    @Optional() @Inject(CRM_CONTACT_STORE) private readonly contacts: ContactStore | null = null,
    @Optional() @Inject(UsersService) private readonly users: UsersService | null = null,
    @Optional() @Inject(PG_POOL) private readonly pool: Pool | null = null,
    @Optional() @Inject(CRM_OPPORTUNITY_STORE) private readonly opportunities: OpportunityStore | null = null,
  ) {}

  private assert(actorId: Id | null | undefined, tenantId: Id, companyId: Id | null, permission: string): void {
    if (!actorId) return;
    const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
    if (companyId) orgPath.push({ level: 'company', id: companyId });
    const target: AccessTarget = { permission, orgPath };
    this.access.assert(actorId, target);
  }

  private orgPath(tenantId: Id, companyId: Id | null): Array<{ level: OrgLevel; id: Id }> {
    const path: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
    if (companyId) path.push({ level: 'company', id: companyId });
    return path;
  }

  /** Root lookup is tenant-scoped in the repository, not fetch-then-check in the service. */
  private async scoped(id: Id): Promise<Signal> {
    const tenantId = this.tenant?.boundTenantId();
    const signal = tenantId ? await this.store.getForTenant(tenantId, id) : await this.store.get(id);
    if (!signal) throw new NotFoundException(`Signal ${id} not found`);
    return signal;
  }

  /** Never allow a bound request to widen a list query to another tenant. */
  private scopedFilter(filter?: SignalFilter): SignalFilter {
    const boundTenantId = this.tenant?.boundTenantId();
    return boundTenantId ? { ...(filter ?? {}), tenantId: boundTenantId } : (filter ?? {});
  }

  private async validateReferences(input: NewSignal): Promise<void> {
    const tenantId = input.tenantId;
    if ((input.contextType == null) !== (input.contextId == null)) {
      throw new BadRequestException('contextType and contextId must be supplied together');
    }
    if (input.accountId) {
      const account = await this.accounts.getForTenant(tenantId, input.accountId);
      if (!account) throw new BadRequestException('account must belong to this tenant');
    }
    if (input.contactId) {
      if (!this.contacts) throw new BadRequestException('contact reference validation is unavailable');
      const contact = await this.contacts.getForTenant(tenantId, input.contactId);
      if (!contact) throw new BadRequestException('contact must belong to this tenant');
      if (input.accountId && contact.accountId !== input.accountId) {
        throw new BadRequestException('contact must belong to the supplied account');
      }
    }
    await this.validateOwner(tenantId, input.ownerId, input.companyId ?? null, false);
    if (input.contextType && input.contextId) {
      await this.validateContext(tenantId, input.contextType, input.contextId, input.accountId ?? null);
    }
  }

  private async validateOwner(tenantId: Id, ownerId: Id | null | undefined, companyId: Id | null, requireLeadCapability: boolean): Promise<void> {
    if (!ownerId || !this.users) return;
    await this.users.ensureTenant(tenantId);
    const roster = this.users.list(tenantId);
    const owner = this.users.get(tenantId, ownerId);
    // Existing policy treats a populated tenant directory as authoritative; an empty directory
    // preserves trusted internal reactor behavior until identity adoption is complete.
    if (roster.length > 0 && !owner) throw new BadRequestException('owner must be a user in this tenant');
    if (owner && !owner.active) throw new BadRequestException('owner must be an active user');
    if (requireLeadCapability && owner && !this.access.can(ownerId, { permission: LEAD_CREATE, orgPath: this.orgPath(tenantId, companyId) }).allowed) {
      throw new BadRequestException('owner cannot be assigned leads');
    }
  }

  private async validateContext(tenantId: Id, contextType: string, contextId: Id, accountId: Id | null): Promise<void> {
    const normalized = contextType.trim().toLowerCase();
    if (normalized === 'account') {
      if (!(await this.accounts.getForTenant(tenantId, contextId))) throw new BadRequestException('context record not found');
      if (accountId && contextId !== accountId) throw new BadRequestException('context account must match the supplied account');
      return;
    }
    if (normalized === 'contact') {
      const contact = this.contacts ? await this.contacts.getForTenant(tenantId, contextId) : null;
      if (!contact) throw new BadRequestException('context record not found');
      if (accountId && contact.accountId !== accountId) throw new BadRequestException('context contact must belong to the supplied account');
      return;
    }
    if (normalized === 'lead') {
      const lead = await this.leads.getForTenant(tenantId, contextId);
      if (!lead) throw new BadRequestException('context record not found');
      if (accountId && lead.accountId !== accountId) throw new BadRequestException('context lead must belong to the supplied account');
      return;
    }
    const descriptor = CONTEXT_TABLES[normalized];
    if (!descriptor) throw new BadRequestException(`unsupported signal context type: ${contextType}`);
    // Cross-module context stores are resolved through the tenant-scoped pool when available.
    // No-DB boots are trusted in-memory reactors; their source records are already local.
    if (!this.pool) return;
    const select = descriptor.hasAccount ? 'id, tenant_id, account_id' : 'id, tenant_id';
    const result = await this.pool.query<{ id: string; tenant_id: string; account_id?: string | null }>(
      `SELECT ${select} FROM public.${descriptor.table} WHERE tenant_id = $1 AND id = $2`,
      [tenantId, contextId],
    );
    const row = result.rows[0];
    if (!row) throw new BadRequestException('context record not found');
    if (accountId && descriptor.hasAccount && row.account_id !== accountId) {
      throw new BadRequestException('context record must belong to the supplied account');
    }
  }

  /** Detect a signal. Idempotent on dedupeKey — a reactor re-firing returns the live signal
   * instead of stacking duplicates (growth-reactor invariant). */
  async create(input: NewSignal & { actorId?: Id | null }): Promise<Signal> {
    const boundTenantId = this.tenant?.boundTenantId();
    if (boundTenantId && input.tenantId !== boundTenantId) {
      throw new BadRequestException('tenant mismatch');
    }
    this.assert(input.actorId, input.tenantId, input.companyId ?? null, SIGNAL_CREATE);
    await this.validateReferences(input);

    if (input.dedupeKey) {
      const existing = await this.store.list({ tenantId: input.tenantId, dedupeKey: input.dedupeKey, limit: 1 });
      if (existing.length) return existing[0];
    }

    const signal = makeSignal(input);
    const event = makeEvent({
      type: CRM_SIGNAL_EVENT.detected,
      tenantId: signal.tenantId, companyId: signal.companyId, actorId: input.actorId ?? null,
      aggregateType: 'crm.signal', aggregateId: signal.id,
      payload: { title: signal.title, source: signal.source, type: signal.type, accountId: signal.accountId },
    });

    await this.tx.run(async (handle) => {
      await this.store.createWithClient(handle, signal);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Signal detected: ${signal.title} (${signal.id})`);
    return signal;
  }

  async advance(id: Id, to: 'REVIEWING' | 'RESEARCHING', actorId?: Id | null): Promise<Signal> {
    return this.tx.run(async (handle) => {
      const boundTenantId = this.tenant?.boundTenantId();
      const existing = handle && boundTenantId
        ? await this.store.getForUpdateWithClient(handle, boundTenantId, id)
        : await this.scoped(id);
      if (!existing) throw new NotFoundException(`Signal ${id} not found`);
      this.assert(actorId, existing.tenantId, existing.companyId, SIGNAL_UPDATE);
      const next = advanceSignal(existing, to, actorId);
      const event = makeEvent({
        type: CRM_SIGNAL_EVENT.reviewed, tenantId: next.tenantId, companyId: next.companyId, actorId: actorId ?? null,
        aggregateType: 'crm.signal', aggregateId: next.id,
        payload: { previousStatus: existing.status, status: next.status, reviewedBy: next.reviewedBy, reviewedAt: next.reviewedAt },
      });
      await this.store.updateWithClient(handle, next);
      await this.events.appendWithClient(handle, [event]);
      return next;
    });
  }

  /** Promote a signal to a Lead — one transaction, preserving source attribution (lead.signalId +
   * lead.source) and the forward link (signal.promotedLeadId). Idempotent: a promoted signal
   * returns its existing lead and creates nothing. */
  async promote(id: Id, actorId?: Id | null): Promise<PromoteSignalResult> {
    return this.tx.run(async (handle) => {
      const boundTenantId = this.tenant?.boundTenantId();
      const signal = handle && boundTenantId
        ? await this.store.getForUpdateWithClient(handle, boundTenantId, id)
        : await this.scoped(id);
      if (!signal) throw new NotFoundException(`Signal ${id} not found`);
      this.assert(actorId, signal.tenantId, signal.companyId, SIGNAL_UPDATE);
      this.assert(actorId, signal.tenantId, signal.companyId, LEAD_CREATE);
      await this.validateOwner(signal.tenantId, signal.ownerId, signal.companyId, true);

      if (signal.status === 'PROMOTED' && signal.promotedLeadId) {
        const existingLead = await this.leads.getForTenant(signal.tenantId, signal.promotedLeadId);
        if (!existingLead) throw new Error(`Signal ${id} is already promoted but its lead is missing`);
        return { idempotentReplay: true, signal, lead: existingLead };
      }
      const lineageLead = await this.leads.findBySignalId(signal.tenantId, signal.id);
      if (lineageLead) {
        // A previous transaction may have created the Lead but failed before linking the Signal.
        // Never create a second Lead or silently repair a contradictory terminal state.
        throw new Error(`Signal ${id} has an existing Lead lineage without PROMOTED state`);
      }

      let accountId = signal.accountId ?? null;
      if (!accountId && signal.accountName) {
        const accountsList = await this.accounts.list({ tenantId: signal.tenantId, limit: 5000 });
        const res = resolveIdentity({ name: signal.accountName }, accountsList.map((a) => ({ id: a.id, name: a.name })));
        if (res.best === 'EXACT' && res.matches.length === 1) accountId = res.matches[0].id;
      }
      const lead = makeLead({
        tenantId: signal.tenantId, companyId: signal.companyId,
        name: signal.accountName ?? signal.title, companyName: signal.accountName,
        source: leadSourceFromSignal(signal), assignedTo: signal.ownerId, signalId: signal.id, accountId,
        requirement: signal.evidence ?? signal.description ?? undefined,
      });
      const promoted = promoteSignal(signal, lead.id, actorId);
      const evs = [
        makeEvent({ type: CRM_EVENT.leadCreated, tenantId: lead.tenantId, companyId: lead.companyId, actorId: actorId ?? null,
          aggregateType: 'crm.lead', aggregateId: lead.id,
          payload: { name: lead.name, companyName: lead.companyName, signalId: signal.id, source: lead.source } }),
        makeEvent({ type: CRM_SIGNAL_EVENT.promoted, tenantId: signal.tenantId, companyId: signal.companyId, actorId: actorId ?? null,
          aggregateType: 'crm.signal', aggregateId: signal.id,
          payload: { leadId: lead.id, source: signal.source, type: signal.type } }),
      ];
      await this.leads.createWithClient(handle, lead);
      await this.store.updateWithClient(handle, promoted);
      await this.events.appendWithClient(handle, evs);
      this.logger.log(`Signal promoted: ${signal.title} (${signal.id}) → lead ${lead.id}`);
      return { idempotentReplay: false, signal: promoted, lead };
    });
  }

  async dismiss(id: Id, reason: string, asDuplicate = false, actorId?: Id | null, note?: string | null): Promise<Signal> {
    return this.tx.run(async (handle) => {
      const boundTenantId = this.tenant?.boundTenantId();
      const existing = handle && boundTenantId
        ? await this.store.getForUpdateWithClient(handle, boundTenantId, id)
        : await this.scoped(id);
      if (!existing) throw new NotFoundException(`Signal ${id} not found`);
      this.assert(actorId, existing.tenantId, existing.companyId, SIGNAL_UPDATE);
      const next = { ...dismissSignal(existing, reason, asDuplicate, note), reviewedBy: actorId ?? existing.reviewedBy };
      const event = makeEvent({
        type: asDuplicate ? CRM_SIGNAL_EVENT.duplicated : CRM_SIGNAL_EVENT.dismissed,
        tenantId: next.tenantId, companyId: next.companyId, actorId: actorId ?? null,
        aggregateType: 'crm.signal', aggregateId: next.id,
        payload: { reason: next.dismissalReason, reasonCode: next.dismissalReasonCode, note: next.dismissalNote, status: next.status, previousStatus: existing.status },
      });
      await this.store.updateWithClient(handle, next);
      await this.events.appendWithClient(handle, [event]);
      return next;
    });
  }

  /** Read-only review payload for the explicit Lead creation confirmation step. */
  async promotionPreview(id: Id, actorId?: Id | null): Promise<SignalPromotionPreview> {
    const signal = await this.scoped(id);
    this.assert(actorId, signal.tenantId, signal.companyId, SIGNAL_UPDATE);
    this.assert(actorId, signal.tenantId, signal.companyId, LEAD_CREATE);
    await this.validateOwner(signal.tenantId, signal.ownerId, signal.companyId, true);
    let accountId = signal.accountId ?? null;
    const matches: SignalPromotionMatch[] = [];
    if (signal.accountId) matches.push({ kind: 'account', id: signal.accountId, label: signal.accountName ?? signal.accountId, exact: true });
    if (signal.contactId) matches.push({ kind: 'contact', id: signal.contactId, label: signal.contactId, exact: true });
    if (!accountId && signal.accountName) {
      const accountsList = await this.accounts.list({ tenantId: signal.tenantId, limit: 5000 });
      const res = resolveIdentity({ name: signal.accountName }, accountsList.map((a) => ({ id: a.id, name: a.name })));
      if (res.best === 'EXACT' && res.matches.length === 1) accountId = res.matches[0].id;
      else if (res.matches.length) for (const m of res.matches.slice(0, 5)) {
        const account = accountsList.find((candidate) => candidate.id === m.id);
        matches.push({ kind: 'account', id: m.id, label: account?.name ?? m.id, exact: false });
      }
    }
    const existing = await this.leads.findBySignalId(signal.tenantId, signal.id);
    if (existing) matches.unshift({ kind: 'lead', id: existing.id, label: existing.name, exact: true });
    const leads = await this.leads.list({ tenantId: signal.tenantId, limit: 5000 });
    const name = (signal.accountName ?? signal.title).trim().toLowerCase();
    for (const candidate of leads) {
      if (candidate.signalId === signal.id || !candidate.companyName) continue;
      if (candidate.companyName.trim().toLowerCase() === name) matches.push({ kind: 'lead', id: candidate.id, label: candidate.name, exact: false });
    }
    if (accountId && this.opportunities) {
      const opps = await this.opportunities.list({ tenantId: signal.tenantId, accountId, limit: 100 });
      for (const opportunity of opps) matches.push({ kind: 'opportunity', id: opportunity.id, label: opportunity.title, exact: false });
    }
    const lead = makeLead({ tenantId: signal.tenantId, companyId: signal.companyId, name: signal.accountName ?? signal.title,
      companyName: signal.accountName, source: leadSourceFromSignal(signal), assignedTo: signal.ownerId, signalId: signal.id,
      accountId, requirement: signal.evidence ?? signal.description ?? undefined });
    return { signal, lead: { name: lead.name, companyName: lead.companyName, source: lead.source, assignedTo: lead.assignedTo,
      accountId: lead.accountId, signalId: lead.signalId, requirement: lead.requirement }, matches };
  }

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async get(id: Id, actorId?: Id | null): Promise<Signal | null> {
    const tenantId = this.tenant?.boundTenantId();
    const signal = tenantId ? await this.store.getForTenant(tenantId, id) : await this.store.get(id);
    if (signal) this.assert(actorId, signal.tenantId, signal.companyId, SIGNAL_READ);
    return signal;
  }
  list(filter?: SignalFilter, actorId?: Id | null): Promise<Signal[]> {
    const scopedFilter = this.scopedFilter(filter);
    const tenantId = scopedFilter.tenantId;
    if (actorId && tenantId) this.assert(actorId, tenantId, null, SIGNAL_READ);
    return this.store.list(scopedFilter);
  }
  listPaged(filter: SignalFilter, page: import('@aura/shared').PageParams, actorId?: Id | null) {
    const scopedFilter = this.scopedFilter(filter);
    const tenantId = scopedFilter.tenantId;
    if (actorId && tenantId) this.assert(actorId, tenantId, null, SIGNAL_READ);
    return this.store.listPaged(scopedFilter, page);
  }

  async summary(filter: SignalFilter = {}, actorId?: Id | null): Promise<SignalSummary> {
    const scopedFilter = this.scopedFilter(filter);
    const tenantId = scopedFilter.tenantId;
    if (actorId && tenantId) this.assert(actorId, tenantId, null, SIGNAL_READ);
    if (this.store.summary) return this.store.summary(scopedFilter);
    const all = await this.store.list({ ...scopedFilter, limit: undefined });
    const open = new Set<SignalStatus>(['NEW', 'REVIEWING', 'RESEARCHING']);
    const tally = (key: (s: Signal) => string) => {
      const m = new Map<string, number>(); for (const s of all) m.set(key(s), (m.get(key(s)) ?? 0) + 1);
      return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
    };
    return { total: all.length, open: all.filter((s) => open.has(s.status)).length,
      new: all.filter((s) => s.status === 'NEW').length, reviewing: all.filter((s) => s.status === 'REVIEWING').length,
      researching: all.filter((s) => s.status === 'RESEARCHING').length, promoted: all.filter((s) => s.status === 'PROMOTED').length,
      dismissed: all.filter((s) => s.status === 'DISMISSED' || s.status === 'DUPLICATE').length,
      highPotential: all.filter((s) => s.confidence >= 70 && open.has(s.status)).length,
      bySource: tally((s) => s.source), byType: tally((s) => s.type) };
  }

  async exportAll(filter: SignalFilter = {}, actorId?: Id | null): Promise<Signal[]> {
    const scopedFilter = this.scopedFilter(filter);
    const tenantId = scopedFilter.tenantId;
    if (actorId && tenantId) this.assert(actorId, tenantId, null, SIGNAL_READ);
    return this.store.exportAll ? this.store.exportAll(scopedFilter) : this.store.list({ ...scopedFilter, limit: undefined });
  }
}
