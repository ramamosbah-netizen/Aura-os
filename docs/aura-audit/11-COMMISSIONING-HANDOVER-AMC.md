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
| **Commissioning** | `commissioning.service.ts` + `handover.service.ts`, 1 store, 1 page, 2 tests | `PARTIALLY_IMPLEMENTED` — commissioned/handover-accepted events real; test sheets/punch-lists/retest depth not verified |
| **AMC** | `amc.service.ts`, 2 stores, 3 pages, 3 tests | `PARTIALLY_IMPLEMENTED` — work-order lifecycle → finance billing wired; preventive-maintenance scheduling not verified |
| **Assets** | `assets.service.ts`, 1 store, 3 pages, 4 tests | `PARTIALLY_IMPLEMENTED` — asset register + disposal reactor; warranty tracking not verified |
| **Handover** | `handover.service.ts` + `/handover` route group | `PARTIALLY_IMPLEMENTED` — acceptance event real; asset-register population depth not verified |
| **Field Service / PWA** | — | `MISSING` — no offline/PWA, technician GPS, signatures, or spare-parts-on-work-order verified in `apps/web` |
| **Warranty / O&M** | folded into AMC/assets | `PARTIALLY_IMPLEMENTED` |

## Findings

- **Positive:** the "handover valley" that kills most ERPs (data not flowing from delivery into O&M) is **bridged by events** here — commissioning → handover → AMC → finance is real.
- **Gap:** the depth inside each stage (punch lists, retesting, PPM schedules, warranty clocks, technician field app) is **thin or missing**. This half of the platform is a **coherent skeleton, not a fleshed-out FSM/CMMS**.
- **Field Service is effectively absent** as an end-user experience — there is no verified mobile/offline worker journey.

**Scores:** Commissioning 48 · Handover ~52 · AMC 56 · Assets 54 · Field Service 20 (missing).
