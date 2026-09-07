# Master Task 2 — gap findings

Findings surfaced by Master Task 2 (2026-09-07), with their evidence and status.

> **This is not the master register.** The authority remains
> [`docs/aura-audit/18-MASTER-GAP-REGISTER.md`](../aura-audit/18-MASTER-GAP-REGISTER.md) — G-01…G-20,
> Rev 2.6 — and nothing here supersedes it. These entries carry their own IDs because they were
> raised and closed inside one task; the ones still OPEN below are candidates for G-2x rows there,
> which is a call for whoever owns that register rather than something to fold in unilaterally.
>
> Companion: [Master Task 2 closure report](2026-09-07-master-task-2-closure.md).

| ID | Title | Severity | Status |
|---|---|---|---|
| AURA-P360-003 | Discipline lens had a control but no effect | High | **CLOSED** — `e5c3da7a` |
| AURA-P360-004 | NCRs carried no ELV system, so the lens narrowed nothing | High | **CLOSED / VERIFIED** — `45edbb9f` |
| AURA-BUILD-001 | Typecheck could read stale `dist` and answer anyway | Medium | **CLOSED** — `8fc7c744` |
| AURA-CHAT-001 | Composer accepted a message it would discard | High | **CLOSED** — `6d423004` |
| AURA-COMMS-001 | "No company channel on a fresh install" | — | **WITHDRAWN** — measurement error |
| AURA-QUALITY-002 | Statuses not treated as "needs a decision" | Low | **OPEN** — owner's call |
| AURA-QUALITY-003 | Poor accessible names on `ProjectPicker` forms | Low | **OPEN** |
| AURA-ENV-002 | `/health` cannot say which database it is bound to | Medium | **OPEN** |
| AURA-COMMS-002 | Directory channel seeding is lazy, not at boot | Low | **OPEN**, benign |
| AURA-TEST-001 | Suite needs state it does not create | Medium | **OPEN** |
| AURA-AUTH-001 | Login lockout: enforcement location unknown | Unknown | **OPEN** |

---

## OPEN

### AURA-ENV-002 — `/health` cannot express which database it is bound to

**Severity:** medium. Cost roughly an afternoon in this task alone.

`/api/v1/health` reports `environment` and `schema: {applied, onDisk, upToDate}`. None of that
identifies the *binding*. A stale API process holding a connection pool to a database that has since
been dropped and rebuilt answers `200` with `282/282`, because the rebuilt database has the same
migration count. A readiness check on health therefore cannot tell a live pairing from a dead one.

This produced six false chat-spec failures and a false `Invalid credentials` in global setup, and
those were filed as a product gap (AURA-COMMS-001, now withdrawn) before being disproved.

Remedy, unevaluated: include a boot-time identity in the payload — the process start time, or an
identifier read from the database at connect and echoed back, so `health` answers *which* database
rather than only *a* database. Cheap, and it would have made that diagnosis one request.

### AURA-TEST-001 — the suite depends on state it does not create

**Severity:** medium.

Several specs pass against a database with history and fail against a clean one. Confirmed
instances, both fixed, but the pattern is broader than the two:

* `meetings-workspace` asserted `getByText('completed')` unscoped — true once, strict-mode violation
  on the second run.
* Specs default `E2E_VIEWER_USERNAME` / `E2E_ALT_USERNAME` to `u-approver`, which CI's TIER-2 seeder
  creates and the local provisioner does not — a 401 reported as two permission specs failing.

Observed while chasing AURA-COMMS-001: the chat file went 6 failed → 5 failed → 0 failed across
three runs with no code change. A suite whose result depends on how many times it has run cannot be
used as evidence, and that property is invisible until someone rebuilds from zero.

Remedy: an audit of which specs seed their own fixtures. Not attempted here.

### AURA-QUALITY-002 — statuses the delivery sections do not treat as "needs a decision"

**Severity:** low. **Deliberately not decided.**

The Project 360 section dashboard classifies attention with:

    /open|pending|overdue|failed|rejected|blocked|draft|raised|requested|investigating|in_progress/i

`raised` was added in `45edbb9f`: it is the NCR corrective-action machine's opening state, so a
raised NCR is one nobody has planned a correction for, and it was the only not-closed status the
pattern did not recognise.

