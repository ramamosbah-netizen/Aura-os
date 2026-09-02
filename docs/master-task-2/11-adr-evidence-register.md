# ADR and Evidence Register

## Current accepted decisions

| Decision | Current authority | Evidence | Status |
|---|---|---|---|
| Sales & Commercial is one visible product | `apps/web/components/nav.ts` | current nav and Sales closure evidence | ACCEPTED |
| Handover freezes commercial facts | project handover snapshot/hash | Gate B Direct/Tender proof | ACCEPTED |
| Delivery mapping is explicit post-handover lifecycle | DeliveryItemMap + migration 0273 | C1/C2/B8 evidence | ACCEPTED |
| SOLD, EXECUTED, CERTIFIED and BILLED are separate | Quantity Ledger / IPC paths | B3–B5/C2/C4 evidence | ACCEPTED |
| Cost Ledger is sole AC history | Cost Ledger + rebuildable CBS/WBS projections | B6/C5 evidence | ACCEPTED |
| BAC is approved opening baseline | migration 0275 + B7A | B7 evidence | ACCEPTED |
| PV/SV/SPI/EAC family unavailable without time-phased authority | canonical EVM service | B7 evidence and tests | ACCEPTED |
| CI is release evidence unless governance says otherwise | Gate B authority decision | B8 report | ACCEPTED |

## Evidence quality distinctions

| Claim | Layer | Current result |
|---|---|---|
| Type correctness | source/build | 51/51 current typecheck |
| Functional domain behavior | tests | strong for closed Gate A/B/PD-5 spine |
| Persistence/migration | local DB catalog | 275 applied locally |
| RLS | local disposable evidence | relevant Gate B/C2 paths proven; production not proven |
| Browser | local authenticated smoke/E2E | 7/7 project browser evidence retained |
| Production readiness | external operations | NOT PROVEN |

## Open decisions requiring authority

1. Production auth/RLS operator evidence and environment contract.
2. Canonical EVM API deprecation/reader rules for legacy overloads.
3. Dead-letter replay/reconciliation ownership and SLOs.
4. Search scale target and projection technology.
5. Provider/upload security acceptance criteria.
6. Whether deferred ELV, Bid Review and Liquidated Damages become Master Task 3 scope.

## Audit boundary

Master Task 2 records these decisions and gaps; it does not implement them. This register is intentionally separate from PD-5 closure evidence and must not be used to infer production approval.
