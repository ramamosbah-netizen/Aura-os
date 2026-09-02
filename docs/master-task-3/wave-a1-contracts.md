# MASTER TASK 3 — WAVE A1 CONTRACTS

## Baseline

- Repository: `C:\Users\Jeet_intech\Desktop\aura-os`
- Branch: `main`
- HEAD at review: `208238c0068377216cdca940324773ed4828d356`
- `origin/main`: `4c9410b8f19d508f812d55904d949494053caa01`
- Working tree: clean before this report; bounded Contracts changes are now present.
- No push, CI trigger, deploy, migration, or shared-Supabase mutation was performed.
- The canonical Web responded on `http://localhost:3000`. The default API configuration
  points at remote Supabase and could not start in this environment (`EACCES` while
  opening the remote PostgreSQL connection). A temporary in-memory API on `:4402` was
  used only for non-persistent endpoint checks; it is not PostgreSQL evidence.

## Discovery

Contracts has one domain authority in `modules/contracts`, exposed by the API
controllers under `apps/api/src/contracts` and by the Web routes under
`apps/web/app/contracts`. Contract signing remains the governed ContractService
command and emits the project-handover event. Payment Certificate certification
remains the B4/C4 authority and emits the existing certification event; the
cross-module subscriber creates the approved billing artefact without making
certification an Actual Cost writer.

The current implementation is usable for the approved scope, but not all product
capabilities are fully evidenced. In particular, the status endpoint accepts the
declared enum without a complete transition matrix, Contract 360 does not yet show
all document/variation/audit history surfaces, and role assignments for clause,
bond, and obligation mutation need an explicit product decision. These are recorded
as bounded gaps rather than invented policy.

## Capabilities

| Capability | Status | Evidence / remaining boundary |
|---|---|---|
| Contract register | PARTIAL | List/search/status/customer/tender filters, empty/error states and navigation exist. Canonical list now carries tenant context; pagination/sort are not exposed by the compatibility list. |
| Contract creation | PARTIAL | Governed `contracts.contract.create` command and commercial snapshot exist. Manual creation remains permissive about source/value semantics and defaults domain-invalid value input to known zero; policy needs confirmation before further tightening. |
| Contract 360 | PARTIAL | Identity, value, status, certificates, bonds, obligations, actions and print are present. Document, variation, audit/history and complete received-value views are not exposed in this surface. |
| Contract lifecycle | PARTIAL | Draft/active/completed/cancelled are declared and signing has SoD/approval checks. Generic status mutation is still broader than a documented transition matrix. |
| Signing and handover | COMPLETE FOR APPROVED PATH | Gate B evidence proves signing, idempotent Project creation and immutable handover snapshot for Direct and Tender paths. |
| IPC / certification | COMPLETE FOR APPROVED PATH | B4/C4 authority covers creation, lines, submit, certify, reject, pay, audit/event and idempotency. Certified remains distinct from billed. |
| Clauses / terms | PARTIAL | Governed clause library create/search/revise/retire/restore exists. Contract-specific association/version history is not exposed as a complete record capability. |
| Bonds / guarantees | COMPLETE FOR APPROVED SCOPE | Domain lifecycle and parent-contract/tenant checks are enforced. Mutation-role assignment beyond admin requires an explicit authorization decision. |
| Obligations | COMPLETE FOR APPROVED SCOPE | Domain lifecycle, due-soon/list/status and parent-contract/tenant checks are enforced. Mutation-role assignment beyond admin requires an explicit authorization decision. |
| Finance integration | COMPLETE FOR APPROVED PATH | Certified event creates the approved AR/invoiced artefact; AP payment and contract value are not Project Actual Cost. |
| Project integration | COMPLETE FOR APPROVED PATH | Signed contract → project/handover and frozen lineage are covered by Gate B/C4 evidence. |
| Documents / approvals | PARTIAL / DEPENDENCY | Existing document and approval infrastructure is available; Contracts-specific document history and My Work presentation are not a new authority in this slice. |

## Pages

Seven canonical Contracts surfaces are registered; the two print routes are
compatibility/print surfaces, not competing authorities.

| Route | Purpose | Status |
|---|---|---|
| `/contracts` | Contracts landing/compatibility shortcuts | COMPLETE FOR APPROVED NAVIGATION |
| `/contracts/contracts` | Contract register | PARTIAL |
| `/contracts/contracts/[id]` | Contract 360 | PARTIAL |
| `/contracts/contracts/[id]/print` | Contract print/readback | COMPLETE FOR APPROVED PRINT PATH |
| `/contracts/clauses` | Clause library | PARTIAL |
| `/contracts/certificates` | IPC/certificate workspace | COMPLETE FOR APPROVED PATH |
| `/contracts/certificates/[id]/print` | Certificate print/readback | COMPLETE FOR APPROVED PRINT PATH |