Left open: `action_planned` and `corrected` are also not terminal. `corrected` in particular waits on
QA verification, which is a decision someone owes. Whether they belong in the attention panel is a
judgement about business semantics, not an evident defect — the owner's call, not the implementer's.

### AURA-QUALITY-003 — poor accessible names on `ProjectPicker` forms

**Severity:** low, uncovered.

Fields are wrapped in a `<label>` with no `id`/`for` and no `aria-label`. For a wrapping label the
accessible name includes the embedded control's value, so the system select's name is
`"SystemNot attributed"` and the project picker's is `"ProjectSelect a project…"` plus every option.

Found by a test that could not locate fields by name and had to drive the DOM relationship instead.
The accessibility suite scans `/login` only, so nothing asserts this. Shared across the ~14 screens
using `ProjectPicker`, so it is a component fix rather than a per-screen one.

### AURA-COMMS-002 — directory channel seeding is lazy

**Severity:** low. Benign today.

`CommsService.channelsFor` seeds directory channels on first call rather than at boot, so the API log
carries no `Asserted N directory chat channels` line until something asks. Harmless, because creation
precedes the read within that request — but a fresh database inspected directly looks emptier than
the product behaves, which is exactly what sent the AURA-COMMS-001 diagnosis down the wrong path.

### AURA-AUTH-001 — where login lockout is enforced is unknown

**Severity:** unknown, because the mechanism was not found.

`auth.controller.ts` states that a locked-out credential returns the same body as a wrong password,
to avoid username enumeration. But:

* `AUTH_LOCKOUT_MAX` is read **nowhere** in the codebase. A line setting it in `apps/api/.env.local`
  is dead, and an earlier claim in this session that CI omitting it was a gap was wrong.
* `AUTH_LOCKOUT_MAX_ATTEMPTS` is read in exactly one place —
  `platform-admin.controller.ts:83` — to *report* the policy, not to apply it.
* No lockout enforcement was found in `apps/api/src/auth/` or `packages/core/src/`.

So either lockout is enforced somewhere not yet located, or the documented behaviour is not
implemented. Both are worth knowing; neither is established.

---

## WITHDRAWN

### AURA-COMMS-001 — not a product gap; a measurement error

Kept on the register so it is not rediscovered as a defect.

Filed as *"internal chat has no company channel on a fresh install"* after six specs failed on a
rebuilt database. Disproved by:

* `defaultChannelsForDirectory` (`shared/src/comms/model.ts:73`) returns `ch-company`
  **unconditionally**. There is no input for which it is absent.
* The endpoint returned it when asked.
* With the channel provably present, five of seven specs still failed — so the stated cause could
  not have been the cause.
* `internal-chat.spec.ts:30` passed alone and failed inside its own file.

The real cause was AURA-ENV-002: measuring against a stale API process. On a pairing proven by four
independent facts, the same specs pass 7/7 — and the one failure that survived was real, and became
AURA-CHAT-001.

---

## CLOSED in Master Task 2

**AURA-P360-003** (`e5c3da7a`) — the lens control was in the Project 360 shell; the effect existed
only on a route that shell does not link to. Sections now honour `?discipline=` through the same
`filterAreaRows` the area register uses.

**AURA-P360-004** (`45edbb9f`) — NCRs carried no discipline/system/systemType, so `filterAreaRows`
kept every row and Quality narrowed nothing. Migration `0282` adds `system text`, nullable and
undefaulted. Verified by identity across three consecutive 4/4 runs, plus the form journey, on a
database built from zero with a proven `@DOWN`.

**AURA-CHAT-001** (`6d423004`) — the composer is a controlled input with Send disabled on empty
state, and neither was gated on hydration. Text typed before React attached was discarded, leaving
the box full and the button dead. Third instance of the failure `use-hydrated.ts` documents. Only
observable under full-suite load.

**AURA-BUILD-001** (`8fc7c744`) — `turbo.json` already declared `typecheck: dependsOn ["^build"]`, so
the pipeline was never wrong; the trap was the per-package command that skips turbo. Demonstrated:
deleting a field from source, `pnpm --filter @aura/api exec tsc` exits 0 in silence while
`pnpm typecheck` reports 7 errors. `scripts/stale-dist-check.mjs` now refuses the silent path.
