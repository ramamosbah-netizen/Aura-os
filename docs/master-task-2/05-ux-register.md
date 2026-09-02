# UX and Product-Coherence Register

## Current strengths

- Centralized navigation drives sidebar and command palette from one model.
- Sales & Commercial is presented as one product with Direct and Tender branches; CRM, Tendering and Contracts remain technical domains.
- Project 360 is the canonical delivery surface; legacy ProjectDetail behavior is not assumed to be valid merely because a historical page existed.
- Load-bearing list surfaces have a classified API error seam (`unauthorized`, `forbidden`, `not-found`, `server`, `unreachable`) and distinguish failure from an empty dataset in the verified surfaces.
- Governed actions expose lifecycle validation rather than generic status mutation in the closed Sales/PD-5 paths.

## Findings

| ID | Observation | Impact | Severity |
|---|---|---|---:|
| UX-01 | `/crm/reports` is a compatibility/redirect surface while Analytics is the current performance surface | Users may read two labels as separate ownership | P2 |
| UX-02 | `/contracts` and nested contract/certificate routes provide multiple entry points | Discoverability is acceptable, but canonical-vs-compatibility wording should be explicit | P2 |
| UX-03 | Secondary panels still use permissive `getJson` behavior by design | Some failures may degrade as empty on non-load-bearing panels | P2 |
| UX-04 | 202 pages span many verticals with uneven depth and evidence | A broad menu can imply parity where workflow depth differs | P2 |
| UX-05 | No repository proof of full responsive/mobile/offline field journey | Site users may lack resilient field mode | P3 |
| UX-06 | i18n and regional/residency behavior are not implemented/proven | Limits multi-region adoption | P3 |
| UX-07 | Notifications surface exists but real provider delivery is unverified | Users may miss required actions | P2 |

## Required UX evidence for future remediation

For each load-bearing page, verify loading, empty, forbidden, error, mutation pending/success, and stale-data states. For each authoring journey, verify post-mutation refresh and history visibility. These are audit recommendations only; no UI changes are made by Master Task 2.

## Project Delivery deep audit

| Surface | Current responsibility | Browser/static evidence | Disposition |
|---|---|---|---|
| `/projects/dashboard` | portfolio delivery cockpit, attention queue, EV health | authenticated DOM showed clear zero-data state, “SPI Unavailable”, attention and shortcut regions | IMPROVE — expose exception drill-down and make the no-project state actionable without implying schedule health |
| `/projects/projects` | active-contract project register | authenticated DOM showed explicit “start from an active contract” empty state and New Project action | KEEP — governed entry point; improve role-specific next action later |
| `/projects/projects/<id>` | compatibility route to canonical Project 360 | source redirects to `/project/<id>/controls`; no duplicate writer | COMPATIBILITY / ALIAS |
| `/project/<projectId>` | Project command center: delivery pulse, blockers, six area links | source is canonical, project data absent in current local dev seed; prior project browser suite retained | KEEP — add stronger evidence for dense real-project state |
| `/project/<projectId>/controls` | controls, WBS/CBS, quantity/cost/EVM read and authoring | canonical component exposes Unknown planning values and unavailable PV/SV/SPI; source audit found legacy component still exists but is not route-owned | IMPROVE — make authority/provenance and empty/error states more explicit |
| `/project/<projectId>/team` | project team context | source route present and linked from command center | KEEP |
| `/project/<projectId>/<area>` | engineering/site/quality/HSE/commissioning/documents registers | shared register with project filter and DataStateNotice | KEEP — verify per-area mutation feedback in future |
| `/projects/schedule` | schedule/Gantt entry | authenticated DOM gave explicit “create a project first” state | IMPROVE — distinguish no schedule from unavailable schedule and make baseline semantics visible |
| `/projects/variations` | variation order authoring/list | authenticated DOM showed project selector, type, amount, raise action and empty table | KEEP — governance is domain-owned; improve history/approval visibility |
| `/projects/closeout` | closeout register | route inventory and source present | KEEP |

### Project Delivery persona audit

| Persona | Landing / immediate need | Current finding | UX disposition |
|---|---|---|---|
| Project Manager | Project Delivery dashboard → blockers, schedule, progress | good single cockpit; zero-data and exception states are clear, but portfolio-to-project drill-down can be deeper | IMPROVE |
| Commercial / QS | Project controls → baseline, quantity, certification, variations | authority boundaries are present; provenance is not always first-glance | IMPROVE |
| Planning Engineer | Schedule → baseline/tasks/variance | schedule page is understandable but no-data state does not yet expose baseline readiness | IMPROVE |
| Site Engineer | Project 360 Site area → daily reports/installations | project context is preserved; field/offline behavior is not proven | IMPROVE |
| Cost Controller | Controls → CBS/cost ledger/EVM | Cost Ledger authority and unavailable PV metrics are semantically correct; legacy labels may confuse | IMPROVE |
| Management / Director | Project Delivery dashboard / Command Center | KPI summary is concise; cross-project drill-down and benchmark evidence are limited | IMPROVE |
| Finance | Finance cockpit + project cost/read-only projections | separation of AC, AP and cash is correct; remote DB/runtime profile can confuse local verification | IMPROVE |
| Document Controller | Project 360 Documents + Doccontrol | controlled records are connected, but upload/security/provider proof is incomplete | IMPROVE |

The workspace reads as one Project 360 with bounded area owners, not as a physical merge of modules. No closed PD-5 authority was reopened. The remaining findings are product-experience evidence and hierarchy issues, not domain-contract defects.

## 2B supplemental live shell evidence

After the authenticated session was restored, read-only snapshots of `/finance`, `/procurement`, `/inventory/dashboard`, and `/crm/overview` confirmed the same AURA shell, consolidated suite ownership, breadcrumb context, online/synchronized status, and domain-specific empty states. Finance explicitly reports no pending decisions and zero pending value; Procurement/Inventory and Sales retain their suite-owned navigation. No form was submitted and no business data was changed.
