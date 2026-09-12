# TC-GATE-18-STOCK-READ-CLOSURE

**Verdict: CLOSED / VERIFIED.** **No migration.** `rls-fitness` unchanged at **254 / 254**.

**Scope taken:** the whole-stock read from TC-GATE-17, which I recorded as a scale limitation. It
was not a scale limitation. **It was a correctness defect**, and this gate exists because I checked
rather than took my own note at face value.

---

## 1. What I wrote down, and what was actually true

The TC-GATE-17 register said:

> *"Resolution reads the tenant's WHOLE stock list on every spares read. Fine at today's scale and
> wrong at a real one."*

That is wrong on the first half. `StockStore.listItems` applies a **default `LIMIT 200`**, ordered by
code. So on any tenant with more than two hundred parts:

- a spare naming the 201st part **read "not in inventory"** on screen; and
- worse, `addSpareItem` **refused a perfectly real part**, because the write validates against the
  same truncated list.

**A validation that rejects valid input is worse than no validation**, and this one shipped one gate
after I added it. None of it was visible at test scale: the dev database holds a handful of parts, so
every test passed and the limitation read like a performance note.

The lesson is not about inventory. It is that *"fine at today's scale"* was an assumption I recorded
as a finding, and the check took five minutes.

---

## 2. The fix: ask for what you want

`InventoryPort.readStockItems(tenantId, references)` now **takes the references** instead of
returning the tenant's stock for the caller to search. There is no list, so there is nothing to
truncate — the bug class is designed out rather than tested around.

Inventory resolves each reference with the lookups it already had: `getItemByCode` (tenant-scoped —
and the code is what a person types) and then `getItem` by id. **The id path re-checks the tenant in
application code**, because `getItem` carries no tenant in its SQL and leans entirely on row-level
security. RLS is real and is asserted below, but a resolver is the wrong place to depend on a single
layer.

Handover passes only the references its rows actually carry: one lookup per distinct part on a
spares list, instead of a read of the tenant's catalogue.

---

## 3. The proof

All against the disposable PostgreSQL database (`environment: "e2e-disposable"`, 304/304
migrations) with auth ON as `u-admin`.

| Check | Result |
|---|---|
| `stock-reference-resolution.pg-int` — real Postgres, application role, **250 parts** | **4 passed** |
| e2e — inventory references, spares, dossier, handover, inspections, certificates, as-built links, defects, commissioning, closeout, NCR, journey | **42 passed**, 0 failed, 2 pre-existing conditional skips |
| `@aura/commissioning` | 174 passed |
| `@aura/inventory` | 41 passed, 4 skipped (the pg-int suite, run separately above) |
| `@aura/api` | 405 passed |
| `@aura/web` | 185 passed |
| `pnpm typecheck` | 51 / 51 |
| production `next build` | clean |
| `rls-fitness` | 254 / 254 |

**The integration test proves the defect was real before it proves the fix works.** Its first
assertion seeds 250 parts and shows the default list returns **200 of them, with the part under test
not among them** — so the old resolver could not have found it. The next two show a targeted lookup
finds it by code and by id regardless of position. The fourth asserts that another tenant's part
stays invisible by id, which is the layer the application-level tenant check is deliberately
doubling.

It runs against the Postgres store on purpose: the limit lives in that adapter, and an in-memory
adapter would never have shown it — the same reason the TC-GATE-1 lineage has a pg-int proof.

---

## 4. Known limitations

1. **One round trip per distinct reference.** A spares list with ten parts makes ten lookups. Small
   and bounded, and correct — but a batched `WHERE code = ANY($1)` would be one. Not done, because
   the fix for a truncation bug should not introduce a new query shape in the same change.
2. **The unit is still not taken from the part** — a spare carries its own, so a part measured in
   metres can be listed in "ea".
3. **Nothing moves stock**, and nothing checks that a handed-over quantity was ever on hand.
4. **`getItem` still carries no tenant in its SQL.** Left alone: it is Inventory's method with other
   callers, and changing its signature from here is the boundary violation this series avoids. The
   risk is covered by RLS plus this consumer's own check, and it is recorded rather than silently
   relied upon.
5. **The ITP's `discipline` is still free text** — the last untyped vocabulary.
6. **Handover has five sections, not eight.**

---

## 5. Gate-19 candidates

1. **The ITP discipline**, with the data migration its free-text history requires — now the only
   small, well-understood item left.
2. **Handover Scope and Overview** — the two tabs of the original eight, both of which would need a
   data model invented rather than discovered.
3. **A sweep for other default-limited reads** used as resolvers, which is the general form of the
   defect this gate fixed.

---

**CLOSED / NOT CLOSED: CLOSED / VERIFIED.** Gate 19 not started.
