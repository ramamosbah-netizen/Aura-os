# CRM Operating Experience Transformation — v4 (Implementation Constitution)

**Date:** 2026-07-17 · **Status:** LOCKED build plan
**Branch:** `claude/crm-account360-inline-contacts` (uncommitted WIP — Phase 0)
**Governing doctrine:** UX Architecture Doctrine (the Constitution).
**Mandate:** upgrade, don't rebuild. Add intelligence, context, action, memory layers over the existing CRM. Philosophy: *"The system does not show information — it guides business execution."*

## Execution discipline (READ FIRST — this governs how the plan is built)
Do **not** build the whole roadmap as one task. Execute:
```
Phase 0 → review existing implementation → create Phase 1 PR ONLY → verify in dev preview → continue
```
One shippable PR per phase, each gated on the prior merged + green. This protects the biggest ERP failure mode: shipping features while degrading the daily workflow. Give the developer only: this document + the repo audit + the current phase instruction.

## Mission
CRM = an intelligent **revenue-execution** system answering *"Who is this customer, what opportunity exists, what blocks progress, what do I do next?"* Every object is a **business situation**, not a database entry.

## Experience spine (no object exists alone)
```
Market Signal → Lead → Qualification → Account+Stakeholders → Opportunity → Solution/Scope
→ Pricing → Quotation → Contract → Project → AMC/Renewal → Expansion
```

## Layered architecture
```
AURA Intelligence Layer (AI L1 embedded everywhere)
        ↓
Persona + Intent Context   ← who is the user, what job
        ↓
Universal Object Shell     ← the 7-part experience every entity renders
        ↓
Object spine (Lead→Account→Opportunity→Pricing→Quote→Contract→Project→AMC)
        ↓
Actions + Outcomes + Business Memory
        ↓
Continuous learning
```

---

## Persona Context Rule
The same object may expose different **priorities** by the user's responsibility — the object stays the same; only recommended action + information priority change. No forked versions of the object.
- **Sales Manager** on an Opportunity sees: risk · forecast impact · probability · owner performance.
- **Sales Engineer** on the same Opportunity sees: technical gap · missing scope · BOQ · submittal.
Personalized via **role · permission · responsibility · My Day ranking**. *(Infra exists: role-based workspace + per-user My Day; Phase-1 gap is persona-aware ranking only.)*

## Universal Object Shell (every entity renders these 7)
```
1. Object Identity      — what is this (name, type, value, stage, owner, status)
2. Current Situation    — what is happening (facts, quiet-for-N-days)
3. Business Health      — health score / band + why
4. Missing Information  — ❌ the specific gaps blocking progress   ← key ERP differentiator
5. Recommended Action   — ONE primary action + button
6. History & Outcome    — Business Memory + the Outcome Loop
7. 360 Context          — the tabs
```
**Missing Information** examples: Opportunity → ❌ decision-maker, technical scope, budget, target date. Account → ❌ facility manager, contract expiry, last executive meeting. Quotation → ❌ approval, customer confirmation. *(Already computed by the gap engines — Phase 1 surfaces the arrays.)*

**Outcome Loop** (part of #6): after acting, AURA asks *What happened? Completed / Failed / Need Follow-up / Reschedule → next action?* — lightweight inline, reusing the activity-outcome engine (PR #75, mig 0154). Prevents dead records.

## Business Memory Layer
Every object remembers: previous decisions · communication history · approvals · changes · commitments · AI summaries. The user never restarts context. Example — *"Why did we quote AED 1.5M?"* → "BOQ received 12 Jul · similar project MAF Mall · approved margin 22% · revised after supplier quotation." *(Foundations exist: event store + unified Timeline PR #80 + immutable commercial baseline/provenance R3 mig 0165. Phase 1 surfaces them uniformly as History & Outcome.)*

## AI Evolution (not a sudden Phase 8)
- **Level 1 — Embedded Intelligence (Phases 1–7, already live):** risk detection, missing information, recommended action, summaries (`composeAiNoticed`).
- **Level 2 — AI Assistants (Phase 8):** "prepare quotation", "summarize customer", "write scope".
- **Level 3 — AI Agents (later):** Sales / Proposal / Pricing / Compliance — autonomous controlled workflows.
- **Always:** permission · approval · audit.

## Commercial = view-workspace (RESOLVED)
`My Day · Accounts · Contacts · Sales Pipeline · Commercial · Activities` + My Day. Commercial surfaces Pricing · Quotations · Contracts · Approvals · Margins as **linked views**; records stay domain-owned (no data move). Applied in Phase 6. Amends `crm-final-ia`.

---

## Implementation sequence (build ONE phase at a time)
- **Phase 0 — Finish current WIP [S]:** verify/commit uncommitted `quotation-360-client.tsx`, `sales-pipeline-workspace.tsx`, `signals-radar.tsx`, `signals/[id]/advance/`, modified 360 clients; e2e green; render each page.
- **Phase 1 — Universal Object Shell [M, KEYSTONE]:** 7-part shell on `record-shell.tsx` (Situation, Business Health, Missing Information, Recommended Action, Outcome Loop, back-context with preserved filters/scroll). Rules from `shared` — no migration.
- **Phase 2 — Opportunity + Lead intelligence [M–L]:** Deal Room + stage gates; Lead-as-signal + lifecycle.
- **Phase 3 — Account + Contact relationship [M].**
- **Phase 4 — Pipeline + Radar [M–L]:** 4 views in one page (Board·Radar·Forecast·Risk Queue).
- **Phase 5 — Communication [M]:** MS-Graph email prefill; WhatsApp deep-link only.
- **Phase 6 — Pricing + Commercial [M–L]:** pricing decision flow; assemble Commercial view-workspace.
- **Phase 7 — Documents + Export [M–L].**
- **Phase 8 — AI Assistants (L2) [L, deferred].**
- **Phase 9 — Admin configuration [L, separate track]:** Admin owns config; Domain keeps accounting/tax/engineering/compliance rules.

## Definition of Done
1. A new user understands any page within 2 seconds.
2. Every record answers: what is this? · why now? · what next?
3. No important object exists without owner · status · next action · history.
4. Users complete business journeys without external spreadsheets (Journey Integrity).
5. Management can export reliable business intelligence.
6. AI improves decisions without bypassing controls.

## UX Acceptance Tests (run per CRM entity)
Open record → verify: ✓ purpose clear · ✓ situation visible · ✓ risk visible · ✓ next action available · ✓ action creates/updates an activity · ✓ outcome captured · ✓ Back returns to previous context (filters + scroll preserved).

## Guardrails
Sidebar stays 5 CRM pages + My Day (queues/radar/leads = views). No business rule leaves `shared`. WhatsApp = deep-link only. AI = permissioned + audited. Outcome Loop = inline, never a blocking modal.
