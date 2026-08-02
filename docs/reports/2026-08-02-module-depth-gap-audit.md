# AURA OS — Module Depth Gap Audit (all modules)

**Date:** 2026-08-02
**Method:** per-module inventory of domain aggregates (`modules/<m>/src/domain`), service layer,
API routes (`apps/api/src`), and operating UIs (`apps/web/app`), verified against the live tree.
Baseline completeness figures carried from `analysis/11-ERP-FUNCTIONALITY-REVIEW.md` and re-checked.

## Headline finding

The platform's depth gap is **not** missing domain models or APIs — every module has a
well-modelled domain and 16–37 exposed routes. The gap is the **delivery-side operating-UI cliff**:
the construction/ELV modules (engineering, site, quality, HSE, assets, fleet) model rich aggregates
but surface only 1–3 pages each, so the aggregates are under-operated. The back office (finance,
CRM, procurement, inventory, HR-core) is reference-grade; the field is where the work is thin.

## Evidence table

| Module | Domain aggregates | Routes | Operating pages | Depth |
|--------|------------------:|-------:|-----------------|------:|
| CRM | 12 | many | accounts, contacts, leads, quotations, activities, campaigns, overview, my-day, market-intelligence | ~90% |
| Finance | 18 | many | full suite (statements, budget, period-close, fx, revenue-rec…) | ~80% |
| Procurement | 6 | many | POs, PRs, RFQ, suppliers, 3-way-match, spend, framework agreements | ~72% |
| Inventory | 6 | 20+ | dashboard, GRNs, stock, transfers, serials, locations, valuation | ~70% |
| Projects | 9 | many | dashboard, projects, schedule (Gantt), variations, delays, CBS | ~72% |
| Tendering | 11 | many | tenders, BOQ, estimate, bid-scores, win-loss | ~70% |
| Contracts | 5 | many | contract 360, bonds, payment certs, obligations, clauses | ~65% |
| HR | 13 | many | attendance, timesheets, expenses, advances, EOSB, doc-expiry | ~65% |
| AMC | 4 | 22 | amc, ppm, dispatch | ~62% |
| Engineering | **8** | 37 | **engineering (1 page)** | ~60% |
| Subcontracts | 4 | 20 | subcontracts, variations, back-charges | ~60% |
| Fleet | 6 | 27 | control, fines, salik | ~55% |
| HSE | 6 | 20 | control, toolbox-talks | ~55% |
| Assets | 6 | 16 | control, depreciation | ~52% |
| Quality | 7 | 33 | control, itps, material-approvals | ~52% |
| Site | 5 | 20 | control, instructions | ~48% |

## Closed since the last audit (verified this session, now on `main`)

- **CRM** — campaigns OS (`/crm/campaigns`, mig 0202) + communications log (activity `direction`/`counterparty`, mig 0203) → closes the "email/comms + marketing/campaign" gap. Quotation engine unified on `estimateLine`. Stakeholder influence map on Account 360.
- **HSE** — permit-to-work close-out (mig 0201) completes the safety lifecycle.
- **Commissioning + Handover** — new aggregates + the deliver→commission→handover→maintain event chain (`commissioning-handover-subscriber`, `handover-amc-subscriber`).
- **Inventory** — serial-unit tracking (mig 0199) + storage locations/bins (mig 0200).
- **Projects** — operable Gantt (add task + set baseline), EVM portfolio rollup.
- **AI platform** — 22 intelligence services + admin console + `/ai` workspace.

## Prioritised gap register

### P0 — core ELV field execution & QA (highest value)

1. **Quality — IR / NCR / snag operating UIs.** ✅ **SHIPPED 2026-08-02.** Added
   `/quality/inspection-requests`, `/quality/ncrs`, `/quality/snags` on the existing domain+API
   (no backend change). Full lifecycle UIs (IR approve/reject, NCR raised→corrected→closed, snag
   open→resolved→closed) + nav. *Construction QA compliance backbone now operable.*
2. **Site — daily site report + labour/plant returns.** ✅ **SHIPPED 2026-08-02.** Added
   `/site/daily-reports` — the foreman's daily diary (work, manpower, plant → draft→submit) plus
   the labour return by trade with man-hour roll-up. The field's most-used tool now has a surface.
3. **Engineering — RFI / submittal / drawing registers.** ✅ **ALREADY COMPLETE (audit
   correction).** The "single page" is a 1,853-line tabbed hub (`engineering-client.tsx`) covering
   all 8 aggregates — drawings, RFIs, submittals, design-changes, documents, technical-queries,
   BIM — with create + lifecycle actions. The gap register had counted page *files*, not the tabs
   inside; verified working E2E (RFI open→answered). No build needed. *Not a gap.*

### P1 — asset / field operations & HR

**Verification correction:** on inspection, the P1 modules were far more built than the file-count
basis implied — each has a comprehensive tabbed control hub. Only the genuinely-missing registers
(domain + API present, no UI) were built; the rest were already covered.

4. **HSE.** `hse-control-client` (733 lines) already covered incidents/PTW/CAPA/training. The one
   gap — **risk assessments (JSA)** — ✅ **SHIPPED 2026-08-02** (`/hse/risk-assessments`: hazard
   L×S scoring, controls, residual band, draft→approved).
5. **Fleet.** `fleet-control-client` (713 lines) already covered vehicles/fuel/maintenance/
   telematics + fines + salik pages. Remaining item (driver assignment) has **no backend route** —
   not a UI-only gap. **No slice needed.**
6. **Assets.** `assets-control-client` already covered register/maintenance/inspections + depreciation.
   The gap — **disposals** — ✅ **SHIPPED 2026-08-02** (`/assets/disposals`: sale/scrap/write-off →
   gain/loss vs net book value). (QR-tag print endpoints exist; a print utility remains minor.)
7. **HR.** `hr-control-client` (554 lines) already covered employees/leaves/payroll-run. The gap —
   **appraisals** — ✅ **SHIPPED 2026-08-02** (`/hr/appraisals`: weighted competency scores → 0–100,
   draft→submitted→acknowledged). (Org chart remains a nice-to-have.)

### P2 — commercial & platform

8. **Subcontracts — progress-claim workflow + subcontractor portal.** `claim`, `variation`,
   `back-charge` modelled; missing the claim certify→pay workflow UI and any external portal.
9. **Contracts — authoring/templating + variation↔value automation.** No template-driven
   contract authoring; variation approval doesn't auto-adjust contract value.
10. **Analytics OS / report builder.** Per-module dashboards exist; the unified Phase-6
    Analytics workspace + report builder is planned, not shipped.
11. **Field/mobile surface.** No technician/site-staff mobile UI for the P0/P1 field flows above.
12. **Master data management.** Items/materials catalog + cost/rate libraries are implied
    (market-intelligence exists) but not surfaced as a governed MDM.

## Recommended build order

Tackle P0 top-down — each is a domain-complete aggregate needing only an operating UI + a few
lifecycle routes, so they are high-value, low-risk slices (one module per PR, the established
pattern). Suggested sequence: **Quality IR/NCR/snag → Site daily report → Engineering RFI/submittal**,
then the P1 field/asset UIs. P2 (portal, Analytics OS, MDM) are larger platform efforts to schedule
after the field cliff is closed.
