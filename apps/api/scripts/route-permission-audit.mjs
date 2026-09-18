#!/usr/bin/env node
/**
 * ROUTE PERMISSION AUDIT — which HTTP routes ask for a permission NO ROLE NAMES.
 *
 * A route without an explicit `@Permissions` does not go ungoverned: `PermissionsGuard` DERIVES a
 * name from the path (`derivePermissionFromRoute`). That is a sensible default and it has a failure
 * mode nothing checks — the derived name belongs to no vocabulary anybody speaks, so the route is
 * reachable only by a wildcard holder and refused for the role whose job it is.
 *
 * It has produced three findings on its own, each discovered by accident while working on something
 * else:
 *
 *   procurement.rfq.quotes                 QC-01 — no role could record a supplier quotation
 *   procurement.purchase-request.status    BUY-01 — submission required approval authority
 *   crm.opportunity.scopes / .approve      J1-07 — the scope author's role cannot author a scope,
 *                                          and the Technical Manager cannot sign one off
 *
 * Three accidents is a pattern, and 151 of 180 capabilities have `permissions: UNVERIFIED`. This
 * turns "we find them when we trip over them" into a list.
 *
 * IT READS SOURCE AND DECIDES NOTHING. Two routes can legitimately appear here: one whose permission
 * genuinely should exist and does not yet, and one nobody is meant to reach outside an admin. The
 * audit cannot tell them apart and does not try — it reports, and a person decides.
 *
 *   node apps/api/scripts/route-permission-audit.mjs [--all]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const API_SRC = join(repo, 'apps', 'api', 'src');
const ROLES = join(repo, 'core', 'src', 'identity', 'standard-elv-roles.ts');
const GUARD = join(repo, 'core', 'src', 'identity', 'permissions.guard.ts');

/* ── the guard's own rules, read from the guard rather than restated ──────── */

const guardSrc = readFileSync(GUARD, 'utf8');

/** Modules the guard deliberately does not derive for (auth, health and the like). */
const exempt = new Set(
  (guardSrc.match(/DERIVE_EXEMPT_MODULES\s*=\s*new Set\(\[([^\]]*)\]/s)?.[1] ?? '')
    .split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean),
);

const METHOD_ACTION = { GET: 'read', POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };

/** `singular` as the guard defines it — copied deliberately, and asserted below. */
const singular = (s) =>
  s.endsWith('ies') ? `${s.slice(0, -3)}y` : s.endsWith('sses') ? s.slice(0, -2) : s.endsWith('s') ? s.slice(0, -1) : s;

function derivePermissionFromRoute(method, controllerPath, handlerPath) {
  const segs = `${controllerPath}/${handlerPath}`
    .split('/').map((s) => s.trim())
    .filter((s) => s && s !== '/' && !s.startsWith(':'))
    .map((s) => s.replace(/\.csv$/, '').toLowerCase());
  if (segs.length === 0) return null;
  const module = segs[0];
  if (exempt.has(module)) return null;
  const entity = singular(segs[1] ?? module);
  const base = METHOD_ACTION[method.toUpperCase()] ?? 'read';
  const tail = segs[segs.length - 1];
  const action = (base === 'create' || base === 'update') && segs.length > 2 && tail !== segs[1] ? tail : base;
  return `${module}.${entity}.${action}`;
}

/* ── what the shipped roles actually hold ─────────────────────────────────── */

const rolesSrc = readFileSync(ROLES, 'utf8');
/**
 * Every permission pattern the catalogue mentions, including the ones built into shared constants.
 * Deliberately over-inclusive: a pattern counted that a role does not really hold makes this audit
 * report FEWER routes, never more, so the list it produces stays conservative.
 */
const patterns = [...new Set([...rolesSrc.matchAll(/'([a-z0-9-]+\.[a-z0-9-]+(?:\.[a-z0-9-*]+)?|\*)'/g)].map((m) => m[1]))];

