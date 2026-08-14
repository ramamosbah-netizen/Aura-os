# Project Delivery Workspace — Specification (Rev 1)

**Status:** Draft for approval · **Date:** 2026-08-13 · **Author:** platform audit
**Scope base:** verified against `main` @ `60a95fc1` (audit Rev 2.5)

> **الفكرة (Arabic framing).** بدل أن يتنقل المهندس بين Engineering / Site / Quality / HSE / Commissioning كوحدات منفصلة على مستوى المؤسسة، يدخل إلى **مشروعه** ويدير التنفيذ بالكامل من مكان واحد — بمساعدة **AI لديه سياق المشروع الكامل**، ضمن حوكمة صارمة: الـ AI **يقترح ويجهّز**، والمهندس **يراجع ويعتمد**، والنظام **ينفّذ عبر البوابات (gates) ويسجّل في سجل التدقيق**. هذا يحوّل الـ 7 workflows المُختبَرة من "محرّكات" إلى **مساحة عمل تنفيذ مشروع** فعلية.

---

## 0. Evidence base — what already exists vs what is net-new

This spec is deliberately grounded: most of the vision is **wiring existing primitives**, not new invention. Verified on `main`:

| Vision element | Reality on `main` (evidence) | Verdict |
|---|---|---|
| **Governed delivery engines** | 7 workflows — engineering, site, quality, HSE, commissioning(+handover), doccontrol, amc/assets/fleet — each a state machine + gates + immutable records + reactors. 7 E2E specs / 13 tests + 9 module domain suites all green (verified today) | **EXISTS ✓** |
| **Cross-module `projectId` linkage** | Every governed entity carries `projectId` + `projectName` (`drawing.ts`, `ncr.ts`, `daily-report.ts`, `commissioning-record.ts`, …). ~28 reactors in `cross-module-subscriber.ts` | **EXISTS ✓** (the join key is universal) |
| **Project-scoped access primitive** | `shared/src/identity/access.ts:11-13` — `Scope = {kind:'org';level} \| {kind:'resource';resourceType;resourceId}`; the doc-comment's own example is **`project:X`**. `authorize()` is scope-aware (matches grant scope ↔ `AccessTarget.resource`/`orgPath`) | **PRIMITIVE EXISTS ✓** (unused for projects) |
| **Delivery personas as roles** | `access.service.ts:113-130` seeds `r-pm`, `r-site-engineer`, `r-qa-qc`, `r-hse` with exact cross-module permission maps | **EXISTS ✓** |
| **Audit ledger** | Event bus + per-workflow audit events + outbox relay + poison/dead-letter path | **EXISTS ✓** |
| **Project membership (user ↔ project ↔ role)** | No table, no service, no UI. Roles are granted at `org:tenant` level only (`access.service.ts:91`) | **NET-NEW** |
| **Scope enforcement to resource** | `PermissionsGuard` (`permissions.guard.ts`) checks the permission **string** only; it does **not** build `AccessTarget.resource` from the touched entity nor call the scope-aware `authorize()`. So a tenant-wide grant = access to every project | **NET-NEW (wiring)** |
| **Project Delivery Workspace IA** | Nav is org-wide `suite → domain → tab`; a Project 360 exists but the engines are separate top-level areas. No "one project → all delivery modules" shell | **NET-NEW** |
| **AI Project Assistant** | `ai.controller.ts` = `POST /ai/complete {prompt}` → single-message passthrough to a provider. No project context, no retrieval, no tools, no confirm/execute, no audit tie-in | **LARGELY NET-NEW** |

**Conclusion:** the delivery *substance* (engines, data, audit, roles, and even the project-scope type) is already here. Three builds turn it into the product: **(A) Project Membership + scope enforcement**, **(B) the Project-context Workspace shell**, **(C) the governed AI Assistant**.

---

## 1. Concept & the access boundary

Two **orthogonal** authority planes — this separation is the spine of the whole design:

```
User
 ├── Enterprise plane   → who administers the org/system (r-admin, finance, org config, /admin)
 └── Project plane      → who may deliver a SPECIFIC project (r-pm / r-site / r-qa / r-hse @ project:X)
```

- **`PROJECT_DELIVERY_ACCESS`** is *not* an org role. It is a **grant of a delivery role scoped to a project**: `{ userId, roleId:'r-pm', scope:{ kind:'resource', resourceType:'project', resourceId:'<projectId>' } }`.
- A Project Engineer is a **Full Delivery Manager inside their assigned projects** — and invisible everywhere else. Not an org admin.
- Enterprise-plane permissions (approve budgets, certify IPCs, org settings) are **never** granted by project membership.

---

## 2. The twelve questions, answered

### Q1 — What does a Project Engineer *see*?
A single **Project Delivery Workspace** for each project they are a member of, and nothing outside it. Left rail = the project tree from the vision (Dashboard · Engineering · Site · Quality · HSE · Assets · Materials · T&C · Documents · Issues · Progress/Reports · AI). Every list is **pre-filtered to `projectId`**; there is no org-wide "all drawings" view in this shell. Landing = **Project Dashboard** (§Q9).

### Q2 — What can they *create*?
Bounded by their role's `*.create`/`*.raise` permissions **and** the engine's entry transition. Baseline by persona:

| Persona (role) | Can create |
|---|---|
| Project Manager (`r-pm`) | anything below + project-level notes, delay/EOT, IPC draft |
| Site Engineer (`r-site-engineer`) | daily reports, activities/progress lines, material requests, inspection requests, site issues |
| QA/QC (`r-qa-qc`) | inspections, ITP records, NCRs, observations, commissioning test items/punch |
| HSE (`r-hse`) | permits, toolbox talks, HSE inspections, incidents |

### Q3 — What can they *edit*?
Only **draft/open** records they own, and only fields the engine allows. Once an aggregate crosses a gate it **freezes** (already enforced: an approved daily report is immutable; issued document revisions are immutable; a commissioned record is locked). Edits after freeze happen by the governed path — a **new revision**, a **retest**, a **reopen-on-reject** — never an in-place status flip.

### Q4 — What can they *approve themselves*?
Only the gates their role owns, and only where **segregation of duties** allows. Examples that are already enforced as gates:

| Self-approvable by role | Gate (evidence) |
|---|---|
| QA closes an NCR after verification | `ncr` verify loop; accepted ⇒ closed |
| QA commissions a system | `commissioning.service` — needs all points passed **and** no open punch (409 otherwise) |
| Site Engineer submits a daily report | draft → submitted |
| HSE approves a permit | 3 gates: approved RA · **segregation of duties** · validity window |

### Q5 — What needs *someone else* to approve?
Anything where the creator ≠ approver by policy, or where the authority is enterprise-plane:

| Action | Requires |
|---|---|
| Approve a drawing/submittal the same person submitted | a different reviewer (drawing review gate) |
| Approve a permit requested by oneself | segregation of duties → a second actor (HSE gate; verified inert-until-two-actors) |
| Certify an IPC / approve a variation value / release payment | **enterprise plane** (finance/commercial), never project membership |
| Accept project handover | client/PM acceptance gate, gated on commissioning complete |

### Q6 — What can the *AI do* (execute)?
Only **low-risk, reversible, draft-producing** actions, and always through the same governed path as a human — via typed tools, never raw writes. Green-tier (AI may execute after a one-line user confirm):
- Assemble & draft today's site report from existing signals; draft weekly/client reports.
- Add line-items to a **draft** report (manpower, plant, installed quantities, photos).
- Draft an NCR / RFI / observation (status = draft, unassigned).
- Compute status, find blockers, predict delay risk, cross-check documents. (read-only → no confirm needed.)

