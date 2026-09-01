# PD-5B Gate B — Authority and Acceptance Contract

**Date:** 1 September 2026  
**Scope:** PD-5B Gate B evidence acceptance only  
**Implementation status:** B1–B7 functionally implemented; no new implementation authorized by this document.

## 1. Purpose

This document is the canonical acceptance contract for PD-5B Gate B. It resolves the previous
absence of a repository-backed Gate B authority without adding requirements retroactively.

The contract accepts the tested handover and delivery semantics and separates Gate B evidence
from release/production evidence.

## 2. Handover boundary

Contract signing is the commercial-to-delivery boundary:

```text
Governed commercial source
        ↓
Accepted commercial baseline
        ↓
Contract
        ↓ contracts.contract.signed
Project + immutable handoverSnapshot + deterministic hash
```

The signed handover must preserve the exact source facts available at acceptance time:

- source opportunity/tender identity where available;
- accepted quotation and revision identity where available;
- commercial baseline identity;
- original contract value and currency where available;
- acceptance/award provenance;
- frozen source items and their quantities where available;
- explicit unavailable/unknown values (never fabricated zeroes).

The handover is replay-safe. Later mutable Sales/Tender changes cannot rewrite the persisted
snapshot, original value, source lineage or hash.

## 3. DeliveryItemMap lifecycle decision

`DeliveryItemMap` is required before any delivery execution fact depends on commercial-to-delivery
mapping, including SOLD, installed quantity, progress attribution and item-level EVM.

It is **not** required to be created automatically by the Contract → Project reactor.

The accepted lifecycle is:

```text
Contract signed
      ↓
Project + immutable handover snapshot
      ↓
Explicit governed mapping command/service
      ↓
DeliveryItemMap
      ↓
Quantity / progress execution
```

The mapping command must validate tenant, project, handover, frozen item membership, source
identity and WBS/CBS ownership. It is immutable and replay-safe. A conflicting remap fails.

The absence of automatically-created map rows in the handover reactor is therefore not a Gate B
failure under this contract.

## 4. Gate B exit criteria

Gate B requires the following invariants to be proven against the approved disposable PostgreSQL
environment and the canonical application/API boundaries where applicable:

1. Direct governed handover persists a Project from the real acceptance/signing path.
2. Tender governed handover persists a Project from the real award/signing path.
3. Original handover facts and hash are immutable after source mutation.
4. Contract-signing replay produces one Project and one handover.
5. SOLD, Executed, Certified, Billed and Actual Cost remain independent authorities.
6. Progress and EVM consume the approved B1–B7 authorities.
7. UNKNOWN remains distinct from ZERO through persistence, service and API.
8. DeliveryItemMap is governed before mapped execution; automatic creation is not required.
9. Tenant/RLS isolation, constraints and concurrency are proven on PostgreSQL.
10. Relevant B1–B7 regression evidence passes.

CI is explicitly classified as release/production evidence, not a Gate B exit criterion.

## 5. Existing evidence-to-criterion mapping

| Criterion | Existing evidence | Result |
|---|---|---|
| Fresh PostgreSQL/pgvector | Existing container `aura-pd5b-b8-pg-20260901-01`, healthy, `pgvector/pg16` | PROVEN |
| Migrations 0001–0275 | `aura_migrations` count 275; latest 0275 | PROVEN |
| 0274/0275 effects | Catalog columns, indexes and validated constraints inspected | PROVEN |
| Baseline/snapshot persistence | Project handover snapshot/hash and opening BAC fixtures persisted | PROVEN |
| Direct governed handover | Authenticated API: Opportunity → Quotation → Approval → Acceptance → Contract → Sign → Project | PROVEN |
| Tender governed handover | Authenticated API: Opportunity → Tender → BOQ → Quotation → Approval → Award → Contract → Sign → Project | PROVEN |
| Post-handover isolation | Direct Opportunity and Tender mutations left Project value, snapshot and hash unchanged | PROVEN |
| Replay/idempotency | Re-signing each Contract returned the same Project; persisted count remained one | PROVEN |
| SOLD / Certified / Billed / AC | Disposable PostgreSQL persistence fixtures plus focused B3–B6 proofs | PROVEN |
| Progress/EVM | Canonical EVM API returned BAC/EV/AC/CV/CPI and unavailable PV/SV/SPI correctly | PROVEN |
| UNKNOWN ≠ ZERO | `planned_value_known=false` remained distinct from explicit zero; API preserved unavailable planning basis | PROVEN |
| DeliveryItemMap lifecycle | Service validation, immutable replay/conflict tests and disposable DB/RLS mapping proof | PROVEN under explicit lifecycle |
| RLS/tenant isolation | Restricted `NOBYPASSRLS` probe and 15/15 isolation assertions | PROVEN |
| Concurrent baseline approval | Genuine concurrent API approvals converged to one baseline/event | PROVEN |
| B1–B7 regression | Projects 46/46 and API 23/23 after real DB execution | PROVEN |
| CI | No remote CI run in this checkpoint | RELEASE-ONLY / NOT RUN |

## 6. Scope decisions

The following are not Gate B blockers under this contract:

- automatic DeliveryItemMap creation during handover;
- a shared Direct/Tender EstimateRevision model;
- time-phased PV;
- future BAC rebaseline semantics;
- EAC, ETC, VAC or TCPI;
- CI execution, unless a separate release policy requires it.

The following remain outside this contract:

- PD-5C;
- Project UI convergence;
- Sales changes;
- destructive cleanup or route retirement.

## 7. Decision

All Gate B criteria defined here are covered by existing evidence. No additional B8 rerun is
required solely because the authority document was previously absent.

```text
PD-5B Gate B        PASS
Technical evidence  PASS FOR TESTED SCOPE
DeliveryItemMap     LIFECYCLE PROVEN — explicit governed step; auto-map not required
CI                  RELEASE EVIDENCE — NOT RUN
PD-5C               BLOCKED
Sales               NO CHANGE
```

Gate B PASS is not a production-readiness declaration. Release/production evidence remains
separate and CI has not been executed.
