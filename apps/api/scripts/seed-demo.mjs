#!/usr/bin/env node
// Demo-data seeder — posts a realistic UAE contracting dataset through the live API
// so a fresh instance shows a populated product (deal chain, spend loop, activity)
// instead of empty states. Idempotent-ish: run against a fresh in-memory API.
//
// Usage:
//   AURA_API_URL=http://localhost:4100 node apps/api/scripts/seed-demo.mjs
// Requires the API running with AUTH_JWT_SECRET set (so it can mint a dev token).

const BASE = process.env.AURA_API_URL ?? 'http://localhost:4000';
const USER = process.env.SEED_USER ?? 'u-admin';
const PASS = process.env.SEED_PASS ?? 'demo';

let token = '';

async function api(method, path, body) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
  }
  return res.status === 204 ? null : res.json();
}

const post = (p, b) => api('POST', p, b);
const patch = (p, b) => api('PATCH', p, b);

async function login() {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  if (!res.ok) throw new Error(`login failed (${res.status}). Is AUTH_JWT_SECRET set on the API?`);
  token = (await res.json()).token;
}

// ── Demo dataset ────────────────────────────────────────────────────────────
const ACCOUNTS = [
  { name: 'Emaar Properties', industry: 'Real Estate Development', website: 'emaar.com' },
  { name: 'Aldar Properties', industry: 'Real Estate Development', website: 'aldar.com' },
  { name: 'DP World', industry: 'Ports & Logistics', website: 'dpworld.com' },
  { name: 'Dubai Municipality', industry: 'Government', website: 'dm.gov.ae' },
  { name: 'Majid Al Futtaim', industry: 'Retail & Leisure', website: 'maf.ae' },
];

const LEADS = [
  { name: 'Ahmed Al Mansouri', companyName: 'Emaar Properties', email: 'ahmed@emaar.com', phone: '+971 50 123 4567', source: 'referral' },
  { name: 'Sara Khan', companyName: 'Aldar Properties', email: 'sara.khan@aldar.com', phone: '+971 55 987 6543', source: 'website' },
  { name: 'Mohammed Rashid', companyName: 'DP World', email: 'm.rashid@dpworld.com', phone: '+971 52 445 1122', source: 'event' },
  { name: 'Fatima Hassan', companyName: 'Majid Al Futtaim', email: 'fatima.h@maf.ae', phone: '+971 56 778 9900', source: 'cold_call' },
];

// (title, account index, value, stage)
const OPPS = [
  ['Downtown Tower MEP Fit-Out', 0, 2_500_000, 'won'],
  ['Yas Island Retail Cooling Plant', 1, 4_200_000, 'won'],
  ['Jebel Ali Warehouse Electrical', 2, 1_800_000, 'proposal'],
  ['City Centre Mall HVAC Upgrade', 4, 3_100_000, 'negotiation'],
  ['Marina Residences Plumbing', 0, 950_000, 'qualification'],
];

async function main() {
  console.log(`Seeding demo data → ${BASE}`);
  await login();
  console.log('✓ authenticated');

  // Accounts
  const accounts = [];
  for (const a of ACCOUNTS) {
    accounts.push(await post('/crm/accounts', { ...a, status: 'active_customer' }));
  }
  console.log(`✓ ${accounts.length} accounts`);

  // Leads
  for (const l of LEADS) {
    await post('/crm/leads', { ...l, status: 'new' });
  }
  console.log(`✓ ${LEADS.length} leads`);

  // Opportunities — winning one auto-creates a downstream tender.
  let won = 0;
  for (const [title, acctIdx, value, stage] of OPPS) {
    const acct = accounts[acctIdx];
    const opp = await post('/crm/opportunities', {
      title,
      accountId: acct.id,
      accountName: acct.name,
      value,
      stage: 'qualification',
      winProbability: 30,
    });
    if (stage !== 'qualification') {
      await patch(`/crm/opportunities/${opp.id}`, { stage });
      if (stage === 'won') won++;
    }
  }
  console.log(`✓ ${OPPS.length} opportunities (${won} won → tenders auto-created)`);

  // Contracts from the two won deals, then projects to execute them.
  const deals = [
    { title: 'Downtown Tower MEP Fit-Out', acct: 0, value: 2_500_000, ref: 'CT-2026-001' },
    { title: 'Yas Island Retail Cooling Plant', acct: 1, value: 4_200_000, ref: 'CT-2026-002' },
  ];
  const projects = [];
  for (const d of deals) {
    const acct = accounts[d.acct];
    const contract = await post('/contracts/contracts', {
      title: d.title,
      reference: d.ref,
      accountId: acct.id,
      accountName: acct.name,
      status: 'active',
      value: d.value,
    });
    const project = await post('/projects/projects', {
      title: d.title,
      reference: d.ref.replace('CT', 'PRJ'),
      contractId: contract.id,
      contractTitle: contract.title,
      accountId: acct.id,
      accountName: acct.name,
      status: 'active',
      value: d.value,
    });
    projects.push(project);
  }
  console.log(`✓ ${deals.length} contracts + ${projects.length} projects`);

  // Procurement + finance spend loop on the first project.
  const proj = projects[0];
  const po = await post('/procurement/purchase-orders', {
    title: 'Chillers & AHUs — Downtown Tower',
    reference: 'PO-2026-014',
    supplierName: 'Zamil Air Conditioners',
    projectId: proj.id,
    projectName: proj.title,
    status: 'issued',
    value: 680_000,
  });
  await post('/procurement/purchase-requests', {
    title: 'Copper piping & fittings',
    reference: 'PR-2026-031',
    projectId: proj.id,
    projectName: proj.title,
    status: 'draft',
    value: 120_000,
  });
  await post('/finance/invoices', {
    title: 'Zamil — milestone 1',
    reference: 'INV-2026-088',
    poId: po.id,
    poTitle: po.title,
    supplierName: 'Zamil Air Conditioners',
    projectId: proj.id,
    projectName: proj.title,
    status: 'draft',
    value: 340_000,
  });
  console.log('✓ procurement + finance spend loop (PO, PR, supplier invoice)');

  console.log('\n✅ Demo data seeded. Reload the workspace to see it populated.');
}

main().catch((err) => {
  console.error('\n✗ Seed failed:', err.message);
  process.exit(1);
});
