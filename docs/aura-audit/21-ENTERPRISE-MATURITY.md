# 21 — Enterprise Maturity & Tier-1 Comparison

## Maturity level

| Level | Definition | AURA OS? |
|---|---|---|
| L1 Prototype | throwaway, mocked | No |
| L2 Functional MVP | works, thin, single-tenant | Exceeded |
| **L3 Production Application** | real persistence, auth, tests, CI | **Yes** |
| **L4 Enterprise Platform** | multi-tenant, governance, event-driven, control plane | **Partially — architecture yes, verification/depth no** |
| L5 Tier-1 Enterprise SaaS | proven scale, compliance, full lifecycle, mobile, integrations | No |

**Placement: Level 3.5.** The *architecture* is L4-shaped (multi-tenant isolation, event-driven cross-module spine, admin control plane, ADR governance, fail-closed security). It falls short of a confident L4 on **verification** (UI E2E, prod RLS proof, performance evidence) and **lifecycle depth** (back-half modules).

## Capability comparison (architecture, not feature parity)

Comparing *architectural capability*, not screen-count. "≈" = credible primitive present; "△" = partial; "✗" = absent/unverified.

| Capability | SAP S/4 · Oracle · Dynamics · ServiceNow · Primavera · Procore | AURA OS | Notes |
|---|---|---|---|
| Multi-tenant isolation | ✓ | ≈ (RLS + scoped pool) | Strong design; prod proof pending |
| Enterprise identity (SSO/JWKS) | ✓ | ≈ | JWKS/HS256 verifier; SCIM/provisioning ✗ |
| RBAC/ABAC | ✓ | ≈ (route-derived taxonomy + org-path) | No ABAC policy engine |
| Financial controls (GL/AR/AP/tax/FX/consolidation) | ✓ | ≈ | Real domain + tests; double-entry enforcement unproven |
| Project controls (WBS/EVM/schedule/cost ledger) | Primavera ✓ | ≈ | Real EVM + cost/quantity ledgers |
| Procurement/inventory (P2P/3-way match) | ✓ | ≈ | Real; batch/valuation △ |
| Document control / engineering | ✓ | **≈** | **Rev 2:** governed revision + drawing state machines, Register/360 UI, browser E2E |
| QA/QC · HSE | Procore ✓ | **≈** | **Rev 2–2.2:** NCR corrective-action loop; permit-to-work with 3 enforced approval gates + incident/CAPA gate |
| Workflow engine | ServiceNow ✓ | △ | Orchestrator + approval matrix + event reactors; no visual designer/BPMN |
| Audit / event sourcing | ✓ | ≈ | Append-only `aura_events` + outbox |
| Integrations (connectors/webhooks) | ✓ | △ | Connector + webhook kernel; catalog thin |
| Scalability (proven) | ✓ | ✗ | Unbenchmarked; search fan-out |
| Governance/extensibility | ✓ | ≈ | ADR registry, form engine, module manager, feature flags |
| Asset / fleet / maintenance management | ✓ | **≈** | **Rev 2.3:** governed work-order lifecycle + contract gate + stamped SLA outcome; asset disposal gate; fine dispute resolution |
| Mobile / offline / field service | Procore ✓ | ✗ | Absent |
| Reporting/analytics | ✓ | △ | Real KPIs, freshness/materialization thin |
| Compliance (SOC2/audit trails/retention) | ✓ | △ | Audit + data-lifecycle present; certified controls ✗ |

## Where AURA is genuinely competitive

- **Tenant isolation runtime** and **fail-closed security bootstrap** are better-engineered than many mid-market ERPs.
- **Event-driven cross-module spine** rivals the *shape* of enterprise process integration.
- **Governance-as-code** (ADRs, migration policy, fitness tests, restore drill) exceeds typical SME-ERP discipline.

## Where it is not Tier-1

- **No proven scale, no mobile/field service, thin back-half lifecycle depth, and unverified operational posture.** These are the difference between "Tier-1-shaped architecture" and "Tier-1 product."

**Enterprise maturity: L3.5 — an L4-architected platform awaiting L4-grade verification and lifecycle depth.**
