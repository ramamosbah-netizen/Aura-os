# TC-GATE-17-INVENTORY-REFERENCE-CLOSURE

**Verdict: CLOSED / VERIFIED.** **No migration** — the column existed; what it lacked was anyone
checking it. `rls-fitness` unchanged at **254 / 254**.

**Scope taken:** the spares stock reference — the gap I introduced one gate earlier and named as the
clearest Gate-17 candidate in the TC-GATE-16 register.

---

## 1. A gap of my own making

TC-GATE-16 gave a spare an optional `stockItemId` and described it in its own migration header as
*"a REFERENCE for anyone who wants the part's real record"*. It was free text nobody checked.

That is precisely what TC-GATE-6 removed from the O&M pack — *"a typo records a reference to
nothing"* — **reintroduced one gate later in a smaller place.** Writing the word "reference" in a
comment does not make a column one; resolving it does.

---

## 2. What was added

`InventoryPort.readStockItems`, implemented by `StockService`, bound in the composition root.

**A projection of code, name and unit, and nothing else.** Inventory keeps everything that makes a
part a part — quantity on hand, warehouse, average cost, costing method, reorder policy. A consumer
that cannot see valuation cannot come to depend on it, and **a spares list handed to a client has no
business carrying what the contractor paid.**

**Checked in two places, for two different reasons** — the pattern TC-GATE-6 established:

- **On write**: a reference the tenant has no part for is refused where it is typed.
- **On read**: every row is re-resolved, so the code and name shown are Inventory's answer *now*.
  Nothing is stored, which is the difference between referencing Inventory and copying it.

**The reference stays OPTIONAL.** A spare described in words — *"assorted fixings"* — is still a
spare, and the e2e asserts that a spare with no reference is accepted. What is refused is a reference
that points nowhere: optional to give, but not optional to be real.

**Nothing moves stock.** This gate reads. Handing a spare over does not decrement anything, and the
closure of TC-GATE-16 said so; that has not changed.

---

## 3. The proof

All against the disposable PostgreSQL database (`environment: "e2e-disposable"`, 304/304
migrations) with auth ON as `u-admin`.

| Check | Result |
|---|---|
| e2e — inventory references, spares, dossier, handover, inspections, certificates, as-built links, defects, commissioning, closeout, NCR, journey | **42 passed**, 0 failed, 2 pre-existing conditional skips |
| `@aura/commissioning` | **174 passed** (was 171) |
| `@aura/inventory` | 41 passed |
| `@aura/api` | 405 passed |
| `@aura/web` | 185 passed |
| `pnpm typecheck` | 51 / 51 |
| production `next build` | clean |
| `rls-fitness` | 254 / 254 |

**The e2e crosses the boundary in both directions:** a bad code is refused; a spare without one is
accepted; a part is created **in Inventory, where parts are created**; the same code is then accepted
on the spare and the surface shows Inventory's code and name.

---

## 4. Two things recorded rather than smoothed over

**An assertion I wrote that could never execute.** The spec originally ended with a rename check
wrapped in `if (renamed.ok())` — and Inventory exposes no rename endpoint, so it would have passed
forever without running. A conditional assertion that cannot fire is test-shaped nothing. It is
deleted, with a comment saying the property is asserted against the resolver directly instead.

**A journey test that outgrew its timeout.** `handover readiness is projected…` now has 42 awaited
steps across five domains and runs 30–70s; it was inside the default 60s by luck, and tipped over.
Raised to 180s deliberately **rather than split** — splitting would mean seeding the same five
domains twice and asserting less, not more — with the reasoning written above the test. It is a
genuine cost of the chain growing, not a hidden regression: the same test passed at 36s two gates
ago and the steps added since are all real evidence.

---

## 5. Known limitations

1. **Resolution reads the tenant's WHOLE stock list** on every spares read. Fine at today's scale and
   wrong at a real one — a tenant with ten thousand parts will read ten thousand rows to resolve
   five. A targeted `readStockItems(tenantId, ids)` is the fix, and it is not done here.
2. **The unit is not taken from the part.** A spare carries its own `unit` field, so a part measured
   in metres can be listed in "ea" and nothing objects.
3. **A spare description is still free text**, so two systems can hold "Spare camera" and
   "spare camera" as different parts even when both reference the same stock item.
4. **Nothing moves stock**, and nothing checks that the quantity handed over was ever on hand.
5. **The ITP's `discipline` is still free text** — the last untyped vocabulary, unchanged since
   TC-GATE-12 named it.
6. **Handover has five sections, not eight.** Scope and Overview still have no data model.

---

## 6. Gate-18 candidates

1. **A targeted stock read** — closing limitation 1 before it becomes a production problem.
2. **The ITP discipline**, with the data migration its free-text history requires.
3. **Handover Scope and Overview** — the two tabs of the original eight with nothing behind them.

---

**CLOSED / NOT CLOSED: CLOSED / VERIFIED.** Gate 18 not started.