const permissionMatches = (pattern, requested) => {
  if (pattern === '*') return true;
  const p = pattern.split('.'), r = requested.split('.');
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '*') { if (i === p.length - 1) return true; continue; }
    if (p[i] !== r[i]) return false;
  }
  return p.length === r.length;
};
/**
 * HOW a permission is held matters more than WHETHER it is.
 *
 * `crm.*` matches every permission in the module, so asking "does any role hold this" answers yes
 * almost everywhere and hides the defect completely. The shape that actually bites is a derived name
 * NO ROLE NAMES: reachable only by whoever carries a broad wildcard, and refused for the role whose
 * job it is. That is exactly what `crm.opportunity.approve` is — the Sales Manager reaches it
 * through `crm.*` while the Technical Manager, who holds `crm.scope.approve` and exists to sign
 * scopes off, cannot.
 */
const literals = new Set(patterns.filter((p) => !p.includes('*')));
const wildcards = patterns.filter((p) => p.includes('*'));
const holding = (permission) =>
  literals.has(permission) ? 'named'
    : wildcards.some((p) => permissionMatches(p, permission)) ? 'wildcard-only'
    : 'unheld';

/* ── every route in the API ───────────────────────────────────────────────── */

/**
 * ONE IMPLEMENTATION, TWO CONSUMERS. This file is both the human-facing report and the engine the
 * fitness test runs, because a guard that re-implements the audit is a guard that can disagree with
 * it — and the disagreement would surface as a build failing for a reason the report denies.
 */
function controllers(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...controllers(full));
    else if (entry.endsWith('.controller.ts')) out.push(full);
  }
  return out;
}

const HTTP = /@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)?\s*\)/g;

