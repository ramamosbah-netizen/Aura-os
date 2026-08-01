# Enterprise Gap Analysis & ELV Industry Fit

## Part A — Benchmark vs. established platforms

| Capability | SAP / Oracle / D365 | Odoo / NetSuite | Procore / ACC | Jira/ClickUp/Monday | ServiceNow | **AURA OS** |
|---|---|---|---|---|---|---|
| Financials (GL/AP/AR/tax) | ★★★★★ | ★★★★ | ★★ | — | ★ | **★★★★** (DB-enforced double-entry, tax, period close) |
| CRM / pipeline | ★★★ | ★★★★ | ★★ | ★★ | ★★★ | **★★★★** (forecast snapshots, health, reference-grade) |
| Procurement / inventory | ★★★★★ | ★★★★ | ★★★ | — | ★★ | **★★★** (spine solid, warehouse depth missing) |
| Project controls (WBS/EVM) | ★★★★ | ★★★ | ★★★★★ | ★★ | ★ | **★★★** (backend strong, cockpit/EVM UI missing) |
| Construction ops (RFI/submittal/daily) | ★★ | ★ | ★★★★★ | ★ | ★ | **★★** (doc control/site backends exist, UI stub) |
| Field service / dispatch | ★★★ | ★★★ | ★★ | ★ | ★★★★★ | **★** (records only, no loop/mobile) |
| Workflow / low-code | ★★★★ | ★★★ | ★★ | ★★★ | ★★★★★ | **★★★★** (approval matrices, form engine, module manager) |
| Multi-tenancy / RLS | ★★★★★ | ★★★★ | ★★★ | ★★★ | ★★★★ | **★★★** (excellent mechanism, inert on prod) |
| AI / agents | ★★★ | ★★ | ★★ | ★★★ | ★★★★ | **★★★** (huge ambition, low maturity) |
| Mobile / field app | ★★★★ | ★★★ | ★★★★★ | ★★★★ | ★★★★★ | **☆** (none) |
| Ecosystem / marketplace | ★★★★★ | ★★★★ | ★★★★ | ★★★★★ | ★★★★ | **★** (SDK exists, no ecosystem) |
| Cost / TCO | $$$$$ | $$$ | $$$$ | $$ | $$$$$ | **$** (self-hosted, no license) |
| **Vertical fit (ELV/MEP contractor)** | ★★ (heavy, generic) | ★★ | ★★★ | ★ | ★★ | **★★★★ (purpose-built — the core advantage)** |

## Competitive gaps (where AURA trails)
1. **Field service & mobile** — ServiceNow/Procore/D365-FS have full dispatch+mobile; AURA has none.
2. **Construction project controls UI** — Procore/ACC own RFI/submittal/daily-log/drawings UX; AURA has the data, not the screens.
3. **BI / analytics** — every incumbent has embedded BI; AURA has fragmented dashboards.
4. **Ecosystem** — incumbents have app stores and integrations; AURA has an SDK but no marketplace/connectors live.
5. **Customer/vendor portals** — standard in NetSuite/SAP; absent in AURA.
6. **Enterprise identity** — SSO/SCIM exist in the auth layer but aren't operationalized.

## Unique advantages (where AURA can win)
1. **Purpose-built for ELV/MEP/FM contractors** — incumbents are generic; AURA speaks the domain (BOQ, tender, ITP, WPS, Salik, retention, back-charges, AMC).
2. **UAE/GCC localization baked in** — WPS/SIF, Salik, VAT, PDCs, bonds/guarantees.
3. **Cost** — no per-seat license; self-hostable.
4. **Modern architecture** — event-sourced, clean, AI-native design intent — more adaptable than legacy incumbents.
5. **Commercial-to-cash cockpit UX** — already better than Odoo/NetSuite for the sales-to-invoice journey.
6. **AI-first ambition** — if governed, the agent layer could leapfrog incumbents on automation.

## Part B — ELV industry fit (the core market)

| ELV domain | Support today | Gap |
|---|---|---|
| **CCTV / Access Control / Fire / AV** | 🟡 as generic BOQ/project line items | No system-type templates, device schedules, or as-built device registers |
| **KNX / BMS integration** | 🔴 | No integration points / commissioning data capture |
| **Structured cabling / networking** | 🟡 | Handled as materials; no cable schedule / port mapping |
| **SIRA / DCD compliance (Dubai)** | 🔴 | No SIRA approval workflow, guard licensing, or compliance register (essential for UAE ELV security systems) |
| **AMC / preventive maintenance** | 🟡 | PPM schedules + WO costing exist; no field execution loop |
| **Asset lifecycle / installed base** | 🟡 | Installed-base store in CRM + assets module; no unified device lifecycle from install→warranty→AMC→replacement |
| **Field service** | 🔴 | No dispatch, no technician mobile, no checklist/signoff |
| **Commissioning (T&C)** | 🟡 *(2026-08-01: built)* | New commissioning module + UI — per-system T&C register with test-point tally and witnessed sign-off; verified E2E. Still needs per-device checklists & the handover trigger |
| **Handover / O&M / warranty** | 🟡 *(2026-08-01: built)* | New Handover module + UI — per-project acceptance package (close-out checklist, client sign-off, warranty-clock start) linked to live commissioning status; verified E2E. Still needs the DMS document bundle + auto-AMC-on-acceptance |
| **Snagging / defects** | 🔴 | No snag list workflow |
| **RMS / material submittals** | 🟡 | Doc control + material approvals backends exist; UI stub |

### ELV verdict
AURA OS has the **commercial and financial infrastructure** an ELV contractor needs, and genuine **UAE localization**, but it is **missing the ELV-specific delivery lifecycle**: commissioning, handover, field service, snagging, SIRA compliance, and device/installed-base lifecycle. These are not edge features — they are the operational core of an ELV contracting business and the strongest differentiator against SAP/Odoo. **Building them is the path to category leadership; not building them leaves AURA as a well-built generic ERP.**

## The strategic gap in one sentence
AURA OS has out-built its competitors on the **commercial-to-cash** journey for this vertical, and under-built them on the **deliver-commission-handover-maintain** journey that *is* the vertical.
