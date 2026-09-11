# AURA OS — Capability Audit, Phase 1 (Static Discovery)

**Scope:** Sales · Pre-Sales · Project Management · Engineering.
**Mode:** Discovery only — nothing fixed, nothing added. This is the inventory the fixes will later
be prioritised against.
**Date:** 2026-09-11.

This is the first of two passes. Phase 1 (this document) reads the code and scores what provably
exists. Phase 2 drives the running app through the **same matrix** and settles every cell this pass
had to leave `UNVERIFIED` — the UX and in-browser behaviour a static read cannot honestly judge.

The discipline the audit was asked to hold: **backend depth never masks a missing workflow, and a
page never masks a missing lifecycle.** So "the domain model exists" scores one cell and one cell
only; a capability is not COMPLETE until a user can create it, find it again, act on its lifecycle,
and see the result — confirmed in Phase 2.

---

## The 14 dimensions

| # | Dimension | Decidable statically? |
|---|---|---|
| 1 | Domain model exists | yes |
| 2 | DB persistence | yes |
| 3 | API | yes |
| 4 | Permissions / RLS | yes (RBAC guards + RLS policy) |
| 5 | Events / audit | yes |
| 6 | UI reachable (route + BFF) | yes |
| 7 | Create (UI) | wiring: yes · renders+works: Phase 2 |
| 8 | View (UI) | wiring: yes · renders+works: Phase 2 |
| 9 | Edit / update (UI) | wiring: yes · renders+works: Phase 2 |
| 10 | Lifecycle actions (UI) | wiring: yes · renders+works: Phase 2 |
| 11 | Errors / empty / loading / success states | **Phase 2** |
| 12 | Cross-module handoff | yes (subscriber + e2e) |
| 13 | Browser proven | e2e spec: yes · live walk: Phase 2 |
| 14 | UX usable (clarity, clicks, terminology, hydration, keyboard, responsive) | **Phase 2** |

"Wiring: yes" means the end-to-end path exists in code — a BFF route the client calls, and a client
form/handler that calls it. It is strong evidence the workflow is reachable; it is **not** proof the
control renders, guards its states, and reads well. Those are dimensions 11 and 14, and they are the
whole reason Phase 2 exists.

## Classification codes

`COMPLETE` · `PARTIAL` · `BACKEND_ONLY` · `UI_ONLY` · `ABSENT` · `DUPLICATED` · `WRONG_AUTHORITY` ·
`UNREACHABLE` · `UNVERIFIED`

Because dimensions 11 and 14 are unverified for every capability until Phase 2, **no capability can
be scored `COMPLETE` yet.** The best a static pass can award is `COMPLETE (wiring)` — every code
cell present, UX pending. That honesty is the point.

Cell key: `✓` evidenced present · `~` present but partial/inconsistent · `✗` absent ·
`?` UNVERIFIED (Phase 2) · `n/a` not applicable.

---

## Sales (CRM)

Backend: 27 API controllers, 41 route-level `@Permissions` + 15 service-level `access.assert`, 62
event emitters, 19 Postgres stores. UI: a full route tree (`crm/leads|opportunities|pipeline|
quotations|forecast|campaigns|accounts|contacts|radar|analytics|…`) with `[id]` detail pages, and a
deep pre-award package under `opportunities/[id]/pre-award/*`.

| Capability | Model | DB | API | Perm | Evt | UI+BFF | Create | View | Edit | Lifecycle | Handoff | E2E | States/UX | Class (static) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Signal / Radar | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | promote→lead | ✓ | ✓ | ? | COMPLETE (wiring) |
| Lead | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | accept·qualify·convert | ✓ | ✓ | ? | COMPLETE (wiring) |
| Opportunity | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | qualify·pursuit·convert-to-quotation | ✓ | ✓ | ? | COMPLETE (wiring) |
| Pre-award package (scope/estimate/pricing) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | approve·freeze·revision·policy | ✓ | ~ | ? | COMPLETE (wiring) |
| Quotation (+pricing, SoD approval) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | approve(SoD)·convert | ✓ | ✓ | ? | COMPLETE (wiring) |
| Account / Contact (360) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ? | COMPLETE (wiring) |
| Activity | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | → My Work | ✓ | ✓ | ? | COMPLETE (wiring) |
| Campaign | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✗ | ? | COMPLETE (wiring) |
| Forecast / pipeline analytics | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | n/a | — | ✗ | ? | COMPLETE (wiring) |
| Negotiation / deal brief / relationship-intel | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ~ | — | ✗ | ? | COMPLETE (wiring) |

**Read:** Sales is the most complete surface by every static measure — the deepest commercial
workflow in the system (radar→lead→opportunity→pre-award→quotation), fully permission-guarded, fully
wired to UI. Nothing here scores below COMPLETE(wiring). Phase 2 confirms it *works and reads well*.

