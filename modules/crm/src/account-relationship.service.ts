import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';
import { CRM_EVENT, type Account } from './domain/account';
import {
  RELATIONSHIP_READING,
  makeAccountRelationship,
  type AccountRelationship,
  type NewAccountRelationship,
} from './domain/account-relationship';
import { CRM_ACCOUNT_STORE, type AccountStore } from './account-store';
import { CRM_ACCOUNT_RELATIONSHIP_STORE, type AccountRelationshipStore } from './account-relationship-store';
import { CRM_LEAD_STORE, type LeadStore } from './lead-store';

/** One edge as seen from a given account: the OTHER party + how the edge reads from here. */
export interface GraphEdge {
  relationshipId: Id;
  direction: 'outbound' | 'inbound';
  /** The edge verb as read from this side ("influences" out, "influenced by" in). */
  reading: string;
  type: AccountRelationship['type'];
  notes: string | null;
  createdAt: string;
  account: { id: Id; name: string; partyType: Account['partyType']; status: Account['status'] };
}

/** A lead that NAMES this account as consultant/main contractor — a link waiting to be made real. */
export interface LeadMention {
  leadId: Id;
  leadName: string;
  role: 'consultant' | 'main_contractor';
  projectName: string | null;
}

export interface AccountGraph {
  accountId: Id;
  edges: GraphEdge[];
  /** Derived on read from the G4 lead text fields — G6 is where those names become real links. */
  leadMentions: LeadMention[];
}

/**
 * G6 — the account relationship graph. Owns the typed directed edges between
 * accounts and answers "who surrounds this party?" in one read: the edges (both
 * directions, each rendered from this account's side) plus the leads that name
 * this account as consultant / main contractor in G4's free-text fields.
 */
@Injectable()
export class AccountRelationshipService {
  private readonly logger = new Logger('CRM');

  constructor(
    @Inject(CRM_ACCOUNT_RELATIONSHIP_STORE) private readonly store: AccountRelationshipStore,
    @Inject(CRM_ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(CRM_LEAD_STORE) private readonly leads: LeadStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
  ) {}

  /** Record a directed edge. Both parties must exist in the tenant; the same edge twice is refused. */
  async link(input: NewAccountRelationship): Promise<AccountRelationship> {
    const rel = makeAccountRelationship(input); // self-link + unknown type refused here
    const [from, to] = await Promise.all([this.accounts.get(rel.fromAccountId), this.accounts.get(rel.toAccountId)]);
    if (!from || from.tenantId !== rel.tenantId) throw new Error(`account ${rel.fromAccountId} not found`);
    if (!to || to.tenantId !== rel.tenantId) throw new Error(`account ${rel.toAccountId} not found`);
    const dup = await this.store.find(rel.tenantId, rel.fromAccountId, rel.toAccountId, rel.type);
    if (dup) throw new Error(`${from.name} is already ${RELATIONSHIP_READING[rel.type].forward} ${to.name}`);

    const event = makeEvent({
      type: CRM_EVENT.accountLinked,
      tenantId: rel.tenantId,
      companyId: rel.companyId,
      actorId: rel.createdBy,
      aggregateType: 'crm.account',
      aggregateId: rel.fromAccountId,
      payload: { toAccountId: rel.toAccountId, relationshipType: rel.type },
    });
    await this.tx.run(async (handle) => {
      await this.store.createWithClient(handle, rel);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Account linked: ${from.name} ${rel.type} ${to.name}`);
    return rel;
  }

  async unlink(id: Id, tenantId: Id): Promise<void> {
    const rel = await this.store.get(id);
    if (!rel || rel.tenantId !== tenantId) throw new Error(`relationship ${id} not found`);
    const event = makeEvent({
      type: CRM_EVENT.accountUnlinked,
      tenantId: rel.tenantId,
      companyId: rel.companyId,
      actorId: null,
      aggregateType: 'crm.account',
      aggregateId: rel.fromAccountId,
      payload: { toAccountId: rel.toAccountId, relationshipType: rel.type },
    });
    await this.tx.run(async (handle) => {
      await this.store.deleteWithClient(handle, id);
      await this.events.appendWithClient(handle, [event]);
    });
  }

  /** The account's neighbourhood: every edge (rendered from this side) + lead mentions. */
  async graphFor(accountId: Id, tenantId: Id): Promise<AccountGraph> {
    const anchor = await this.accounts.get(accountId);
    if (!anchor || anchor.tenantId !== tenantId) throw new Error(`account ${accountId} not found`);

    const rels = await this.store.listFor(tenantId, accountId);
    const otherIds = [...new Set(rels.map((r) => (r.fromAccountId === accountId ? r.toAccountId : r.fromAccountId)))];
    const others = new Map<string, Account>();
    for (const other of await Promise.all(otherIds.map((id) => this.accounts.get(id)))) {
      if (other) others.set(other.id, other);
    }

    const edges: GraphEdge[] = rels.flatMap((r) => {
      const outbound = r.fromAccountId === accountId;
      const other = others.get(outbound ? r.toAccountId : r.fromAccountId);
      if (!other) return []; // half-deleted edge — never invent a party
      return [{
        relationshipId: r.id,
        direction: outbound ? 'outbound' as const : 'inbound' as const,
        reading: RELATIONSHIP_READING[r.type][outbound ? 'forward' : 'inverse'],
        type: r.type,
        notes: r.notes,
        createdAt: r.createdAt,
        account: { id: other.id, name: other.name, partyType: other.partyType, status: other.status },
      }];
    });

    // G4 captured consultant/main contractor as NAMES; surface the leads naming THIS account
    // so the text can graduate into an account + edge instead of staying a string forever.
    const name = anchor.name.trim().toLowerCase();
    const leadMentions: LeadMention[] = (await this.leads.list({ tenantId, limit: 5000 }))
      .flatMap((l) => {
        const out: LeadMention[] = [];
        if (l.consultant?.trim().toLowerCase() === name)
          out.push({ leadId: l.id, leadName: l.name, role: 'consultant', projectName: l.projectName ?? null });
        if (l.mainContractor?.trim().toLowerCase() === name)
          out.push({ leadId: l.id, leadName: l.name, role: 'main_contractor', projectName: l.projectName ?? null });
        return out;
      });

    return { accountId, edges, leadMentions };
  }
}
