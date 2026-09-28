#!/usr/bin/env node
/**
 * SEC-01 STAGE 4 — THE AUTHORITY DRAFT FOR THE OWNER (generated; edit this file, not the outputs).
 *
 * For each route on apps/api/src/route-permission-allowlist.json: the permission the guard derives,
 * WHICH shipped roles reach it and through WHICH wildcard (from the compiled role catalogue — run
 * `pnpm --filter @aura/core build` first if the roles changed), and a proposal. It decides nothing
 * about authority: a proposal is either "name it on the roles that reach it today" (no change in who
 * may act) or an explicit question for the owner. Writes sec-01-stage-4-authority-draft.{json,md}.
 *
 *   node docs/reports/full-aura-audit/build-sec01-authority-draft.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const OUT = import.meta.dirname;
const repo = join(OUT, '..', '..', '..');
const audit = await import(pathToFileURL(join(repo, 'apps/api/scripts/route-permission-audit.mjs')).href);
const core = await import(pathToFileURL(join(repo, 'core/dist/identity/standard-elv-roles.js')).href);
const roles = core.STANDARD_ELV_ROLES;
const allow = JSON.parse(readFileSync(join(repo, 'apps/api/src/route-permission-allowlist.json'), 'utf8')).routes;

const matches = (pattern, requested) => {
  if (pattern === '*') return true;
  const p = pattern.split('.'), r = requested.split('.');
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '*') { if (i === p.length - 1) return true; continue; }
    if (p[i] !== r[i]) return false;
  }
  return p.length === r.length;
};

const scanned = audit.scanRoutes();
const byKey = new Map(scanned.map((r) => [audit.routeKey(r), r]));
const scan = [];
for (const key of allow) {
  const r = byKey.get(key);
  if (!r) throw new Error(`allowlisted route not found by the scan: ${key}`);
  const src = readFileSync(join(repo, r.file), 'utf8');
  const [method, route] = key.split(' ');
  const ctrl = (src.match(/@Controller\(\s*['"`]([^'"`]*)['"`]\s*\)/) ?? [])[1] ?? '';
  const handlerPath = route === ctrl ? '' : route.slice(ctrl.length + 1);
  const dec = `@${method[0]}${method.slice(1).toLowerCase()}(`;
  let idx = -1;
  for (const q of ["'", '"', '`']) {
    const i = src.indexOf(`${dec}${q}${handlerPath}${q})`);
    if (i >= 0) { idx = i; break; }
  }
  if (idx < 0 && handlerPath === '') idx = src.indexOf(`${dec})`);
  let handler = null;
  if (idx >= 0) {
    const tail = src.slice(idx, idx + 2500);
    const m = tail.match(/\n\s*(?:async\s+)?([a-zA-Z0-9_]+)\s*\(/);
    handler = m ? m[1] : null;
  }
  const holders = [];
  for (const role of roles) {
    const hit = role.permissions.find((p) => matches(p, r.derived));
    if (hit) holders.push({ role: role.id, name: role.name, via: hit });
  }
  scan.push({ key, derived: r.derived, file: r.file, handler, holders });
}


/** Owner questions. Each lists what happens TODAY and the default this draft would ship if accepted. */
const DECISIONS = [
  { id: 'D-01', title: 'Finance authority acts — payments, journals, bank reconciliation',
    match: (d) => ['finance.payment.create', 'finance.journal.create', 'finance.bank-transaction.reconcile', 'finance.bank-transaction.unreconcile'].includes(d),
    question: 'Today the Finance role alone records a payment, posts a manual journal and reconciles or un-reconciles a bank line, each through an entity wildcard, with no second person. Keep that (the Finance role, by name), or require a checker (e.g. the Finance Controller) for some of them — and if so, above what amount?' },
  { id: 'D-02', title: 'VAT return — generate and change status (filing)',
    match: (d) => d.startsWith('finance.vat-return.'),
    question: 'Today the Finance role generates a VAT return and moves it to filed and to paid. Keep that, or reserve filing for the Finance Controller?' },
  { id: 'D-03', title: 'Bank guarantees and post-dated cheques — status changes',
    match: (d) => d === 'finance.bank-guarantee.status' || d === 'finance.post-dated-cheque.status',
    question: 'Today the Finance role changes a bank guarantee\'s or post-dated cheque\'s status (a guarantee released or claimed; a cheque deposited, cleared, bounced or cancelled). Keep that, or require the Finance Controller?' },
  { id: 'D-04', title: 'Engineering review authority — drawings, submittals, design changes, documents, BIM versions',
    match: (d) => ['engineering.drawing.review', 'engineering.drawing.start-review', 'engineering.submittal.status', 'engineering.design-change.decision', 'engineering.document.transition', 'engineering.bim-model.version'].includes(d),
    question: 'Today only the Technical Manager (through engineering.*) reviews drawings, sets submittal status, decides design changes and moves engineering documents. Keep the Technical Manager alone, or add another reviewer (e.g. a Design Manager) — and must the reviewer differ from the author?' },
  { id: 'D-05', title: 'RFI answers',
    match: (d) => d === 'engineering.rfi.answer',
    question: 'Today the Project Engineer and the Technical Manager may both answer an RFI. Keep both?' },
  { id: 'D-06', title: 'Project variation status',
    match: (d) => d === 'projects.variation.status',
    question: 'Today the Project Manager and the Commercial Manager may BOTH move a project variation\'s status, including approving it — one person could raise and approve. Keep, or split (PM raises/submits, Commercial Manager approves)?' },
  { id: 'D-07', title: 'Project closeout finalisation and delay status',
    match: (d) => d === 'projects.closeout.finalize' || d === 'projects.delay.status',
    question: 'Today the PM alone finalises a closeout, and the Planning Engineer and PM set a delay\'s status. Keep?' },
  { id: 'D-08', title: 'Acts NO business role can perform today — project status, WBS baseline, cash-flow forecast, delivery item maps',
    match: (d) => ['projects.project.status', 'projects.project.wbs-baseline', 'projects.cashflow-forecast.create', 'projects.delivery-item-map.create'].includes(d),
    question: 'Only the System Administrator can change a project\'s status, approve its WBS baseline, save a cash-flow forecast or create the delivery-item maps certified billing needs. Who should: the PM, the Planning Engineer, the Commercial Manager?' },
  { id: 'D-09', title: 'Authority approvals (Civil Defence, SIRA, utilities) — the compliance module',
    match: (d) => d.startsWith('compliance.'),
    question: 'Only the System Administrator can register an authority, open a compliance case, submit to it, schedule an inspection, record a decision or issue a certificate — the /compliance screen exists, but every act on it is refused for everyone else. Who owns authority approvals: the Document Controller, a Project Engineer, a dedicated Authority Approvals role?' },
  { id: 'D-10', title: 'ELV device register',
    match: (d) => d.startsWith('elv.device.'),
    question: 'Only the System Administrator can register an ELV device, change its status or link it to commissioning. Who should: the T&C Engineer, the Technical Engineer, the Store (on receipt)?' },
  { id: 'D-11', title: 'Generic documents — upload, new version, share, revoke a share',
    match: (d) => d.startsWith('documents.'),
    question: 'The generic document routes (outside each module\'s own upload screens) are System-Administrator-only. Should the Document Controller hold them — and may any staff member share a document they can already read?' },
  { id: 'D-12', title: 'Estimation, pricing intelligence and AI completion',
    match: (d) => d === 'estimation.line.create' || d.startsWith('intelligence.') || d === 'ai.complete.create',
    question: 'Only the System Administrator can run a line estimate, record a pricing source, trigger calibration or call AI completion. Who should: the Estimator, Pre-Sales, the Executive? (AI access will later be an AI Center setting; this is the default until then.)' },
  { id: 'D-13', title: 'Sales Manager–only CRM acts — outcome override, pricing policy, the pre-award package',
    match: (d) => ['crm.opportunity.override', 'crm.opportunity.policy', 'crm.opportunity.estimate', 'crm.opportunity.open', 'crm.opportunity.revision', 'crm.opportunity.scope', 'crm.opportunity.build-ups', 'crm.opportunity.lines', 'crm.opportunity.preview'].includes(d),
    question: 'Only the Sales Manager (through crm.*) can override an opportunity outcome, set a pricing policy, or add an estimate / open pricing / add scope on the pre-award package. These routes are live: the commercial panel, the estimation workspace (build-ups) and package pricing (pricing policy) call them, so by the role catalogue an Estimator or Pre-Sales engineer working there is refused unless they also hold Sales Manager. Is that intended, or should the Estimator and Pre-Sales hold the estimate, build-up and scope acts? (Not yet reproduced in the browser — read from the catalogue.)' },
];

