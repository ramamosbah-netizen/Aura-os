# AURA OS — Live State Verification & Report-Estate Review

**Date:** 2026-08-05 · **Branch:** `claude/aura-os-reports-review-a32336` (base `8aa27aa`; `main` at `fc665f7`)
**Method:** API rebuilt from source and booted against the live Supabase DB; web dev server booted; findings taken from HTTP responses, boot logs, the migrations table, and `grep` over the working tree. **Nothing here is an estimate.** Where a number is not measured, this report says so instead of supplying one.

**Two jobs:** (1) verify what the platform actually does right now, and (2) review the documentation estate — **all 182 markdown files** across `docs/` and `/analysis` — for accuracy and put it in order.

---

## 1. Headline

The platform **boots clean and works**. The verification found no new functional defect. What it did find is a **gap between what the reports claim and what the tree does** — five claims of "0 remaining" or "complete" that are not, one report asserting `PRODUCTION READY` against a tree whose dev instance answers unauthenticated requests with live data, and one measured score cited for three weeks after a better measurement superseded it.

**And one it found in this report.** §2.2 originally claimed production could deploy with no auth gate at all. It cannot — the gate exists and exits 1. That claim is retracted in place rather than quietly edited out, because a report about verification discipline that hides its own miss is worth nothing. The pattern is identical to the ones it criticises: a conclusion drawn from one line read in isolation.

The single most useful output of this pass is not a bug. It is this: **the running build had drifted from source, and the first live check of a "fixed" feature failed because of it.** Any verification that skips "does the running build match HEAD" is measuring a ghost.

---

## 2. What was verified live

### 2.1 The app runs

| Check | Result |
|---|---|
| API boot (`node apps/api/dist/main.js`) | ✅ `AURA OS API listening on http://localhost:4000/api/v1` |
| `/health` | ✅ `{"status":"ok", schema:{upToDate:true, applied:224, onDisk:219, pending:[]}}` |
| Web dev server (`pnpm --filter @aura/web dev`) | ✅ serving; `/`, `/crm/overview`, `/operations/overview`, `/inventory/serials` all **200** |
| Event spine | ✅ `Pipeline projection ready — replayed 1153 event(s) across 1 tenant(s)` |
| Cross-module reactors | ✅ registered (CRM → Tender → Contract → Project + operate loop) |
| Notification subscribers | ✅ 9 registered (`po.approved`, `ipc.certified`, `tender.awarded`, …) |
| Approval matrix seed | ✅ `u-admin/u-approver (unlimited) · u-director (≤500k) · u-manager (≤50k)` |
| AI platform | ✅ 9 agents + tools registered; ⚠️ `No ANTHROPIC_API_KEY — LOCAL fallback mode (no model calls)` |

### 2.2 Security posture — and a finding I got wrong

```
WARN [AuthService] Auth OFF (no AUTH_JWKS_URL / AUTH_JWT_SECRET) — requests run as the dev default
WARN [Bootstrap] ⚠️ DB connection role "postgres" bypasses row-level security (superuser/BYPASSRLS)
                 — RLS policies are INERT and tenant isolation is app-code-only.
```

| Probe (no token) | Result |
|---|---|
| `GET /api/v1/crm/opportunities` | **200 · 34 records** |
| `GET /api/v1/crm/accounts` | **200 · 35 records** |
| `GET /api/v1/auth/status` | `{"enabled":false}` |

**⚠️ Correction (added 2026-08-05, after this section was first written).** The paragraph that stood here claimed auth "still has no gate at all" and called it the last P0. **That was wrong, and it was wrong in the direction that does most damage: it invented a hole.**

`apps/api/src/main.ts:52-63` already refuses to boot in production when no verifier is configured. **Measured:** `NODE_ENV=production` with no `AUTH_JWKS_URL`/`AUTH_JWT_SECRET` → `FATAL: … Refusing to boot open`, **exit code 1**, never listens. `ALLOW_INSECURE_NO_AUTH=true` is a deliberate escape hatch for gateway-fronted deployments.

The error came from reading `main.ts:101` — `enforce = AUTH_REQUIRED==='true' || (isProd && auth.enabled)` — in isolation, concluding production could fall through it, and never reading the 40 lines above. `:101` governs anonymous-request rejection *once the app is running*; in the scenario I described the process has already exited.

**What is actually true:** the dev default runs with auth off, which is the documented staged pass-through, and the local instance is a dev instance. That is a much smaller finding than the one this report originally carried, and the difference matters to anyone deciding whether this platform can be deployed.

