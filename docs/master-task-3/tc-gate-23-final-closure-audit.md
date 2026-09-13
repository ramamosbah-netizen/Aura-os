# TC-GATE-23 — FINAL T&C + HANDOVER CLOSURE AUDIT

**Verdict: CLOSED / VERIFIED.** **No migration.** `rls-fitness` unchanged at **255 / 255**.

The last planned gate. Its job was to prove the chain composes, decide the five-vs-eight question on
evidence, and stop pretending three red tests were acceptable.

---

## 1. The three long-standing e2e failures were never product defects

`global-shell-home`, `internal-chat` and `permit-workflow` had been red for four gates. I baselined
them against `main` in TC-GATE-19 and correctly did not chase them — but a *closure* audit cannot sign
off over three red tests, one of which reads as **"a third party can read a DM between two other
people."**

**All three were one cause.** Each names an identity — a restricted viewer, a second actor — that CI
seeds (`AUTH_DEV_ADMIN_USER=u-admin,u-approver`) and a local disposable database does not: its seeder
registers `u-admin, u-e2e-checker, u-e2e-viewer`. Every one of the three is parameterised for exactly
this. Pointed at accounts this environment actually has, they pass:

```
E2E_VIEWER_USERNAME=u-e2e-viewer E2E_ALT_USERNAME=u-e2e-checker
→ 158 passed, 1 skipped, 0 failed
```

**The DM isolation property holds.** The spec could not sign in as the third party; it never got as
far as testing what it guards. That is the standing rule about password mismatches, and it was right.

### What was actually wrong: each failed as though the product were broken

- `permit-workflow` said in its own comment that without a second actor *"this journey is not merely
  awkward to test, it is correctly impossible"* — segregation of duties refuses self-authorisation —
  and then asserted the happy path anyway. It failed on `permit-status` reading "Requested", which
  looks exactly like a broken approval.
- `global-setup` validated the ALT identity **only when the variable was set**, so both specs falling
  back to a default were never probed at all.

Both fixed: global setup now **probes every identity the suite uses, by its effective name**, and says
which variable to set. The specs that need one **skip with that reason** instead of asserting the
product. With no overrides at all the suite is now green — `9 passed, 3 skipped` across those three
files — and in CI, where the identities exist, nothing skips.

Silent degradation into a wrong-looking failure is the same fault this series has chased since
TC-GATE-18. It was in the harness.

---

## 2. The chain, proved in one walk

`journey-tc-handover-closure.spec.ts` — **passes in 36.6s**:

```
project → engineering (drawing approved) → ELV (device installed) → T&C test point
  → FAIL → defect raised in the defects surface → defect closed with its resolution
  → RETEST PASS → commissioned
  → commissioning certificate linked → as-built registered and linked
  → O&M pack accepted → training acknowledged BY THE CLIENT → spares acknowledged
  → all seven readiness gates READY on the surface a person reads
  → package SUBMITTED → client ACCEPTED
  → service contract raised by the reactor → closeout readiness answerable
```

**Every leg already had a spec. None proved they COMPOSE.** The closest — the 42-step
`handover-readiness` journey — stopped at the as-built gate reaching READY: it never submitted a
package, never had one accepted, and never reached the service handoff. The last third of the
lifecycle was covered only in pieces, by specs that each seed their own world.

Two things it asserts that nothing else did:

- **A failing point cannot commission, and a retest after a closed defect can.** The fail → defect →
  retest → pass path is how a real commissioning goes; every other spec passes its point first time.
- **Submission succeeds only once all seven gates are READY** — and then it does. That is the whole
  claim of TC-GATE-4 and -5, asserted forward rather than as a refusal.

---

## 3. FINDING: the deliver→maintain seam is joined by a sentence

Writing the last leg surfaced a real defect. `HandoverAmcSubscriber` raises the service contract on
`commissioning.handover.accepted` and calls `amc.createContract` with **no `projectId` and no
handover id**. The only tie back is prose:

```ts
serviceScope: `Warranty & AMC — ${p.projectName} (from handover ${e.aggregateId.slice(0, 8)})`
```

The contract number encodes eight characters of the handover id, which is why the journey can assert
the seam at all. But **nothing can resolve a service contract to the project it maintains** — you
cannot ask "which AMC covers this project", only read a sentence and hope.

This is precisely what TC-GATE-17 said of the spares reference: *"A reference nobody resolves is not a
reference; it is a note that looks like one."* The same fault, at the last seam in the lifecycle.

**Not fixed here.** It needs a column and a migration in AMC — a module outside this programme's scope
— and the audit's job was to find it, not to quietly widen itself on the final gate. The journey spec
asserts what the product does and says in its comments what it should do.

---

## 4. Five sections, not eight — decided on evidence

The question was whether Overview and Handover Scope can be projections rather than new tables, and
whether the workflow needs them at all.

**Where the other three went.** Two of the eight were never missing, only folded:

| Requested tab | Where it is | Why folding is right, not a shortcut |
|---|---|---|
| **As-Built Records** | the `asBuilts` readiness gate + the dossier | A separate Handover tab would imply Handover **owns** as-builts. It does not — document control owns the register, T&C owns the link. A tab is an ownership claim. |
| **Acceptance & Closeout** | inside `packages` | Acceptance is the package's own lifecycle (`submit` → `accept`), not a second register. |

**Overview — do NOT add.** It already exists: the readiness panel inside `packages` renders all seven
projected items with their states and reasons. A separate tab would be the same content at a different
URL, added to reach a number. That is the thing this gate was told not to do.

