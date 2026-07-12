# Accounts Portfolio + Account 360 Command Center

**Date:** 2026-07-12 · **Branch:** `feat/accounts-portfolio` (stacked on #71 `feat/account-form`)
**Why:** the Accounts page was a customer register (Name/Status/Industry/Created) and the
Account 360 a flat detail page. The account is the persistent commercial PARTY the whole
deal chain revolves around — the page should read as a relationship portfolio.

## 1. Relationship Stage replaces the lead funnel — migration **0151**
`AccountStatus` = `prospect → qualified → active_customer → strategic · dormant · inactive`
(was `lead/active/inactive`). 0151 rebuilds the status CHECK and maps existing rows
(`lead→prospect`, `active→active_customer`), guarded @DOWN. Create/edit drawers, demo
seeder and tests updated.

## 2. `GET /crm/accounts/portfolio` — the tenant-wide roll-up
One call composes accounts × opportunities × tenders × quotations × contracts × projects ×
invoices × activities and returns per relationship: active deals, open pipeline, open
tenders, contracts + contracted value, active projects, outstanding/overdue AR,
last-activity, and **derived health**:
- 🔴 `at_risk` — overdue receivables (with the amount as the reason)
- 🟠 `attention` — live business with no owner · no activity in 60 days · has contracts
  but still marked a prospect (ships a `suggestedStage: active_customer`)
- 🟢 `healthy` — otherwise

## 3. Accounts page → Account Portfolio (`accounts-portfolio-client.tsx`)
- Copy: “…where every commercial relationship lives.”
- Executive KPIs: Total · Prospects · Active Customers · Active Opportunities · Open
  Pipeline · Contracted Value · Outstanding AR · At-Risk.
- Smart views w/ counts: All | My Accounts | Prospects | Active Customers | Strategic |
  At Risk | Dormant + free search.
- Commercial table: Account | Relationship (+ one-click **→ Active Customer** promote when
  suggested) | Owner (**Unassigned + Assign to me**) | Active Deals | Pipeline | Contracts
  (count · value) | Projects | Outstanding (red when overdue) | Health (reasons on hover) |
  Last Activity | Edit.

## 4. Account 360 → command center (`account-360-client.tsx` reorg)
- Header: name / stage pill · industry · client since · source · owner (assign inline) /
  **Relationship Health: 🔴 At Risk — AED 1,000 overdue receivables** (reason inline,
  + Promote when stage lags the contracts).
- Actions: + Opportunity · + Quotation · + Tender · **Export ▾** (Excel/PDF dossier) ·
  **More ▾** (+ Contact, + Activity, AR ledger).
- Snapshot in two groups: **Commercial** (pipeline, active opps, contracted value, active
  contracts) | **Delivery & Finance** (active projects, open tenders, quotations, AR).
- **Commercial Portfolio** strip: both routes — `↳ tendered: Opportunity → Tender →
  Quotation → Contract → Project` and `↳ direct: Opportunity → Quotation → …` — stages are
  clickable chips that jump to the matching tab; quotations split Tendered/Direct.
- Composite **Overview** tab: Relationship Health · Financial Exposure · Upcoming Actions
  (open activities by due date) · Recent Activity (timeline) · Key Contacts · Profile.
  Timeline tab folded into Overview; Activity tab remains the register.

## 5. Fixes en route
- `PATCH /crm/accounts/:id` silently dropped `ownerId` (missing from DTO + update call) —
  the assign-owner action was a no-op. Fixed; new BFF `POST /api/crm/accounts/assign-owner`
  stamps the session user server-side.
- Acme data: `lead` w/ 3 contracts → `active_customer`; mojibake `Referral � consultant`
  source → `referral`.

## 6. Verification (live, dev DB, :4310/:3310)
Portfolio endpoint smoke: Acme `at_risk ['AED 1000 overdue receivables']`, Globex
`attention` + `suggestedStage active_customer`. Browser: KPI row, smart-view counts,
promote button flipped Globex to Active Customer, **Assign to me persisted `u-admin`**
(verified in DB), Acme 360 header reads exactly per spec with the red health line, both
portfolio routes render, Overview composite live. crm tests 19/19 · api/web builds green ·
migration gate green (151, @DOWN) · SDK regenerated (683 ops).