### 2.3 P1-3 (global search) — now genuinely closed, and how it nearly wasn't

| Query | Result |
|---|---|
| `?q=Dome` | ✅ `4MP Dome Camera — DS-2CD-E2E2` (project *Tower A*) + `…-E2E1` (in stock) |
| `?q=DS-2CD` | ✅ both units |
| `?q=camera` | ✅ 3 POs + both serials |
| `?q=Hikvision` | ⚠️ **1 Purchase Order only** — no SKU, no unit |

The serial→site→warranty lookup works. **The flagship demo query does not**, because the seeded catalogue is generic (`4MP Dome Camera` / `CAM-4MP-DOME`) with no manufacturer or model. The capability is closed; the demonstration is not. That is a seed-data job (P2-2), not a search job.

**The stale-build trap.** The first run of this check returned `[]` for every query. Source was correct, the unit tests were green, and the feature was still broken in the running app — `apps/api/dist` was built before the fix merged, and `dist/search/search.service.js` contained no `Stock Item` branch at all. `pnpm --filter @aura/api build` + restart fixed it. Had this check been run against the stale build and written up, the report would have "disproved" a working feature.

### 2.4 UI token/hex sweep — the "0 remaining" claims are not accurate

Measured by `grep -rl` over `apps/web`, excluding `.next/` build output:

| Token / colour | Claimed | Measured 2026-08-05 |
|---|:--:|---|
| `var(--surface…)` | 0 | ✅ **0** |
| `#2563eb` | 0 | ✅ **0** |
| `placeholder="uuid"` | 0 | ✅ **0** |
| `var(--fg)` | 0 | ❌ **3** — `apps/web/app/globals.css:895, :944, :947` |
| `#d97706` | 0 | ❌ **4 in 3 files** |

The three `var(--fg)` survivors are the ones that matter: `--fg` is undefined in both palettes (the real token is `--text`), and they style `.fe-collapsible:hover`, `.fe-tab:hover` and `.fe-tab.active` — so the **form engine's active tab silently loses its colour.** This is precisely the bug class the migration existed to kill; the sweep covered `.tsx` and missed three lines in the global stylesheet. The `#d97706` survivors are two hardcoded values in `hr/document-expiry` and two dead `var(--warn, #d97706)` fallbacks.

### 2.5 New finding — migration history drift (logged as P2-8)

`aura_migrations` holds **224 rows against 219 files on disk.** Applied but no longer present:

```
0055_finance_vat_returns.sql
0064_contracts_payment_certificates.sql
0178_backfill_account_name_snapshot.sql
0180_backfill_account_name_snapshot.sql   ← same backfill, applied twice under two numbers
0204_project_cost_accrual.sql
```

Renumbering artifacts from stacked-PR rebases. Nothing is broken today, and `upToDate: true` is honest — the gate asks only *"is anything pending?"*. But this is the **same shape as the P0-2 coverage bug** that took migration `0218` to fix: a file changed after it was applied never re-runs, so CI on a fresh schema stays green while the long-lived database quietly diverges. The gate should also warn on applied-but-absent filenames.

### 2.6 Performance — one claim retired for lack of evidence