### Q7 — What can the AI only *suggest* (never execute)?
Red-tier — AI **prepares and recommends**, a human commits:
- Any **gate crossing**: approve/close NCR, commission, approve permit, issue a document revision, approve a drawing, accept handover.
- Anything with **money or legal effect**: IPC, variation value, payment.
- Anything touching **segregation of duties** or enterprise-plane permission.

**Governance pipeline (mandatory for every AI action):**
```
AI → prepare/suggest → Engineer reviews → Engineer confirms → System executes via typed tool
   → workflow gate (may still 409) → domain event → Audit Ledger (actor = engineer, agent = AI, on behalf)
```
The AI never bypasses a gate; a gate can still refuse an AI-prepared, human-confirmed action, and that refusal is the correct, audited outcome.

### Q8 — Cross-module workflows
These already exist as reactors; the workspace **surfaces** them as project-delivery flows:
- Inspection **fails** → raise **NCR** (provenance carried) → corrective action → verify → close.
- Commissioning test **fails** → **punch item** → blocks commission (409) → fix/retest → commission → **unlocks handover**.
- Drawing **approved** → transmit → **doccontrol transmittal** + acknowledgement.
- Daily report **approved** → progress ledger / KPI roll-up.
- Material shortage (site request vs stock) → flags CCTV/other installation risk on the dashboard.

### Q9 — Dashboard & KPIs
The Project Dashboard is a **composition over the engines**, keyed by `projectId`. The vision's "today's status" is a computed digest:

| KPI | Source |
|---|---|
| Progress % | site progress lines / WBS roll-up |
| Critical blockers | open NCRs (major) + open punch + overdue RFIs + material shortages |
| Overdue RFIs | engineering RFI due dates |
| Open NCRs | quality |
| Material status | site requests vs inventory stock |
| Commissioning status / delay | commissioning + schedule |
| Actions due this week | aggregated open actions across engines |
| HSE standing | open permits, incidents, overdue actions |

This same digest is the **AI's context payload** for "give me today's project status" (§C).

### Q10 — How everything links to the project
`projectId` is the **universal join key** (already on every governed entity). The workspace passes it into every list, create, and query; the dashboard and AI context assemble by fanning out on it. No schema change needed for linkage — only consistent use of the existing column.

### Q11 — How each action is audited
Every state transition already emits a domain event onto the bus → audit trail + outbox. The workspace adds two fields to the audit envelope for AI-assisted actions: **`actorId`** (the confirming engineer — the accountable human) and **`agent`** (`ai` when AI prepared it). Immutable records (verifications, revisions, closed punch with resolution) are preserved as history, never deleted.

### Q12 — How we guarantee an engineer sees only their project
This is the **one enforcement gap to close** (see §A). Today the guard checks permission strings only. Required:
1. Resolve the **touched `projectId`** on each delivery route (from body, param, or loaded entity).
2. Build `AccessTarget { permission, resource:{type:'project',id}, orgPath }` and call the existing scope-aware `authorize()`.
3. A grant scoped `resource:project:X` authorizes **only** targets on project X; a tenant grant still covers all (enterprise roles).
4. Belt-and-suspenders: list endpoints in the workspace require a `projectId` the actor is a member of; RLS remains the tenant floor beneath this.

---

## 3. Architecture deltas (what to build)

### A. Project Membership + scope enforcement  *(foundation)*
- **New:** `project_members` (userId, projectId, roleId, addedBy, at) as **grants** with `scope:{kind:'resource',resourceType:'project',resourceId}` — reuse `AccessService`, don't fork it.
- **Wire:** `PermissionsGuard` builds `AccessTarget.resource`/`orgPath` for delivery modules and calls `authorize()` (the scope-aware function already in `shared`).
- **UI:** project **Team** tab — add/remove members, assign delivery role (PM-only, itself a gate).
- Migration: `project_members` table + FORCE RLS; SDK regen.

