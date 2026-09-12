# TC-GATE-22-RETRY-ISOLATION-CLOSURE

**Verdict: CLOSED / VERIFIED.** **Migration 0306** (one new table). `rls-fitness` **255 / 255**.

**Scope taken:** the hazard TC-GATE-20 recorded as its most serious unfixed finding — a `retryable`
handler's failure re-running the siblings that already succeeded. Discovery-first, as directed.

---

## 1. What discovery established

The fan-out was mapped from source rather than sampled. **54 named-type subscriptions** — 30
`retryable`, 9 `bestEffort`, 15 unwrapped — and **8 event types with more than one subscriber**.

The confirmed mixed case is the one TC-GATE-20 named:

```
inventory.stock.movement_recorded  (4 subscribers)  ⚠ MIXED
   - [bestEffort] auto-draft replenishment PR   "PR create is not idempotent … a retry would double-post"
   - [bestEffort] post inventory GL             "journals.post is not idempotent; a retry would double-post the GL entry"
   - [retryable]  post material cost txn
   - [bestEffort] post material quantity txn
```

**But the map understated it.** Three subscribers take `'*'` and therefore receive **every event**:
the projection engine, the intelligence pipeline projection, and — the one that matters —
**`WebhookDispatcher`**.

That last one turned out to be the worst finding in the gate. It POSTs to the customer's endpoint and
then records the delivery. **Nothing read that record before POSTing.** So a failure anywhere in the
fan-out, on any event type, re-sent the same business event to an external system. It is the only
duplicate here that **leaves the building**, and the people it reaches cannot see what caused it.

So the true statement is not "one event type is affected". It is: **any of 30 retryable handlers
throwing re-runs every subscriber of that event, including an outbound webhook.**

---

## 2. The architecture, and why it is this small

The relay retries **events**; the retry decision is written per **handler**, at every call site, in a
comment block that explains the choice. The two never agreed. Making them agree needs one fact the
system did not record: **which handlers already completed this event.**

`aura_event_handler_deliveries` (migration 0306) records exactly that, and nothing else.

**The handler's name was already written.** Every wrapped handler carries a label as its first
argument — `'post inventory GL from stock.movement_recorded'` — authored to say what the work is,
which is precisely what a delivery record needs to name. No new identity scheme, and no renaming of
59 subscriptions.

Three decisions inside the wrappers carry the correctness:

- **Recorded AFTER the work, never before.** A claim taken first would mark a handler done that then
  failed, and the retry would skip the very thing it exists to redo.
- **A delivery-log read failure means RUN, never skip.** A duplicate side effect is recoverable; one
  that never happened because the bookkeeping was down is not.
- **A record failure is swallowed.** The side effect already happened — turning that into a failed
  event would retry everything and cause the duplicate this exists to prevent.

**The store is injected `@Optional()`.** Unbound, every handler runs on every delivery exactly as
before, so nothing that does not wire it changes behaviour.

**The webhook fix needed no new architecture at all** — its delivery table already recorded every
send, keyed by `(subscription, event)`. It simply was not read. One `deliveryExists` call before the
POST closes it.

---

## 3. The proof, and that it can fail

The GL journal case is the primary regression test, per the plan. It publishes the same event twice —
which is exactly what the relay does after a partial failure — and asserts the journal posted once.

**Verified by removing the guard and watching it fail:**

```
AssertionError: the GL journal handler already completed this event — a re-delivery
must not post again: expected 2 to be 1
```

Two GL entries, from one movement, because something unrelated failed. That is the defect, in a
number.

The test also asserts `afterFirst > 0` before the real assertion, so it cannot pass by never having
posted at all — the same self-check that caught the flaw in TC-GATE-19's fitness helper.

| Check | Result |
|---|---|
| GL journal re-delivery — **fails without the fix** (2 vs 1) | ✔ |
| webhook dispatcher — POSTs once, skips the re-delivery, still sends a *different* event | **3 passed** |
| `event-delivery-store.pg-int` — repeat record absorbed, append-only, tenant-scoped | **5 passed** |
| `@aura/api` | **443 passed** (was 440) |
| `@aura/core` | **292 passed** |
| `pnpm test` — every package | 51 / 51 tasks |
| `pnpm typecheck` | 51 / 51 |
| production `next build` | clean, 27 / 27 |
| `rls-fitness` | **255 / 255** — the new table enabled, forced and policied |
| `migrations:check` | 306 files, sequential, `@DOWN` present |
| e2e — **full suite**, 54 specs | **150 passed**, 6 skipped, 3 failed — the same three baselined against `main` in TC-GATE-19 |

---

## 4. What changed about TC-GATE-20's tests, and why it had to

Those three tests published **one event twice** to prove the ledger's dedupe key. With a delivery log
they would now pass without the key ever being consulted — a test that still goes green while proving
nothing.

They now publish **two events with different ids for the same aggregate**, which is a producer
emitting twice: the case the delivery log *cannot* catch and the durable key exists for. The
same-event case has its own tests.

Two layers, each tested by the case only it can handle. The delivery log removes the re-runs; the keys
survive the ones it cannot.

---

## 5. Known limitations

1. **The two `bestEffort` quantity handlers were NOT promoted to `retryable`.** They now qualify —
   their sinks are keyed *and* their siblings are protected — and migration 0255 wanted exactly that.
   It is left undone deliberately: promoting changes when failures reach the outbox, which is a
   different behaviour change from the one this gate is about, and it should be reviewed as itself.
   It is now **unblocked**, which it was not before this gate.
2. **The `'*'` projection subscribers are not covered.** `ProjectionEngine` and the intelligence
   pipeline re-run on every re-delivery. Projections are idempotent *by design* — they upsert by
   aggregate — but that is an assumption this gate did not verify.
3. **Subscribers outside `CrossModuleSubscriber` are not covered.** `notifications-subscriber` (9
   handlers) and three smaller files do not use the `retryable`/`bestEffort` wrappers, so a
   re-delivery can still send a duplicate notification. The wrappers are where the labels live; those
   files would need names before they could be covered.
4. **A window remains between doing the work and recording it.** A process that dies in between
   re-runs the handler on retry. It is the same window the outbox itself has, it is narrowed by the
   relay claiming events `FOR UPDATE SKIP LOCKED`, and it is why TC-GATE-20's durable dedupe keys stay
   in place rather than being replaced by this.
5. **The log grows with events × handlers** and nothing prunes it. `archive-events` sweeps
   `aura_events`; the delivery rows for archived events are left behind.
6. **The cost ledger's `limit: 1000000`** remains recorded for the Final Audit, per the plan — not a
   proven correctness failure.

---

## 6. Gate-23 handoff

Per the agreed plan, Gate 23 is the **FINAL T&C + HANDOVER CLOSURE AUDIT**, and the last planned gate:
the full journey (Engineering → Site → Quality → T&C → fail/defect/retest/pass → Commissioning →
controlled evidence → As-Built → O&M/Warranty → Training → Spares → Dossier → Transmittal → Receipt →
Acceptance → Project Closeout → Asset/Service handoff), plus the UI/UX review and the five-vs-eight
Handover sections — **without assuming Scope and Overview need new tables.** If projections are
enough, they are projections; if the workflow does not need them, no data model gets invented to reach
eight tabs.

---

**CLOSED / NOT CLOSED: CLOSED / VERIFIED.** Gate 23 not started.
