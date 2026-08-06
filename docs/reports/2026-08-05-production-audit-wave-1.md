# AURA OS — Production Readiness Audit · Wave 1 (mechanical)

**Date:** 2026-08-05 · **Scope:** every migration, every event subject, every API route, every page, every service's test coverage, and the shipped source of every module — checked programmatically, so the coverage claim is literal rather than aspirational.

**What this wave cannot tell you:** whether any of it is *correct*. These checks prove structure — that things exist, connect, don't collide and can be reached. Business rules and calculations are wave 2, and that is per-module work. See §4.

---

## Result: the codebase is mechanically clean, with two real defects

| Sweep | Scope | Result |
|---|:--:|---|
| Migration numbering collisions | 219 files | ✅ **0** |
| Migrations missing a `-- @DOWN` revert (policy: required ≥ 0137) | 219 files | ✅ **0** |
| API routes defined twice | 854 routes | ✅ **0** |
| Event subjects subscribed but never emitted (dead reactors) | 310 subjects | ✅ **0** *(one match — `kernel.poison.test` — is deliberate fault injection)* |
| `TODO` / `FIXME` / `HACK` / `XXX` in shipped source | all modules + core + api | ✅ **0** |
| Stub throws (`not implemented`) | all modules + core + api | ✅ **0** |
| Route groups missing an `error.tsx` boundary | every UI route group | ✅ **0** *(only `/api` and `/login`, neither of which needs one)* |
| **Pages with no link anywhere in the app** | 128 static pages | ❌ **4** — fixed below |
| **Services with no test at the service level** | 74 services | ⚠️ **30** — recorded, not fixed |

That most of these come back zero is worth saying plainly: **migration discipline, route hygiene, event wiring and code cleanliness are genuinely in good shape**, and the CI gates that enforce them are doing their job. A 219-migration schema with no numbering collisions and no missing revert blocks is not common.

---

## Finding 1 — four pages nobody could reach ✅ FIXED

Built, routed, rendering `200`, and **linked from nowhere in the application**. No nav entry, no button, no `href` in any component.

| Page | What it is | Fix |
|---|---|---|
| **`/ai`** | The end-user **AI workspace** — the agent surface that five separate reports describe as shipped | Added to Home nav |
| `/notifications` | Full notification history | Added to Home nav |
| `/views` | Saved views across modules | Added to Home nav |
| `/finance/statements/print` | Statement pack print/PDF view | Linked from the statements page |

**`/ai` is the one that should sting.** The repo carries five walkthroughs, an implementation plan and a completion report describing an Enterprise Agent Operating Platform, and the page a user would open to *use* it had no link. It has been unreachable since it was built.

The print view is a smaller version of the same story: every other `/print` page in the platform (12 of them — contracts, quotations, invoices, POs, GRNs, payroll, subcontracts) is linked from its record page. Statements was the one that wasn't.

*Verified after fixing: all four return `200`, and the new entries render in the shell.*

**Why the audit nearly missed this:** the first sweep reported **17** unreachable pages. Twelve were false — the Admin Center builds its tiles from a registry (`admin-nav.ts`) my check didn't read, and `/login` is reached by redirect. Checking those twelve before reporting them is the difference between a finding and a wild goose chase.

---

## Finding 2 — 30 of 74 services have no test at the service level ⚠️ RECORDED

**Stated precisely, because the loose version is wrong:** the *domain* logic under these services **is** tested — statements, budget, schedule, estimate and payment-certificate all have domain test suites covering their calculations. What has no test is the **service layer**: orchestration, guards, event emission, store interaction.

| Module | Untested services |
|---|---|
| **finance** | **8** — BankGuarantee · BankReconciliation · Budget · CostCenter · PettyCash · PostDatedCheque · ProfitCenter · Statements |
| contracts | 4 — Bond · Clause · Obligation · **PaymentCertificate** |
| crm | 4 — Campaign · Contact · InstalledBase · PricingSheet |
| projects | 4 — CashflowForecast · Closeout · DelayEot · Schedule |
| tendering | 4 — BidScore · Clarification · Estimate · WinLoss |
| commissioning | 2 — Commissioning · Handover |
| inventory | 2 — StorageLocation · Transfer |
| doccontrol · procurement | 1 each — Doccontrol · FrameworkAgreement |

**Two stand out.** `PaymentCertificateService` sits on the money cycle — it computes retention, advance recovery and net payable, and its `certify` transition triggers the automatic AR invoice. `StatementsService` produces the three primary financial statements. Both have domain tests beneath them; neither has a test proving the service wires that logic up correctly.

Not fixed here: writing 30 service test suites is its own body of work, and doing it properly means understanding each service's rules — which is wave 2, not wave 1.

---

## What wave 1 deliberately did not check

Honest boundary, so nobody reads this as more than it is:

- **Business rules and calculations.** No module's logic was verified against the ERP rules it implements. Double-entry, WAC, EVM, retention, EOSB, IFRS-15 — all unverified by me.
- **Permissions semantics.** Every route derives a permission (854 of them, mechanically covered) but no check confirms the *right* permission, or that role grants match intent.
- **Workflow correctness.** Events wire up and reactors fire; whether each transition is the right one for an ELV contractor is a domain question.
- **UI behaviour.** Pages render; whether a screen is usable, complete or correct is not something a sweep can answer.

---

## Wave 2 — the plan

Per-module, in this order, each ending with findings fixed and tests added:

1. **finance** — the largest domain (20 files, 15 services) and the one where wrong logic loses money silently. Double-entry enforcement, WAC, statement derivation, retention, tax.
2. **projects** — EVM, cost ledger, cashflow, closeout.
3. **contracts** — payment certificates end to end (retention, advance recovery, net payable, the auto-invoice trigger).
4. **tendering** — estimate build-up, bid scoring, the quotation bridge.
5. **procurement · inventory** — approval matrix thresholds, 3-way match, valuation.
6. The delivery modules — site, quality, hse, commissioning, amc — against the ELV workflows they claim.

Each is a session. The output of each is the same shape as this document: findings, fixes, tests, and an explicit statement of what was not checked.
