# Journey Register

| Journey | Canonical path | Evidence | Status |
|---|---|---|---|
| Login/authenticated shell | login → session → permission-filtered nav | browser smoke retained; API health 200 | PASS |
| Direct commercial handover | Opportunity → quotation/approval → acceptance → contract → sign → project | disposable PostgreSQL + application evidence from Gate B | PASS |
| Tender handover | Opportunity → tender → BOQ → pricing → quotation → approval/award → contract → sign → project | disposable PostgreSQL + application evidence from Gate B | PASS |
| Frozen handover | signed contract → immutable snapshot/source items/hash | Gate B persistence/source-mutation evidence | PASS |
| Delivery mapping | frozen source item → explicit governed DeliveryItemMap | C1/C2 evidence and migration 0273 | PASS |
| Execution/progress | installation → installed quantity → progress | C2/C3 E2E and project tests | PASS |
| Certification | mapped delivery item → governed certificate/ledger fact | B4/C4 evidence | PASS |
| Billing separation | billed fact independent from certified fact | B4 billed evidence | PASS |
| Actual cost | economic source → Cost Ledger → CBS/WBS projection | B6/C5 evidence | PASS |
| Opening BAC/EVM | approved leaf baseline → BAC → EV/AC/CV/CPI | B7A/B7 evidence | PASS |
| Delay/EOT | governed delay/EOT lifecycle → history/status | PD-5 parity/browser evidence | PASS |
| WBS/CBS authoring | Project 360 → governed writer → persisted hierarchy | PD-5 parity evidence | PASS |
| Sales award browser | Tender Register/360 → award dialog → canonical award | final Sales evidence retained as accepted | PASS |
| Notifications | domain event → provider delivery → retry/dead letter | repository subscriber only; providers not verified | NOT VERIFIED |
| Search | search UI → API fan-out across spine entities | source code shows in-memory fan-out | PARTIAL |
| Restore/recovery | backup → restore → migration/readiness gate | deploy-readiness code exists; live production drill not available | NOT VERIFIED |

## Journey risks

The handover-to-execution spine is the most strongly evidenced journey. The principal residual risk is not the happy path but operational convergence: outbox subscriber failures, provider delivery, environment selection, and production role/auth configuration.

## Additional cross-suite journeys

| Journey | Ownership boundary | Evidence end point | Status |
|---|---|---|---|
| Purchase request → approval → RFQ → supplier → PO | Procurement | controllers/services and workflow seed present; no fresh browser mutation run in this audit | PARTIAL |
| PO → GRN/receipt → inventory | Procurement + Inventory | PO/GRN routes and stores present; GRN is receipt evidence, not automatic AC | PARTIAL |
| Supplier invoice → AP → payment → accounting | Finance | AP/payment services and retained Finance tests; two remote PostgreSQL EACCES failures | PARTIAL |
| Project → installation → inspection → executed quantity | Projects + Site + Quality | C2/C3 E2E and service evidence; Quality remains separate from Certification | PASS |
| Contract → IPC → certification → customer invoice → receipt | Contracts + Finance | B4/C4/Billed evidence and event subscribers; provider/production evidence separate | PASS |
| Document → revision → transmittal/submittal → approval/history | Doccontrol | domain entities, stores, routes and workflow source; upload/provider controls not verified | PARTIAL |
| My Work → Approvals → domain workspace → audit/history | Core + domain | My Work/approval routes and permission guard present; cross-suite browser session expired during this run | PARTIAL |

## Browser limitation for this validation run

The local Web/API processes were restarted from the canonical checkout for read-only Project Delivery inspection. The authenticated browser session then expired when navigating to non-project suites, so no mutation was attempted and no unauthenticated page was promoted to PASS. Existing authenticated browser/E2E evidence remains retained; new cross-suite rows above are deliberately PARTIAL or NOT VERIFIED where fresh session evidence was unavailable.

## Supplemental authenticated browser evidence

The session was subsequently restored without submitting any business mutations. Read-only snapshots of `/finance`, `/procurement`, `/inventory/dashboard`, and `/crm/overview` showed the authenticated `u-admin` shell, consolidated suite navigation, breadcrumb ownership, synced connection state, and domain empty states. This strengthens shell/navigation evidence only; it does not replace the retained governed-journey evidence or prove provider/production behavior.
