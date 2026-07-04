# Volume 13 — Formula Library

[← Master index](README.md)

Two formula families: **metadata formulas** (form-engine expression language, Volume 5 §4 —
user-authorable, sandboxed) and **domain calculations** (TypeScript in `modules/*/src/domain`,
unit-tested — the money-grade math). This volume catalogs both.

---

## 1. Expression-language reference (metadata formulas)

**Operators:** `+ - * / %` · comparisons `== != >= <= > <` (loose numeric/string equality) ·
boolean `&& || !` (also `AND OR NOT`) · parentheses · unary minus. Division/modulo by zero
yield 0 (form-safe, not NaN).

**Functions (built-in, 24):**

| Family | Functions |
|---|---|
| Logic | `IF(cond, a, b)` · `COALESCE(a, b, …)` |
| Math | `ROUND(n, digits)` · `FLOOR` · `CEIL` · `ABS` · `MIN(…)` · `MAX(…)` · `SUM(…)` |
| String | `CONCAT(…)` · `UPPER` · `LOWER` · `TRIM` · `LEN` · `LEFT(s,n)` · `RIGHT(s,n)` · `TEXT(v)` |
| Numeric | `NUMBER(v)` |
| Date | `TODAY()` · `NOW()` · `YEAR(d)` · `MONTH(d)` · `DAY(d)` · `DAYS_BETWEEN(a,b)` · `ADD_DAYS(d,n)` |
| Aggregation | `SUMLINES(linesField, "perLineExpr")` — evaluates the quoted expression per line item and sums |

**Plugin functions:** registered via `registerFormulaFunction` — shipped example `VAT_UAE(n)`
(5% rounded to 2dp). **Safety:** no eval, 512-token/32-depth caps, unknown identifiers = field
refs, unknown functions throw, dependency cycles rejected at compile.

## 2. Standard formula patterns (the requested set, ready to paste into any schema)

| Name | Formula |
|---|---|
| Subtotal | `quantity * rate` |
| Line-items subtotal | `ROUND(SUMLINES(lines, "quantity * unitPrice"), 2)` |
| VAT (5% UAE) | `ROUND(subtotal * 0.05, 2)` or `VAT_UAE(subtotal)` |
| VAT from lines (per-line rates) | `ROUND(SUMLINES(lines, "quantity * unitPrice * vatRate / 100"), 2)` |
| Grand total | `ROUND(subtotal + vatTotal, 2)` |
| Discount | `gross * (1 - discountPct / 100)` |
| Margin | `revenue - cost` |
| Profit % | `IF(revenue > 0, ROUND((revenue - cost) / revenue * 100, 1), 0)` |
| Markup price | `cost * (1 + markupPct / 100)` |
| Retention amount | `ROUND(certifiedValue * retentionPct / 100, 2)` |
| Net payable (IPC) | `certifiedValue - retention - advanceRecovery` |
| Man-hours | `headcount * hours` |
| Days to deadline | `DAYS_BETWEEN(TODAY(), dueDate)` |
| Validity end | `ADD_DAYS(issueDate, validityDays)` |
| Overdue flag | `IF(DAYS_BETWEEN(dueDate, TODAY()) > 0, "OVERDUE", "")` |
| Full name | `CONCAT(TRIM(firstName), " ", TRIM(lastName))` |
| Net salary | `basicSalary + allowances - deductions` |

**Live in production schemas:** quotation `subtotal`/`vatTotal`/`grandTotal` (transient
computed, API stays authoritative).

## 3. Domain calculations (TypeScript, unit-tested — the authoritative tier)

| Calculation | Module | Definition |
|---|---|---|
| Double-entry balancing | Finance | Σdebits = Σcredits per journal (+ DB trigger) |
| Trial balance / P&L / BS / CF | Finance | folded from GL postings |
| Budget vs actual | Finance | GL fold per cost object |
| IFRS-15 revenue recognition | Finance | `recognized = contractValue × (costToDate / totalForecastCost)` per period |
| Multi-currency conversion | Finance kernel | `base = amount × rate(date)` via exchange-rate service |
| VAT return aggregation | Finance | output − input tax per period |
| Moving WAC | Inventory | `newAvg = (onHandValue + receiptValue) / (onHandQty + receiptQty)` |
| COGS on issue | Inventory | `qty × currentWAC` |
| EVM | Projects | `CPI = EV/AC`, `SPI = EV/PV`; EV from progress × budget |
| Cash-flow S-curve | Projects | cumulative forecast; peak funding = max cumulative net-out |
| DLP end | Projects | handover + DLP months |
| EOSB (UAE) | HR | 21 days basic/yr (first 5 yrs) + 30 days/yr thereafter, capped at 24 months; pro-rated |
| Worked hours | HR | attendance in/out fold |
| WPS SIF | HR | SCR/EDR fixed-format records |
| Payroll net | HR | basic + allowances − deductions |
| PPM next-due | AMC | last visit + frequency |
| SLA escalation | AMC | ticket age vs SLA tier thresholds |
| Depreciation | Assets | schedule over useful life |
| Expiry windows | Fleet/HR | ≤30-day and overdue banding |

**Doctrine (mirrors Volume 12 §4):** metadata formulas compute *display and drafts*; domain
code computes *records of account*. Where both exist (quotation totals), the API result is
authoritative and the form marks its version `transient`.

## 4. Roadmap

Formula editor with autocomplete + dependency preview in the form designer [Planned] ·
per-tenant function packs via plugin registration [ready today] · server-side formula
evaluation on submit (shared engine — designed).

---

*Next: [Volume 14 — Metadata Platform](vol-14-metadata-platform.md)*
