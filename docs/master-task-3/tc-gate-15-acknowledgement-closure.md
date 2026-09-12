# TC-GATE-15-ACKNOWLEDGEMENT-CLOSURE

**Verdict: CLOSED / VERIFIED.** **No migration** — this gate stores nothing; it reads back a
reference the last one wrote. `rls-fitness` unchanged at **253 / 253**.

**Scope taken:** the first Gate-15 candidate from the TC-GATE-14 register — surfacing what became of
the conveyance.

---

## 1. A reference nothing read back

TC-GATE-14 asked document control to open a transmittal and stored its id on the dossier manifest.
Nothing resolved it. **A stored reference nobody reads is exactly what TC-GATE-6 removed from the
O&M pack** — it looks like evidence and proves nothing. The surface could say a conveyance existed;
it could not say whether it had been sent, to whom, or whether the client confirmed receipt.

That last one is the whole reason the seam was built. *"We never received the O&M manuals"* is
answered by the client's acknowledgement, not by our record of having sent it — and the
acknowledgement was being written into DocControl and never looked at.

---

## 2. What was added

`DocControlPort` gains `readProjectTransmittals`, beside the register read it already had — one call
per project, the same shape as every other read in this module.

**DocControl resolves the acknowledgement, not the consumer.** The transmittal head holds the
current status; the immutable acknowledgement record holds who and when. A consumer should not have
to know those are two tables to answer one question, so the projection carries
`acknowledgedAt` / `acknowledgedBy` already joined — and only asks for the acknowledgement when the
status says there is one.

**Four states, said plainly**, and the last two are the distinction that matters:

| | |
|---|---|
| no transmittal | *not conveyed through document control* |
| opened, not sent | *TR-… opened, not yet sent by document control* |
| sent | *sent 2026-09-01 to Client DC (TR-…) — not yet acknowledged* |
| acknowledged | *acknowledged by Client Rep on 2026-09-03 (TR-…)* |

An issue with no transmittal **was never conveyed** — a decision. An issue whose transmittal cannot
be read **is conveyed and unverified** — an outage. Collapsing them into one phrase would report an
outage as a decision, and blame the wrong party for the gap.

**Nothing is gated on it.** An unacknowledged transmittal does not block acceptance. Nobody has
stated that a client must confirm receipt before accepting handover, and inventing that requirement
would repeat the mistake TC-GATE-10 deliberately avoided with certificate registration.

---

## 3. The proof

All against the disposable PostgreSQL database (`environment: "e2e-disposable"`, 303/303
migrations) with auth ON as `u-admin`.

| Check | Result |
|---|---|
| e2e — dossier, inspections, certificates, defects, as-built links, handover, commissioning, closeout, NCR, journey | **39 passed**, 0 failed, 2 pre-existing conditional skips |
| `@aura/commissioning` | **166 passed** (was 164) |
| `@aura/doccontrol` | 35 passed |
| `@aura/api` | 405 passed |
| `@aura/web` | 185 passed |
| `pnpm typecheck` | 51 / 51 |
| production `next build` | clean |
| `rls-fitness` | 253 / 253 |

**The e2e drives the whole lifecycle across the boundary:** submit → *opened, not yet sent*;
document control **sends** it → *not yet acknowledged*; document control records the client's
**acknowledgement** → *acknowledged by …*. Every transition is performed through DocControl's own
API, because Handover cannot perform any of them.

The unit tests pin the two states that look alike: a conveyance that was opened and can be read back
acknowledged, and one that was opened while the transmittal read throws — `transmittalId` set,
`transmittal` null.

---

## 4. What the proofs caught

**One assertion of mine, one gate old.** TC-GATE-14's spec asserted the conveyance line read
*"conveyed by document control"*. This gate replaced that label with something more specific, and the
old assertion failed. Updated to name the transmittal and drive the lifecycle rather than match a
phrase — which is the assertion it should have been.

**One transient**, recorded rather than hidden: a run failed in `global-setup` because the health
check did not answer, and passed on the retry with the API reporting healthy throughout. An
environment hiccup, not a product fault.

---

## 5. Known limitations

1. **Handover cannot send or acknowledge, by design** — and there is no link from the dossier to the
   transmittal in document control, so a reader who wants to act on it has to find it there.
2. **The acknowledgement is the recipient's own record**, entered by whoever operates DocControl. It
   is stronger evidence than our manifest and weaker than a signed receipt; nothing here signs
   anything.
3. **Nothing is gated on acknowledgement** (see §2) — a package can be accepted with the dossier
   unsent.
4. **A resubmission opens a second transmittal**, still unlinked to the first.
5. **Still no PDF anywhere**, and **the ITP's `discipline` is still free text** — both unchanged.

---

## 6. Gate-16 candidates

1. **The ITP discipline**, with the data migration its free-text history requires — now the last
   untyped vocabulary and the last of the small, well-understood items.
2. **Spares**, which needs a new authority rather than a port.
3. **Handover Scope and Overview** — the two tabs of the original eight that still have no data model
   behind them.

---

**CLOSED / NOT CLOSED: CLOSED / VERIFIED.** Gate 16 not started.
