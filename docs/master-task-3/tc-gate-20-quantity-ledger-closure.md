# TC-GATE-20-QUANTITY-LEDGER-CLOSURE

**Verdict: CLOSED / VERIFIED.** **Migration 0305** (data-only backfill, no schema change).
`rls-fitness` unchanged at **254 / 254**.

**Scope taken:** Gate-19 candidate 1 — the double-post guard in the PO-cancellation reactor. Discovery
found that guard was the smallest of five defects in the same ledger, and that the worst of them was
not a guard at all.

---

## 1. The headline: the position was wrong, not just unguarded

`QuantityLedgerService.position` read one BOQ item's ledger through `list`, which applies a default
`LIMIT 500` ordered `occurred_at DESC`, and handed the result to `quantityPosition` — **which sums
it**. Past five hundred transactions on one item the position was understated, silently.

And it was understated in the worst possible place. Newest-first discards the **oldest** rows, and
the `boq` baseline is the first transaction an item ever receives. Lose the baseline and:

- `boq` reads **0** on an item with a thousand,
- `remainingToOrder` goes negative,
- `progressPct` — `installed / boq` — collapses to **zero on a fully installed item**.

This is not a gate that fails loudly. It is the figure a quantity is billed from, quietly getting
smaller. The integration test asserts exactly that shape before it asserts the fix.

**Five hundred transactions on one BOQ item is not exotic.** A cable line accrues ordered, received,
issued, installed, approved, certified and billed rows for the life of a project.

---

## 2. The other four

| Where | What the capped read did | Direction of the lie |
|---|---|---|
| `reverseBilled` | Looked for the ORIGINAL billed fact, which is **older** than the cancellation reversing it | Not found reads as *"nothing to reverse"* and returns `null` — the billed quantity **stayed standing and the cancellation reported success** |
| `correctCertified` (source) | Scanned for the certified row by its shape | Aged past the cap → **refused a valid correction** |
| `correctCertified` (effective total) | Summed certified rows to check the result would not go negative | Understated → **refused a valid correction**, differently |
| `postInstalled` / `postCertified` / `postBilled` | Pre-checked a keyed replay | The durable guard is `append`'s conflict, so **no double-post** — but a truncated pre-check could miss a *conflicting* replay and return the stored row as if it agreed |

The last row is stated precisely because it would have been easy to claim four double-post bugs. There
were none: those three writes were always protected by the unique index. What was degraded was
conflict *detection*.

---

## 3. The reactors, and a migration whose purpose never landed

Migration **0255** added `dedupe_key` and its partial unique index. Its own header says why:

> *"A durable per-post dedupe key makes `post` idempotent **so those reactors can propagate failures
> to the outbox again**."*

The mechanism shipped. Three reactors never adopted it and kept posting unkeyed rows — the ordered
reversal on `po.updated(cancelled)`, the received quantity on `grn.created`, the issued quantity on
`stock.movement_recorded`. All three are keyed now, and the PO-cancellation reactor's capped
read-then-check is deleted: it was two failures in one, since the guard could not see far enough
**and** two concurrent deliveries could both pass it.

Its comment claimed redelivery-safety. It is now true rather than claimed, and the regression test
**fails without the key** — checked by removing it and watching the assertion report two rows.

---

## 4. Why two of them are still `bestEffort`, and it is not the ledger's fault

By this file's own rule, a keyed sink qualifies for `retryable`. I did not promote them, because of
something the sweep turned up:

**`EventBus.publish` is `Promise.all` over every handler, and the relay retries the whole EVENT.** So
one handler's rethrow re-runs *all* of its siblings. `inventory.stock.movement_recorded` has **four**
subscribers, one already `retryable` — so its failures already re-run the inventory GL journal post,
which has no idempotency key and would double-post a real ledger entry.

That is a live latent defect and it is **not fixed here**: fixing it means per-handler delivery
tracking, which is an architecture change and belongs in its own gate. What this gate does is refuse
to add another trigger for it, and rewrite the two `bestEffort` reasons to say the true thing — the
sink is duplicate-safe; the fan-out is what is not. A stale reason that blames the ledger would have
sent the next reader to the wrong place.

The sibling PO-transition reason was updated for the same reason: it named *"the non-idempotent
received-quantity reactor"*, which as of this gate is keyed.

---

## 5. The migration, and what it deliberately does not hide

**0305** backfills the three keys onto rows the reactors already wrote. Without it, an event sitting
in the outbox with `attempts > 0` is re-delivered after deploy, finds no conflicting key because last
time's row has none, and posts the quantity a second time — the change would open the exact window it
closes.

**It keys only the first row of each group.** If a group already holds two rows, that is a historical
double-post, and keying both would violate the unique index and fail the deploy. Keying the earliest
leaves the duplicate **visible and unkeyed**. A migration is not the place to decide what to do about
a quantity that was counted twice, and it must not paper over one.

Verified against the disposable database, not reasoned about: four rows seeded — a reversal, a GRN,
and **two** movements sharing one `movementId` — then the migration run. The first three came back
keyed; the duplicate came back `null`.

---

## 6. A hazard this uncovered that is bigger than this gate

The backfill works locally **because the migration role is a superuser**. I checked rather than
assumed: `aura` reports `rolsuper: true, rolbypassrls: true`.

