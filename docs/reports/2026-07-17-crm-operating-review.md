# CRM Operating Review — module 1 (AURA Operating Review Program)

**Date:** 2026-07-17 · **Method:** static read of `apps/web/app/crm/**`, the CRM sidebar (`nav.ts`), and the CRM clients. · **This module is the TEMPLATE** — CRM must be fully closed (all 3 layers + resulting PRs merged + Journey Audit re-run and improved) before any other module starts.

The **AURA Operating Review Program** runs **three layers** per module (Doctrine is one layer, not the whole thing):
- **L1 Journey Audit** — does the business journey complete inside AURA? (scored /100; CRM: Direct Sale 82, Tender 65).
- **L2 Architecture (Doctrine) Audit** — does the page obey the Constitution? (one purpose · progressive disclosure · Queue-vs-Workspace · Entity-vs-Work page).
- **L3 Operating-Experience Audit** (leads now) — per page, the 7 questions: why open it? what do I accomplish? easily? unneeded info? missing info? duplicated step? **dead end?**

**Locked rule:** never delete OR keep a surface on API/code/data similarity — prove *why a user opens it* first. A **distinct intent that the current (broken) implementation fails to serve → repurpose, don't delete** (a blind delete buries a real unserved need).

## The measuring stick (from the Constitution)
1. Organize by **User Intent**, not modules.
2. **One Purpose per Page** — two surfaces answering the same question = a duplication.
3. **Preserve Context** — same-entity moves (Contacts/**Activities**/Documents) stay *inside* the 360.
4. **Expose only the next logical action.**
5. **Journey Integrity.**
Plus the 3 page types (Entity 360 · Operational · Queue) and: **Queues are Saved Views, never sidebar items.**

## Sidebar inventory vs the locked IA — ✅ COMPLIANT
Current CRM sidebar group: **My Day · Accounts · Contacts · Sales Pipeline · Quotations · Activities**.
That is exactly the locked IA (My Day entry + 5 work pages). No queue masquerading as a sidebar page. Entity pages (Account/Contact/Lead/Opportunity/Quotation 360) are not split. Good.

## Duplication / violation register