---

## Pre-Sales

Split by design across CRM (solutioning/quoting) and the Tendering module (competitive bids).

Tendering backend: 5 controllers, 13 event emitters, 8 stores, 4 audit writes. It carries **0
explicit `@Permissions` decorators and 0 `access.assert` calls — but it is NOT ungated** (see the
correction below and Finding F1): the global `PermissionsGuard` derives a permission from every
tendering route, and tender creation runs through the command bus with an explicit
`permission: 'tendering.tender.create'`. BFF is rich: tenders CRUD, award, BOQ (import/upload/items),
clarifications (+answer), pricing (+csv/items), quotation, status, bid-scores.

| Capability | Model | DB | API | Perm | Evt | UI+BFF | Create | View | Edit | Lifecycle | Handoff | E2E | States/UX | Class (static) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Solution scope / scope-assist (CRM) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | approve·accept | ✓ | ~ | ? | COMPLETE (wiring) |
| Estimate + build-ups (CRM/tendering) | ✓ | ✓ | ✓ | ✓der | ✓ | ✓ | ✓ | ✓ | ✓ | freeze·approve | ✓ | ✓ | ? | COMPLETE (wiring) |
| BOQ (+import/upload) | ✓ | ✓ | ✓ | ✓der | ✓ | ✓ | ✓ | ✓ | ✓ | import | ✓ | ✓ | ? | COMPLETE (wiring) |
| Tender | ✓ | ✓ | ✓ | ✓der+cmd | ✓ | ✓ | ✓ | ✓ | ✓ | status·award | ✓ | ✓ | ? | COMPLETE (wiring) |
| Tender pricing | ✓ | ✓ | ✓ | ✓der | ✓ | ✓ | ✓ | ✓ | ✓ | csv | ✓ | ~ | ? | COMPLETE (wiring) |
| Clarifications | ✓ | ✓ | ✓ | ✓der | ✓ | ✓ | ✓ | ✓ | ✓ | answer | ✓ | ✗ | ? | COMPLETE (wiring) |
| Bid score | ✓ | ✓ | ✓ | ✓der | ✓ | ✓ | ✓ | ✓ | ~ | — | ✗ | ? | COMPLETE (wiring) |
| Award → Contract | ✓ | ✓ | ✓ | ✓der | ✓ | ✓ | n/a | ✓ | n/a | tender.awarded→contract | ✓ | ✓ | ? | COMPLETE (wiring) |
| Win/Loss | ✓ | ✓ | ✓ | ✓der | ✓ | ✓ | ✓ | ✓ | n/a | — | ✓ | ? | COMPLETE (wiring) |

`✓der` = guarded by a permission **derived from the route** by the global guard (e.g. `POST
/tendering/tenders/:id/award` → `tendering.tender.award`); `✓cmd` = an explicit command-bus
permission. Neither needs a decorator to bite.

**Read:** The pre-sales *workflow* is complete and UI-wired. My first pass wrongly flagged the whole
Tendering module as ungated; that was a **method error, corrected here** (F1). RBAC in this system is
enforced through a *layered* model — a global guard that **derives** the required permission from the
route unless an explicit `@Permissions` overrides it, plus command-bus permissions and service-level
asserts for finer checks — so counting only decorators/asserts (which is what the first grep did)
drastically undercounts authorization. Tendering is guarded. The one genuine residual is a
grant-catalog check (F1), deferred to a permission-taxonomy review, not a "no RBAC" claim.

---

## Project Management (Projects)

Backend: the largest module — `projects.controller.ts` (huge) + members controller, 12 route
`@Permissions` + 10 service `access.assert`, 25 event emitters, 16 stores, 8 audit writes. BFF covers
the full lifecycle set below.

| Capability | Model | DB | API | Perm | Evt | UI+BFF | Create | View | Edit | Lifecycle | Handoff | E2E | States/UX | Class (static) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Project (lifecycle) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | status (planned→active→completed) | contract.signed→project | ✓ | ? | COMPLETE (wiring) |
| WBS + baseline | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | baseline | ✓ | ✓ | ? | COMPLETE (wiring) |
| CBS + cost ledger | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | cost transactions | ✓ | ✓ | ? | COMPLETE (wiring) |
| Schedule + resource allocation (§22) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | planning-run·accept·baseline·bookings | ✓ | ✓ | ? | COMPLETE (wiring) |
| EVM / cashflow | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | ~ | — | ✓ | ? | COMPLETE (wiring) |
| Risks | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | status·materialise→issue | ✓ | ✓ | ? | COMPLETE (wiring) |
| Issues | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | status | ✓ | ✓ | ? | COMPLETE (wiring) |
| Variations | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | status | ✓ | ✓ | ? | COMPLETE (wiring) |
| Delays / EOT | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | submit·decide·analysis | ✓ | ✓ | ? | COMPLETE (wiring) |
| Closeout + readiness | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | finalize·§27 gate | project.completed→contract.completed | ✓ | ? | COMPLETE (wiring) |
| Handover | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ? | COMPLETE (wiring) |
| Cost/Quantity transactions, resource-facts, delivery-item-map, health-signals | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | internal | ✓ | n/a | INTERNAL (not user CRUD) |

