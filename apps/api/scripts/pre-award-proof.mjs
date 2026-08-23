// One-off PROOF: drive a real DIRECT opportunity through the Pre-Award package lifecycle against the
// live DB (postgres store), watching governance flip. Verifies the Phase-3 write path end-to-end.
// Read-mostly + one deal's writes on dev. Run: pnpm --filter @aura/api exec node scripts/pre-award-proof.mjs
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from 'dotenv';
import pg from 'pg';
import { PostgresPreAwardPackageStore, PreAwardPackageService } from '@aura/crm';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(apiRoot, '.env.local') });
const cs = (process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL || '').trim();
if (!cs) { console.error('no db url'); process.exit(1); }
const sslOff = /(@|\/\/)(localhost|127\.0\.0\.1)/.test(cs) || /sslmode=disable/.test(cs);
const pool = new pg.Pool({ connectionString: cs, ssl: sslOff ? false : { rejectUnauthorized: false } });

async function main() {
  // Pick a DIRECT opportunity (no tender) that has no package yet.
  const { rows } = await pool.query(
    `select o.id, o.tenant_id, o.company_id from public.aura_crm_opportunities o
     where o.tender_id is null
       and not exists (select 1 from public.aura_crm_pre_award_packages p where p.opportunity_id = o.id)
     limit 1`);
  if (!rows.length) { console.log('no un-packaged direct opportunity found (nothing to prove on)'); await pool.end(); return; }
  const { id: oppId, tenant_id: tenantId, company_id: companyId } = rows[0];
  // Bind the tenant GUC on every pooled connection so FORCE-RLS tables accept the writes/reads.
  pool.on('connect', (c) => { c.query("select set_config('app.current_tenant_id', $1, false)", [tenantId]).catch(() => {}); });

  const store = new PostgresPreAwardPackageStore(pool);
  const svc = new PreAwardPackageService(store);
  const show = async (label) => console.log(label, JSON.stringify(await svc.governance(tenantId, oppId)));

  console.log('opportunity', oppId, 'tenant', tenantId);
  await show('before        ');
  const pkg = await svc.openDirect({ tenantId, companyId, opportunityId: oppId, createdBy: 'proof' });
  await show('after open     ');
  const lines = [{ lineId: 'L1', description: 'IP camera', unit: 'no', quantity: 10, sourceLineId: 'S1' }];
  let basis = await svc.addScopeBasis({ tenantId, companyId, packageId: pkg.id, sourceId: 'scope-proof', lines, createdBy: 'proof' });
  basis = await svc.approveScopeBasis(basis, 'proof');
  await show('scope approved ');
  const { estimate } = await svc.addEstimate({ tenantId, companyId, packageId: pkg.id, basisRevisionId: basis.id, lines, buildUps: [{ basisLineId: 'L1', components: [{ costType: 'material', description: 'Camera', quantity: 1, unitCost: 800 }], overheadPercent: 10, profitPercent: 15 }], createdBy: 'proof' });
  const frozen = await svc.freezeEstimateRevision(estimate, 'proof');
  await svc.approveEstimateRevision(frozen, 'proof');
  await show('estimate approv');
  console.log('estimate totals', JSON.stringify(estimate.totals));
  await pool.end();
}
main().catch(async (e) => { console.error(e); try { await pool.end(); } catch { /* ignore */ } process.exit(1); });
