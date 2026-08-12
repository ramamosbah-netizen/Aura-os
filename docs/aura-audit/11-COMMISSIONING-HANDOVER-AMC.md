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
| ▲▲▲ **AMC** | `amc.service.ts`, 2 stores, **5 pages**, 4 tests | **`VERIFIED_IMPLEMENTED` (Rev 2.3)** — governed work order + contract gate + stamped SLA outcome; see below |
| ▲▲▲ **Assets** | `assets.service.ts`, 1 store, **5 pages**, 5 tests | **`VERIFIED_IMPLEMENTED` (Rev 2.3)** — governed lifecycle + disposal gate; warranty tracking still display-only |
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

## Rev 2.3 — AMC and assets governed (migs `0230`–`0231`)

**AMC.** Rev 1 recorded "work-order lifecycle → finance billing wired; preventive-maintenance scheduling not verified". The lifecycle existed but nothing enforced it — `complete()` set a status field from any state. Now:

- `WORK_ORDER_TRANSITIONS` (`modules/amc/src/domain/work-order.ts:20`): `open → assigned → in_progress → completed`, with `cancelled` reachable from any live state. Completion **straight from `open` is refused** — closing out a job nobody was assigned is how phantom visits get billed. `assigned → completed` is deliberately allowed (marking "in progress" is bookkeeping a technician may skip).
- **Contract gate** (`amc.service.ts`): a work order cannot be raised against an expired or terminated service contract. The **PPM sweep** created visits directly and bypassed this entirely — a schedule left running against a dead contract would mint billable visits forever. Now gated in the sweep too.
- **SLA outcome** is stamped at completion from the governing contract (`slaResolutionHours`, measured `resolutionHours`, `slaMet`) and **snapshotted, not recomputed** — contract terms change, and a recomputed figure quietly re-judges history. Ad-hoc orders with no contract read "not measured", never "missed".
- `startWork()` was on the class from the beginning and **nothing ever called it**; `in_progress` was unreachable. Now wired through service, controller, BFF and UI.
- **Work Order 360** at `/amc/work-orders/[id]` with the register at `/amc/work-orders`.

**Assets.** The disposal reactor was real, but disposal itself was ungoverned:

- **Disposal gate**: refused while maintenance is still open against the asset — work booked against something no longer owned posts cost to a settled asset, and the gain/loss is computed from a book value maintenance is still moving.
- Scheduling work now moves the asset to `maintenance`; completing the **last** open job returns it to `active`. The register previously said "active" for a machine on a workbench.
- **Depreciation is refused once disposed** — its book value was settled by the disposal record.
- **Asset 360** at `/assets/register/[id]` surfaces the gate state before a user attempts a disposal.

**Residual:** warranty clocks and PPM schedule depth are still thin; field service remains absent.

## Findings

- **Positive:** the "handover valley" that kills most ERPs (data not flowing from delivery into O&M) is **bridged by events** here — commissioning → handover → AMC → finance is real.
- **Rev 2.3:** the gap "depth inside each stage" is now closed for **commissioning, AMC and assets**. What remains genuinely thin is **warranty clocks, PPM schedule depth, and the technician field app** — the post-execution chain is governed end to end, but its long-tail service features are not.
- **Field Service is still effectively absent** as an end-user experience — there is no verified mobile/offline worker journey. *(An `offline-sync.spec.ts` browser spec now exists, but it does not amount to a technician field journey.)*

**Scores (re-estimates from merged source, not a live benchmark):** Commissioning 48→**62** · Handover ~52 (unchanged) · **AMC 56→68 (Rev 2.3)** · **Assets 54→66 (Rev 2.3)** · Field Service 20 (missing, unchanged).
