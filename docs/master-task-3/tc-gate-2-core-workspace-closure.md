# TC-GATE-2-CORE-WORKSPACE-CLOSURE

**Verdict: NOT CLOSED.** The scope is built, tested and browser-proven, and one required piece of
evidence is missing: the browser proof ran against the repo's in-memory tier, not against
PostgreSQL, because Docker would not start on this machine (§10). Everything else in the gate is
complete. Re-running one command closes it — §10 has the exact command and what it must show.

**Scope:** Overview, Systems & Equipment, Testing & Commissioning, Defects & Retests. No ITP
authoring, no pre-commissioning, no certificates, no Handover change, no O&M, no client training,
no dossier, no asset operational handoff. None of the six Gate-1 gaps were opportunistically fixed;
two are addressed because they are inside this scope (test-point authoring, defect linkage) and are
called out as such below.

---

## 1. The four surfaces

`/commissioning?section=…`, using the section pattern already established across the other Delivery
Operations workspaces. The AURA tab anchor is unchanged from `08fd19e4`: `href="/commissioning"`,
carrying no section, so the tab always returns to the command centre.

| Surface | The job it does | Where its data comes from |
| --- | --- | --- |
| **Overview** | Answers "what is preventing this project/system from being commissioned?" Eight counters, each a real link into the filtered records, and a blocking list that names the reason per system. | `readWorkspace` projection — derived at read time from records, test points, runs and punch items. Nothing stored, nothing hand-ticked. |
| **Systems & Equipment** | Commissioning scope (T&C's own authority) and, beneath it, the equipment being tested. | Scope from commissioning records; equipment **read** from the ELV device register (§4). |
| **Testing & Commissioning** | Select a system → author a point → execute it → read the run history → see what blocks sign-off → sign and witness → commission. Filter chips for the six states. | The system's own 360 payload, fetched on expand. |
| **Defects & Retests** | Failing points with the run that failed them, the defects raised from those failures, and what is owed. | The same projection, plus the project's punch list. |

Two things deliberately absent: a section per status (that is a filter, not a place), and any
section that would be empty because its feature belongs to a later gate.

---

## 2. Authority matrix

| Business truth | Writer | T&C's relationship |
| --- | --- | --- |
| Test point definition (what must be proven) | **T&C** — `aura_commissioning_test_items` | Owns it. Now authorable from the UI; see §5. |
| Test run (an execution, immutable) | **T&C** — `aura_commissioning_test_runs` | Owns it. Unchanged from Gate 1. |
| Commissioning scope / status / sign-off | **T&C** — `aura_commissioning_records` | Owns it. |
| Commissioning punch item (defect gating sign-off) | **T&C** — `aura_commissioning_punch_items` | Owns it. Gained provenance INTO T&C's own evidence (§6). |
| Equipment / device (tag, model, serial, cable, port) | **`@aura/elv`** — `aura_elv_devices` | **Reads only.** No writer exposed here (§4). |
| ITP / inspection plan (hold & witness points) | **Quality** — `modules/quality/src/domain/itp.ts` | Untouched. Not read yet either; Gate 3. |
| NCR / snag | **Quality** | Untouched. The UI states the boundary rather than implying a link exists (§6). |
| Corrective action | **Quality** — a field and a transition on the NCR, not a separate aggregate | Untouched. |
| Warranty start / service handoff | **Handover → AMC** | Untouched and unre-verified by this gate — no Handover code was modified. |

Rule applied throughout: one business truth, one writer; projection and reference over duplicate
persistence.

---

## 3. Findings and dispositions

| # | Finding | Disposition |
| --- | --- | --- |
| F-G2-01 | **The ELV device register is the equipment authority and is unreachable from the app.** Full domain + API (`elv/devices`, including `PUT :id/commissioning`) since G-21, and no UI or BFF route at all. | Projected read-only into Systems & Equipment. No writer added. Recorded as a gap (§9). |
| F-G2-02 | **No device hierarchy.** `ElvDevice` is flat: project → system → device, with `homeRunTo` as a free-text rack/panel reference. The `NVR-01 → CAM-001…064` tree in the directive is not modelled. | **Reported, not invented.** Grouped by system in the UI, which is what the data supports. A parent/child link is a change to the ELV authority and needs review (§9). |
| F-G2-03 | **Test points had no authoring surface.** Creatable only through the API. | Exposed T&C's existing writer through a BFF route and the system panel. This creates no test-plan authority — see §5. |
| F-G2-04 | **A defect could not be linked to the failure that caused it.** | Two nullable columns on T&C's own punch table (§6). No Quality writer added. |
| F-G2-05 | **The page requested API paths that do not exist** (`/api/commissioning/workspace` instead of `…/records/workspace`). Caught by the first browser run, where the workspace rendered its unavailable state rather than zeros. | Fixed. The honest-unavailable path is itself now proven. |
| F-G2-06 | **Race: a section click during a project change discarded the project.** `useSearchParams` reports the previous query until the navigation commits, so the click wrote the old URL back. Caught by comparing two screenshots. | Section strip is inert while `switching`. Asserted in the spec. |
| F-G2-07 | **The manual tally control would have vanished with the old register.** Legitimate only for a system with no test sheet. | Kept, in the system panel, shown **only** when the system has no test points — so the Gate-1 refusal can no longer be reached from the UI at all. |
| F-G2-08 | **"Test points (total)" on the register form wrote a tally the sheet then overrode.** | Field removed; the form says where points are added. |

---

## 4. Equipment-authority conclusion

**The repository already has a canonical equipment authority: `@aura/elv`.**

`ElvDevice` carries the project, the canonical system, the device tag as labelled on site, model,
manufacturer, location, drawing reference, serial, MAC, IP, cable reference, home run, port — and
three seams built for exactly this moment: `commissioningRecordId`, `warrantyExpiresAt`, `assetId`.
Its own docstring describes the chain `Project → System → Device → … → Commissioning point →
Handover → Warranty → AMC asset`.

So T&C does **not** create an equipment master, and Gate 2 adds no device writer. Systems &
Equipment projects the register, groups it by system, shows whether each device is linked to a
commissioning record, and says on the page whose authority it is.

**The gap, reported rather than filled:** the register is flat. There is no parent/child device
relationship, so `NVR-01 → CAM-001…064` cannot be represented today — `homeRunTo` is a free-text
rack/panel string, not a link. Adding that hierarchy is a change to the ELV authority's model and is
**not** done here. A second gap: the register has no authoring surface anywhere in the app, so
devices exist only where they were created through the API.

---

## 5. Test-point authoring determination

The directive asks whether point definitions should be authored in T&C, derived from an existing
test/ITP authority, or left backend-only.

**Determination: authored in T&C — because T&C already owns them.** `aura_commissioning_test_items`
predates this gate, is written by `POST commissioning/records/:id/test-items`, and is the sheet the
Gate-1 tally derives from. Exposing that writer in the UI creates no authority; it removes a gap
where the app could execute a sheet it could not author.

**This is not an ITP.** Quality's `Itp` is the QA inspection plan — hold / witness / review /
surveillance points against a work activity, with acceptance criteria, its own lifecycle and its own
page. A commissioning test point is a functional test on one system. The two already coexisted in
the repository before this gate; nothing here merges or duplicates them.

**Left for review (Gate 3):** whether a commissioning sheet should be *derivable* from a Quality
ITP — an ITP hold point generating the test point that satisfies it. That is a real integration with
a real ownership question, and inventing it here would have created the second test-plan authority
the directive forbids.

---

## 6. Defects and retests model

The four concepts, kept explicitly apart:

| Concept | Owner | State in Gate 2 |
| --- | --- | --- |
| Failed test run | T&C | Immutable evidence. Shown with its run number, measured value and reason. |
| T&C punch item | T&C | The defect, and the gate on sign-off. Now carries `test_item_id` / `source_run_id`. |
| Quality NCR / snag | Quality | Untouched. Not created, not mirrored, not referenced. |
| Corrective action | Quality (a field + transition on the NCR) | Untouched. |
| Retest | T&C | A new immutable run on the same point. Linked to the prior failure through the point's lineage. |

**When a failed test is which:**

- **(a) retest only** — the default. A point stands failed; the blocker says "retest required"; a new
  run clears it. No defect needed.
- **(b) defect** — when the failure needs tracked rectification before a retest is worth doing.
  *Raise defect* on the failing point creates a commissioning punch item carrying the point and the
  run it answers, so the Defects surface shows one problem rather than two. The service refuses a
  defect pointing at another system's evidence.
- **(c) Quality escalation** — **not built, and said so on the screen.** The Defects surface states
  that NCRs and snags are Quality-owned, are not raised or mirrored from here, and that the linkage
  does not exist yet. No column was added for it: a field nothing can populate is worse than an
  honest gap.

---

## 7. Schema, domain, API, UI

**Schema** — `0297_commissioning_punch_test_provenance.sql`: two nullable columns
(`test_item_id`, `source_run_id`) plus a partial index on `aura_commissioning_punch_items`. No table
created, nothing altered or dropped. Applied cleanly to the disposable database (§10).

**Domain** — `PunchItem` gains the two provenance fields. New read-model types
`CommissioningWorkspaceView`, `CommissioningSystemView`, `FailingPointView`. No new aggregate.

**Service** — `readWorkspace(tenantId, projectId?)` derives every number the surfaces show, in three
queries rather than one per system; `listProjectPunchItems`; `addPunchItem` accepts provenance and
validates that the point belongs to the record.

**Store** — `listTestItemsForProject` / `listTestRunsForProject` / `listPunchItemsForProject` on both
adapters.

**API** — `GET commissioning/records/workspace`, `GET commissioning/records/punch-items`; `POST
:id/punch` accepts `testItemId` / `sourceRunId`. Both reads are declared before `:id` so the literal
segments are not swallowed by the parameter route. Permissions derive from route as usual —
`commissioning.record.read` and `commissioning.record.punch` — and are proven guarded in §9.

**BFF** — added only what the client actually calls: `records/[id]/detail`, `records/[id]/test-items`,
`records/[id]/punch`. Two routes written during the build and called by nothing were **deleted**
rather than left as dead code.

**UI** — `commissioning-workspace-client.tsx` (the four sections),
`commissioning-system-panel.tsx` (one system's work, opened in place), and the Gate-1 test sheet
gaining an `onChanged` hook so the workspace reconciles its own detail *and* the totals above it.
The old flat register client was removed; everything it did lives in a section now.

**Mutation contract**, held by every Gate-2 mutation: an in-flight guard that makes a second click a
no-op, a pending label on the control, the server's own message surfaced on failure, and a
reconcile-on-success that refetches the panel and refreshes the page — no manual reload anywhere.
Controls stay disabled until hydration, so a first click cannot be silently dropped.

---

## 8. Tests

| Suite | Cases | What it proves |
| --- | --- | --- |
| `workspace-view.test.ts` (new) | 10 | Every derived number and blocker sentence; that a point failing on run #3 reports the whole loop; that **eligibility matches the sign-off guard exactly** (asserted by attempting the commission in the same test); defect provenance, including the refusal to link another system's point. |
| `test-integrity.test.ts` (Gate 1) | 10 | Unchanged, still green — lineage and the tally refusal. |
| `test-punch.test.ts` | 12 | Run validation and snapshot projection. |
| `test-run-immutability.rls.pg-int.test.ts` | 8 | Gate-1 Postgres proof (not re-run this gate — §10). |
| `commissioning-workspace.spec.ts` (new) | 3 | The browser journey, §9. |
| `commissioning-permissions.spec.ts` (new) | 1 | Authorization, §9. |
| Regressions | 20 e2e | commissioning lineage + workflow, the four delivery-workspace section specs, engineering sections, operations shortcuts, closeout readiness, project lifecycle. |

`delivery-workspace-section-shortcuts.spec.ts` was **updated, not deleted**: it asserted that T&C was
a single register with no sections, which Gate 2 deliberately changed. The comment now records that
decision so a later reader can tell a deliberate change from an accidental deletion.

Full checks: commissioning 49 passed / 8 skipped (the pg-int suite, gated), `@aura/api` 396,
`@aura/web` 182, `pnpm typecheck` 51/51, production `next build` clean.

---

## 9. Browser and actor evidence

Auth **ON** (`/auth/status` → `{"enabled":true}`), signed in as **u-admin**.

**The journey** (`commissioning-workspace.spec.ts`, all asserted):

| Required | Result |
| --- | --- |
| Project / system selection | ✓ project chosen from the context bar; URL carries it |
| Section navigation, and project continuity | ✓ all four sections; project survives every switch, **including a click made while the project change is still in flight** (F-G2-06) |
| Open commissioning record | ✓ expanded in place; loading state observed |
| Author a test point | ✓ created from the UI; the list line reconciles to `0/1 passed` without a reload |
| Validation / server refusal | ✓ a fail with no remarks is refused and the API's message is shown |
| Execute failing test; failure immediately visible | ✓ run #1 `fail`, `104.8 m`, reason, with no reload |
| Blockers reconcile immediately | ✓ system flips to `failing`, blocker line updates |
| Defect / retest state visible | ✓ Defects shows "failed on run #1 of 1 · measured 104.8 m · Over length at patch panel" |
| Raise a defect from the failure | ✓ linked; shown as "raised from a failing test point" |
| Sign-off refused while blocked | ✓ open-punch refusal surfaced |
| Passing retest; both runs remain | ✓ run #2 `pass`, run #1 still `fail` with its reason, "passed on retest" badge |
| Sign / witness → commission | ✓ |
| Commissioned state visible without reload | ✓ locked panel, state `commissioned`, no record-run control |
| Reload → persistence and history unchanged | ✓ both runs still there after reload |
| Return to Overview | ✓ commissioned count 1, nothing blocking |
| Empty state | ✓ "No devices registered for this project"; "No test point is standing failed"; "No defect is open" |
| Loading / pending state | ✓ panel loading; "Loading project…" during a project change |
| Double-click protection | ✓ a double-click on *pass* yields exactly one run |
| No dropped first click | ✓ cold navigation straight to `?section=testing`, control enabled then one click opens the panel |
| Keyboard / accessibility | ✓ section strip is real buttons — focusable, Enter activates, `aria-current` set; nav/section landmarks labelled; device table uses `th scope` |

**Actor evidence** (`commissioning-permissions.spec.ts`): a second actor (`u-e2e-viewer`, holding
only `workspace.me.read`) is refused **403** on the workspace read, the run append and the defect
raise; the same workspace read succeeds for the admin token in the same test, so the refusals are
about permission rather than broken routes. A narrower actor was used only here, because that is the
only behaviour in this gate that a single principal cannot exercise.

---

## 10. Known limitations

1. **The browser proof ran on the in-memory tier (TIER-2), not PostgreSQL (TIER-3).** Docker
   Desktop's Linux engine would not start on this machine (the process runs; the named pipe never
   appears), so the disposable database was unavailable. This matters for two things the in-memory
   adapter cannot prove: the Postgres store paths for the new project-wide queries and the two new
   punch columns, and RLS posture after `0297`.
   **What was proven on Postgres before it went down:** migration `0297` applied cleanly
   (`✓ done 0297_commissioning_punch_test_provenance.sql`, 1 applied / 296 current).
   **What to re-run to close this** — with Docker up and the disposable database provisioned:
   ```bash
   cd apps/web && AURA_API_URL=http://localhost:4000 E2E_DISPOSABLE_DB=1 E2E_USERNAME=u-admin E2E_PASSWORD=e2e-password E2E_VIEWER_USERNAME=u-e2e-viewer E2E_ALT_USERNAME=u-e2e-checker pnpm exec playwright test e2e/commissioning-workspace.spec.ts e2e/commissioning-permissions.spec.ts e2e/commissioning-test-lineage.spec.ts
   ```
   plus `node apps/api/scripts/rls-fitness.mjs` (expected: 247/247 enabled, forced, policied —
   `0297` adds columns to a table that is already RLS-enabled and policied, so the posture should be
   unchanged, but it has not been re-measured).
2. **A throwaway `api-memory` launch configuration** was added to `.claude/launch.json` to run that
   tier. It exists only because Windows cannot express an empty environment variable through `cmd`;
   it sets `DATABASE_URL=`, `AUTO_MIGRATE=off` and `AUTH_STATE_PERSISTENCE=optional` for a local
   process. `apps/api/.env.local` was not touched.
3. **No device hierarchy** (F-G2-02) and **no device authoring surface** (F-G2-01).
4. **Overview counters lead to filtered records, not to individual rows.** "Retests required" counts
   points and lands on the failing systems; drilling to a single point is a click further.
5. **Search is absent.** Filtering is by project and by state. A project with fifty systems is
   navigable; five hundred would want search.
6. **`fail(record, reason)`** still sets a record's status independently of its points — the Gate-1
   gap, untouched here.
7. **The `commissioning.test-run.recorded` event still has no subscriber.**

---

## 11. Gate-3 dependencies

1. **Quality escalation.** Raising an NCR from a failed test needs a Quality-side writer and a
   provenance field on the NCR (it has `sourceIrId` for inspection requests; it has no commissioning
   equivalent). Both are changes to Quality's authority.
2. **ITP derivation.** Whether a commissioning sheet can be generated from a Quality ITP hold point,
   and who owns the result.
3. **Device hierarchy and a device authoring surface** in `@aura/elv`, before `NVR-01 → CAM-001` can
   be shown as a tree.
4. **Pre-commissioning gates** need a decision on what counts as installation evidence from Site.
5. **Certificates and evidence** need an attachment/document seam — DocControl owns formal issue.
6. **Handover readiness projections** depend on this gate's read model, and on the five other
   authorities the checklist booleans currently stand in for.

---

**CLOSED / NOT CLOSED: NOT CLOSED** — pending only the TIER-3 re-run in §10.1. Gate 3 not started.