Browser page loading was observed for the Web route, but the current session was
redirected to the login screen because the canonical API/authenticated runtime was
not available. Therefore an authenticated browser lifecycle is **NOT PROVEN** in
this run; HTTP reachability is not being upgraded to browser PASS.

## Functions

The repository inventory identifies the following function groups (the list is a
coverage register, not a claim that every item is complete):

- Register: list, search, status filter, customer/tender filter, navigation,
  loading, empty, error, status display, value display, project linkage.
- Contract lifecycle: create, update permitted metadata, activate/sign, complete,
  cancel, print/readback.
- IPC: create, add line, submit, certify, reject, mark paid, summary, list,
  print/readback, sequence/previous-certified calculation.
- Clauses: create, search/filter, revise, retire, restore.
- Bonds: create, list, expiry view, release, call, expire.
- Obligations: create, list, due-soon view, status change.

The function inventory is **PARTIAL** because lifecycle transition policy,
contract-specific document/variation/audit history, and non-admin mutation role
ownership are not established as complete current product contracts.

## Code changes

| File | Classification | Reason |
|---|---|---|
| `apps/api/src/contracts/contracts.controller.ts` | PRODUCT | Pass tenant context through the compatibility list path. |
| `apps/api/src/contracts/contracts.controller.test.ts` | TEST | Prove the list path supplies tenant context. |
| `modules/contracts/src/payment-certificate.service.ts` | PRODUCT | Enforce tenant ownership for certificate lines and contract creation. |
| `modules/contracts/src/payment-certificate.service.test.ts` | TEST | Prove cross-tenant contract rejection. |
| `modules/contracts/src/bond.service.ts` | PRODUCT | Require the referenced contract to exist and belong to the tenant. |
| `modules/contracts/src/obligation.service.ts` | PRODUCT | Require the referenced contract to exist and belong to the tenant. |
| `modules/contracts/src/contract-relationship.service.test.ts` | TEST | Prove missing/cross-tenant parent rejection. |
| `docs/master-task-3/README.md` | DOC | Index for the Wave A1 evidence. |
| `docs/master-task-3/wave-a1-contracts.md` | DOC | Completion/discovery register and bounded evidence. |

No Sales UI, Project UI, B1–B7 semantics, C1–C6 semantics, migration, or runtime
configuration was changed.

## Migrations and persistence

No migration was added or rewritten. `pnpm migrations:check` passed for all 275
files. Existing contract, IPC, clause, bond and obligation tables have tenant
ownership and RLS policies from the current migration chain. Because this slice did
not change schema or persistence semantics, no new PostgreSQL proof was claimed.

## Permissions

Route permissions are derived by the existing PermissionsGuard (`read/create/update`
for each Contracts resource). Current role evidence explicitly covers contract
creation, IPC creation/certification, and signing SoD. Clause/bond/obligation
mutation roles are not broadly assigned in the current role matrix; this remains a
deferred authorization decision, not an admin bypass added by this task.

## Audit and events

Contract create/update/sign/complete events and IPC lifecycle events are present.
IPC certification uses the existing audit writer and carries project/item/quantity/
unit provenance. The existing event subscribers preserve the separation between
certified, billed, and Project Actual Cost. Bond/obligation/clause event behavior is
present, but a complete Contracts-specific audit-history UI is not claimed.

## Integrations

- **Sales:** accepted quotation/tender/award snapshots are consumed as source
  evidence; no Sales ownership or UI was changed.
- **Projects:** signed contracts use the established handover event and frozen
  lineage; Gate B/C4 evidence remains the authority.
- **Finance:** certified IPC creates the approved customer billing artefact; AP
  payment, customer receipt, and contract value remain distinct from Project AC.
- **Documents:** existing document infrastructure is a dependency; no second
  attachment authority was introduced.
- **Approvals:** existing signing and certification approval authorities are reused.

## PostgreSQL evidence

Existing Gate B/C4 PostgreSQL/RLS evidence remains applicable because no schema or
persistence semantics were changed. A fresh Wave A1 PostgreSQL run was not claimed:
the default API could not connect to the configured remote Supabase endpoint from
this environment, and the temporary `:4402` process was explicitly in-memory.

## Browser evidence

