import { Pool } from 'pg';

// Release-proof workload for Customers. This deliberately reports a baseline instead of
// inventing a latency budget; correctness invariants are the only hard failures.
const databaseUrl = process.env.OWNER_URL ?? process.env.DATABASE_URL;
const apiBase = process.env.AURA_API_URL ?? 'http://localhost:4000';
const tenantId = process.env.VOLUME_TENANT ?? 'volume-proof-tenant';
const counts = { accounts: 10_000, contacts: 40_000, opportunities: 50_000, contracts: 20_000, projects: 20_000, activities: 100_000, invoices: 50_000 };
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl, max: 8 });
const timed = async (label, fn) => {
  const start = performance.now();
  const value = await fn();
  const elapsedMs = +(performance.now() - start).toFixed(1);
  console.log(`${label}: ${elapsedMs} ms`);
  return { value, elapsedMs };
};

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL synchronous_commit = off');
    await client.query(`
      INSERT INTO public.aura_crm_accounts
        (id, tenant_id, company_id, name, status, industry, owner_id, created_by)
      SELECT md5('volume-account-' || g)::uuid, $1, 'volume-company',
             'Volume Account ' || g,
             CASE WHEN g % 10 = 0 THEN 'strategic' WHEN g % 3 = 0 THEN 'active_customer' ELSE 'prospect' END,
             CASE WHEN g % 2 = 0 THEN 'construction' ELSE 'technology' END,
             'u-volume-owner-' || (g % 20), 'volume-proof'
      FROM generate_series(1, $2::int) g
      ON CONFLICT (id) DO NOTHING`, [tenantId, counts.accounts]);
    await client.query(`
      INSERT INTO public.aura_crm_contacts
        (id, tenant_id, company_id, account_id, account_name, name, job_title, email, phone, is_primary, status, owner_id, created_by, stakeholder_role, relationship_strength)
      SELECT md5('volume-contact-' || g)::uuid, $1, 'volume-company',
             md5('volume-account-' || (((g - 1) % $2::int) + 1)),
             'Volume Account ' || (((g - 1) % $2::int) + 1), 'Volume Contact ' || g,
             'Stakeholder', 'volume-' || g || '@example.invalid', '+971500' || lpad(g::text, 6, '0'),
             g % 4 = 0, 'active', 'u-volume-owner-' || (g % 20), 'volume-proof',
             CASE WHEN g % 5 = 0 THEN 'Decision Maker' WHEN g % 3 = 0 THEN 'Champion' ELSE 'Influencer' END,
             CASE WHEN g % 2 = 0 THEN 'strong' ELSE 'medium' END
      FROM generate_series(1, $3::int) g
      ON CONFLICT (id) DO NOTHING`, [tenantId, counts.accounts, counts.contacts]);
    await client.query(`
      INSERT INTO public.aura_crm_opportunities
        (id, tenant_id, company_id, title, value, stage, win_probability, close_date, account_id, account_name)
      SELECT md5('volume-opportunity-' || g)::uuid, $1, 'volume-company', 'Volume Opportunity ' || g,
             (g % 500 + 1) * 1000, CASE WHEN g % 10 = 0 THEN 'won' WHEN g % 7 = 0 THEN 'lost' WHEN g % 3 = 0 THEN 'proposal' ELSE 'qualification' END,
             (g % 100)::numeric, CURRENT_DATE + (g % 180),
             md5('volume-account-' || (((g - 1) % $2::int) + 1)), 'Volume Account ' || (((g - 1) % $2::int) + 1)
      FROM generate_series(1, $3::int) g
      ON CONFLICT (id) DO NOTHING`, [tenantId, counts.accounts, counts.opportunities]);
    await client.query(`
      INSERT INTO public.aura_contracts_contracts
        (id, tenant_id, company_id, title, reference, account_id, account_name, status, value, owner_id, created_by)
      SELECT md5('volume-contract-' || g)::uuid, $1, 'volume-company', 'Volume Contract ' || g, 'VC-' || g,
             md5('volume-account-' || (((g - 1) % $2::int) + 1)), 'Volume Account ' || (((g - 1) % $2::int) + 1),
             CASE WHEN g % 9 = 0 THEN 'cancelled' WHEN g % 2 = 0 THEN 'active' ELSE 'draft' END, (g % 200 + 1) * 5000,
             'u-volume-owner-' || (g % 20), 'volume-proof'
      FROM generate_series(1, $3::int) g
      ON CONFLICT (id) DO NOTHING`, [tenantId, counts.accounts, counts.contracts]);
    await client.query(`
      INSERT INTO public.aura_projects_projects
        (id, tenant_id, company_id, title, reference, account_id, account_name, status, value, owner_id, created_by)
      SELECT md5('volume-project-' || g)::uuid, $1, 'volume-company', 'Volume Project ' || g, 'VP-' || g,
             md5('volume-account-' || (((g - 1) % $2::int) + 1)), 'Volume Account ' || (((g - 1) % $2::int) + 1),
             CASE WHEN g % 5 = 0 THEN 'active' WHEN g % 2 = 0 THEN 'planned' ELSE 'completed' END, (g % 300 + 1) * 7000,
             'u-volume-owner-' || (g % 20), 'volume-proof'
      FROM generate_series(1, $3::int) g
      ON CONFLICT (id) DO NOTHING`, [tenantId, counts.accounts, counts.projects]);
    await client.query(`
      INSERT INTO public.aura_crm_activities
        (id, tenant_id, company_id, type, subject, related_type, related_id, due_date, status, assignee_id, created_by)
      SELECT md5('volume-activity-' || g)::uuid, $1, 'volume-company',
             CASE WHEN g % 4 = 0 THEN 'meeting' ELSE 'task' END, 'Volume Activity ' || g, 'account',
             md5('volume-account-' || (((g - 1) % $2::int) + 1)), CURRENT_DATE::text,
             CASE WHEN g % 6 = 0 THEN 'completed' ELSE 'open' END, 'u-volume-owner-' || (g % 20), 'volume-proof'
      FROM generate_series(1, $3::int) g
      ON CONFLICT (id) DO NOTHING`, [tenantId, counts.accounts, counts.activities]);
    await client.query(`
      INSERT INTO public.aura_finance_customer_invoices
        (id, tenant_id, company_id, invoice_number, customer_name, account_id, issue_date, due_date, lines, subtotal, vat_total, total, amount_paid, status, created_by)
      SELECT md5('volume-invoice-' || g)::uuid, $1, 'volume-company', 'VI-' || g,
             'Volume Account ' || (((g - 1) % $2::int) + 1), md5('volume-account-' || (((g - 1) % $2::int) + 1)),
             CURRENT_DATE - (g % 365), CURRENT_DATE - (g % 60), '[]'::jsonb,
             (g % 200 + 1) * 100, (g % 20) * 10, (g % 200 + 1) * 110, (g % 3) * 100,
             CASE WHEN g % 11 = 0 THEN 'paid' ELSE 'issued' END, 'volume-proof'
      FROM generate_series(1, $3::int) g
      ON CONFLICT (id) DO NOTHING`, [tenantId, counts.accounts, counts.invoices]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function explain() {
  const { rows } = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT a.id, a.name, a.status
    FROM public.aura_crm_accounts a
    WHERE a.tenant_id = $1 AND a.name ILIKE '%' || $2 || '%'
    ORDER BY a.created_at DESC, a.id DESC LIMIT 50`, [tenantId, 'Volume Account 9999']);
  const plan = rows[0]['QUERY PLAN'][0];
  console.log(`EXPLAIN ANALYZE search: ${plan['Execution Time']} ms; plan=${plan.Plan['Node Type']}`);
}

async function apiProof() {
  const login = await fetch(`${apiBase}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'u-admin', password: process.env.AUTH_DEV_PASSWORD ?? 'e2e-password' }) });
  if (!login.ok) throw new Error(`API login failed (${login.status})`);
  const token = (await login.json()).token;
  const get = async (path) => timed(path, async () => {
    const response = await fetch(`${apiBase}${path}`, { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`${path} returned ${response.status}`);
    return response.json();
  });
  const first = (await get(`/api/v1/crm/accounts/portfolio/paged?limit=50&offset=0`)).value;
  const last = (await get(`/api/v1/crm/accounts/portfolio/paged?limit=50&offset=${counts.accounts - 50}`)).value;
  const distant = (await get('/api/v1/crm/accounts/portfolio/paged?limit=50&offset=0&search=Volume%20Account%209999')).value;
  const filtered = (await get('/api/v1/crm/accounts/portfolio/paged?limit=50&offset=0&status=strategic')).value;
  if (first.total !== counts.accounts || last.items.length !== 50 || !distant.items.some((item) => item.name === 'Volume Account 9999')) throw new Error('portfolio pagination/search invariant failed');
  if (first.summary.totalAccounts !== last.summary.totalAccounts || filtered.total !== counts.accounts / 10) throw new Error('portfolio totals/KPI invariant failed');
  console.log(`API proof: total=${first.total}, first=${first.items.length}, last=${last.items.length}, distantSearch=${distant.items.length}, strategic=${filtered.total}`);
}

try {
  console.log(`CRM volume proof tenant=${tenantId}`);
  await timed('seed disposable dataset', seed);
  for (const table of ['aura_crm_accounts', 'aura_crm_contacts', 'aura_crm_opportunities', 'aura_contracts_contracts', 'aura_projects_projects', 'aura_crm_activities', 'aura_finance_customer_invoices']) {
    const { rows } = await pool.query(`SELECT count(*)::int AS count FROM public.${table} WHERE tenant_id = $1`, [tenantId]);
    console.log(`${table}: ${rows[0].count}`);
  }
  await explain();
  await apiProof();
} finally {
  await pool.end();
}
