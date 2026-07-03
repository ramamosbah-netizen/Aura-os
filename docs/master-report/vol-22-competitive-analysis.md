# Volume 22 — Competitive Analysis

[← Master index](README.md)

Twelve competitors in four classes. For each: what they are, where they beat AURA today,
where AURA beats them, and the sales counter. Frame: AURA's ICP is the 50–2,000-person GCC
project/asset business (Volume 1 §4–5) — every judgment below is relative to *that* buyer,
not the Fortune 500.

---

## Class A — Mega-suite ERPs

### 1. SAP S/4HANA
- **What:** the enterprise ERP reference; unmatched finance/logistics depth, ecosystem, compliance.
- **Beats AURA:** maturity, references, treasury/consolidation depth, localization coverage breadth, partner army, trust.
- **AURA beats:** implementation time (days vs 12–24 months), TCO, construction-native objects (IPC/retention/BOQ are custom work in SAP), event-connected deal chain out of the box, modern AI seam vs bolt-on Joule.
- **Counter:** "You will spend more on the SAP implementation partner than on ten years of AURA — and still build the IPC workflow yourself."

### 2. Oracle Fusion Cloud
- **What:** SAP's twin in the cloud; strong financials + Primavera/Unifier adjacency.
- **Beats AURA:** same as SAP + owns Primavera (schedule gravity).
- **AURA beats:** one system vs Fusion+Unifier+Primavera integration project; mid-market pricing; GCC payroll (WPS/EOSB) native.
- **Counter:** the three-Oracle-products quote vs one platform.

### 3. Microsoft Dynamics 365 (F&O + Project Operations)
- **What:** the most credible mid-market rival; Power Platform is the metadata benchmark this report's Volume 14 tracks.
- **Beats AURA:** Power Platform maturity (the designer AURA hasn't built yet), M365 gravity, partner channel, Azure trust.
- **AURA beats:** construction depth (Project Ops is services-centric — no BOQ/IPC/retention/subcontractor claims), GCC statutory HR, price, AI-first internals vs Copilot layers.
- **Counter:** "Dynamics needs an ISV (and their margin) for everything your business actually does between contract and cash."
- **Strategic note:** Dynamics is also the template — metadata platform + marketplace (V3) is explicitly the Dynamics playbook on modern architecture.

### 4. Salesforce
- **What:** CRM king + platform (Einstein, AppExchange).
- **Beats AURA:** CRM depth, ecosystem, platform maturity, brand.
- **AURA beats:** everything after the deal is won — Salesforce has no ledger, no payroll, no inventory, no site; construction customers buy it and then buy an ERP anyway.
- **Counter:** "Salesforce ends where your margin is decided."

### 5. ServiceNow
- **What:** workflow platform for IT/employee/customer service; the workflow-engine benchmark.
- **Beats AURA:** workflow designer maturity, ITSM ecosystem, enterprise ops credibility.
- **AURA beats:** ServiceNow is not an ERP — no financials/inventory/projects accounting; per-seat cost is prohibitive as a business system for this ICP.
- **Counter:** positioning, rarely a head-to-head; if a customer wants "ServiceNow for construction ops," that is literally AURA's AMC+workflow+inbox story.

## Class B — Open / mid-market ERPs

### 6. Odoo
- **What:** modular open-source ERP; the price-anchor competitor in the GCC.
- **Beats AURA:** module count (website, POS, manufacturing…), community, app store, brand recognition at this price point.
- **AURA beats:** construction/contracting depth (Odoo's is community-thin), event-driven automation between modules (Odoo links are shallow), GCC statutory payroll correctness, kernel quality (outbox/audit/idempotency vs Odoo's ORM-centric model), AI architecture.
- **Counter:** demo the chain: won opportunity → tender → contract → project → PO → GRN → WAC → GL, untouched by humans. Odoo cannot.

### 7. ERPNext
- **What:** open-source ERP with genuine construction usage in the region.
- **Beats AURA:** free/self-host story, existing regional installs, mature accounting basics.
- **AURA beats:** architecture (multi-tenant kernel, events, metadata forms vs monolith), depth per vertical row (IPC/retention/back-charges/EOSB verified vs partial), AI platform, product polish.
- **Counter:** TCO of "free" — implementation + customization + upgrade fragility.

## Class C — Work management

### 8. Monday.com · 9. ClickUp
- **What:** flexible work/project trackers teams adopt bottom-up.
- **Beat AURA:** onboarding delight, collaboration UX, virality, price per seat.
- **AURA beats:** they are databases of promises — no ledger, no stock, no payroll, no compliance; companies outgrow them into ERP+spreadsheet chaos, which is AURA's entry wedge.
- **Counter:** "Keep Monday for tasks if you like it — AURA is where the money and the compliance live." (Webhook integration, not war.)

## Class D — Construction point solutions

### 10. Primavera P6
- **What:** the scheduling standard for GCC mega-projects.
- **Beats AURA:** CPM scheduling depth AURA does not attempt (baselines/critical path partial).
- **AURA beats:** everything that isn't the schedule.
- **Counter:** integrate, don't fight — XER import is on the roadmap (Vol 17); "P6 plans it, AURA runs it."

### 11. Procore
- **What:** construction project management SaaS (docs, RFIs, field, quality/safety).
- **Beats AURA:** field/mobile UX (AURA's biggest visible gap), document workflows maturity, marketplace, brand in construction.
- **AURA beats:** no ERP core in Procore (no GL/payroll/inventory — they partner out); per-project pricing that mid-market GCC dislikes; AURA's site/quality/HSE modules cover the daily-use surface.
- **Counter:** "Procore + an ERP + an HR system + integrators ≈ 3× AURA's cost, and the data still lives in three places."

### 12. Oracle Unifier (+ Aconex)
- **What:** capital-program controls (cost, contracts, doc control) for owners/PMCs.
- **Beats AURA:** owner-side cost-control depth, mega-project references, Aconex correspondence gravity.
- **AURA beats:** contractor-side operations (Unifier is owner-centric), weight/cost, HR/finance absent.
- **Counter:** different buyer (owner vs contractor); when the owner mandates Aconex, AURA's doc-control transmittals coexist.

---

## Synthesis — the moat map

| AURA differentiator | Threatened most by | Defense |
|---|---|---|
| Event-connected deal chain | Dynamics + ISVs | keep automation lead; demo the untouched chain |
| Construction+GCC depth | ERPNext community | verified statutory correctness (WPS/EOSB/VAT) + audit trail |
| Metadata form platform | Dynamics/Salesforce designers | ship the designer (V2) before deals demand it |
| AI-first kernel | Copilot/Einstein marketing | guardrailed autonomy + MCP are demonstrably deeper; publish it |
| Days-not-months implementation | Odoo partners | opinionated defaults + demo seeder + this documentation |

**Vulnerability list (where deals die today):** no mobile field app (Procore wins the site
demo) · no BI charts (CEO demo moment lost) · no SSO/MFA (enterprise IT checklist) · no
references (pilot pricing strategy required). All four are V1/V2 roadmap rows.

---

*Next: [Volume 23 — Gaps Analysis](vol-23-gap-analysis.md)*
