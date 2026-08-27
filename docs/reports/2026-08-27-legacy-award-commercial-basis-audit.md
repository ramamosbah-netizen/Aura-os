# Legacy tender awards with no pinned commercial basis — audit

**Date:** 2026-08-27 · **Status:** 🔴 **BLOCKED on data** — instrument built and proven, target environment unreachable
**Subject:** what happens to tenders awarded BEFORE the commercial-basis model (ADR-0021 follow-up, migration 0256, commit `2d309feb`)
**Rule observed:** no policy is proposed in this report. Counts first.

---

## 1. The blocking finding

**There is no staging or production database reachable from this repository.**

Measured, not assumed — the complete set of connection variables in `apps/api/.env.local`:

| Variable | Points at |
|---|---|
| `DATABASE_URL` | the dev Supabase, app role `aura_app` |
| `MIGRATION_DATABASE_URL` | the same dev database, owner role |
| `DIRECT_URL` | the same dev database, direct (non-pooled) |

`apps/api/.env.example` declares only `PORT`. `infrastructure/` holds `migrations/` and `observability/` and no environment definitions. `.github/workflows/ci.yml` references "production" only as a *posture* under test (a fail-closed boot check), never as a deployment target with credentials.

So the audit that matters — the one against real awarded tenders — **cannot be run from here**. It needs someone holding staging/production credentials.

### The dev database proves nothing, and said so

The first run of the audit reported `0` for every cohort. That number is **void**, and the script now refuses to print it. The role is `aura_app`, which is `NOBYPASSRLS`; every tenant-scoped `aura_*` table is `ENABLE` + `FORCE ROW LEVEL SECURITY` (migrations 0163/0164); and the policy is `tenant_id = current_tenant_id() AND current_tenant_id() IS NOT NULL`. With no tenant bound, `current_tenant_id()` is `NULL`, so **that session sees zero rows in every table whether or not any exist**.

A "0" from that session is indistinguishable from a database full of legacy awards. The script now exits `3` rather than report it:

```
❌ REFUSING TO REPORT — this role cannot bypass RLS and no tenant is bound.
   current_user=aura_app  current_tenant_id()=NULL
```

This is the single most important property of the instrument. An audit that under-reports to zero would have retired the whole question on a false negative.

---

## 2. Findings that do NOT need the row counts

These come from the schema and the control path, and they already constrain the policy menu.

### 2.1 "Awaiting commercial basis" is currently INVISIBLE

The task framed option 1 as *"leave legacy awards permanently basis-less and visible as 'awaiting commercial basis'."* The second half is not true today.

| Surface | `commercialBasis` present? |
|---|---|
| `aura_tendering_tenders.commercial_basis` (DB) | yes (0256) |
| `modules/tendering` domain + store | yes |
| `apps/api` controller + reactor | yes |
| **`packages/sdk`** | **no — zero occurrences** |
| **`apps/web`** | **no — zero occurrences** |

The only thing a human ever sees is a server log line in the reactor:

> `⚡ tender.awarded → NO contract for "…": awaiting commercial basis.`

A won tender that silently produces no contract, with no UI state saying why, is discovered when someone goes looking for a contract that was never coming. **Option 1 is therefore not a no-op** — as written it is a build (surface the state), not a decision to do nothing.

### 2.2 No operator-driven link path exists

`TenderService.linkCommercialBasis` has exactly **one** caller in the whole tree: the `crm.commercial_baseline.locked` reactor (`apps/api/src/events/cross-module-subscriber.ts:532`). There is no controller, no route, no DTO, no SDK method.

So option 3 ("an operator asserts the link") is also a build, not a configuration change. Its cost is a governed command + route + permission + UI, not a script.

### 2.3 The old resolver was already non-deterministic — which is the real argument against a backfill

`findTenderBaseline` (still defined at `cross-module-subscriber.ts:186`, now called from the *quotation* path only) ranked quotations `accepted(0) > approved(1) > sent(2)` and took the first that had a baseline. Two properties matter for any retroactive picker:

1. **Ties within a rank are resolved by list order**, not by any commercial fact. Two `accepted` quotations on one tender with different baselines had no defined winner.
2. **"Best status" and "latest lock" are different answers.** Both are defensible. Neither is the customer's.

A backfill script must choose one. Where those two pickers disagree, the script would be *inventing* provenance at an arbitrary later date — precisely what the pin removed. **Cohort E exists to count exactly this**, and it is the group that decides whether any scripted option is admissible at all.

### 2.4 `locked_at` may PREDATE the award