const STAFF_PERSONAL = (d) => d.startsWith('work-items.') || d === 'notifications.read.update' || d.startsWith('views.');
const ADMINISTRATION = (d) => d.startsWith('builder.') || d.startsWith('templates.') || d === 'workspace.config.update' || d.startsWith('integration.webhook.') || d === 'events.event.create';
const MACHINE = (d) => d === 'fleet.telemetry.webhook' || d === 'whatsapp.webhook.create';

const nonAdmin = (r) => r.holders.filter((h) => h.role !== 'r-admin');

const rows = scan;
const out = rows.map((r) => {
  const holders = nonAdmin(r);
  const today = holders.length ? holders.map((h) => `${h.role} (${h.via})`).join(', ') : 'r-admin only (*)';
  const decision = DECISIONS.find((x) => x.match(r.derived));
  let proposal;
  if (decision) proposal = { kind: 'owner-decision', decision: decision.id, default: holders.length ? `name ${r.derived} on ${[...new Set(holders.map((h) => h.role))].join(', ')} (unchanged holders) — pending ${decision.id}` : `no default — ${decision.id} must name a role` };
  else if (MACHINE(r.derived)) proposal = { kind: 'machine-inbound', default: 'not a role question: an inbound webhook must authenticate by signature, not by a user permission — separate security item' };
  else if (ADMINISTRATION(r.derived)) proposal = { kind: 'stays-administration', default: `name ${r.derived} on r-admin — system administration, not business authority` };
  else if (STAFF_PERSONAL(r.derived)) proposal = { kind: 'staff-personal', default: `name ${r.derived} in STAFF_BASE — the user's own tasks, notifications and saved views` + (holders.length ? '' : ' (today NOBODY but the admin can save a view or favourite a page)') };
  else proposal = { kind: 'name-on-current-holders', default: `name ${r.derived} on ${[...new Set(holders.map((h) => h.role))].join(', ')} — no change in who may act` };
  return { route: r.key, handler: r.handler, file: r.file, derived: r.derived, today, proposal };
});