**Handover Scope — genuinely absent, and genuinely a projection.** The data is all there:
`HandoverReadinessFacts` already carries `systemsTotal`, `systemIds`, `notReadyReasons`, and the
per-system `omItems`, `asBuiltLinks` and spares. **No table would be needed.**

**But it is not needed for the workflow, so it is not built.** The journey above completes end to end
without it: submission is gated on the seven projected items, which already walk every system on the
project. Scope would be a *consolidation view* — one table answering "what is being handed over and
what does each system still owe" — which today is answerable, but only by reading three sections.

And it is not free. The client's readiness payload carries the seven **project-aggregate** items and
`systemsTotal`/`systemsCommissioned` — **not** per-system detail. So Scope needs new API surface: a
domain projection, a service method, a route. That is a build, not a rendering change.

**The rule given was explicit: do not invent to reach eight tabs.** A view that is convenient, absent
from the critical path, and costs new API surface fails that test. Recorded here as a small,
well-understood piece of work should it ever be wanted for operational convenience — not as a gap in
correctness.

**Handover stays at five, and now the five are justified rather than asserted.**

---

## 5. The proof

| Check | Result |
|---|---|
| **`journey-tc-handover-closure`** — the whole chain, one walk | **1 passed** (36.6s) |
| the three long-standing failures, pointed at seeded identities | **pass** |
| e2e — full suite, **no identity overrides** | green; the three skip with their reason |
| e2e — full suite, identities supplied | **157 passed**, 1 skipped, 2 failed — see §5a |
| `pnpm test` — every package | 51 / 51 tasks |
| `pnpm typecheck` | 51 / 51 |
| production `next build` | clean, 27 / 27 |
| `rls-fitness` | 255 / 255 |

### 5a. The two failures in the full run, stated plainly

Neither is in T&C or Handover, and I am not going to call this green when it is not.

- **`00-crm-activities-release-proof`** — fails in the full run, **passes in isolation**. Test
  interference, not a defect.
- **`my-work-dashboard`** — fails in the full run **and in isolation**, on
  `expect(link).not.toHaveAttribute('target', '_blank')`: some link inside My Work opens a new tab,
  which that spec forbids.

**It is data-dependent, and this gate probably tripped it.** It passed twice today on the same
database and fails now, after roughly ten suite runs and this gate's new journey — which seeds a
project, a commissioned system, a handover package and a service contract into the **shared** dev
tenant that `work-items` aggregates across. More work items, more links, and one of them carries
`target="_blank"`.

**I could not identify which link.** It is not in the tasks page's own components; it comes from
something rendered inside them for a particular item type, and pinning it down needs an authenticated
browser session, which I do not drive. So it is recorded, not guessed at.

Two real things sit underneath it, and both are worth someone's hour:

1. **Does a My Work link genuinely leave the app?** If so that is a small UI defect the spec is
   correctly catching.
2. **The e2e specs share one tenant**, so a new spec can change another spec's outcome. That is a
   structural weakness in the suite — it means "passing" is partly a function of what else ran.

---

## 6. Carried forward — what closing this programme does NOT close

Nothing here is a T&C or Handover correctness defect. Recorded so the next person does not have to
re-derive it.

**Found by this audit**
1. **The AMC contract has no reference to its project or handover** (§3). The last seam is free text.

**Operational — needs an operator, not a change**
2. **The migration-role check on staging/production** (TC-GATE-21). One query; I have no access. If
   both flags are false there, seven historical backfills did nothing.
3. **The delivery log is never pruned** (TC-GATE-22). `archive-events` sweeps `aura_events` and leaves
   its rows.

**Unblocked, deliberately not done**
4. **Promoting the two `bestEffort` quantity reactors to `retryable`** — they qualify since
   TC-GATE-22, and migration 0255 wanted it.

**Known coverage gaps**
5. `'*'` projection subscribers re-run on re-delivery (idempotent by design, unverified).
6. `notifications-subscriber` is unwrapped, so a duplicate notification is still possible.

**Recorded smells, not proven defects — per the plan**
7. **`CostLedgerService` line 60 passes `limit: 1000000`** to escape the default cap. It works. It is
   a magic number where a read that cannot truncate belongs, and the quantity ledger's `position`
   never even got the magic number — which is how TC-GATE-20 happened. **Only worth a gate if
   discovery proves a wrong result**, which this audit did not attempt.
8. **The ITP's `discipline` is still free text** — the last untyped vocabulary. Technical debt; no
   business decision depends on it.
9. Cost/shape notes: HSE and Quality resolve by reading the whole tenant; the delivery-impact signal
   makes one round trip per outstanding review; one round trip per distinct stock reference; the
   in-memory and Postgres `list` adapters disagree about default caps.

---

## 7. Where the programme ends

Twenty-three gates. The T&C workspace has its **eight** sections; Handover has **five**, and this
register says why each of the other three is either folded or deliberately absent. The chain from an
approved drawing to a client's signature, a service contract and a closed project is proved in one
pass, including the failing-then-passing path a real commissioning takes.

**ONE BUSINESS TRUTH → ONE WRITER** held throughout, and the last audit found the rule being kept in
the place it would have been easiest to break: Handover reads as-builts, snags, documents, inventory
and quality evidence, and writes none of them.

---

**CLOSED / NOT CLOSED: CLOSED / VERIFIED.** No further gate planned.
