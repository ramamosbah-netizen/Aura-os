# Domain and Capability Register

Status meanings: `PASS` = current evidence supports the capability; `PARTIAL` = meaningful implementation exists but depth/evidence is incomplete; `NOT VERIFIED` = no trustworthy proof; `DEFERRED` = deliberately outside this audit's remediation scope.

| Suite / capability | Authority and current state | Status | Main gap or evidence |
|---|---|---|---|
| Sales & Commercial | consolidated nav, CRM/tendering/contracts ownership, canonical quotations/commercial decisions | PASS / FROZEN | release evidence separate |
| CRM leads/opportunities/customers | CRM services/controllers and 30 pages | PASS | search/performance and breadth evidence |
| Tendering/Pre-Award | tender register, BOQ, estimation, submission, award | PASS | bid review draft deferred |
| Quotations/pricing | quotation + pricing sheet/estimation authority | PASS | legacy aliases require ongoing fitness |
| Commercial Decisions | composition/decision workspace, no second pricing or mutation owner | PASS | ownership tests retained |
| Contracts/IPC | contract lifecycle, certificates, billed separation | PASS | external provider/production posture |
| Projects / Project 360 | handover, WBS/CBS, quantity/cost ledgers, EVM, delay/EOT | PASS | authoring depth/performance evidence |
| B1–B7 / C1–C6 | frozen source through change control | PASS / CLOSED | no regression found in current source |
| Procurement | PR/PO/RFQ, supplier and spend surfaces | PASS / PARTIAL | GRN→AC policy remains explicitly unverified |
| Inventory | stock, locations, transfers, serials, GRN, valuation | PARTIAL | lot/reservation/valuation depth not fully proven |
| Site execution | daily reports, installations, instructions | PASS | mobile/offline depth not proven |
| Quality/HSE | inspection/NCR and permit/incident workflows | PASS | provider/operational evidence |
| Engineering/Commissioning | drawing/test-sheet/punch-list workflows | PARTIAL | depth and field usability evidence |
| Finance | AP/AR, journals, cash, FX, tax | PARTIAL | two remote PostgreSQL EACCES failures; one API taxonomy failure |
| Subcontracts | claims, variations, back-charges | PARTIAL | certified-claim/AC depth and release proof |
| Doccontrol/Knowledge | revisions/transmittals, documents, clause library | PARTIAL | upload/AV/signed access not proven |
| Admin/security | users, roles, settings, workflows, health, audit | PARTIAL | production auth/RLS posture and operations proof |
| Notifications/integrations | in-app store/subscribers and connector surfaces | NOT VERIFIED | real email/SMS/push/provider health not demonstrated |
| ELV device cockpit | complete branch exists in deferred PR-06 worktree | DEFERRED | product decision required before integration |
| Bid Review | governed draft exists in `aura-os-t2` | DEFERRED | Sales freeze/product decision |
| Liquidated Damages | contracts domain draft exists on retained branch | DEFERRED | business semantics not approved |

## Capability quality pattern

The strongest pattern is governed lifecycle + dual persistence adapter + event idempotency in the core commercial/project spine. The weakest pattern is operational proof at environment/provider boundaries and depth/performance proof for broad verticals. A page existing is not treated as a complete capability unless its writer, authority, permissions, persistence, error states and regression evidence are identifiable.