This table is `FORCE ROW LEVEL SECURITY`, and **FORCE applies to the table owner too**. So on any
deployment whose migration role is a non-superuser owner, the policy applies — and with no tenant
bound, `current_tenant_id()` is null and nothing matches. Demonstrated directly:

```
rows visible to a NOBYPASSRLS role with no tenant bound: 0
rows a backfill UPDATE would touch: 0
```

No error. No warning. **Zero rows, silently** — the same failure mode this series has now hit three
times in different clothes.

Every data backfill in this chain uses the same plain-`UPDATE` shape (0239, 0241, 0249, 0267, 0269,
0270). If any deployment runs migrations as a non-superuser owner, **all of them have silently done
nothing**. I followed the house pattern here rather than inventing a private mechanism for one
migration, and I am recording the hazard instead of leaving it discovered-and-forgotten. It is
Gate-21 candidate 1.

---

## 7. Gate 19's own fitness test had a hole, and this gate fell in it

The resolver pin added last gate extracted a method body from the first `{` at end of line. A
signature like `async reverseBilled(input: {` opens a brace in its **parameter type**, so the "body"
came back as the parameter list — and a body cut short makes every `mustNotCall` pass while reading
nothing.

It surfaced because each resolver also carries a `mustCall`, which fails when the body is not really
there. That assertion existed for exactly this reason and it did its job. The helper now walks the
parameter list to its closing paren first.

---

## 8. The proof

All against the disposable PostgreSQL database (`environment: "e2e-disposable"`, **305/305**
migrations) with auth ON as `u-admin`.

| Check | Result |
|---|---|
| `quantity-position-completeness.pg-int` — real Postgres, application role, **600 transactions on one BOQ item** | **5 passed** |
| migration 0305 backfill, incl. a deliberate duplicate | verified against the live database (§5) |
| reactor re-delivery (×3), and **each fails without its key** | in `cross-module-subscriber.test.ts` |
| e2e — **full suite**, 54 specs | **150 passed**, 6 skipped, 3 failed — all three pre-existing (§8a) |
| `@aura/api` | **416 passed** (was 410) |
| `@aura/projects` | 425 passed, 12 skipped (the pg-int suites, run separately) |
| `pnpm test` — every package | 51 / 51 tasks |
| `pnpm typecheck` | 51 / 51 |
| production `next build` | clean, 27 / 27 |
| `rls-fitness` | 254 / 254 |
| `migrations:check` | 305 files, sequential, `@DOWN` present |

**The integration test proves the defect before it proves the fix.** It lays the `boq` baseline down
first and then 599 installed rows, so the baseline is the oldest row — then asserts that the capped
read returns 500 rows **containing no baseline at all**, and that the position computed from them
reports `boq: 0` and `progressPct: 0` on an item that is 59.9% installed. Only then does it show the
complete read returning all 600 and the position coming out right.

It also pins the read order. `quantityPosition` takes the unit from the first row carrying one, so
newest-first is load-bearing for that one field — preserved exactly, so this gate changed
completeness and nothing else.

---

## 8a. The three e2e failures, and one run that had thirty-one

`global-shell-home`, `internal-chat` and `permit-workflow` fail here. All three were **baselined
against `main` during TC-GATE-19** — checked out, run, failed identically — so they are pre-existing
and not this gate's. Nothing else fails; this run is one better than last gate's, whose fourth failure
was a CRM flake that passed in isolation.

The first attempt at this suite reported **thirty-one** failures and ran for twenty minutes. That was
not the code: **the disk filled up** (`ENOSPC`), the Next dev server died with a fatal Turbopack error
mid-run, and everything downstream of it timed out. The turbo build cache had grown to **46 GB** on a
67 GB volume. Cleared it (gitignored, no tracked files, regenerates on the next build), cleared the
dev cache that had been corrupted by a half-written SST, restarted, re-ran: three failures.

Recorded because the instinct on seeing thirty-one red tests is to go looking through the diff, and
the answer was `df`. The same reflex that made TC-GATE-19 baseline against `main` rather than guess.

---

## 9. Known limitations

1. **The event fan-out (§4) is unfixed** — a `retryable` handler's throw still re-runs every sibling,
   including the inventory GL journal post, which is not idempotent. The most serious thing this gate
   found and deliberately did not touch.
2. **Backfill migrations depend on a privileged migration role (§6)**, unverified outside local.
3. **The cost ledger has the same shape and is not fixed here.** `CostLedgerService` line 60 already
   passes `limit: 1000000` to escape the cap — someone hit this before and defended with a magic
   number instead of a read that cannot truncate. It works; it is not the fix; and the quantity
   ledger's `position` never even got the magic number.
4. **`list` still caps at 500** and is still the public audit-trail read. Correct as a listing — that
   is the whole distinction this gate and the last one rest on.
5. **Historical double-posts are not repaired**, only left visible (§5).
6. **The ITP's `discipline` is still free text**; **Handover still has five sections, not eight.**

---

## 10. Gate-21 candidates

1. **The migration-role/RLS hazard** (§6) — cheap to settle, and it silently invalidates six existing
   backfills if it is real in any deployment.
2. **Per-handler event delivery** (§4) — the architecture fix that would let keyed reactors be
   retryable without exposing their siblings.
3. **The cost ledger's reads** — the twin of this gate, including replacing the `limit: 1000000`.

---

**CLOSED / NOT CLOSED: CLOSED / VERIFIED.** Gate 21 not started.
