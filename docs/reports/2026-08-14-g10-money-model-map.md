# G-10 — Money Model Map & Float-Drift Evidence

**Date:** 2026-08-14 · **Tree:** `main` @ `de51b601` · **Status:** 🟢 CURRENT · **Scope:** investigation only — no code, schema, or migration changed.

> Purpose: before touching a single `number → Decimal` line, prove **where** money float-drift actually occurs in AURA, with real values — not from the presence of a pattern. The audit's G-10 (`docs/aura-audit/18-MASTER-GAP-REGISTER.md`) is confirmed **open** on evidence, and its *severity is upgraded in consequence*: the drift reaches the UAE VAT tax-invoice path and posts to the GL as a **balanced-but-wrong** journal.

---

## 1. The money path, layer by layer

Traced on the quotation and finance customer-invoice paths (representative of the commercial money flow).

| Layer | What actually happens | Evidence | Verdict |
|---|---|---|---|
| Input / DTO | `Number(input.quantity)`, `Number(input.unitPrice)`, `vatRate` numeric | `modules/crm/src/domain/quotation.ts:172-174`; `modules/finance/src/domain/customer-invoice.ts:75-77` | float from entry |
| **Persistence (DB)** | money stored as **exact `numeric`** (`numeric(18,2)`, `(14,2)`, `(15,4)`, …); **zero** `double precision`/`real`/`float` money columns | 130+ numeric money columns vs 0 float, across `infrastructure/migrations/*.sql` | ✅ **sound at rest** |
| **Read boundary** | stores coerce `Number(r.amount)` — **discard pg's exact numeric string → float64**; no `pg` `setTypeParser` override anywhere | **115** `Number(r.<money>)` sites across `modules/*/src/postgres-*-store.ts` | ⚠️ **exactness lost here** |
| Calculation | float arithmetic: `qty*price`, `lineNet*(rate/100)`, `total*exchangeRate` | `quotation.ts:179-180`; `customer-invoice.ts:82-83,109` | float domain |
| **Rounding** | `round2 = (n) => Math.round(n * 100) / 100`, **copy-pasted in 37 files** — no single policy | idiom count = 37 files under `modules/*/src`, `packages/*/src` | ⚠️ **float-unsafe idiom, duplicated** |
| Aggregation | `round2(Σ lineNet)`, `round2(Σ lineVat)` — rounds *after* the sum | `quotation.ts:190-191` | placement OK |
| **Ledger** | `Sum(debit) − Sum(credit)` enforced in SQL, hard `RAISE EXCEPTION` at `ABS(bal) > 0.001` | `infrastructure/migrations/0050_finance_double_entry_trigger.sql:17-24` | ✅ balance safe / ❌ **value not** |
| API / SDK | money crosses the wire as `number` (float64) | `packages/sdk/src/client.ts:41 total: number` | ⚠️ float on the contract |
| UI | `toFixed()` for display | pervasive | Class A (benign) |

## 2. Usage classification (A–E)

| Class | Meaning | Count / evidence | Risk |
|---|---|---|---|
| A | Display-only `toFixed()` | majority of the 130 `toFixed(2)` sites | none |
| B | Arithmetic on `number` | pervasive across domains | drift source |
| C | Read coerces `numeric → float` | **115** `Number(r.money)` sites | drift source |
| D | Financial invariant | GL balance ✅ (SQL trigger); **VAT/total value ❌ unguarded** | **the real exposure** |
| E | API allows precision loss | SDK/DTO money typed `number` | propagates to clients |

## 3. Proven drift — real values, not academic

The exact production code is `lineVat = round2(lineNet * (vatRate / 100))` with `round2(n) = Math.round(n*100)/100` and UAE VAT `vatRate = 5`.

Scanning every AED price from `0.01` to `20,000.00` (2,000,000 values) through that exact expression vs an exact-cent reference:

- **1,638 prices compute the wrong cent.**
- Concrete cases (deterministic — recur on every quote/invoice using that catalogue price):

| Price (AED) | System VAT | Correct VAT | Error |
|---|---|---|---|
| 0.70 | 0.03 | 0.04 | −0.01 |
| 2.90 | 0.14 | 0.15 | −0.01 |
| 20.70 | 1.03 | 1.04 | −0.01 |
| 42.30 | 2.11 | 2.12 | −0.01 |
| 80.30 | 4.01 | 4.02 | −0.01 |

Two compounding float faults:
1. The money multiply is already inexact: `0.70 * 0.05 = 0.03499999999999…` (not `0.035`).
2. The rounding idiom mis-rounds at the boundary: `round2(1.005) = 1.00` (should be `1.01`), because `1.005 * 100 = 100.4999999…` in float64.

The **same flaw is on the compliance-critical path**: `modules/finance/src/domain/customer-invoice.ts` (the UAE tax invoice) is identical to the quotation path, and `baseTotal = round2(total * exchangeRate)` (`:109`) adds a second lossy multiply for foreign-currency invoices (FX rates are `numeric(15,4)`/`(18,6)`, so the pre-round error is larger).

## 4. Where drift is contained vs where it leaks

- **Contained:** `total = round2(subtotal + vatTotal)` keeps internal consistency (`quotation.ts:192`); and `debit = credit` cannot be broken — the SQL trigger is a hard gate.
- **Leaks (unguarded):** the **value** of VAT and FX-converted amounts. The GL posting uses the *same* computed amount on both legs — `modules/finance/src/customer-invoice.service.ts:93` posts `{ debit: amount, credit: 0 }` / `{ debit: 0, credit: amount }` — so a **misstated-but-balanced** journal passes the double-entry trigger **silently**. This is the compliance-relevant escape (a VAT-return misstatement), not a balance error.

## 5. Root cause (one sentence)

Money is exact at rest but is coerced to float64 at **115** read points and rounded through a float-unsafe `round2` idiom duplicated **37×**, so per-cent VAT/FX errors are computed — and no invariant guards *value* correctness, only balance.

## 6. What a real close of G-10 must satisfy

Replacing `toFixed`/`round2` alone does **not** qualify. Acceptance:

```
single money representation
        → deterministic calculation
        → one defined rounding policy (half-up, decimal-exact)
        → exact persistence
        → invariant tests (incl. the 1,638-case VAT set as a negative control)
        → API contract verified
```

## 7. Representation options (decision pending — not taken)

| Option | Fit | Cost |
|---|---|---|
| Integer minor units (fils / `bigint`) | strongest; removes float entirely | high — 115 stores + SDK + DB reads + schema |
| Decimal type (e.g. `decimal.js`) at domain + read boundary | keeps `numeric` DB, exact calc, string on wire | medium — money util + boundary refactor |
| **Hybrid (recommended)** | correct `money`/rounding util now (kills the 1,638 cases) → phased Decimal at the read boundary | low → medium, incremental, testable |

**Recommendation: Hybrid.** Land one correct money/rounding utility with the invariant + VAT negative-control test matrix first (small blast radius, kills the proven drift), then migrate the read boundary behind it — avoiding a risky big-bang `numeric → bigint` schema change.

---

### Method note (report-integrity rule)

Every count here was measured on `main` @ `de51b601`: money-column types and the double-entry trigger from `infrastructure/migrations/`, the `Number()`/`round2` breadth by scoped grep, and the 1,638 VAT mismatches by executing the exact production expression over 2,000,000 real AED price points. The drift figure is reproducible; the fix is **not** yet implemented and no score is claimed closed.
