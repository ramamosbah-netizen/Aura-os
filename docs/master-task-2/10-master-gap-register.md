# Final Validated Master Gap Register

This is the Master Task 2B authority. Existing IDs were reviewed against current source, local catalog, runtime evidence and retained test evidence. New UX gaps are separate and non-duplicative. Closed authorities are not reopened.

## Summary

| Metric | Count |
|---|---:|
| Existing gaps reviewed | 17 |
| Confirmed | 15 |
| Reclassified | 2 |
| Merged | 0 |
| Rejected | 0 |
| New gaps discovered | 2 |
| Final unique gaps | 19 |
| P0 | 2 |
| P1 | 3 |
| P2 | 12 |
| P3 | 2 |

## Register

| ID | Suite | Lens | Type | Sev | Affected routes/capabilities | Persona/journey | Current behavior | Evidence | Expected behavior | Disposition | Recommendation | Dependencies | Wave | Regression risk | Closed authority impacted? |
|---|---|---|---|---:|---|---|---|---|---|---|---|---|---:|---|---|
| MT2-SEC-001 | Platform | Security/RLS | RELEASE EVIDENCE BLOCKER | P0 | all tenant tables/environments | all personas; every journey | production role/FORCE posture cannot be observed | local catalog 237/248 RLS, 232/248 FORCE; no prod access | prove NOBYPASSRLS + intended FORCE posture per env | CONFIRMED | operational evidence and boot telemetry | deployment access | 0 | configuration drift could expose data | NO |
| MT2-SEC-002 | Platform | Auth | RELEASE EVIDENCE BLOCKER | P0 | auth/session/permission guard | all authenticated journeys | production verifier/grants not proven; local dev auth works | source fail-closed checks + local session only | configure and prove IdP/JWKS/secret and AUTH_REQUIRED | CONFIRMED | production auth posture evidence | IdP/ops | 0 | unauthenticated access if misconfigured | NO |
| MT2-ENV-001 | Web/API | Runtime | RELEASE EVIDENCE BLOCKER | P1 | :3000, :4000, :4311, DB | every browser journey | host API :4000 and Docker :4311 use different DB profiles | process/socket inspection; health 200; remote Supabase connection on host | one explicit, observable local profile | CONFIRMED | provenance banner/startup guard and profile docs | local DB/env | 0 | testing wrong data source | NO |
| MT2-EVM-001 | Projects | EVM/data | TECHNICAL DEBT | P2 | /projects/dashboard, /project/<id>/controls, portfolio API | PM, QS, management | legacy 3-arg calculateEvm overload and stale comments exist; production service uses 4-arg PV-unavailable form | rg call-site analysis: overload only in definition/tests; service passes null PV; UI renders Unavailable | canonical readers cannot regress to static PV | RECLASSIFIED | deprecate overload and add reader fitness rule later | B7 authority | 1 | semantic drift in future consumer | NO |
| MT2-OPS-001 | Core/API | Events/ops | OPERATIONS GAP | P1 | outbox, dead-letter, projection status | PM, ops, support | retry/dead-letter code exists; complete operator reconciliation/replay workflow not proven | event store/relay/subscriber source; best-effort handlers | observable replay, convergence and operator audit | CONFIRMED | define replay/rebuild ownership and SLO | observability/admin | 1 | stale projections/silent failure | NO |
| MT2-DATA-001 | Projects/Finance | Data integrity | DATA INTEGRITY RISK | P2 | ledger/project/installation relations | QS, cost controller, site | key text project references cannot use relational UUID FKs; current orphan scans are zero | local read-only orphan scans all zero; schema types text vs UUID | typed/defended critical relations and orphan gate | RECLASSIFIED | targeted typed constraints or enforced orphan scans | migration decision | 1 | future orphan/cast defects | NO |
| MT2-PERF-001 | Core/Search | Performance | PERFORMANCE / SCALE RISK | P1 | global search | all personas | in-memory fan-out across entity stores | search.service.ts source | bounded/indexed search projection with measured budgets | CONFIRMED | benchmark and projection design | scale targets | 2 | latency/memory growth | NO |
| MT2-PERF-002 | API/Web | Performance | PERFORMANCE / SCALE RISK | P2 | list/register endpoints | operational roles | pagination exists on key portfolios but not uniformly evidenced; caching policy absent | route/source inventory and prior audit | bounded payloads and explicit budgets | CONFIRMED | endpoint fitness and benchmark matrix | PERF-001 | 2 | slow lists/N+1 | NO |
| MT2-TEST-001 | QA | Testing | TECHNICAL DEBT | P2 | CI coverage and vertical suites | release/QA | broad tests pass, but coverage floor and inventory/provider depth are not complete gates | retained test counts and CI branches | critical suites and floors enforced without hiding failures | CONFIRMED | enforce high-value gates separately | CI/release decision | 1 | regressions slip | NO |
| MT2-INT-001 | Integrations | Provider | INTEGRATION GAP | P2 | notifications/connectors | all personas | in-app records/subscribers exist; real email/SMS/push/provider health unverified | source subscribers; no provider evidence | verified provider contracts/retry/dead-letter | CONFIRMED | provider contract tests and health checks | external credentials | 2 | missed notifications | NO |
| MT2-SEC-003 | Documents | Upload/access | SECURITY DEFECT | P2 | documents/uploads/downloads | document controller, all approvers | MIME/size/AV/signed-url behavior not fully proven | route/source inspection; no live security proof | validated uploads and scoped signed access | CONFIRMED | security acceptance matrix | storage provider | 2 | malicious upload/data leak | NO |
| MT2-API-001 | API | Validation | PRODUCT DEFECT | P2 | project/CBS inputs and error taxonomy | PM/QS/API consumers | prior invalid UUID path and one taxonomy fitness failure remain | retained 375/376 result and 29164 log | boundary validation with stable semantic errors | CONFIRMED | targeted API fitness fix in future | error contract | 1 | poor client handling | NO |
| MT2-REL-001 | Finance/Release | Environment | RELEASE EVIDENCE BLOCKER | P2 | Finance remote PostgreSQL tests | finance/release | 256 pass, 2 skipped, 2 remote EACCES failures | retained Finance report | release environment resolves or explicitly waives external DB evidence | CONFIRMED | keep separate from local product proof | release infra | 0 | false release confidence | NO |
| MT2-UX-001 | Web | Navigation | UX / PRODUCT EXPERIENCE | P2 | /crm/reports, /crm/analytics, /contracts aliases | sales, management | compatibility aliases can look like duplicate ownership | nav/source + page register | canonical labels make alias intent obvious | CONFIRMED | alias telemetry/wording | Sales freeze | 3 | ownership confusion | NO |
| MT2-UX-002 | Web | Field UX | UX / PRODUCT EXPERIENCE | P3 | Site/project areas and narrow viewports | site engineer | responsive styles exist; mobile/offline field journey not proven | source inventory, no mobile evidence | field-appropriate offline/responsive experience | CONFIRMED | field pilot and responsive evidence | product decision | 3 | field adoption friction | NO |
| MT2-REG-001 | Platform | Region | PRODUCT DECISION | P3 | all data/UI | regional users | i18n/residency strategy not implemented/proven | source/audit | approved regional/residency model | CONFIRMED | architecture decision | market scope | 3 | adoption/compliance limits | NO |
| MT2-DEC-001 | Product | Deferred work | PRODUCT DECISION | P2 | ELV PR-06, Bid Review, Liquidated Damages | ELV, sales, contracts | valid local drafts exist outside main authority | retained branch diffs and worktrees | explicit roadmap/ownership decision | CONFIRMED | preserve branches; decide before integration | product governance | 3 | accidental architecture fork | NO |
| MT2-UX-003 | Projects | Information architecture | UX / PRODUCT EXPERIENCE | P2 | /projects/dashboard, /project/<id>, controls | PM, QS, director | portfolio is concise, but baseline/quantity/cost/history evidence is distributed across tabs | authenticated DOM + Project 360 source audit | role-aware drill-down and exception-first context | NEW | improve hierarchy and provenance discoverability | Project 360 frozen | 3 | overload or missed exceptions | NO |
| MT2-UX-004 | Projects | State comprehension | UX / PRODUCT EXPERIENCE | P2 | controls, schedule, variations, area registers | planning/site/QS | empty/no-project states are clear, but unavailable vs zero and schedule/baseline readiness are not uniform across pages | browser DOM + source state components | consistent UNKNOWN/empty/error/status language | NEW | shared state matrix and copy audit | UX-003 | 3 | users misread absence as zero | NO |

## Alias and review history

| Previous ID | Review result | Basis |
|---|---|---|
| MT2-SEC-001 | CONFIRMED as release evidence blocker, not proven vulnerability | production environment unavailable |
| MT2-SEC-002 | CONFIRMED as release evidence blocker, not source defect | local auth implementation works; prod config unknown |
| MT2-EVM-001 | RECLASSIFIED P1→P2 technical debt | overload is not called by current production service |
| MT2-DATA-001 | RECLASSIFIED P1→P2 data-integrity risk | zero local orphans; concrete text/UUID mismatch remains |
| Other 13 existing IDs | CONFIRMED | current source/runtime evidence supports the scoped statement |
| New UX-003/004 | NEW | page/persona evidence adds systemic, non-duplicate UX findings |

## Closed-authority check

No finding requires reopening Sales, Gate A, Gate B, B1–B7, C1–C6, Project 360 ownership, Cost Ledger authority, quantity separation, or UNKNOWN semantics.