**Read:** PM is deep and fully wired. The last row is called out deliberately (Finding F5): these are
**infrastructure primitives** (ledgers, event facts, health derivations), correctly having no
dedicated CRUD screen — they must not be mis-scored `ABSENT`/`BACKEND_ONLY`, because a user is never
meant to "create a cost transaction" by hand.

---

## Engineering

The hypothesis going in was "backend-rich, UI-thin." **The evidence refutes it.** The route tree
looks thin (`engineering/page.tsx` + `drawings/`), but `page.tsx` renders `engineering-client.tsx`
(1,877 lines): a tabbed workspace with tabs **and create forms** for overview, drawings, RFIs,
submittals, design-changes, documents, technical-queries, BIM. Backend: 1 controller with full CRUD
+ lifecycle for every capability; **0 route `@Permissions` but 13 service `access.assert`** (guarded
at the service layer, not the route); 19 event emitters; 9 stores. BFF: **every** lifecycle endpoint
has a matching route.

| Capability | Model | DB | API | Perm | Evt | UI+BFF | Create | View | Edit | Lifecycle | Handoff | E2E | States/UX | Class (static) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Drawing (+revisions) | ✓ | ✓ | ✓ | ✓der+svc | ✓ | ✓ | ✓ | ✓ | ✓ | submit·start-review·review·revise·transmit·close | ✓ | ✓ | ? | COMPLETE (wiring) |
| RFI | ✓ | ✓ | ✓ | ✓der+svc | ✓ | ✓ | ✓ | ✓ | ✓ | answer | ✓ | ✗ | ? | COMPLETE (wiring) |
| Submittal | ✓ | ✓ | ✓ | ✓der+svc | ✓ | ✓ | ✓ | ✓ | ✓ | status | ✓ | ~ | ? | COMPLETE (wiring) · see F2 |
| Technical Query | ✓ | ✓ | ✓ | ✓der+svc | ✓ | ✓ | ✓ | ✓ | ✓ | respond | ✓ | ✗ | ? | COMPLETE (wiring) |
| Design Change | ✓ | ✓ | ✓ | ✓der+svc | ✓ | ✓ | ✓ | ✓ | ✓ | decision | ✓ | ✗ | ? | COMPLETE (wiring) |
| Engineering Document | ✓ | ✓ | ✓ | ✓der+svc | ✓ | ✓ | ✓ | ✓ | ✓ | transition | ✓ | ✓ | ? | COMPLETE (wiring) |
| BIM Model | ✓ | ✓ | ✓ | ✓der+svc | ✓ | ✓ | ✓ | ✓ | ✓ | version | ✓ | ✗ | ? | COMPLETE (wiring) |

**Read:** Engineering is wired end to end for all eight capabilities, and it is permission-guarded —
by the global guard's **route-derived** permissions *and* 13 service-level `access.assert` calls
(`✓der+svc`). The earlier "service-only / 0 route" impression was the same method error as tendering:
absence of `@Permissions` decorators is not absence of authorization. The one honest caveat that
remains is e2e coverage: RFI, Technical Query, Design Change and BIM have **no e2e spec** (`✗`), so
their live behaviour is entirely Phase-2-dependent. This is where dimensions 11/14 matter most: the
*forms exist*; whether a user can raise an RFI, send it, watch it age, get a response and close it
**cleanly** is exactly what Phase 2 must drive.

---

## Findings register (discovery — no fixes)

Separated into the three buckets requested: missing capability · backend-only · UX problem — plus
permissions and structure, which are neither.

### Permissions / authority
- **F1 · Authorization is layered — and easy to under-count (method correction).** My first pass
  scored tendering and engineering as ungated because it grepped only `@Permissions` decorators and
  `access.assert` calls. That was **wrong**, and the correction is the finding: RBAC here is enforced
  by (a) a **global `PermissionsGuard` (`APP_GUARD`)** that *derives* the required permission from the
  route — e.g. `POST /tendering/tenders/:id/award` → `tendering.tender.award` — for every module
  except `{health, auth, metrics}`; (b) explicit `@Permissions` decorators that *override* the
  derived default where it is wrong; (c) **command-bus** registrations carrying a `permission` (e.g.
  `tendering.tender.create`); and (d) service-level `access.assert`. Tendering and engineering are
  guarded by (a) + their own of (c)/(d). *No "no RBAC" gap exists.* Two genuine residuals remain, and
  both are **Phase-1.5 verification, not code gaps**:
  - **F1a — taxonomy/grant coverage.** Do the *derived* permission strings (e.g.
    `tendering.tender.award`, `engineering.rfi.answer`) exist in the role catalog and map to the
    intended roles? A derived permission nobody is granted fails **closed** (safe); the risk is the
    other way — a role granted a broad wildcard (`tendering.*`) that over-permits. This needs a
    grant-matrix review, not a code change.
  - **F1b — auth must be ON in production.** The guard early-returns `true` when `auth.enabled` is
    false (the dev/e2e default). All of the above is real *only* when auth is enabled — the same
    posture note as AURA-RLS-002 for RLS. A production readiness gate, not a domain gap.
