# Integrations and Event Spine

## Event topology

`core` provides event contracts, PostgreSQL event store/outbox, relay/retry and dead-letter handling. `apps/api/src/events/cross-module-subscriber.ts` wires CRM/tendering → contracts → projects → procurement/inventory/site/quality/finance/AMC/assets, with notifications and other subscribers.

## Important flows

| Source event | Consumer(s) | Contract status |
|---|---|---|
| commercial baseline/quotation accepted | contract/handover reactors | proven for Direct/Tender Gate B journeys |
| contract signed | project creation + handover snapshot/WBS seed | proven; explicit DeliveryItemMap is a later lifecycle step |
| `site.installation.recorded` | quantity/progress synchronization | proven and replay-convergent |
| `contracts.ipc.certified` | certification/AR and downstream consumers | proven with idempotency guards |
| material/labour/plant/subcontract actual | Cost Ledger actual | proven under B6/C5 contract |
| inventory GRN | receipt evidence | intentionally not automatically AC |
| AP payment/customer receipt | cash settlement/receipt | excluded from project AC |

## Risks

1. Best-effort subscribers and retryable subscribers coexist; a failed projection can leave a stale read model unless reconciliation is run.
2. Duplicate-event protections exist in key paths, but a single operator workflow for inspecting, replaying, and proving convergence is not established.
3. External integrations/providers (mail, SMS, push, connectors) are represented by adapters/subscribers, not live-provider evidence.
4. API/BFF route inventory is broad; contract tests should be tied to canonical endpoint ownership to prevent compatibility routes drifting.

## Recommended evidence, not implementation

Define per-event ownership, retry class, idempotency key, dead-letter disposition, projection rebuild command and operator audit trail. This is Wave 1/2 work and is outside Master Task 2 remediation authorization.
