# AURA Vision — Personal Command Center + CRM/Commercial deepening (2026-07-18)

Large vision from the user (full spec in the session message). Organized here into workstreams, each mapped to **status** (✅ exists · 🟡 partial · 🆕 new) and where it fits the AURA Operating Review Program. NOT a single PR — a multi-wave roadmap.

## A · My Day → Personal Command Center 🟡→🆕
Interactive KPI cards (slide-over panels, not just navigation) · open entities in a NEW tab (My Day never closes) · Quick Notes · Quick Tasks (title/priority/due/reminder/tags/related) · Reminders/Alarms/Snooze/Repeat + in-app notifications · embedded **action-capable AI assistant** · live updates (no refresh) · personal activity timeline · Next-Best-Action · customizable widget layout (move/hide/resize/save layouts) · global search · Quick Actions (+) · daily work status + productivity board (Focus/Productivity/Time-saved-by-AI).
Exists: My Day page (composeAiNoticed rail, Now/Next spine) — read-mostly. Gap: interactivity, tasks/notes, AI actions, live, customization.

## B · Workspace / Tab discipline 🆕 (cross-cutting UX law)
Every table row opens the entity in a **new browser tab**; the Workspace (My Day, Commercial, Projects, Procurement, Finance, Inventory) stays open with its filters/sort intact. Entity 360 pages are independent tabs. Aligns with the doctrine's "preserve context." Small but system-wide.

## C · Accounts → unified Business Partners 🟡
Account types: Customer · Supplier · Consultant · Subcontractor · Developer · Government · Partner · Other (+ filter by type). In-account **(+) buttons create the entity directly** (Opportunity/Quotation/Tender/Contact/Meeting/Task/Contract/Project/RFQ) with Account + customer/supplier pre-filled — NOT navigate to the module list. ("+Quotation" opens quote authoring; "+Tender" opens tender create; etc.)
Exists: Accounts (customers) + RelationshipStage. Gap: partner types, context-prefilled direct create.

## D · Contacts & Stakeholders → Contact 360 🟡 (much exists)
Advanced filter/sort + Saved Views ("Decision Makers", "Inactive", "Suppliers") + export · Contact 360 (Overview/Deals/Activities/Documents/Communication) · Deals tab deep-links open the exact record in a new tab · activity timeline with Summary/Outcome/Decision/Next · **immutable stakeholder Role/Relationship** (set at create; changed only via Edit Contact + **audit trail** — it's business history) · **Influence Map** for strategic accounts.
Exists: Contact 360, stakeholder role/strength, stakeholder map. Gap: saved views, immutable+audited classification, richer activity schema, influence map.

## E · Sales Radar — full signal architecture 🟡
MarketSignal entity · ingestion → detection → classification → enrichment → scoring · inbox/review-drawer/convert · internal sources (contracts/AMC/projects/activities) + external (tender portals/website/market-AI). Priority = value+confidence+relationship+urgency.
Exists: Signals + Radar (S3, signals-radar, scorePursuit). Gap: source connectors, richer scoring, AI market agents.

## F · Intelligent Sales Pipeline — AI assistant 🟡
Command-center greeting · AI lead-qualification assistant + lead score · qualification gate · deal coach · stage-gated board with **auto-task templates per stage** · activity-intelligence risk · Next-Best-Action engine · smart morning brief · **predictive** forecast · deal health.
Exists: NBA, attention, stage/workflow gate, health, forecast snapshots. Gap: AI actions, per-stage task templates, predictive forecast, morning brief.

## G · Quotation → Commercial Intelligence Engine 🟡 (lifecycle exists)
Requirement → Scope (incl/excl) → BOQ → **Pricing Sheet** → Quotation → **Technical Offer**/attachments → Approval → multi-channel **Send** (email/WhatsApp/portal) + comm-log → **Revision** (locked after approval) → Accept → **Contract** → commercial+cost+time **Baseline** → future estimation (similar-project lookup).
Exists: quotation lifecycle, pricing authoring (#147), commercial baseline, convert-to-contract, revision lock. Gap: Requirement entity, Scope/incl-excl, Terms templates, Technical Offer + PDF proposal package, multi-channel send + comm-log, follow-up automation, cost/time baseline intelligence, historical estimation.

## Sequencing (recommended)
1. **Finish CRM 100/100** (in-flight: CRM-4/5/6 + merges) — close the current journey cleanly (small, days).
2. **B · Open-in-new-tab law** — small, system-wide, high daily value; do early.
3. **A · My Day Command Center** — the centerpiece "Mission Control"; its own wave (tasks/notes/reminders → interactivity → AI actions → customization), several PRs.
4. **C/D** Accounts-as-partners + context-create + Contact-360 saved-views/influence-map.
5. **G** Quotation deepening (Requirement→Technical Offer→multi-channel send→baseline intelligence).
6. **E/F** Radar + Pipeline AI deepening (largest; AI-agent heavy).

Each wave runs the 3-layer Operating Review (Journey · Doctrine · OpEx), one small PR per proven slice.
