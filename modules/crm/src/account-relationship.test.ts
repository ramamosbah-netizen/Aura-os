import { describe, it, expect, vi } from 'vitest';
import { NullTxRunner, type EventStore } from '@aura/core';
import {
  RELATIONSHIP_READING,
  ACCOUNT_RELATIONSHIP_TYPES,
  makeAccountRelationship,
} from './domain/account-relationship';
import { makeAccount } from './domain/account';
import { makeLead } from '@aura/shared';
import { AccountRelationshipService } from './account-relationship.service';
import { InMemoryAccountRelationshipStore } from './in-memory-account-relationship-store';
import { InMemoryAccountStore } from './in-memory-account-store';
import { InMemoryLeadStore } from './in-memory-lead-store';

const events = () =>
  ({
    append: vi.fn().mockResolvedValue(undefined),
    appendWithClient: vi.fn().mockResolvedValue(undefined),
  }) as unknown as EventStore;

function build() {
  const rels = new InMemoryAccountRelationshipStore();
  const accounts = new InMemoryAccountStore();
  const leads = new InMemoryLeadStore();
  const ev = events();
  const service = new AccountRelationshipService(rels, accounts, leads, ev, new NullTxRunner());
  return { service, accounts, leads, ev };
}

describe('G6 account relationship domain', () => {
  it('refuses a self-link', () => {
    expect(() =>
      makeAccountRelationship({ tenantId: 't1', fromAccountId: 'a', toAccountId: 'a', type: 'influences' }),
    ).toThrow('cannot be related to itself');
  });

  it('every relationship type has a reading for both directions', () => {
    for (const t of ACCOUNT_RELATIONSHIP_TYPES) {
      expect(RELATIONSHIP_READING[t].forward).toBeTruthy();
      expect(RELATIONSHIP_READING[t].inverse).toBeTruthy();
    }
  });

  it('party type defaults to null — never guessed', () => {
    expect(makeAccount({ tenantId: 't1', name: 'Acme' }).partyType).toBeNull();
    expect(makeAccount({ tenantId: 't1', name: 'Acme', partyType: 'consultant' }).partyType).toBe('consultant');
  });
});

describe('G6 AccountRelationshipService', () => {
  it('links two accounts, emits the event, and renders the edge from BOTH sides', async () => {
    const { service, accounts, ev } = build();
    const consultant = makeAccount({ tenantId: 't1', name: 'Alpha Consultants', partyType: 'consultant' });
    const developer = makeAccount({ tenantId: 't1', name: 'Emaar', partyType: 'developer' });
    await accounts.create(consultant);
    await accounts.create(developer);

    await service.link({ tenantId: 't1', fromAccountId: consultant.id, toAccountId: developer.id, type: 'influences' });
    expect(ev.appendWithClient).toHaveBeenCalledOnce();

    const fromSide = await service.graphFor(consultant.id, 't1');
    expect(fromSide.edges).toHaveLength(1);
    expect(fromSide.edges[0].direction).toBe('outbound');
    expect(fromSide.edges[0].reading).toBe('influences');
    expect(fromSide.edges[0].account.name).toBe('Emaar');
    expect(fromSide.edges[0].account.partyType).toBe('developer');

    const toSide = await service.graphFor(developer.id, 't1');
    expect(toSide.edges[0].direction).toBe('inbound');
    expect(toSide.edges[0].reading).toBe('influenced by');
    expect(toSide.edges[0].account.name).toBe('Alpha Consultants');
  });

  it('refuses the same edge twice, a missing party, and a cross-tenant party', async () => {
    const { service, accounts } = build();
    const a = makeAccount({ tenantId: 't1', name: 'A' });
    const b = makeAccount({ tenantId: 't1', name: 'B' });
    const foreign = makeAccount({ tenantId: 't2', name: 'Foreign' });
    await accounts.create(a);
    await accounts.create(b);
    await accounts.create(foreign);

    await service.link({ tenantId: 't1', fromAccountId: a.id, toAccountId: b.id, type: 'partner_of' });
    await expect(
      service.link({ tenantId: 't1', fromAccountId: a.id, toAccountId: b.id, type: 'partner_of' }),
    ).rejects.toThrow('already');
    await expect(
      service.link({ tenantId: 't1', fromAccountId: a.id, toAccountId: 'b0b0b0b0-0000-0000-0000-000000000000', type: 'partner_of' }),
    ).rejects.toThrow('not found');
    await expect(
      service.link({ tenantId: 't1', fromAccountId: a.id, toAccountId: foreign.id, type: 'partner_of' }),
    ).rejects.toThrow('not found');
  });

  it('unlink removes the edge; unknown or cross-tenant ids refuse', async () => {
    const { service, accounts } = build();
    const a = makeAccount({ tenantId: 't1', name: 'A' });
    const b = makeAccount({ tenantId: 't1', name: 'B' });
    await accounts.create(a);
    await accounts.create(b);
    const rel = await service.link({ tenantId: 't1', fromAccountId: a.id, toAccountId: b.id, type: 'supplier_to' });

    await expect(service.unlink(rel.id, 't2')).rejects.toThrow('not found');
    await service.unlink(rel.id, 't1');
    expect((await service.graphFor(a.id, 't1')).edges).toHaveLength(0);
  });

  it('surfaces leads that name the account as consultant / main contractor (G4 text → G6 link)', async () => {
    const { service, accounts, leads } = build();
    const consultant = makeAccount({ tenantId: 't1', name: 'Alpha Consultants', partyType: 'consultant' });
    await accounts.create(consultant);
    await leads.create(
      makeLead({
        tenantId: 't1',
        name: 'Layla Hassan',
        consultant: 'alpha consultants', // case/space-insensitive match
        projectName: 'Marina Hotel Retrofit',
      }),
    );

    const graph = await service.graphFor(consultant.id, 't1');
    expect(graph.leadMentions).toHaveLength(1);
    expect(graph.leadMentions[0].role).toBe('consultant');
    expect(graph.leadMentions[0].projectName).toBe('Marina Hotel Retrofit');
  });
});