const count = (k) => out.filter((o) => o.proposal.kind === k).length;
const summary = {
  'name-on-current-holders': count('name-on-current-holders'),
  'staff-personal': count('staff-personal'),
  'stays-administration': count('stays-administration'),
  'machine-inbound': count('machine-inbound'),
  'owner-decision': count('owner-decision'),
};
if (Object.values(summary).reduce((a, b) => a + b, 0) !== rows.length) throw new Error('unclassified route');

writeFileSync(`${OUT}/sec-01-stage-4-authority-draft.json`, JSON.stringify({
  date: '2026-09-28', status: 'DRAFT — for the owner; nothing here is applied',
  source: 'apps/api/src/route-permission-allowlist.json (151 routes) × core/src/identity/standard-elv-roles.ts',
  summary, decisions: DECISIONS.map(({ id, title, question }) => ({ id, title, question, routes: out.filter((o) => o.proposal.decision === id).map((o) => o.route) })),
  routes: out,
}, null, 2) + '\n');

const esc = (s) => String(s).replace(/\|/g, '\\|');
const table = (head, body) => `| ${head.join(' | ')} |\n| ${head.map(() => '---').join(' | ')} |\n${body.map((r) => `| ${r.map(esc).join(' | ')} |`).join('\n')}`;

let md = `# SEC-01 stage 4 — authority draft (for the owner)\n\n`;
md += `**Status: DRAFT, 2026-09-28. Nothing in this document is applied.** It answers one question for each of the ${rows.length} routes still on \`route-permission-allowlist.json\`: who can perform it TODAY, and through which grant. Every one of them is reachable only through a wildcard, so the role list does not say who holds the authority — this document does.\n\n`;
md += `It proposes nothing that changes who may act, except where it asks. Each route is in one of five groups:\n\n`;
md += `- **Name on current holders (${summary['name-on-current-holders']})** — a business role already reaches it, through an entity or module wildcard. Stage 4 writes the permission down by name on the same roles. No change in who may act, so no owner decision is needed; whether a further role should ALSO hold one of these (e.g. the Sales role for account maintenance the Sales Manager alone reaches today) is not decided here.\n`;
md += `- **Staff personal (${summary['staff-personal']})** — a user's own work items, notifications and saved views. Named in the staff base every role carries. Saved views and favourites are today reachable by the System Administrator ONLY, so nobody else can save a view or favourite a page — a defect, fixed by naming them.\n`;
md += `- **Stays administration (${summary['stays-administration']})** — form/approval builder, templates, workspace configuration, integration webhooks, event emission. Named on the System Administrator: this IS system administration, and it is not business authority.\n`;
md += `- **Machine inbound (${summary['machine-inbound']})** — inbound webhooks (fleet telemetry, WhatsApp). Not a role question: they must authenticate by signature. Listed as a separate security item.\n`;
md += `- **Owner decision (${summary['owner-decision']})** — the acts below. The draft's default is to keep today's holders, by name; where today's holder is only the System Administrator, there is no default and a role must be chosen.\n\n`;
md += `Owner principles this draft follows (2026-09-28): company configuration ≠ platform security; system administration ≠ business authority (today the System Administrator holds \`*\`, so it can do every act below — removing that is a separate, deliberate migration, see configuration candidate CC-07); configuration changes ≠ historical changes.\n\n`;
md += `## Decisions for the owner\n\n`;
for (const d of DECISIONS) {
  const rs = out.filter((o) => o.proposal.decision === d.id);
  md += `### ${d.id} — ${d.title}\n\n${d.question}\n\n`;
  md += table(['Route', 'Handler', 'Permission', 'Who can today'], rs.map((o) => [`\`${o.route}\``, o.handler ?? '', `\`${o.derived}\``, o.today])) + '\n\n';
}
md += `## Every route\n\n`;
md += table(['Route', 'Permission', 'Group', 'Who can today', 'Proposal'], out.map((o) => [`\`${o.route}\``, `\`${o.derived}\``, o.proposal.kind + (o.proposal.decision ? ` ${o.proposal.decision}` : ''), o.today, o.proposal.default])) + '\n';
writeFileSync(`${OUT}/sec-01-stage-4-authority-draft.md`, md);
console.log(JSON.stringify(summary));
