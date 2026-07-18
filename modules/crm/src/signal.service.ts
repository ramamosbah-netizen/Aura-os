import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type AccessTarget, type Id, type OrgLevel, makeEvent,
  type Signal, type NewSignal, type SignalStatus, type Lead, type LeadSource,
  makeSignal, advanceSignal, promoteSignal, dismissSignal, makeLead,
  CRM_SIGNAL_EVENT, CRM_EVENT,
} from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';
import { CRM_SIGNAL_STORE, type SignalFilter, type SignalStore } from './signal-store';
import { CRM_LEAD_STORE, type LeadStore } from './lead-store';

export interface PromoteSignalResult {
  /** True when the signal was already promoted — the existing lead is returned, nothing new created. */
  idempotentReplay: boolean;
  signal: Signal;
  lead: Lead;
}

/** Map a signal source onto the (narrower) lead source enum — attribution is also carried
 * verbatim via lead.signalId, so this is only the coarse bucket the lead funnel understands. */
function leadSourceFromSignal(s: Signal): LeadSource {
  // Warm existing-relationship signals are referrals, not 'other' (they degraded to 'other' before,
  // losing the fact that the lead came from a relationship we already had).
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
  ) {}

  private assert(actorId: Id | null | undefined, tenantId: Id, companyId: Id | null): void {
    if (!actorId) return;
    const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
    if (companyId) orgPath.push({ level: 'company', id: companyId });
    const target: AccessTarget = { permission: 'crm.account.create', orgPath };
    this.access.assert(actorId, target);
  }

  /** Detect a signal. Idempotent on dedupeKey — a reactor re-firing returns the live signal
   * instead of stacking duplicates (growth-reactor invariant). */
  async create(input: NewSignal & { actorId?: Id | null }): Promise<Signal> {
    this.assert(input.actorId, input.tenantId, input.companyId ?? null);

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

  async advance(id: Id, to: 'REVIEWING' | 'RESEARCHING' | 'WATCHING', actorId?: Id | null): Promise<Signal> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`Signal ${id} not found`);
    this.assert(actorId, existing.tenantId, existing.companyId);
    const next = advanceSignal(existing, to);
    await this.store.update(next);
    return next;
  }

  /** Watch mode: Park the signal if the timing isn't right, to be automatically reactivated later. */
  async watch(id: Id, actorId?: Id | null): Promise<Signal> {
    return this.advance(id, 'WATCHING', actorId);
  }

  /** Merge multiple signals into one, preserving evidence and tracing lineage. */
  async mergeSignals(targetId: Id, sourceIds: Id[], reason: string, actorId?: Id | null): Promise<Signal> {
    const target = await this.store.get(targetId);
    if (!target) throw new Error(`Target signal ${targetId} not found`);
    this.assert(actorId, target.tenantId, target.companyId);

    const mergedEvidences: string[] = [];
    const relatedIds = new Set(target.relatedSignalIds);

    for (const sid of sourceIds) {
      if (sid === targetId) continue;
      const source = await this.store.get(sid);
      if (!source) continue;
      
      // Accumulate evidence and trace relationships
      if (source.evidence) mergedEvidences.push(`[From ${source.title}]: ${source.evidence}`);
      relatedIds.add(source.id);
      source.relatedSignalIds.forEach(id => relatedIds.add(id));

      // Mark the source signal as duplicate/merged
      const dismissedSource = dismissSignal(source, `Merged into ${targetId}: ${reason}`, true);
      dismissedSource.mergeReason = reason;
      dismissedSource.mergedBy = actorId ?? null;
      dismissedSource.mergedAt = new Date().toISOString();
      dismissedSource.timeline.push({ event: `Merged into ${targetId}`, at: new Date().toISOString() });
      await this.store.update(dismissedSource);
    }

    const nextTarget = {
      ...target,
      relatedSignalIds: Array.from(relatedIds),
      evidence: target.evidence 
        ? `${target.evidence}\n\nMerged Evidence:\n${mergedEvidences.join('\n')}`
        : mergedEvidences.join('\n'),
      timeline: [...target.timeline, { event: `Merged with ${sourceIds.length} signals`, at: new Date().toISOString() }],
      updatedAt: new Date().toISOString()
    };

    await this.store.update(nextTarget);
    return nextTarget;
  }

  /** Promote a signal to a Lead — one transaction, preserving source attribution (lead.signalId +
   * lead.source) and the forward link (signal.promotedLeadId). Idempotent: a promoted signal
   * returns its existing lead and creates nothing. */
  async promote(id: Id, actorId?: Id | null): Promise<PromoteSignalResult> {
    const signal = await this.store.get(id);
    if (!signal) throw new Error(`Signal ${id} not found`);
    this.assert(actorId, signal.tenantId, signal.companyId);

    if (signal.status === 'PROMOTED' && signal.promotedLeadId) {
      const existingLead = await this.leads.get(signal.promotedLeadId);
      if (!existingLead) throw new Error(`Signal ${id} is already promoted but its lead is missing`);
      return { idempotentReplay: true, signal, lead: existingLead };
    }

    const lead = makeLead({
      tenantId: signal.tenantId,
      companyId: signal.companyId,
      name: signal.accountName ?? signal.title,
      companyName: signal.accountName,
      source: leadSourceFromSignal(signal),
      assignedTo: signal.ownerId,
      signalId: signal.id, // lineage back to the originating signal
      // Carry what the signal already KNEW so the rep doesn't re-type it at qualification (zero re-entry).
      // (The account itself is matched by companyName at Convert — the Lead has no accountId field.)
      requirement: signal.evidence ?? signal.description ?? undefined,
    });
    const promoted = promoteSignal(signal, lead.id);

    const evs = [
      makeEvent({
        type: CRM_EVENT.leadCreated, tenantId: lead.tenantId, companyId: lead.companyId, actorId: actorId ?? null,
        aggregateType: 'crm.lead', aggregateId: lead.id,
        payload: { name: lead.name, companyName: lead.companyName, signalId: signal.id, source: lead.source },
      }),
      makeEvent({
        type: CRM_SIGNAL_EVENT.promoted, tenantId: signal.tenantId, companyId: signal.companyId, actorId: actorId ?? null,
        aggregateType: 'crm.signal', aggregateId: signal.id,
        payload: { leadId: lead.id, source: signal.source, type: signal.type },
      }),
    ];

    await this.tx.run(async (handle) => {
      await this.leads.createWithClient(handle, lead);
      await this.store.updateWithClient(handle, promoted);
      await this.events.appendWithClient(handle, evs);
    });
    this.logger.log(`Signal promoted: ${signal.title} (${signal.id}) → lead ${lead.id}`);
    return { idempotentReplay: false, signal: promoted, lead };
  }

  async dismiss(id: Id, reason: string, asDuplicate = false, actorId?: Id | null): Promise<Signal> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`Signal ${id} not found`);
    this.assert(actorId, existing.tenantId, existing.companyId);
    const next = dismissSignal(existing, reason, asDuplicate);

    const event = makeEvent({
      type: CRM_SIGNAL_EVENT.dismissed, tenantId: next.tenantId, companyId: next.companyId, actorId: actorId ?? null,
      aggregateType: 'crm.signal', aggregateId: next.id, payload: { reason: next.dismissalReason, status: next.status },
    });
    await this.tx.run(async (handle) => {
      await this.store.updateWithClient(handle, next);
      await this.events.appendWithClient(handle, [event]);
    });
    return next;
  }

  get(id: Id): Promise<Signal | null> {
    return this.store.get(id);
  }
  list(filter?: SignalFilter): Promise<Signal[]> {
    return this.store.list(filter);
  }
  listPaged(filter: SignalFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }
}
