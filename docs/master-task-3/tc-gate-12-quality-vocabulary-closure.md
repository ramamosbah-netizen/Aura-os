# TC-GATE-12-QUALITY-VOCABULARY-CLOSURE

**Verdict: CLOSED / VERIFIED.** **No migration** — the two changes needed none, for reasons that are
themselves the finding. `rls-fitness` unchanged at **253 / 253**.

**Scope taken:** Quality's untyped vocabularies, the Gate-12 candidate from the Gate-11 register —
done in the module that owns them, which is why it was deferred out of Gate 11 rather than forced
through from commissioning.

---

## 1. The defect: three normalisers, and only one knows the aliases

The same value — an ELV system name — is reduced for comparison in three separate places:

| Where | What it does | Knows aliases? |
|---|---|---|
| `commissioning-readiness.ts::normalise()` | lowercase, hyphens/spaces → `_` | **no** |
| `apps/web/lib/project-areas.ts::normaliseLensValue()` | lowercase, strip all non-alphanumerics | **no** |
| `@aura/shared::toElvSystemOrNull()` | canonical resolve, **with an alias map** | yes |

`@aura/shared` carries `ELV_SYSTEM_ALIASES` — `pa_va`, `pa`, `voice_alarm` → `public_address`;
`acs`, `access` → `access_control`; `sc` → `structured_cabling`; `lan` → `network` — and its own
comment records that **`pa_va` is a spelling that genuinely exists in `aura_commissioning_records`**.

Neither reader used it. So an open non-conformance filed against `acs` did **not** block the
access-control system's readiness gate, and did **not** appear under that system's Project-360 lens.
The NCR was open, visible in Quality, and invisible to the two places that decide whether the system
can be handed over.

Both readers now resolve through the canonical function. The punctuation strip is kept in the lens
as a *fallback*, because that lens compares heterogeneous fields — a drawing's `discipline`
(`architectural`) is not an ELV system and must keep comparing the way it always did.

---

## 2. The decision this gate deliberately did NOT reverse

Migration 0282 added `aura_quality_ncrs.system` as **nullable free text with no CHECK**, and argued
for it: *"a CHECK would only add a way for a project with an unusual system name to fail a write"*,
and NULL must stay NULL because *"a default would make every historical NCR claim a system it was
never assessed against."*

That reasoning is sound and stands. **The storage was never the problem — the reading was.** This
gate changes no column and adds no constraint; it makes the readers resolve properly instead of
stripping punctuation and hoping.

---

## 3. The third case, and why it blocks

An NCR attributed to something the platform cannot resolve at all — `"chiller plant"` — now
**blocks**, and the reason names the value so the fix is obvious.

The alternative is to ignore it, which hides an open non-conformance behind a typo. **UNKNOWN NEVER
PASSES** is the rule every gate in this chain follows. The cost of being wrong this way is that
someone corrects the NCR's system field; the cost of being wrong the other way is a system handed
over with an unresolved non-conformance against it.

---

## 4. An ELV ERP whose inspection request could not say "cctv"

`InspectionRequest.discipline` was four values: `civil | mechanical | electrical | plumbing`. On an
ELV ERP. An engineer inspecting a camera installation had to file it as *electrical* or not at all —
and the form's own label read **"Electrical & ELV"**, which is what a screen looks like when the
vocabulary behind it cannot say what the business does.

It is now the canonical platform `Discipline` (18 values). A strict **superset**: all four old values
are members, every existing row stays valid, and the column never carried a CHECK constraint — so
**no migration was needed**. The API still *rejects* an unrecognised trade rather than coercing it,
because a typo on a write somebody just made is worth reporting; `toDiscipline`'s fallback is for
reading rows that already exist.

`DISCIPLINE_LABELS` was added to `@aura/shared` beside `ELV_SYSTEM_LABELS`, for the same stated
reason that one exists: one source for labels so API, UI and reports never drift.

**This does not make inspection requests contribute to readiness.** It removes the reason they
couldn't — nothing on an IR could name an ELV system. Adding an IR gate is a change to Testing &
Commissioning and a separate decision about what an open IR means for readiness.

---

## 5. The proof

All against the disposable PostgreSQL database (`environment: "e2e-disposable"`, 302/302
migrations) with auth ON as `u-admin`.

| Check | Result |
|---|---|
| e2e — the full affected set plus the NCR lens, Project-360 and compliance suites | **57 passed**, 0 failed, 2 pre-existing conditional skips |
| `@aura/commissioning` | **151 passed** (was 149) |
| `@aura/web` | **185 passed** (was 182) |
| `@aura/api` | 405 passed |
| `@aura/quality` | 30 passed |
| `pnpm typecheck` | 51 / 51 |
| production `next build` | clean |
| `rls-fitness` | 253 / 253, unchanged |

The new unit tests pin all three cases: `acs` and `pa_va` now block their own systems; an
access-control NCR still does **not** block CCTV (resolving is not matching everything); and an
unresolvable attribution blocks with its value named. The lens tests assert the aliased row appears
under its canonical twin's lens, that an unattributed row stays visible under every lens, and that
non-system dimensions compare as before.

---

## 6. Known limitations

1. **The ITP's `discipline` is still free text.** It is the last untyped vocabulary, and it is what
   forced the explicit ITP link in TC-GATE-3. Left alone here because, unlike the IR's, its stored
   values are arbitrary strings with a `'general'` default that is not a `Discipline` — so it needs a
   data migration and a decision about what to do with unmappable values, not a type widening.
2. **`RegisterDiscipline` (6) is still unmapped to `Discipline` (18).** Document control files by
   coarse trade; nothing translates between the two.
3. **IRs still contribute nothing to commissioning readiness.** This gate removed the blocker, not
   the gap.
4. **The alias map is small and hand-written.** It covers the drift found so far; a new abbreviation
   in the field resolves to nothing and — by §3 — will block rather than be ignored, which is the
   safe direction but still a correction somebody has to make.
5. **Two normalisers still exist**, now agreeing on ELV systems. They have not been merged, because
   the lens legitimately compares fields that are not ELV systems.

---

## 7. Gate-13 candidates

1. **The ITP discipline**, with the data migration its free-text history requires.
2. **Inspection requests contributing to readiness**, now that they can name a system.
3. **Transmittal-based issue**, and **spares** — both unchanged from earlier registers.

---

**CLOSED / NOT CLOSED: CLOSED / VERIFIED.** Gate 13 not started.
