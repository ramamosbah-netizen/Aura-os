// Slice-5 PROOF — AURA Scope Assist on live Postgres, fully isolated (BEGIN…ROLLBACK), nothing left.
//
// Proves, through the POSTGRES stores + services on one rolled-back client:
//   • tenant/evidence ISOLATION: generating for tenant A cites only A's evidence, even when the model
//     returns a perfect cross-tenant citation (app-layer WHERE + domain provenance filter).
//   • generation changes NO other lifecycle state; the proposal round-trips through the store.
//   • the DB immutability trigger rejects any content UPDATE and any DELETE.
//   • Accept ≠ Approve: accept produces a DRAFT basis; a second accept is refused.
// Run: pnpm --filter @aura/api exec node scripts/scope-assist-proof.mjs
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import pg from 'pg';
import {
  PostgresScopeAssistStore, PostgresPreAwardStore, PostgresPreAwardPackageStore, PostgresPricingSheetStore,
  ScopeAssistService, PreAwardPackageService, makeRequirement,
} from '@aura/crm';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(apiRoot, '.env.local') });
const cs = (process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL || '').trim();
if (!cs) { console.error('no db url'); process.exit(1); }
const sslOff = /(@|\/\/)(localhost|127\.0\.0\.1)/.test(cs) || /sslmode=disable/.test(cs);
const pool = new pg.Pool({ connectionString: cs, ssl: sslOff ? false : { rejectUnauthorized: false } });
const assert = (c, m) => { if (!c) throw new Error('ASSERT FAILED: ' + m); console.log('  ✓', m); };

async function main() {
  const client = await pool.connect();
  const one = { query: (...a) => client.query(...a) };
  const evidence = new PostgresPreAwardStore(one);
  const saStore = new PostgresScopeAssistStore(one);
  const packages = new PreAwardPackageService(new PostgresPreAwardPackageStore(one), new PostgresPricingSheetStore(one));

  const idsToProbe = {};
  try {
    const src = (await client.query(`select * from public.aura_crm_opportunities where tender_id is null limit 1`)).rows[0];
    if (!src) { console.log('no direct opportunity to clone; nothing to prove on'); return; }
    const tenantA = src.tenant_id;

    await client.query('BEGIN');

    // Two fixture opportunities: A in the real tenant, B in a synthetic OTHER tenant.
    const cloneOpp = async (tenantId) => {
      const id = randomUUID();
      const cols = Object.keys(src);
      const vals = cols.map((c) => (c === 'id' ? id : c === 'tenant_id' ? tenantId : src[c]));
      await client.query(`insert into public.aura_crm_opportunities (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`, vals);
      return id;
    };
    const oppA = await cloneOpp(tenantA);
    const oppB = await cloneOpp('proof-tenant-B');
    idsToProbe.oppA = oppA; idsToProbe.oppB = oppB;
    console.log('fixture oppA', oppA, '(tenant', tenantA + '),  oppB', oppB, '(tenant proof-tenant-B)');

    // IDENTICAL requirement text in both tenants — a perfect semantic match across the boundary.
    const TEXT = '48 IP cameras, NVR, 30-day retention';
    const rA = makeRequirement({ tenantId: tenantA, opportunityId: oppA, title: TEXT, priority: 'must' });
    const rB = makeRequirement({ tenantId: 'proof-tenant-B', opportunityId: oppB, title: TEXT, priority: 'must' });
    await evidence.saveRequirement(rA);
    await evidence.saveRequirement(rB);

    // A model that (wrongly) cites tenant B's requirement id for tenant A's deal.
    const crossTenantAi = { complete: async () => ({ text: JSON.stringify({ items: [{ description: '48 IP cameras', unit: 'no', quantity: 48, provenance: [{ kind: 'requirement', sourceId: rB.id, excerpt: 'cross-tenant' }] }], assumptions: [], gaps: [] }), model: 'stub', provider: 'stub' }) };
    const svc = new ScopeAssistService(saStore, evidence, crossTenantAi, packages);

    const proposal = await svc.generate({ tenantId: tenantA, companyId: src.company_id, opportunityId: oppA, actorId: 'sa-proof' });
    idsToProbe.proposal = proposal.id;
    const provIds = proposal.items.flatMap((i) => i.provenance.map((p) => p.sourceId));
    assert(!provIds.includes(rB.id), 'ISOLATION: the cross-tenant requirement id is NOT cited');
    assert(provIds.length === 1 && provIds[0] === rA.id, 'ISOLATION: provenance grounds ONLY on tenant A\'s own requirement');
    assert(proposal.gaps.some((g) => /not backed by this deal/i.test(g.question)), 'the cross-tenant item was discarded with a recorded gap (no silent fill)');

    // No lifecycle state changed by generation.
    const aggBefore = await packages.readAggregate(tenantA, oppA);
    assert(aggBefore.package === null, 'generation created NO package (no lifecycle change)');

    // Round-trips through the store.
    const readBack = await saStore.get(tenantA, proposal.id);
    assert(readBack && readBack.version === 1 && readBack.status === 'suggested', 'proposal round-trips through the postgres store');

    // DB immutability trigger: content UPDATE and DELETE are rejected. A rejected statement aborts the
    // transaction, so each negative probe runs inside a SAVEPOINT we roll back to keep the txn usable.
    const expectReject = async (sql, msg) => {
      await client.query('SAVEPOINT probe');
      let rejected = false;
      try { await client.query(sql, [proposal.id]); } catch { rejected = true; }
      await client.query(rejected ? 'ROLLBACK TO SAVEPOINT probe' : 'RELEASE SAVEPOINT probe');
      assert(rejected, msg);
    };
    await expectReject(`update public.aura_crm_scope_assist_proposals set items='[]'::jsonb where id=$1`, 'DB trigger rejects a content UPDATE (proposal is immutable)');
    await expectReject(`delete from public.aura_crm_scope_assist_proposals where id=$1`, 'DB trigger rejects a DELETE (append-only)');

    // Accept ≠ Approve: accept makes a DRAFT basis; package now exists but scope NOT approved.
    const { proposal: accepted, basis } = await svc.accept({ tenantId: tenantA, companyId: src.company_id, opportunityId: oppA, proposalId: proposal.id, actorId: 'sa-proof' });
    assert(accepted.status === 'accepted' && accepted.acceptedBasisRevisionId === basis.id, 'accept stamped the proposal + linked the draft basis');
    assert(basis.status === 'draft', 'accept produced a DRAFT basis (editable, not approved)');
    const govAfterAccept = await packages.governance(tenantA, oppA);
    assert(govAfterAccept.governed === true && govAfterAccept.scopeApproved === false, 'Accept ≠ Approve: package opened but scope NOT yet approved');

    // A second accept is refused.
    let reAcceptRejected = false;
    try { await svc.accept({ tenantId: tenantA, companyId: src.company_id, opportunityId: oppA, proposalId: proposal.id }); }
    catch { reAcceptRejected = true; }
    assert(reAcceptRejected, 'a proposal cannot be accepted twice');

    await client.query('ROLLBACK');
    console.log('ROLLBACK done');

    const left = (await client.query(`select 1 from public.aura_crm_scope_assist_proposals where id=$1`, [idsToProbe.proposal])).rowCount
      + (await client.query(`select 1 from public.aura_crm_opportunities where id = any($1::uuid[])`, [[idsToProbe.oppA, idsToProbe.oppB]])).rowCount;
    assert(left === 0, 'NOTHING left behind (proposal + both fixture opportunities gone)');

    console.log('\nPROOF PASSED — Scope Assist is grounded, isolated, immutable, and Accept ≠ Approve.');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* best-effort */ }
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
