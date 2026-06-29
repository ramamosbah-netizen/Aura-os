# Aura OS Expansion: Blueprint Alignment Plan

This document details the step-by-step implementation plan to scaffold and wire all remaining modules, edge portals, and subsystems required to align Aura OS with the V2 master blueprint.

---

## 📅 Roadmap Overview

```
 ┌──────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
 │ PHASE 1: CRM & Sales │ ──► │ PHASE 2: Tendering   │ ──► │ PHASE 3: Tier 2      │
 │ (Leads, Opps, Quotes)│     │ (BOQ, Estimates)     │     │ (Eng, Doc, Site, QA) │
 └──────────────────────┘     └──────────────────────┘     └──────────────────────┘
                                                                      │
 ┌──────────────────────┐     ┌──────────────────────┐     ┌──────────▼───────────┐
 │ PHASE 6: Hardening   │ ◄── │ PHASE 5: Portals/PWA │ ◄── │ PHASE 4: Tier 3      │
 │ (pgvector, OCR)      │     │ (Vendor/Client)      │     │ (HR, Fleet, AMC)     │
 └──────────────────────┘     └──────────────────────┘     └──────────────────────┘
```

---

## 🛠️ Detailed Phase Breakdown

### Phase 1: CRM & Sales Expansion
Deepens the CRM module to support the full deal chain:
*   **Database Tables (`crm.*`)**:
    *   `crm.aura_crm_leads`: Individual prospects, lead sources, and statuses.
    *   `crm.aura_crm_opportunities`: Deals linked to accounts, stages, and weighted values.
    *   `crm.aura_crm_activities`: History of calls, meetings, and emails.
*   **Services**: `LeadService`, `OpportunityService`, `ActivityService`.
*   **Events**: `crm.lead.created`, `crm.opportunity.won` (automatically triggers Tender registration).
*   **UI Components**: Leads and Opportunities pipeline boards.

### Phase 2: Estimating & Tendering Gaps
Upgrades Tendering from a simple register to MEP-grade estimation:
*   **Database Tables (`estimating.*`)**:
    *   `estimating.aura_estimating_boqs`: Import metadata, parent sheet tags.
    *   `estimating.aura_estimating_boq_items`: Lines specifying Item code, description, quantity, and unit rate.
    *   `estimating.aura_estimating_resources`: Resource cost sheets (Labor rate, Material, Equipment overhead).
*   **Services**: `EstimationService`, `BoqImportService` (Excel parsing).
*   **Events**: `estimating.tender.submitted`, `estimating.quote.priced`.
*   **UI Components**: Excel-like BOQ editor, resource cost breakdown tables.

### Phase 3: Tier 2 — Control & Compliance Modules
Builds the core engineering and compliance layer:
1.  **Engineering Module (`@aura/engineering`)**:
    *   *Tables*: `engineering.aura_drawings`, `engineering.aura_rfis`, `engineering.aura_submittals`.
    *   *Events*: `engineering.rfi.raised`, `engineering.submittal.status_changed`.
    *   *UI*: Shop drawing register, RFI status cards.
2.  **Document Control Module (`@aura/doccontrol`)**:
    *   *Tables*: `doccontrol.aura_transmittals`, `doccontrol.aura_correspondence`.
    *   *Events*: `doccontrol.transmittal.sent`.
    *   *UI*: Correspondence log (inbound/outbound), transmittal dispatch forms.
3.  **Construction / Site Control Module (`@aura/site`)**:
    *   *Tables*: `site.aura_daily_reports`, `site.aura_site_diaries`, `site.aura_manpower_logs`.
    *   *Events*: `site.daily_report.submitted`.
    *   *UI*: Daily report submission logs, site attendance sheets.
4.  **HSE Module (`@aura/hse`)**:
    *   *Tables*: `hse.aura_incidents`, `hse.aura_permits_to_work`.
    *   *Events*: `hse.incident.reported`, `hse.ptw.issued`.
    *   *UI*: Incident reporter form, Permit authorization matrix.
5.  **Quality Module (`@aura/quality`)**:
    *   *Tables*: `quality.aura_ncrs`, `quality.aura_punch_lists`.
    *   *Events*: `quality.ncr.raised`.
    *   *UI*: Non-Conformance Report (NCR) tracker, punch-list checklists.

### Phase 4: Tier 3 — Operate & Assets Modules
Builds the asset management, workforce, and service systems:
1.  **HR & Payroll (`@aura/hr`)**:
    *   *Tables*: `hr.aura_employees`, `hr.aura_camp_records`, `hr.aura_payroll_runs`.
    *   *Events*: `hr.payroll.run`.
    *   *UI*: Visa tracker, camper list, payroll generator.
2.  **Fleet (`@aura/fleet`)**:
    *   *Tables*: `fleet.aura_vehicles`, `fleet.aura_fuel_logs`.
    *   *Events*: `fleet.maintenance.due`.
    *   *UI*: Salik tracker, fuel consumption logs.
3.  **Assets (`@aura/assets`)**:
    *   *Tables*: `assets.aura_assets`, `assets.aura_calibrations`.
    *   *Events*: `assets.calibration.due`.
    *   *UI*: Calibration timeline calendar.
4.  **AMC & Service (`@aura/service`)**:
    *   *Tables*: `service.aura_service_contracts`, `service.aura_tickets`, `service.aura_ppm_schedules`.
    *   *Events*: `service.ticket.raised`, `service.sla.breached`.
    *   *UI*: Route mapping dispatcher board, SLA tickets board.

### Phase 5: Experience Edges (Portals & PWA)
Builds the edge portals in the monorepo:
*   **Supplier Portal**: Vendor bidding UI, PO receipt, and Invoice creation.
*   **Customer Portal**: AMC ticket logging, project milestones view, and payment dashboard.
*   **Mobile Workforce (PWA)**: Offline-first site diary logs, camera snaps for snags, and daily site check-in.

### Phase 6: Subsystems Hardening & AI Depth
*   **pgvector Semantic RAG**: Connect RAG service to `aura_vector_store` for AI Copilot chat memory.
*   **Document OCR / Classification**: Wire AI Provider to OCR documents (invoices, POs, Drawings) on upload.
*   **Redis Event Spine scale**: Introduce MQ for outbox relay.

---

## 🚦 Recommended Next Step

I recommend starting with **Phase 3 (Tier 2 Modules)**, scaffolding the first core module: **Engineering** (`@aura/engineering`), including drawing records, RFIs, and technical submittals, and wiring its events into the outbox.