- **F3 · The layered model is by design, not an inconsistency.** Route-derivation gives every route a
  sane default; `@Permissions` overrides it where the taxonomy differs; command/service checks add
  finer gates. That is coherent defence-in-depth. The only actionable item is documentation: an
  auditor reading for `@Permissions` alone (as I first did) will mis-read derived-guard modules as
  open. Worth one line in the security runbook stating "absence of `@Permissions` ≠ unguarded; the
  global guard derives."

### Structure / duplication
- **F2 · Submittals exist as two separate aggregates in two modules (DUPLICATED — confirmed).** Not
  two views of one record: `modules/engineering/src/domain/submittal.ts` and
  `modules/doccontrol/src/domain/submittal.ts` are each a distinct domain model with its **own store,
  service, tests, API (`/engineering/submittals` vs `/doccontrol/submittals`) and UI**. In ELV
  practice a material/technical submittal *is* a document-control submittal, so two registers can
  drift — a submittal raised in one is invisible in the other. This may be intended layering
  (engineering = the review workflow; doccontrol = the formal transmittal register) or a genuine
  duplicate. *Needs an authority decision: which module owns the submittal of record, and is the
  other its consumer or a parallel copy? Phase 2 must also check whether a user can tell which one to
  use.* Severity: medium (data-integrity / user-confusion risk, not a security or data-loss issue).

### Missing capability
- **None found in the four domains at the workflow level.** Every capability with a domain model has
  an API, a BFF route, and a UI surface that calls it. (This is a genuine, and genuinely good,
  result of the static pass — subject to Phase-2 confirmation that the surfaces render and work.)

### Backend-only capability
- **None in the four domains among *user* capabilities.** The only model-without-UI cases are the PM
  infrastructure primitives (F5), which are correctly internal.
- **F5 · Infra primitives, not defects.** cost/quantity transactions, resource-facts,
  delivery-item-map, health-signals — internal, no CRUD screen expected. Recorded so they are not
  mis-scored later.

### UX problem (all deferred to Phase 2 — dimensions 11 & 14)
- **F4 · Every UX and state cell is UNVERIFIED.** No capability's empty/loading/error/success states,
  clarity, click-count, terminology, keyboard, or responsive behaviour has been observed. Nothing
  above is `COMPLETE` — only `COMPLETE (wiring)`.
- **F6 · Systemic hydration / immediate-click risk (carry-over).** The e2e flake root cause (React
  hydration: server-rendered controls accept clicks before their handler is wired) is a *real-user*
  characteristic, not just a test artefact. The app defends one spot (chat composer ships disabled
  until hydrated); Phase 2 must check, per screen, whether a fast first click is dropped.
- **F7 · E2E blind spots.** RFI, Technical Query, Design Change, BIM (engineering) and Campaign,
  Forecast, Clarifications, Bid-score have no e2e spec — their live behaviour rests entirely on
  Phase 2.

---

## Phase 2 — plan (not started)

Drive the running app through the **same matrix**, settling dimensions 7–11, 13, 14 for every row
above. For each capability, do the work a user does — **create → find it again → update → perform a
lifecycle action → hand off → verify the downstream result** — and record clarity, navigation, click
count, terminology, forms, permissions felt, empty/loading/error/success states, immediate-click/
hydration readiness, keyboard basics, responsive behaviour, and whether the next action is obvious.

And, as a **separate** part (four good suites do not make one good product), walk the cross-domain
journey end to end — Radar/Signal → Lead → Opportunity → Qualification → Solution/Scope →
Estimate/BOQ/Pricing → Quotation **or** Tender → Award → Contract → Project → Engineering →
Procurement/Site/Quality/T&C → Certification/Commercial → Handover/Closeout → Renewal — proving at
every handoff both **provenance** (the downstream record cites the upstream one) and **UI continuity**
(a person can actually get from one to the next), not merely that an event subscriber exists.

Only after these four domains, the method repeats over Delivery Operations, Supply Chain, Finance,
Assets & Service, People, Admin, and Communication/My Work. Only then is "the whole app is complete
and easy to use" a claim that can be made.
