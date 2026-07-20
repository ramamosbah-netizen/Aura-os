# My Day — Operational Review

**Date:** 2026-07-20
**Scope:** `/crm/my-day` after six slices (PRs #157–#160)
**Method:** live measurement against a running stack — endpoint timings by `curl`, data overlap computed from live API responses, rendered cards read out of the DOM
**Verification note:** every number below was measured. No score is issued; §7 states what was *not* measured.

---

## 0. What was measured, and how

| Claim class | How established |
|---|---|
| Endpoint latency | `curl -w %{time_total}` against `localhost:4000`, one warm run each |
| Page latency | Same, 5 consecutive runs against `localhost:3000/crm/my-day`, plus a lighter CRM page as baseline |
| Data overlap | Set intersection computed in the browser over live `/api/inbox`, `/api/notifications`, `/api/crm/my-day`, `/api/crm/opportunities/pipeline` responses |
| Card emptiness | Rendered DOM, per section |
| Query graph | Read from `page.tsx` |

Dev mode, `force-dynamic`, single tenant (`dev-tenant`). Production numbers will be lower; the **relative** findings hold.

---

## 1. Single source of truth — one real violation

The page issues **nine queries**: one awaited, then eight in parallel.

```
await /api/workspace/me              ← blocks everything below
Promise.all([
  /api/crm/my-day        /api/crm/quotations      /api/tendering/tenders
  /api/contracts/contracts  /api/crm/signals/radar   /api/inbox
  /api/notifications      /api/crm/opportunities/pipeline
])
```

**Finding 1.1 — two engines answer "which deals need attention".**

| Card | Source | Filter | Rows today |
|---|---|---|---|
| My deals | `/api/crm/my-day` | `ownerId == me` | **0** |
| Deals at risk | `/api/crm/opportunities/pipeline` | tenant-wide | **12** |

Overlap: **0**. Not because they are well separated, but because one is empty. Two different services, two different definitions of "needs attention", rendered as two cards on one page. This is the SSOT violation.

**Finding 1.2 — the AI rail restates the cards.**

The top insight reads *"37 decisions are waiting on you · AED 8,716,890 held up"*. The card below it reads *"Waiting on you — 37 decisions across the platform · AED 8,716,890 held up"*. **Identical numbers, same source, two places.** This was introduced in slice 3 and should not have been.

---

## 2. Inbox vs Notifications — no duplication. Keep both.

| | Inbox | Notifications |
|---|---|---|
| Rows | 37 | 4 unread |
| Shared `refId`s | **0** | |
| Modules | Finance, Procurement, Quality, HR, Subcontracts, Tendering | tendering, crm, contracts |
| Tense | pending — *waiting on a decision* | past — *already happened* |

Zero identifier overlap and disjoint module coverage. They are semantically distinct: one is work you owe, the other is news you missed. **No action.**

---

## 3. Activities vs At-Risk — not duplicated, but mis-scoped

Overlap is **0**, and the tasks (`now: 3`, `next: 0`, `meetings: 1`) are activity records while at-risk rows are opportunities. Different entities entirely.

The problem is not duplication, it is **scope**: `My deals` is owner-filtered and therefore silent, while 12 deals slide — **11 of them owned by nobody**. An owner-filtered card cannot surface unowned work, which is exactly the work most likely to be dropped.

---

## 4. Default order — wrong for a new user

Current order, and what each card held at measurement time:

| # | Card | Rows | Kind |
|---|---|---|---|
| 1 | Capture | input | action |
| 2 | Waiting on you | 37 | decisions |
| 3 | Since you were here | 4 | news |
| 4 | Deals at risk | 12 | risk |
| 5 | Today's appointments | 1 | **work** |
| 6 | Now — late or due today | 3 | **work** |
| 7 | Next | 0 | *empty* |
| 8 | My leads | 1 | work |
| 9 | My deals | 0 | *empty* |

A new user opening My Day meets an **empty text box** first, then 41 rows of other people's decisions and platform news, before reaching the three things actually due today at position 6.

The page's own stated question is *"where do I focus today?"* — the answer to that question is card 6.

---

## 5. Merge / split recommendations

| # | Change | Rationale |
|---|---|---|
| R1 | **Merge `My deals` into `Deals at risk`** | One card, "Deals needing attention", yours sorted first then unowned. Kills a permanently-empty card (§1.1) |

> **Correction to R1 (found while implementing).** This row originally said the merge "removes the duplicate engine". That was wrong — the two engines are **complementary, not duplicated**, and their reason sets do not intersect:
>
> | Detector | Detects |
> |---|---|
> | `pipeline.atRisk` | close date passed · gone quiet · weak qualification · no decision-maker · buying-journey misalignment |
> | `day.opportunities` | no next action · no owner · no due date |
>
> Dropping either would have lost real signal. The implemented fix therefore **merges by opportunity id and unions both reason sets**, rather than removing an engine. Verified live by temporarily assigning an at-risk deal to the test user: it rendered as **one** row, first, carrying **all five** reasons — three from the pipeline engine, two from my-day — and the deal was reverted to unowned afterwards.
>
> The defect was never duplication. It was **two cards for one question, one of them structurally silent** because it filtered by owner while 11 of 12 sliding deals had no owner.
| R2 | **Drop the decisions insight from the AI rail** | The card states it better and more completely (§1.2) |
| R3 | **Merge `Now` + `Next`** into one "Your work" card with two headings | `Next` was empty; two cards for one list of dated activities |
| R4 | **Reorder:** work first — Now/Next, Appointments, then Waiting on you, Deals at risk, Since you were here, Capture last | Answers the page's own question at position 1 (§4) |
| R5 | **Keep Capture, move it to the end** | Capture is a verb you reach for deliberately; it is not the answer to "where do I focus" |

Net: **9 cards → 6**, with nothing removed from the day.

---

## 6. Performance — the sharpest finding

**Page, 5 consecutive runs:** 6.37s · 5.55s · 5.11s · 5.14s · 5.13s
**Baseline** (`/crm/accounts`, same conditions): 3.07s · 3.04s

My Day costs roughly **2 seconds more than double** a normal CRM page.

**Per endpoint:**

| Endpoint | Time | Why |
|---|---|---|
| `/crm/my-day` | **3073 ms** | fetches `limit: 5000` activities **+** 5000 leads **+** 5000 opportunities, every load |
| `/inbox` | **2838 ms** | 13 sequential module list calls |
| `/crm/opportunities/pipeline` | 881 ms | |
| `/notifications` | 875 ms | |
| `/tendering/tenders` | 821 ms | |
| `/crm/signals/radar` | 812 ms | |
| `/crm/quotations` | 807 ms | |
| `/contracts/contracts` | 805 ms | |
| `/workspace/me` | 807 ms | **awaited before the other eight start** |

Three findings:

- **P1 — the `me` waterfall.** `/api/workspace/me` is awaited alone, so its ~800 ms is added *in front of* the parallel block instead of inside it. It is needed only to build the `my-day` query string.

  > **Correction (measured after this report was first written).** The original text here claimed removing the waterfall "would return ~800 ms directly". That was an assumption, not a measurement, and it is **wrong for this environment**. The session cookie carries the username for free, but **this dev stack has no session cookie** — `/api/crm/my-day` without `?userId=` returns **400**, confirming no bound actor. Signed out, the `me` call still has to happen, and because `my-day` (the slowest query) depends on it, the critical path is unchanged: measured **5.13 s before → 5.09 s after**, i.e. within noise.
  >
  > The fix was still made, because it is correct where it matters: with a session cookie, `my-day` starts immediately and the ~800 ms disappears. **That gain is production-only and was not measurable here.** Signed out, only `my-day` now waits for `me` instead of all eight queries.
- **P2 — `my-day` pulls 15,000 rows to render 4.** It renders `now: 3`, `next: 0`, `meetings: 1`, `leads: 1`, `opportunities: 0`. The filtering happens in the host after loading everything.
- **P3 — `inbox` fans out to 13 modules on every page load.** Acceptable on a dedicated inbox page; expensive on a page that also does eight other things.

The parallel block is bounded by its slowest member, so **`my-day` alone sets the floor at ~3.1 s**, and P1 pushes the total to ~3.9 s before rendering.

---

## 7. What was NOT measured

- **Production timings.** All numbers are dev-mode with `force-dynamic`. Do not quote them as production figures.
- **Cold start**, and any effect of the Next.js dev compiler on the first run (run 1 was ~1.2 s slower than runs 3–5; that gap is likely compilation, not data).
- **Multi-tenant behaviour.** One tenant, one user (`u-admin`), whose owned-deal count is 0 — which is precisely why `My deals` reads empty. A tenant with owned deals would show different card fullness, though it would not change §1.1.
- **No UX score is issued.** The findings above are defects and recommendations, not a rating.

---

## 8. Suggested order of work

1. ~~**P1** — un-block the `me` waterfall.~~ **Done.** Correct, but the win is production-only — see the correction in §6. Do not expect it to show up in dev timings.
2. **R1 + R2** — merge the deals cards, drop the duplicated insight. Closes the SSOT violation.
3. **R4 + R3 + R5** — reorder and merge Now/Next. Pure layout.
4. **P2** — push `my-day` filtering into the query instead of loading 15,000 rows. Largest win, but it is an API change and belongs in its own slice.
5. **P3** — consider caching `/inbox` or loading it after first paint.

R1–R5 are UI-only. P2 and P3 touch the API and should not be bundled with them.