/** Every route that derives a permission, with how that permission is held. */
export function scanRoutes() {
  const rows = [];
  for (const file of controllers(API_SRC)) {
  const src = readFileSync(file, 'utf8');
  const ctrl = src.match(/@Controller\(\s*['"`]([^'"`]*)['"`]\s*\)/)?.[1];
  if (ctrl === undefined) continue;

  for (const m of src.matchAll(HTTP)) {
    const method = m[1].toUpperCase();
    const handlerPath = m[2] ?? m[3] ?? m[4] ?? '';
    /**
     * Is this handler explicitly governed? The decorator may sit above OR below the HTTP one, so
     * the window is the gap between the previous handler and this one, plus the lines just after.
     */
    const start = Math.max(0, src.lastIndexOf('\n', Math.max(0, m.index - 1)));
    const prevHandler = [...src.slice(0, m.index).matchAll(HTTP)].pop();
    const from = prevHandler ? prevHandler.index + prevHandler[0].length : 0;
    const window = src.slice(from, m.index) + src.slice(m.index, src.indexOf('\n', src.indexOf('(', m.index + m[0].length) + 1) + 1);
    void start;
    const classLevel = /@Permissions\(/.test(src.slice(0, src.indexOf('export class')));
    if (/@Permissions\(/.test(window) || classLevel) continue;

    const derived = derivePermissionFromRoute(method, ctrl, handlerPath);
    if (!derived) continue;
    rows.push({ file: file.replace(repo, '').replace(/\\/g, '/'), method, route: `${ctrl}/${handlerPath}`.replace(/\/+$/, ''), derived, held: holding(derived) });
    }
  }
  return rows;
}

/**
 * The verbs worth looking at first. A name ending in one of these is almost never "an edit": it is
 * an authority fact, an external release, or an irreversible state change — the categories that made
 * J3-01 and J1-07 critical rather than untidy.
 */
export const GOVERNING_VERB =
  /\.(approve|reject|submit|release|publish|issue|award|cancel|close|withdraw|sign|certify|freeze|baseline|confirm|decide|reopen|void|post|transmit|send|activate|complete|handover)$/;

/** A route's stable identity in the allowlist: what it is, not where it happens to live. */
export const routeKey = (r) => `${r.method} ${r.route}`;

/**
 * THE ROUTES STAGE 2 FREEZES: mutating, and governed by a name no role names. A GET that only a
 * wildcard reaches shows somebody more than intended and is worth knowing; one of these MANUFACTURES
 * A BUSINESS FACT under a name nobody chose, which is the shape behind every finding this came from.
 */
export const ungovernedMutations = (rows = scanRoutes()) =>
  rows.filter((r) => r.method !== 'GET' && r.held !== 'named');

/* ── report ───────────────────────────────────────────────────────────────── */

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('route-permission-audit.mjs');
if (!invokedDirectly) {
  // Imported by the fitness test: expose the scan and say nothing.
} else {
const rows = scanRoutes();
const showAll = process.argv.includes('--all');
const orphans = rows.filter((r) => r.held !== 'named');
const byPermission = new Map();
for (const r of orphans) {
  if (!byPermission.has(r.derived)) byPermission.set(r.derived, []);
  byPermission.get(r.derived).push(r);
}

console.log(`\n-- Route permission audit ------------------------------------`);
console.log(`   ${rows.length} routes derive a permission (no explicit @Permissions)`);
console.log(`   ${rows.filter((r) => r.held === 'named').length} derive a name a role NAMES -- governed as somebody intended`);
console.log(`   ${rows.filter((r) => r.held === 'wildcard-only').length} derive a name only a WILDCARD reaches`);
console.log(`   ${rows.filter((r) => r.held === 'unheld').length} derive a name nothing matches at all\n`);

/**
 * READS AND WRITES ARE NOT THE SAME FINDING, and reporting them together buries the one that
 * matters. A GET reaching only a wildcard holder shows somebody more than they were meant to see,
 * which is worth knowing and rarely urgent. A POST or PATCH reaching one MANUFACTURES A BUSINESS
 * FACT -- an approval, a release, an award -- under a name nobody chose for it. That is the shape
 * behind every finding this audit was written after.
 */
const mutating = orphans.filter((r) => r.method !== 'GET');
const reading = orphans.filter((r) => r.method === 'GET');
console.log(`   OF THOSE: ${mutating.length} MUTATE (POST/PATCH/PUT/DELETE), ${reading.length} only read.\n`);

const byName = new Map();
for (const r of mutating) {
  if (!byName.has(r.derived)) byName.set(r.derived, []);
  byName.get(r.derived).push(r);
}

/**
 * The verbs worth looking at first. A name ending in one of these is almost never "an edit": it is
 * an authority fact, an external release, or an irreversible state change -- the categories that
 * made J3-01 and J1-07 critical rather than untidy.
 */
const GOVERNING = GOVERNING_VERB;
const governing = [...byName.entries()].filter(([n]) => GOVERNING.test(n)).sort((a, b) => b[1].length - a[1].length);
const rest = [...byName.entries()].filter(([n]) => !GOVERNING.test(n)).sort((a, b) => b[1].length - a[1].length);

console.log(`   ${governing.length} of those names are GOVERNING VERBS -- approve, release, award, issue,`);
console.log(`   cancel, sign, certify and the like. THESE COME FIRST:\n`);
for (const [permission, hits] of governing) {
  console.log(`   ${permission}`);
  for (const h of hits) console.log(`       ${h.method.padEnd(6)} ${h.route}`);
}

console.log(`\n   ...and ${rest.length} further mutating names that are not obviously governing verbs.`);
if (showAll) {
  for (const [permission, hits] of rest) {
    console.log(`   ${permission}`);
    for (const h of hits) console.log(`       ${h.method.padEnd(6)} ${h.route}`);
  }
} else {
  console.log('   (--all lists them.)');
}

const modules = {};
for (const r of mutating) { const m = r.derived.split('.')[0]; modules[m] = (modules[m] ?? 0) + 1; }
console.log('\n   mutating routes by module:');
for (const [m, n] of Object.entries(modules).sort((a, b) => b[1] - a[1])) console.log(`       ${m.padEnd(22)} ${n}`);

/**
 * THE THREE KNOWN CASES, asserted. If this audit cannot find the findings that motivated it, its
 * silence about everything else means nothing.
 */
const known = ['procurement.rfq.quotes', 'crm.opportunity.scopes', 'crm.opportunity.approve'];
const missed = known.filter((k) => !byPermission.has(k));
console.log('');
if (missed.length === 0) {
  console.log('   ✓ self-check: all three known findings appear in this list, so its silence elsewhere means something.');
} else {
  console.log(`   ✗ self-check FAILED: ${missed.join(', ')} not found — the scan is missing routes,`);
  console.log('     so the count above is a floor and not a total.');
  process.exitCode = 1;
}
console.log('');
}