The proposed one-off backfill would record `POST_AWARD_LINKED` with the baseline's own `locked_at` as `establishedAt`. But a baseline that locked *before* the award is not a post-award link at all — it is a basis that existed at award time and was simply never captured, because the capture code did not exist yet.

Recording it as `POST_AWARD_LINKED` would make a false historical claim, and `kind` is exactly the field 0256 says must never collapse:

> `kind` is AT_AWARD … or POST_AWARD_LINKED …. They are different historical claims and must never collapse into one.

The audit therefore splits the linkable cohort three ways — `BASELINE_PREDATES_AWARD`, `BASELINE_LOCKED_AFTER_AWARD`, `AWARD_DATE_UNKNOWN` — using `aura_events` (`type='tendering.tender.awarded'`) as the only non-invented award timestamp.

### 2.5 Join reality (for whoever runs this)

Cross-module joins are by convention, not FK, and the types differ:

| Column | Type |
|---|---|
| `aura_tendering_tenders.id` | `uuid` |
| `aura_crm_commercial_baselines.source_tender_id` | `text` |
| `aura_contracts_contracts.tender_id` | `text` |
| `aura_crm_commercial_baselines.quotation_id` | `text` |
| `aura_crm_quotations.id` | `uuid` |

Every join casts the `uuid` side and carries `tenant_id`. A hand-written audit that forgets either will silently under-count.

---

## 3. The instrument

`scripts/audit-legacy-award-commercial-basis.mjs` — **strictly read-only**: session set read-only, `BEGIN READ ONLY`, `ROLLBACK` in `finally`. An accidental write raises `25006`. It performs no backfill, re-emits no events, and modifies no reactor.

### Cohorts reported

| # | Cohort | Question it answers |
|---|---|---|
| 1 | won population | cohort A's denominator; splits governed-award / `LEGACY_WON` / never-went-through-`award()` |
| 2 | A = `won ∧ commercial_basis IS NULL` | crossed with baseline-present × contract-present |
| 3 | B(1) = exactly one candidate baseline | the only cohort any scripted link could touch, split by `locked_at` vs award date |
| 4 | **E = two or more candidate baselines** | where a script would have to invent a choice; counts money-moving ambiguity and picker disagreement |
| 5/6 | C+D = contracts already on basis-less tenders | `contract.value` **classified**, never assumed |

Cohort D classifies each contract two independent ways and reports the disagreement:

- **declared provenance** — is `commercial_baseline_id` set, and is it actually a candidate for that tender?
- **measured value** — `MATCHES_A_BASELINE_TOTAL` · `MATCHES_TENDER_ESTIMATE` · `AMBIGUOUS_BOTH_EQUAL` · `MATCHES_NEITHER`

`AMBIGUOUS_BOTH_EQUAL` exists because a contract whose value equals both the baseline total and the tender estimate carries **no evidence** of which one produced it. Reporting it as "baseline-derived" would be a guess. It is reported as ambiguous.

### Proof that it classifies correctly

Running the SQL is not the same as it being right. A fixture covering all eight cases was seeded inside a transaction on dev, the audit's own queries were run against it, and the transaction was **rolled back** (`rows surviving: 0`).

**30/30 assertions passed**, including:

| Assertion | Result |
|---|---|
| tender with a pinned basis excluded from cohort A | ✓ |
| governed award (evidence, no basis) counted separately from `LEGACY_WON` | ✓ |
| `BASELINE_PREDATES_AWARD` / `LOCKED_AFTER_AWARD` / `AWARD_DATE_UNKNOWN` split | ✓ 1 / 1 / 2 |
| two baselines → best-status picks 380,000, latest-lock picks 420,000, **flagged as disagreeing on money** | ✓ |
| contract at the tender estimate → `MATCHES_TENDER_ESTIMATE`, `declares_baseline=false` | ✓ |
| contract at the baseline total, declaring it → `MATCHES_A_BASELINE_TOTAL`, candidate confirmed | ✓ |

### How to run it

```bash
AUDIT_DATABASE_URL='postgres://…' node scripts/audit-legacy-award-commercial-basis.mjs --detail=50
```

`--json` emits machine-readable output.

#### Credential handling (USER ruling, 2026-08-27)

**Do not persist a staging/production URL into `apps/api/.env.local`.** A production credential sitting beside the dev configuration is a standing invitation to run the next command against the wrong environment. Use a **temporary, least-privilege, read-only** credential, passed for the invocation only.

The script is built to match that rule:

- **`AUDIT_DATABASE_URL` only — there is deliberately no fallback to `DATABASE_URL`.** With the fallback, running this in any ordinary shell in this repo would silently audit dev and print those numbers under the same headings as real ones — a plausible wrong answer, the same defect class as the RLS false zero. Verified: with `DATABASE_URL` set and `AUDIT_DATABASE_URL` unset it exits `2` and reads nothing.
- The header names the **server**, not just the database — `host:port/database`, credential never printed. `current_database()` is `postgres` on dev *and* on every Supabase project, so the database name alone cannot tell an operator which environment they just read.

#### Least-privilege audit role

Least privilege here does **not** require `BYPASSRLS`. The RLS policy resolves `app.current_tenant_id`, which any role may set, so a plain `SELECT`-only role works with `--tenants=<id,…>`: the script binds each tenant with `set_config(…, true)` and sums the passes. (A bare `WHERE` clause returns nothing under FORCE RLS — the binding is what grants visibility.)

```sql
-- temporary, read-only, expires on its own
CREATE ROLE aura_audit_ro LOGIN PASSWORD '…' VALID UNTIL '2026-09-03';
ALTER  ROLE aura_audit_ro SET default_transaction_read_only = on;
GRANT  USAGE ON SCHEMA public TO aura_audit_ro;
GRANT  SELECT ON public.aura_tendering_tenders,
                 public.aura_crm_commercial_baselines,
                 public.aura_crm_quotations,
                 public.aura_contracts_contracts,
                 public.aura_events
       TO aura_audit_ro;
-- afterwards:  DROP ROLE aura_audit_ro;
```

Grant `BYPASSRLS` **only** if a whole-database pass is wanted without enumerating tenants first — it is the convenience option, not the secure one.

---

## 4. What is explicitly NOT decided here

- **No policy.** The choice between *leave awaiting basis* · *one-off explicit linking* · *operator-driven linking* waits on cohorts A/B/C/E.
- **No contract is re-valued.** 0256's trigger already refuses to re-base an established basis. A contract built on the old `tender.value` fallback is **surfaced by cohort D and left alone** — its remediation is a separate, explicit decision, and it does not become automatic merely because the audit proves its value equals `Tender.value`.
- **Nothing is committed.** The instrument is proven functional, but the value this task owes is *counts*. It stays uncommitted until a real run is reviewed.
- **No Tender / Contract / reactor change, no backfill, no operator-link UI.**

## 5. Standing constraints on the policy step (USER ruling, 2026-08-27)

Recorded now so the numbers are read against them, not after them.

**A. `E > 0` with a money difference between candidates ⇒ that cohort is disqualified from inferred or scripted linking, from the outset.** Not "harder to justify" — out of scope for any algorithm. It requires additional evidence or a governed human assertion, because *an algorithm cannot reconstruct a historical fact that was never recorded.*

**B. `E = 0` does not authorise a backfill either.** If every legacy award turns out to have exactly one candidate baseline, the question does not become "so link them" — it *changes*:

> from **"is the choice ambiguous?"** to **"do we have provenance sufficient to prove this baseline actually was the historical basis?"**

Uniqueness is not provenance. One surviving candidate today is consistent with several histories — a second quotation that was deleted, a baseline locked for a different purpose, or a bid priced outside AURA entirely. The audit can prove *how many* candidates exist; it cannot prove *that this one governed the award*. Answering B needs evidence beyond these counts.

**The sequence, agreed:**

```
instrument proven → real read-only counts → classify → STOP
      → review evidence → policy decision → (only then) any write
```

### Required output order for the real run

1. total `won`
2. `commercial_basis IS NULL`
3. of those: governed award vs `LEGACY_WON`
4. no-baseline / exactly-one / multiple-baselines
5. the exactly-one split: pre-award / post-award / award-date-unknown
6. cohort E, **with the count of pickers disagreeing on value**
7. basis-less tenders holding contracts, with contract values classified baseline / estimate / both / neither

## 6. Gates

| Gate | Result |
|---|---|
| `pnpm lint` | 0 errors (warnings only) |
| `pnpm typecheck` | 51/51 tasks |
| `pnpm test` | 51/51 tasks · 310/310 api tests |
| `pnpm build` | 27/27 tasks |
| real-Postgres proof | 30/30 fixture assertions, rolled back, 0 rows surviving |
| wrong-environment negative control | `DATABASE_URL` set, `AUDIT_DATABASE_URL` unset → exits `2`, reads nothing |
| RLS false-zero negative control | non-bypass role, no tenant bound → exits `3`, reports nothing |
| credential masking | header prints `host:port/database` only |

No migration was written, so no migration proof is owed. Nothing is committed.