Web `/contracts` was reachable over HTTP and the in-app browser rendered the login
screen. Authenticated register/360/IPC lifecycle proof is **NOT PROVEN** in this
run because the canonical API/auth session was unavailable. No browser mutation or
shared-database write was performed.

## Tests and verification

- `pnpm --filter @aura/contracts test`: **PASS — 7 files / 37 tests**.
- `pnpm --filter @aura/api test -- src/contracts/contracts.controller.test.ts`:
  **PASS — 1 test**.
- API contract integration tests: **PASS — 3 files / 42 tests**.
- `pnpm --filter @aura/contracts typecheck`: **PASS**.
- `pnpm --filter @aura/contracts build`: **PASS**.
- `pnpm --filter @aura/api typecheck`: **PASS**.
- `pnpm --filter @aura/api build`: **PASS**.
- `pnpm --filter @aura/web typecheck`: **PASS**.
- `pnpm --filter @aura/web build`: **PASS**.
- `pnpm --filter @aura/projects test`: **PASS — 26 files / 123 tests**.
- `pnpm --filter @aura/projects typecheck/build`: **PASS**.
- `pnpm --filter @aura/web test`: **PASS — 36 files / 175 tests** (required
  elevated local filesystem access because Vitest could not read an ancestor
  directory in the restricted runner; no config/product change was made).
- Root `pnpm typecheck`: **PASS — 51/51 tasks**.
- `pnpm migrations:check`: **PASS — 275/275 migrations**.
- `git diff --check`: **PASS** (line-ending warnings only).
- Full API suite: **376/377 passed**; the single failure is the pre-existing
  error-taxonomy fitness test and is outside Wave A1.

## Master Gap interaction

- MT2-API-001: **PARTIALLY ADDRESSED** by tenant propagation on the Contracts
  compatibility list path.
- MT2-SEC-003: **DEPENDENCY ONLY**; no upload-security redesign was attempted.
- MT2-UX-001: **DEPENDENCY ONLY**; print and compatibility surfaces remain bounded.
- MT2-OPS-001 / MT2-TEST-001: **DEPENDENCY ONLY**; runtime and full-suite gaps
  remain separately tracked.
- MT2-DEC-001: **NOT IN CONTRACTS SCOPE**; Liquidated Damages was not invented.
- MT2-SEC-001 / MT2-SEC-002 / MT2-REL-001: **NOT IN SCOPE**.

## Remaining Contracts gaps

1. Authenticated browser/API evidence against a working local PostgreSQL-backed
   runtime is still required for a full product-completion claim.
2. A complete lifecycle transition matrix and protection against overly generic
   status mutation require an explicit current product contract.
3. Contract-specific document, variation, audit/history and received-value views
   are not complete in Contract 360.
4. Non-admin clause/bond/obligation mutation permissions require an explicit role
   decision.
5. The repository-wide API error-taxonomy fitness failure remains pre-existing.

## A1.1 CLM Design Gate (decision required)

The existing `/contracts/clauses` capability is a reusable clause library, not a
contract-draft/negotiation system. A real Contract Lifecycle Management (CLM)
workflow requires an explicit product/legal decision before implementation:

```text
Clause Library
  → Contract Clause Snapshot
  → Contract Revision (R01…Rn)
  → Internal/Client Review
  → Negotiation and share history
  → Approval
  → Signed immutable revision
  → Post-sign amendment/variation through the existing change authority
```

This gate must define revision identity, clause snapshots, comments/share
provenance, approval states, client access/security, and the boundary between
pre-sign negotiation and post-sign C6 change control. It must not mutate the
standard clause library or the signed revision. No CLM tables, sharing endpoint,
client portal, or negotiation workflow has been invented in A1.1.

**A1.1 disposition:** `DECISION REQUIRED — CLM DESIGN GATE`.

## Safety flags

- Development data preserved: **YES**
- Shared Supabase mutated: **NO**
- Sales authority regressed: **NO**
- PD-5 authority regressed: **NO**
- Push performed: **NO**
- CI triggered: **NO**

## Decision

MASTER TASK 3 — WAVE A1 CONTRACTS = PARTIAL

CONTRACTS PRODUCT COMPLETION = NOT COMPLETE

BLOCKERS = authenticated browser/API lifecycle evidence is unavailable in the
current environment; the CLM Draft/Negotiation/Revision/Client Sharing design is
decision-bound; document/history and non-admin role ownership remain unresolved.

NEXT = restore a local PostgreSQL-backed API/auth runtime, then review the bounded
Contracts gaps and authorize only the missing product decisions before further
implementation.