| # | Finding | Severity | Doctrine breached | Fix |
|---|---------|----------|-------------------|-----|
| **D1** | **Activities pipeline tab has the WRONG CONTENT (INTENT-AUDITED, verdict flipped from "delete").** The **Work Center** = actionable urgency agenda (complete · outcome · follow-up · create), intent "close out my touchpoints." The **pipeline tab** = read-only global dump, no actions, not deal-scoped = a Dead End *as built*. **But** the "**Opportunity Activities**" intent (a rep working the pipeline wanting ONLY their active opportunities' touchpoints, actionable) is **real and served by nothing**: the Work Center has no related-type filter, and the backend `ActivityFilter.relatedType` already supports the scope. A blind delete buries a genuine unserved need. | 🟠 Medium | #2 One Purpose; #4 next-action; OpEx Dead-End + Missing-info | **Repurpose the tab → "Opportunity Activities"**: filter to `relatedType=opportunity` (active), add Complete / Follow-up / Open-Opportunity. **Alt (doctrine-purer):** delete the tab + add a related-type saved view to the Work Center, linked from the pipeline. Fork = user's intent call. |
| **D2** | **"Commercial" is a mental-model gap, not a missing rename.** The user thinks "where's everything *commercial*?" not "where's the Quotations page?". Today there's only a Quotations page. | 🟡 Low | #1 Organize by intent | Build **Commercial as a Workspace** grouping Pricing · Quotations · Contracts · Approvals · Margins as **linked views**, data ownership staying in the origin modules (tendering/CRM/contracts). Transformation Phase 6. NOT a nav-label swap. |
| **D3** | **Three adjacent "what now?" surfaces** — My Day (cross-domain daily entry), Activities Work Center (touchpoint agenda), Sales Pipeline → Overview (deal cockpit + at-risk). Intents are *distinct* (start-my-day vs work-touchpoints vs triage-deals), so this is **not** a true duplication — but the boundaries are subtle and worth a one-purpose gut-check as they evolve. | 🟢 Watch | #2 (borderline) | No change now. Keep My Day = router-to-work, not a work surface (doctrine: dashboards route, never become the work page). |
| **D4** | **"Attention/priority" engines** — Advisor (ambient), Relationship Alerts, Signals Radar, Lead Attention, My Day "AI noticed". | ✅ Not a dup | — | Already consolidated in PR #85 (deleted the 6th "Intelligence" page; distributed by context, which the doctrine allows). Leave as-is. |

## What's already right (compliance highlights)
- **Principle 3 honoured:** every 360 (Account/Contact/Lead/Opportunity/Quotation) embeds the unified `<Timeline>` — a record's activities stay inside its entity page.
- **No queues in the sidebar** — at-risk/overdue/expiring surface from My Day, pipeline Overview, and the Advisor, not as nav items.
- **Deal-chain split** — Tender/Contract/Project correctly live in the Deal-chain nav group, not inside CRM.
- The recent 360 consolidation (deal-room panels → tabs, #142) removed a real long-scroll violation.

## Compliance scorecard (CRM)
| Principle | Rating | Note |
|---|---|---|
| Organize by intent | 8/10 | Commercial amendment (D2) not yet applied |
| One purpose per page | 7/10 | Activities double-up (D1) |
| Preserve context | 10/10 | 360 timelines, back-to-entity |
| Next logical action | 9/10 | Situation band / NBA across 360s |
| Queue = Saved View | 10/10 | No queue in sidebar |
| **Overall** | **≈ 8.5/10** | One clear fix (D1) + one deferred amendment (D2) |

## L3 — Operating-Experience pass (journey order, 5-state)
Reviewed in the natural user path. Each surface → the 7 questions → one state: ✅ Keep · 🔄 Reshape · 🔀 Merge · ❌ Remove · 🟦 Unserved Intent.

| # | Surface | Intent (why open it) | Finding (7-Q) | State |
|---|---------|----------------------|---------------|-------|
| 1 | **My Day** | "Where do I focus today?" | Entry point; routes to work (doesn't become the work). One watch: the "AI noticed" rail vs the ambient **CrmAdvisor** vs **RelationshipAlerts** — 3 attention *render* surfaces (engine already unified in #85). | ✅ Keep · 🔀 watch (attention surfaces) |
| 2a | **Pipeline · Radar** | Triage market signals | Distinct acquisition-inbox intent. | ✅ Keep |
| 2b | **Pipeline · Overview** | Deal cockpit + at-risk | Pipeline-scoped (≠ My Day's cross-domain). | ✅ Keep |
| 2c | **Pipeline · Board** | Move deals across stages (drag-drop) | Visual stage management. | ✅ Keep |
| 2d | **Pipeline · List** | Find/scan/filter deals | Distinct from Board (search vs manage). | ✅ Keep |
| 2e | **Pipeline · Analytics** | Performance/sources/executive | Analyze intent. | ✅ Keep |
| 2f | **Pipeline · Activities** | *(none as built — global read-only dump)* | **Dead End**; the real "Opportunity Activities" intent is unserved. | 🔄 **Reshape** → card + deep-link (D1) |
| 3 | **Lead 360** | Qualify & convert a lead | Overview/Qualification/Convert = distinct steps. | ✅ Keep |
| 4 | **Account 360** | The customer hub | Portfolio + inline contacts + timeline; its "Commercial portfolio" block foreshadows the Commercial workspace. | ✅ Keep |
| 5 | **Contact 360** | The person | Stakeholder role + timeline. | ✅ Keep |
| 6 | **Opportunity 360** | Work the deal | 9 tabs after #142 consolidation — heavy on progressive disclosure (Journey / Win Plan / Deal Depth are "Advanced"). "Activity" tab = record timeline (Principle 3, correct). | ✅ Keep · 🔄 watch (tab density) |
| 7 | **Commercial Workspace** | "Where's everything commercial?" | **Does not exist.** Only a Quotations page today. | 🟦 **Unserved Intent** |
| 8 | **Activities Work Center** | "Close out my touchpoints" | Correct execution home, BUT no related-type filter and no URL-param saved views → can't serve the pipeline's "Opportunity Activities" deep-link. | 🔄 **Reshape** (add saved views) |

## Execution plan (small PRs, in order)
1. **PR-CRM-1 · Opportunity Activities** (closes D1 + finding 8): Work Center gains a **related-type filter + URL-param saved views**; Sales Pipeline drops the full Activities tab and adds a **contextual card** (Pending / Overdue / Due-Today counts) linking to the WC saved view (`relatedType=opportunity, status!=completed`). One coherent, behaviour-preserving PR. **← recommended first.**
2. **PR-CRM-2 · Commercial Workspace** (closes D2 + finding 7): build Commercial as a **Workspace of linked views** (Pricing · Quotations · Contracts · Approvals · Margins), data owned by origin domains. Bigger; its own slice.
3. **Watch items** (fold into the above or a small polish PR): converge the 3 attention *render* surfaces (My Day / Advisor / Alerts); reassess Opportunity 360 tab density against progressive disclosure.

**Close-out:** after PR-CRM-1 (+2) merge, **re-run the L1 Journey Audit** (Direct Sale + Tender) — the target is a measurable rise (fewer dead-ends, clearer next-actions). Only then does CRM count as "closed," and **Tendering** starts as the same three-layer template.
