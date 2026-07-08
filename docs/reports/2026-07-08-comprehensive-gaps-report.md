# AURA OS — Comprehensive Gaps Report (Architecture · UI · Security · Ops · Modules)

**Date:** 2026-07-08 · Source of truth: Vol 23 gap register + master-report health board, verified against the live tree.

## 0. The one-sentence read
The domain is **not** where the gaps are — 17 modules are deep and kernelized. The gaps cluster in **security *enforcement*, deployment/operations, the admin UI, and BI/mobile**. Nothing on the critical list is architecturally hard; most are scoped S/M.

---

## 1. Health scoreboard (master report)

### Platform capabilities
| Area | Score | Note |
|---|---|---|
| Kernel (events, workflow, DMS, identity, numbering, audit) | 9.2 | excellent |
| Form engine (metadata, rules, formulas, AI fill/review) | 9.0 | excellent |
| Command center (attention scoring, AI homepage) | 8.6 | excellent |
| AI platform (provider seam, RAG, autonomy, MCP) | 6.5 | early |
| Integration platform (webhooks, connectors, SDK) | 5.5 | partial |
| Reporting / BI | 5.0 | thin |
| **Security** (designed, enforcement was gated) | 4.5 → improving | **P0s** |
| **Deployment / Operations** | 3.5 | earliest |
| **Administration Center** | 3.2 | mostly design |
| **Mobile / Offline** | 1.5 | not started |

### Weakest modules (depth)
Engineering 6.0 · Document Control 6.8 · Site 7.0 · HSE 7.0 · Assets 7.0 · Fleet 7.2 · Quality 7.4. (Strongest: Finance 8.8, Procurement 8.6, Projects/Inventory/HR 8.4.)

---

## 2. Architecture gaps

| Gap | Sev | State |
|---|---|---|
| **RLS enforcement** (least-priv role, tenant GUC, FORCE RLS, isolation test) | P0 #1 | **Not enforced** — the existential one; deferred to last by decision |
| Auth on + refresh + revocation + lockout | P0 #2 | **✅ DONE** (this session) |
| Secrets vault + rotation + revoke exposed keys | P0 #3 | Not started (keys have touched dev trees) |
| Docker + deploy target + CI migration gate | P0 #4 | Not started — cannot ship/upgrade |
| Backups / DR + restore drill | P0 #5 | Not documented |
| Observability (OTel + gauges + alerts) | P1 #6 | **Foundation done** (metrics + /metrics + gauges); OTLP/alerts remain |
| Permission taxonomy across ~600 handlers | P1 #7 | **Guard wired + enforced**; annotate rest + roles UI remain |
| Performance baseline + budgets | P1 #15 | Not started — needs a load env |
| Down-migration policy + orphan-scan + archiving | P2 #25 | Not started |
| Partitioning / read-replicas / cells | P3 #33 | Documented posture only |
| **Debt:** `any`/`as any` in ~372 pg-row mappers | — | mechanical typed-row pass |
| **Debt:** two multi-currency approaches on `main` (PR#13 FX registry vs invoice fields) | — | consolidation pending |
| **Debt:** Site/AMC events not in the typed event catalog | — | small |
| **Debt:** `.gitattributes` CRLF normalization | — | warning noise every commit |
| **Debt:** `pnpm audit` non-blocking in CI | — | flip to fail on high/critical |

---

## 3. UI / UX gaps (this is a real weak axis)

| Gap | Sev | State |
|---|---|---|
| **Admin center phase 1** (settings service, users/roles, numbering/approval/webhook UIs) | P1 #12 | **Biggest UI gap** — mostly design; every config change is an eng ticket |
| Roles / permissions admin UI | P1 #7 | Not built (guard now exists to back it) |
| Charts / BI floor | P1 #10 | Charts exist; **CSV/BI export added** this session; dashboards thin |
| Reporting / BI screens | — | 40% — no report builder, limited dashboards |
| Form designer (no-code, DB-stored schemas) | P2 #16 | Schemas are code files today; no visual editor |
| **Mobile PWA + offline drafts** | P2 #17 | **~5% — effectively absent**; field ops need it |
| Customer + supplier portals | P2 #18 | Not started |
| Workflow designer UI | P3 #30 | Engine exists; no visual builder |
| Metadata expansion (list views, dashboards, menus as metadata) | P2 #23 | Partial |
| **Debt:** legacy inline-style tables on some list pages | — | being retired module-by-module |
| Gantt / baselines UI (+ Primavera import) | P2 #19 | Not started |

---

## 4. Security gaps (the critical cluster)

| Gap | State |
|---|---|
| RLS (#1) | ❌ **open — highest risk** (cross-tenant exposure) |
| Auth on/refresh/revoke/lockout (#2) | ✅ done this session |
| MFA + SSO / Entra OIDC + TOTP (#13) | ✅ done this session |
| Permission enforcement (#7) | ✅ guard wired; annotation rollout pending |
| Secrets vault (#3) | ❌ open |
| Field-level PII encryption — salaries, IDs (#14) | ❌ open (deferred by decision) |
| SOC 2 Type II + pen-test + bounty (#34) | ❌ V3 |

**Net:** design is strong; *enforcement* was the hole. Two of the biggest enforcement gaps (auth, MFA/SSO) closed this session; RLS + secrets + PII remain.

---

## 5. Operations / Deployment gaps
Docker + CI images + migration gate (#4), Azure target, backups/DR + restore drill (#5), observability alerts (#6 remainder), performance baseline (#15), golden-flow E2E + axe a11y + coverage gate (#26). **This is the lowest-scoring axis (3.5) and blocks first customer.**

---

## 6. Module-depth gaps (#24, cumulative M–L)
Engineering is thinnest (needs service/workflow depth). Per-module roadmap rows: warranty workflow, batch/serial tracking, org chart, calibration automation, and per-module dashboards (CRM/Quality/HSE/Fleet/Assets/AMC). Weak-module **test** depth (#27) largely addressed this session.

---

## 7. Integration / AI / BI gaps
Integration 5.5: **OpenAPI/Swagger spec + published SDK + API docs** (#21), M365 Graph email + bank feeds + FTA e-filing (#22). AI 6.5: wave-2 (risk scoring, recommendations, RAG-over-DMS, OCR) (#20). BI 5.0: report builder, Power BI feed (export started).

---

## 8. What closed this session (PRs #33–#41)
| Gap | Delivered |
|---|---|
| #8 validation layer | error taxonomy + all 104 try/catch wrappers + server-side form enforcement |
| #9 pagination | fleet, HR (8), doc-control + assets/site |
| #27 test depth | remaining untested domain fns |
| #6 observability | metrics registry + /metrics + gauges |
| #13 MFA/SSO | Entra OIDC (JWKS) + TOTP |
| #10 charts/BI | audit + AP-aging CSV export |
| #7 authz | permission guard wired + enforced + procurement taxonomy |
| **#2 auth** | fail-closed + lockout + refresh + jti revocation (**P0 complete**) |

---

## 9. Priority verdict
**Do next, in order (deploy-blockers):** #4 Docker/CI → #3 secrets vault → #5 backups → **#1 RLS** (the existential one) → then #12 admin UI + #15 perf.

**The single most important sentence (Vol 23 §5):** nothing on the P0 list is architecturally hard — but those together are the line between *"impressive codebase"* and *"a product a customer trusts with their books."* Auth (#2) is now off that list; **RLS (#1) is the one that still is.**
