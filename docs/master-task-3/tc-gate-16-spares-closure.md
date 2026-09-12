# TC-GATE-16-SPARES-CLOSURE

**Verdict: CLOSED / VERIFIED.** Migration `0304` applied; `rls-fitness` re-measured at **254 / 254**.

**Scope taken:** spares — the last handover readiness item that said *"nothing verifies this"*, in
every register since TC-GATE-4.

---

## 1. The end of the six booleans

TC-GATE-4 turned handover readiness from six ticks into a projection and left four as assertions.
TC-GATE-5 built two authorities (O&M, training). TC-GATE-6 derived a third (warranty certificates)
from an authority that already existed and was simply never read. TC-GATE-9 added a seventh item
(Quality snags) that was already derived. **Spares was the one left.**

It now has an authority, and the consequence is larger than one item:

> **No handover readiness item is asserted any more.** `evidence: 'asserted'` no longer occurs. The
> package's stored checklist has nothing left that anybody reads or can write, and the UI list of
> tickable items is empty — kept, typed, and empty, because its emptiness is the statement.

The unit suite asserts exactly that, in one line: every item's `evidence` is `projected`.

---

## 2. Why nothing already owned it

- **Inventory** holds stock items, movements, serial units and their **issue to a project**. That is
  how a part gets installed. Handing two spare cameras to the building owner at handover is a
  different event with a different counterparty, and Inventory models the first.
- **The O&M pack's `spare_parts_list`** is a DOCUMENT — the recommended list. A list is not a
  delivery, and reading it as one would quietly redefine the item from *handed over* to
  *written down*.

So `aura_handover_spares` is the authority, scoped to a system like the O&M pack beside it.

**The client's word is what counts.** `handedOverAt` is ours; `acknowledgedBy` is theirs, and only
the second satisfies readiness — the same rule client training has followed since TC-GATE-5.

**Not a ledger.** Two integers on one row. Nothing decrements stock, values anything, or pretends to
be Inventory; `stockItemId` is a reference for whoever wants the part's real record.

**Guards, each closing a way the record could lie:** acknowledging before anything was handed over is
refused (an acknowledgement of nothing is not evidence); more than was asked for is refused (a typo
or an unrecorded change); a **partial** delivery is allowed, because part-deliveries are real — and
it does not satisfy the gate; and an acknowledgement needs a **named** representative.

**No backfill.** The old `spares` tick records that somebody asserted it — no quantity, no part, no
recipient. Turning one boolean into a row would fabricate the delivery this table exists to record.

---

## 3. A real defect the proofs found — and a correction to two earlier registers

The certificate-link spec failed **reproducibly in the full suite and passed in isolation**. I chased
it rather than calling it a flake, and it was a product bug:

**A reference input accepted typing before React hydrated.** Hydration then reset the input to its
initial state, so the typed value silently disappeared and the button it gated never enabled. Under
light load hydration won the race; under suite load it did not.

The fix is in the product, not the test: those inputs are now **disabled until hydrated**, like the
buttons beside them. A field that is briefly disabled is honest; one that forgets what was typed into
it is not. Applied to the certificate reference, the as-built reference, the O&M document reference,
and the two spares inputs added here.

**The correction.** The TC-GATE-8 and TC-GATE-10 registers each recorded a one-off failure of this
same shape and attributed it to cross-test interference and a stale dev server. **That was probably
wrong** — the symptom matches this race, and it is the kind of explanation that closes an
investigation instead of finishing it. Recorded here rather than left standing.

---

## 4. The proof

All against the disposable PostgreSQL database (`environment: "e2e-disposable"`, 304/304
migrations) with auth ON as `u-admin`.

| Check | Result |
|---|---|
| e2e — spares, dossier, handover, inspections, certificates, as-built links, defects, commissioning, closeout, NCR, journey | **41 passed**, 0 failed, 2 pre-existing conditional skips |
| `@aura/commissioning` | **171 passed** (was 166) |
| `@aura/api` | 405 passed |
| `@aura/web` | 185 passed |
| `pnpm typecheck` | 51 / 51 |
| production `next build` | clean |
| `rls-fitness` | 254 tenant-scoped tables · enabled 254 · forced 254 · with-policy 254 |

**The sequence the e2e drives, through the UI:** nothing listed → UNKNOWN; a part listed → BLOCKED;
handed over → **still BLOCKED**, *"1 handed over but not confirmed"*; the client acknowledges →
READY. Our record of handing something over never satisfies the gate on its own.

**On screen**: seven readiness items, every one reading `derived`, with *Spares and consumables
handed over — derived · Handover — spares — "All 1 required part handed over and acknowledged by the
client."*

---

## 5. Known limitations

1. **Quantities are not reconciled with Inventory.** Handing over five spare cards does not decrement
   anything; `stockItemId` is a free-text reference and is not validated against Inventory, so a typo
   records a reference to nothing — the same gap TC-GATE-6 closed for O&M documents, and it would
   need an Inventory read port to close here.
2. **A spare is described in free text**, so two systems can hold "Spare camera" and "spare camera"
   as different parts.
3. **One hand-over event per row.** A part delivered in two visits records the second quantity over
   the first; there is no delivery history, unlike the test-run lineage.
4. **The O&M pack's recommended-spares list is not linked to what was handed over.** The list says
   what was recommended and this says what was delivered; nothing compares them.
5. **The ITP's `discipline` is still free text** — the last untyped vocabulary, unchanged.
6. **Handover has five sections, not eight.** Scope and Overview still have no data model.

---

## 6. Gate-17 candidates

1. **An Inventory read port** for the spares reference — the last unvalidated cross-domain reference
   in this workspace.
2. **The ITP discipline**, with the data migration its free-text history requires.
3. **Handover Scope and Overview** — the two tabs of the original eight with nothing behind them.

---

**CLOSED / NOT CLOSED: CLOSED / VERIFIED.** Gate 17 not started.
