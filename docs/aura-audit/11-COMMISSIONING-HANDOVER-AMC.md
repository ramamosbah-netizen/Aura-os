# 11 — Commissioning / Handover / O&M / Warranty / AMC / Field Service

## Lifecycle wiring — `VERIFIED_IMPLEMENTED` (thin implementations)

The post-execution chain is **event-wired end to end**, even though the individual module implementations are thin:

```
commissioning.record.commissioned ─▶ (commissioning-handover-subscriber.ts:26) ─▶ handover
commissioning.handover.accepted    ─▶ (handover-amc-subscriber.ts:26)           ─▶ AMC setup
amc.workorder.completed            ─▶ (cross-module-subscriber:1052)            ─▶ finance billing
assets.asset.disposed              ─▶ (cross-module-subscriber:1169)            ─▶ finance disposal
```

So the flow **Project completion → Commissioning → Handover → AMC → Asset register → Finance** does connect. This is a real, if shallow, lifecycle.

## Module-by-module

| Module | Impl | Status |
|---|---|---|
| ▲ **Commissioning** | `commissioning.service.ts` + `handover.service.ts`, 1 store, **2 pages**, 3 tests | **`VERIFIED_IMPLEMENTED` (Rev 2)** — itemised test sheet + punch list + enforced retest gate; see below |
| **AMC** | `amc.service.ts`, 2 stores, 3 pages, 3 tests | `PARTIALLY_IMPLEMENTED` — work-order lifecycle → finance billing wired; preventive-maintenance scheduling not verified |
| **Assets** | `assets.service.ts`, 1 store, 3 pages, 4 tests | `PARTIALLY_IMPLEMENTED` — asset register + disposal reactor; warranty tracking not verified |
| **Handover** | `handover.service.ts` + `/handover` route group | `PARTIALLY_IMPLEMENTED` — acceptance event real; asset-register population depth not verified. **Rev 2: deliberately untouched by PR #209** |
| **Field Service / PWA** | — | `MISSING` — no offline/PWA, technician GPS, signatures, or spare-parts-on-work-order verified in `apps/web` |
| **Warranty / O&M** | folded into AMC/assets | `PARTIALLY_IMPLEMENTED` |

## Rev 2 — commissioning depth (PR #209, mig `0228`)

Rev 1 recorded "test sheets/punch-lists/retest depth **not verified**". That is now implemented and verified in source:

- **Itemised test sheet** — `CommissioningTestItem` (`modules/commissioning/src/domain/commissioning-test-item.ts`), so a commissioning record carries per-test results rather than a single status flag.
- **Punch list** — `PunchItem` with severity and open/closed state (`domain/punch-item.ts`).
- **Enforced retest gate** — `commissioning.service.ts:78-81` refuses sign-off while any punch item is `open`:
  > `only a system with no open punch items can be commissioned (N open)`

  This is a **service-level guard**, not a UI affordance, so it holds for any caller. Phrased to land as a 409 under the platform error taxonomy (`error-taxonomy`, `05`).
- **Commissioning 360** — `/commissioning/[id]` renders record + test sheet + punch list from one `getDetail` read (`:187-192`).
- Covered by `apps/api/test/commissioning-handover-workflow.e2e-spec.ts` and `apps/web/e2e/commissioning-workflow.spec.ts`.

**Scope note:** the depth was added to the *commissioning* aggregate only. The **handover module was intentionally left untouched**, so Rev 1's handover findings (asset-register population depth unverified) still stand.

## Findings

- **Positive:** the "handover valley" that kills most ERPs (data not flowing from delivery into O&M) is **bridged by events** here — commissioning → handover → AMC → finance is real.
- **Rev 2:** the gap "depth inside each stage" is **closed for commissioning** (punch lists + retesting now real and gated) and **still open for the rest** — PPM schedules, warranty clocks and the technician field app are unchanged. The post-execution half is no longer a uniform skeleton: its first stage is fleshed out, the downstream stages are not.
- **Field Service is still effectively absent** as an end-user experience — there is no verified mobile/offline worker journey. *(An `offline-sync.spec.ts` browser spec now exists, but it does not amount to a technician field journey.)*

**Scores (Rev 2 re-estimates from merged source, not a live benchmark):** Commissioning 48→**62** · Handover ~52 (unchanged) · AMC 56 (unchanged) · Assets 54 (unchanged) · Field Service 20 (missing, unchanged).