| Path | Dev-server response |
|---|---|
| `/` | 6.0s |
| `/crm/overview` | 1.6s |
| `/operations/overview` | 1.0s |
| `/inventory/serials` | 1.2s |
| API `/admin/companies` (the homepage's own call) | **0.54s** |

The 6.0s on `/` reproduces the audit's "~5–7s first paint" — **but this is the Next.js dev server, where the figure is dominated by on-demand compilation, and the API behind that page answers in half a second.** No production build was measured. "~5–7s first paint" should not be quoted as a production number until someone measures `next build && next start`.

### 2.7 Confirmed unchanged

- **P1-4 (field/mobile):** `apps/web/public/` is empty — no manifest, no service worker. Offline capture remains the largest wholly-untouched item in the register.
- **P1-1 (orphan scan):** `infrastructure/orphan-references.json` carries **19** references, as claimed.

---

## 3. The report estate — what was wrong and what was done

90 documents in `docs/reports/`, no index, and the `/analysis` audit had already flagged the sprawl ("Normalize naming; archive superseded reports", `09-CODE-QUALITY-REPORT.md:32`).

### 3.1 Accuracy problems found

| # | Problem | Where | Action |
|---|---|---|---|
| 1 | `PRODUCTION READY` verdict on a tree that serves unauthenticated data and runs RLS-inert | `2026-07-19-master-platform-status.md` | ⛔ SUPERSEDED banner with a claim-vs-verified table |
| 2 | "Production Candidate" status, now three weeks stale | `2026-07-19-technical-architecture-assessment.md` | 🗄️ HISTORICAL banner |
| 3 | **904 lines duplicated verbatim** — sections 7/8/9 appeared twice; the first copy's §9 was a broken render claiming **0** domain events, the second had the real **399** | `2026-07-19-master-platform-status.md` | Duplicate removed, §9 repaired (2573 → 1661 lines, no content lost) |
| 0 | **This report's own §2.2** — claimed production deploys with no auth gate; it exits 1. Retracted in place, with the measurement | this file | ❌ **RETRACTED** — see §2.2 |
| 4 | "The close-out re-audit is still outstanding" — it ran on 2026-07-20 and measured **87/100**, E2E gate PASS | `2026-07-17-journey-direct-sale.md`, `2026-07-17-crm-operating-review.md` | Both updated; score history 82 → 85 → **87** recorded in one place |
| 5 | **Dangling citation:** `2026-07-17-journey-direct-sale-rerun.md` cited by three documents as the source of the 85/100 — **no such file in the repo** | 3 documents | ✅ **RECOVERED** — see below; citations now resolve |
| 6 | "AURA OS is fully productionized and ready for pilot customer deployment" — a 22/22 build result inflated into a platform verdict | `2026-07-24-walkthrough-ai-platform-phases1-4.md` | Rewritten to the claim actually verified, with a pointer to the readiness audit |
| 7 | Five "0 remaining"/"complete" claims, two of them wrong (§2.4) | `2026-08-03-enterprise-readiness-audit.md` | Corrected inline with a measured table |
| 8 | 7 files with no extension and spaces in the name (`walkthrough 1 24-07-2026`) | `docs/reports/` | Renamed to `YYYY-MM-DD-slug.md` |
| 9 | 8 more files undated in the name despite dated content | `docs/reports/` | Renamed to the same convention — **every file is now `YYYY-MM-DD-*.md`** |
| 10 | No index; no way to tell a live report from a July snapshot | `docs/reports/` | [README.md](README.md) added — every report with a status |

### 3.1a The missing report was found — in a stash

The 85/100 re-run report **was written**. It had been left uncommitted in `git stash@{0}` on an unrelated branch (`claude/crm-signal-promote`, alongside a large Sales-Radar WIP) and surfaced by accident during this session. It is now committed at [2026-07-17-journey-direct-sale-rerun.md](2026-07-17-journey-direct-sale-rerun.md), and the three documents that described it as missing have been corrected.

Reading it confirms the citations were sound: **85/100**, up +3 from 82, with User Guidance 7→8 and Discoverability 7→8 from the Deal-Room consolidation and the Commercial Workspace. It also earned its keep — it surfaced the direct-path progression gap (a completed direct sale showed "Contract —" on its opportunity because the 360 read only `c.tenderId`, never `quotation.convertedContractId`), which became PR-CRM-3.

**So nothing downstream was wrong, and that is exactly what makes this worth recording.** For three weeks a cited score had no reachable evidence behind it. Anyone auditing the repo would have found three documents pointing at a file that wasn't there, and no way to tell whether the number was real or invented — which is the same position as a fabricated score, from the reader's side. **A report that is written but not committed does not exist.** The always-export rule is not paperwork; this is the failure it prevents.

### 3.2 The rest of `docs/` — 91 more documents

The first pass covered `docs/reports/` only. Extending it to the whole documentation set (**182 markdown files** across `docs/` and `/analysis`) found one more accuracy failure, and it is the most consequential one in the estate:

**`master-report/vol-23-gap-analysis.md` marks P0 row 2 — "Auth ON by default" — as ✅ DONE.** It is not. `apps/api/src/main.ts:101`:

```ts
const enforce = process.env.AUTH_REQUIRED === 'true' || (isProd && auth.enabled);
```

Enforcement needs an explicit opt-in, **or** production *plus a verifier already configured*. `auth.enabled` is false whenever neither `AUTH_JWKS_URL` nor `AUTH_JWT_SECRET` is set — so **a production deploy without a verifier gets `enforce === false` and an API that runs wide open.** The error log at `:103` only fires when `AUTH_REQUIRED` was set; the silent path prints nothing at all.

The mechanism itself is real and everything the row lists works — fail-closed 401, public allowlist, `LoginThrottle`, `jti` revocation, refresh/logout. What was recorded as done is the *build*; what was never true is the *default*. A reader consulting the gap register would conclude auth was handled. Row corrected to ◑ with the evidence, in both Vol 23 and Vol 7 §11.

Independently, `/analysis/06-SECURITY-AUDIT.md:28` had already named the exact risk — *"the risk is a production deploy that never flips it"* — four days before the readiness audit. Two audits found it; the gap register still said ✅.

**Other work across the wider set:**

| Document | Finding | Action |
|---|---|---|
| `master-report/README.md` | Health board; update notes stop at **2026-07-11**, ~1 month stale | Currency banner — volumes sound as reference, status/gap columns not current |
| `master-report/vol-07-security.md` | P-list rows 1–2 both marked done | Both re-scoped to ◑ with live evidence (RLS built-but-inert; auth opt-in) |
| `roadmap/AURA-FINAL-GAP-REGISTER.md` | Its two P0s have shipped; **it does not contain the P0 that now matters most** | Status banner reconciling both rows + naming the missing one |
| `roadmap/AURA-FINAL-EXECUTION-ROADMAP.md` | Still says R1 "BUILD THIS FIRST"; R1–R5 shipped, R6 never started | Progress banner; slice specs kept as the authority |
| `/analysis` (17 docs, 2026-08-01) | **Holds up entirely** — both headline security findings re-confirmed against the running app | Re-confirmation note; 2 debt rows closed; the ~58% vs 54/100 apparent conflict reconciled |
| 6 founding blueprints (June 2026) | Several still read *"no code is written until each phase is approved"* | Marked historical via the new index |
| `docs/AURA-0.2-MASTER-BLUEPRINT.md` | Cites `AURA-0.2-CONSOLIDATION-AUDIT.md` — **not in the repo**; the only broken link in 182 files | Noted inline; pointed at the blueprint that supersedes it |
| `docs/` as a whole | No top-level entry point — the gap `/analysis` §4 flagged | [docs/README.md](../README.md) added |

**Link integrity across all 182 documents is now zero broken links.**

### 3.3 What was deliberately *not* deleted

The five AI-platform walkthroughs (`phase1` → `phases1-4` → `phase6-1` → `phase6`) read like redundant snapshots, and `phase6` does supersede `phase6-1` at the summary level. They were kept: each documents implementation detail (migration numbers, service names) the later one drops, and for a project whose reports *are* its record, deleting distinct detail costs more than one extra file. They are labelled as a series in the index instead. Likewise the two same-day `2026-07-01` due-diligence reports are genuinely different audits, not copies.

**The only content deleted in this pass was the 904-line verbatim duplicate.**

---

## 4. What to do next

1. **Flip `DATABASE_URL` to the least-privilege `aura_app` role.** Now the only true P0, and it is configuration, not code — everything else in the RLS bundle is built, gated and CI-proven. See [the runbook](../runbooks/rls-tenant-isolation.md).
2. **Fix the 3 `var(--fg)` lines in `globals.css`.** Two-minute fix; it restores the form engine's active tab. Then the P2-3 claim becomes true.
3. **Clean demo seed (P2-2).** Now blocking two other things: the ELV search demo has nothing branded to find, and CRM close-out is holding on the duplicated MAF accounts. Seed real ELV brand/model SKUs.
4. **Warn on applied-but-absent migrations (P2-8).** Small change to the gate; closes the drift class that already cost one production-coverage bug.
5. **Re-measure first paint against a production build** before treating P2-5's latency half as real.
6. **Re-run the 12-area readiness assessment** when the auth gate lands. **54/100 stays the quotable figure until then** — a lot has merged since, but merged rows are not a measured score.

---

## 5. Verification provenance

Commands and probes behind every number above: `node apps/api/dist/main.js` (boot log); `curl` against `/health`, `/auth/status`, `/crm/opportunities`, `/crm/accounts`, `/search?q=…`, `/admin/companies`, and four web routes; `select filename from public.aura_migrations` vs `ls infrastructure/migrations`; `grep -rl` over `apps/web` for four token/colour patterns; a markdown link-checker over all 90 reports.

Not measured, and therefore not claimed anywhere in this report: the 12-area readiness score, any journey score, production-build performance, test-suite results, and functional completeness percentages.
