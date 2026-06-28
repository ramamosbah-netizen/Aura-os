# AURA OS — L4 Optimization Technical Report

> **Location:** Distributed inside `@aura/intelligence` and `@aura/projects`  
> **Status:** Core engines (EVM, CBS, IEC, Project Ledger) operational. Advanced optimization models (7-criteria bid scoring, LTV) are in the backlog.

---

## 1. Architectural Role & Objective

The **L4 Optimization** layer bridges transactional records (L2 Business Modules) with AI execution (L3 Intelligence). It does not maintain its own isolated host; instead, it is implemented as a set of mathematical services inside core modules. Its primary goal is to **maximize project margins, track budget variances, calculate progress metrics, and calibrate supply-chain rates**.

---

## 2. Core Optimization Engines Implemented

AURA OS currently runs four optimization engines:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        L4 OPTIMIZATION ENGINES                         │
├──────────────────────────┬──────────────────────────┬──────────────────┤
│    EVM Rollup Engine     │   CBS Cost Classifiers   │   IEC Pricing    │
│  PV/EV/AC/CPI/SPI rollup │  Direct/Indirect budget  │  4-layer closed  │
└──────────────────────────┴──────────────────────────┴──────────────────┘
```

---

### 2.1 Earned Value Management (EVM) Engine
* **Location:** [`modules/projects/src/domain/wbs.ts`](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/projects/src/domain/wbs.ts)
* **Goal:** Computes schedule and cost compliance against the planned project baseline.
* **Aggregates:**
  - **Planned Value (PV):** Total budgeted cost allocated for scheduled work.
  - **Earned Value (EV):** Budgeted cost of work actually performed ($\text{Budget} \times \text{Progress \%}$).
  - **Actual Cost (AC):** Real money spent to date (derived from approved invoices).
* **Compliance Indicators:**
  - **Cost Performance Index (CPI):** $CPI = \frac{EV}{AC}$ (values $< 1.0$ indicate the project is over budget).
  - **Schedule Performance Index (SPI):** $SPI = \frac{EV}{PV}$ (values $< 1.0$ indicate the project is behind schedule).
* **Recursive Roll-up:** Leaf-node updates recursively bubble up and recalculate the CPI/SPI metrics for parent nodes up to the project root.

---

### 2.2 Cost Breakdown Structure (CBS) Engine
* **Location:** [`modules/projects/src/domain/cbs.ts`](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/projects/src/domain/cbs.ts)
* **Goal:** Groups project costs into standardized categories, complementing the task-focused WBS.
* **Categories:** `direct` · `indirect` · `overhead` · `contingency`.
* **Cost Tracking Columns:**
  - `budgetAmount` (allocated cost)
  - `committedAmount` (committed POs and subcontracts)
  - `actualAmount` (payouts and invoices paid)
  - `forecastAmount` / **Estimate at Completion (EAC):** Forecasted total cost.
  - `variance` ($\text{Budget} - \text{Forecast}$).
* **Summaries:** Recalculates total budget utilization and commitment coverage percentages per category.

---

### 2.3 Closed-Loop IEC Pricing Engine
* **Location:** [`intelligence/src/pricing.service.ts`](file:///c:/Users/Jeet_intech/Desktop/aura-os/intelligence/src/pricing.service.ts)
* **Goal:** Continuously refines estimation rates by comparing material prices from POs, subcontractor claims, and invoices against baseline estimates.
* **Algorithm:** Source weight calculation $\rightarrow$ time-based decay $\rightarrow$ standard deviation anomaly checks $\rightarrow$ reality gap feedback loop.

---

### 2.4 Project Ledger (Profitability Projections)
* **Location:** [`intelligence/src/project-ledger.ts`](file:///c:/Users/Jeet_intech/Desktop/aura-os/intelligence/src/project-ledger.ts)
* **Goal:** Computes real-time P&L status per project across the deal chain.
* **Flow:** Combines deal-chain contracts (revenue) with committed procurement POs and actual finance invoices (expenses) to flag negative variance trends.

---

## 3. Database Schema

Optimization metrics are structured in these primary migrations:

* **`0016_projects_wbs.sql`:** WBS progress tracking and EVM columns (`planned_value`, `earned_value`, `actual_cost`).
* **`0047_projects_cbs.sql`:** CBS categories, budget, committed, actual, and forecast fields.
* **`0019_intelligence_pricing_autonomy.sql`:** Calibration tables and pricing sources.

---

## 4. Current Optimization Gaps (Backlog)

The following advanced optimization capabilities are planned for future phases:

1. **7-Criteria Bid Scoring Engine (Tendering):** Matches new tenders against historical data to compute a bid suitability score based on: Value, Margin, Competitors, Resource Availability, Risk, Project Fit, and Working Capital Impact.
2. **Client Profitability (LTV) Analyzer:** Segmenting customers by historical margin variance and payment delays to optimize bidding terms.
3. **BIM 3D Spatial Integration:** Dynamically calculating quantity takeoffs by linking BOQ items to 3D architectural models.

---