### B. Project Delivery Workspace shell  *(the product surface)*
- **New route group** `/project/[projectId]/…` re-projecting the 7 engines under one project context, left rail = the vision tree.
- A `ProjectContext` provider carrying `projectId` + the member's role → drives nav visibility (Q1) and pre-filters every list (Q10).
- **Reuse** existing 360s/registers as the leaf pages, scoped; add the Project Dashboard (Q9).

### C. Governed AI Project Assistant  *(the differentiator)*
- **Context assembler:** one service that fans out on `projectId` and returns the Q9 digest + drill-downs (the "full context" the vision demands).
- **Tool catalog:** typed, permission-checked, risk-tiered tools (green = draft/execute-after-confirm, red = suggest-only) — each maps to an existing service method, so gates & audit apply unchanged.
- **Confirm gate in UI:** AI proposes a concrete action (diff/preview) → engineer confirms → tool runs → gate → audit (`agent:'ai'`).
- Replace the bare `/ai/complete` passthrough with a project-scoped assistant endpoint that takes `projectId` + turns and returns text **and** proposed tool-calls.
- **Model:** target the latest Claude models via the Anthropic SDK; keep the provider seam that already exists.

---

## 4. Proposed build sequence (one PR per slice)

| # | Slice | Delivers | Depends on | Status |
|---|---|---|---|---|
| **P1** | Project Membership + Team UI | grants scoped to `project:X`; add/remove members | — | **✅ shipped (PR #214)** |
| **P2** | Scope enforcement in guard | engineers see only their projects (Q12) | P1 | **✅ shipped** |
| **P3** | Project Workspace shell + nav | `/project/[id]` with the delivery tree, lists pre-filtered | P2 | next |
| **P4** | Project Dashboard + KPI digest | Q9 composition (also the AI context payload) | P3 | — |
| **P5** | AI context assembler (read-only) | "today's project status" grounded in real data | P4 | — |
| **P6** | AI tool layer + confirm gate (green-tier) | "create today's site report", add line-items | P5 | — |
| **P7** | AI suggest-only (red-tier) + audit `agent` field | prepared-but-human-committed gate actions | P6 | see [[p7-01-governed-metered-runtime]] (parallel) |

P1–P4 are mostly **wiring existing primitives** (low risk). P5–P7 are the genuinely new capability and should be gated behind a feature flag until the confirm-gate UX is proven.

**P2 as built (`PermissionsGuard`):** on a project-scoped module (`projects`, `engineering`, `site`, `quality`, `hse`, `commissioning`, `doccontrol`) the guard resolves the touched project from `params.projectId` / `body.projectId` / `query.projectId` and stamps `AccessTarget.resource = project:<id>`. A `resource:project:X` grant then authorises X and only X; an org/tenant grant is unaffected (org grants match by `orgPath`, ignoring the resource) — so the change is strictly additive and enterprise access is untouched. **Boundary:** routes that address an entity only by its own id (e.g. `site/daily-reports/:id`) do not expose the project without loading it, so a project-only member is not yet authorised there — resolving entity→project (service-layer or a per-route resolver) is a follow-up slice. Enforcement engages only when an auth verifier is configured (dev/CI run auth-off pass-through), so no current environment behaviour changes.

---

## 5. Open decisions (need your call)

1. **Project-scope representation:** use `resource:project:X` (works today, zero type change) — recommended — **vs** add `'project'` to `OrgLevel` (cleaner tree semantics, touches the scope type + tests). 
2. **AI action boundary for P6:** does "green-tier execute-after-confirm" include creating a **draft NCR/RFI**, or only report/line-item drafting in v1?
3. **Membership admin:** may a **Project Manager** add project members (project-plane), or is membership strictly an **enterprise/admin** action?
4. **First vertical to prove end-to-end:** Site daily-report + AI report drafting (highest daily use) vs Quality NCR (highest governance value)?

---

*This spec turns AURA OS from a set of governed modules into a project-delivery platform without re-architecting: the engines, the audit ledger, the project join key, the scope primitive, and the delivery roles are already in the tree. The work is membership, scope-wiring, a project-context shell, and a governed assistant on top.*
