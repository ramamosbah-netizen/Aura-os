// AURA OS performance baseline (gap register Vol 23 #15).
// Hammers the key read endpoints with warmup + timed rounds and reports p50/p95/max
// against per-endpoint budgets. Run with the API up:
//   node scripts/perf-baseline.mjs [--base http://localhost:4000] [--n 50] [--enforce]
// --enforce exits 1 on any budget breach (CI perf smoke); default is report-only.

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const BASE = opt('base', process.env.AURA_API_URL ?? 'http://localhost:4000');
const N = Number(opt('n', '50'));
const ENFORCE = args.includes('--enforce');

// Budgets (ms, p95) — the documented ceilings. Simple lists stay under 150ms;
// aggregate/report endpoints under 400ms; health under 50ms. Revisit per release.
const TARGETS = [
  { name: 'health', path: '/api/v1/health', p95: 50 },
  { name: 'crm accounts (bare)', path: '/api/v1/crm/accounts', p95: 150 },
  { name: 'crm accounts (paged)', path: '/api/v1/crm/accounts/paged?limit=50', p95: 150 },
  { name: 'projects list', path: '/api/v1/projects/projects', p95: 150 },
  { name: 'finance invoices (paged)', path: '/api/v1/finance/invoices/paged?limit=50', p95: 200 },
  { name: 'AP aging (report)', path: '/api/v1/finance/invoices/aging', p95: 400 },
  { name: 'AR aging (report)', path: '/api/v1/finance/customer-invoices/aging', p95: 400 },
  { name: 'workspace config', path: '/api/v1/workspace/config', p95: 150 },
  { name: 'events feed', path: '/api/v1/events', p95: 200 },
  { name: 'site instructions (paged)', path: '/api/v1/site/instructions/paged?limit=50', p95: 150 },
];

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

async function measure(t) {
  // warmup (JIT, connection pool, route cache)
  for (let i = 0; i < 5; i++) await fetch(`${BASE}${t.path}`).catch(() => null);
  const times = [];
  let failures = 0;
  for (let i = 0; i < N; i++) {
    const s = performance.now();
    try {
      const res = await fetch(`${BASE}${t.path}`);
      if (!res.ok) failures++;
      await res.arrayBuffer();
    } catch {
      failures++;
    }
    times.push(performance.now() - s);
  }
  times.sort((a, b) => a - b);
  return {
    name: t.name,
    path: t.path,
    n: N,
    failures,
    p50: +pct(times, 50).toFixed(1),
    p95: +pct(times, 95).toFixed(1),
    max: +times[times.length - 1].toFixed(1),
    budget: t.p95,
    pass: failures === 0 && pct(times, 95) <= t.p95,
  };
}

const health = await fetch(`${BASE}/api/v1/health`).catch(() => null);
if (!health?.ok) {
  console.error(`✗ API not reachable at ${BASE} — start it first (pnpm --filter @aura/api start).`);
  process.exit(1);
}

console.log(`AURA OS perf baseline — ${BASE}, n=${N}/endpoint (after 5 warmups)\n`);
const results = [];
for (const t of TARGETS) results.push(await measure(t));

const w = Math.max(...results.map((r) => r.name.length));
console.log(`${'endpoint'.padEnd(w)}  p50(ms)  p95(ms)  max(ms)  budget  result`);
for (const r of results) {
  console.log(
    `${r.name.padEnd(w)}  ${String(r.p50).padStart(7)}  ${String(r.p95).padStart(7)}  ${String(r.max).padStart(7)}  ${String(r.budget).padStart(6)}  ${r.pass ? 'PASS' : 'FAIL'}${r.failures ? ` (${r.failures} errors)` : ''}`,
  );
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} within budget.`);
if (args.includes('--json')) console.log(JSON.stringify(results, null, 2));
if (ENFORCE && failed.length > 0) process.exit(1);
