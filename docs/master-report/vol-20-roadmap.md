# Volume 20 — Product Roadmap

[← Master index](README.md)

Three versions, each with an unambiguous exit bar. Sequencing logic: **V1 hardens what exists
into sellable, V2 makes it winnable against incumbents, V3 makes it a platform others build
on.** Effort classes: S (<1 wk) · M (1–4 wk) · L (1–3 mo) per workstream.

---

## Version 1 — "Production-grade" (sell to first 10 customers)

Exit bar: a paying tenant runs daily operations with auth on, isolated data, backups, and a
supported upgrade path.

| Workstream | Contents | Effort |
|---|---|---|
| Security P0 bundle | auth-on default, refresh/revocation, RLS enforcement bundle, secrets vault (Vol 7 §11 #1–3) | M |
| Deploy epic | Docker → CI images + migration gate → Azure single-region → backups/DR runbook (Vol 19 §11) | M |
| Observability | OTel + the four platform gauges + alerts | S–M |
| Validation unification | global exception filter + server-side `evaluateForm` on submit + universal pagination | M |
| Permission taxonomy | annotate handlers, DB-backed roles, minimal roles UI | M |
| Reporting floor | chart primitives on the 5 dashboards + Power BI export | S–M |
| Admin center phase 1 | settings service + shell + users/roles + numbering/approval/webhook UIs (Vol 15 §3 steps 1–3) | M |
| Notification channels | email provider + per-event routing | S |
| Quality floor | coverage gate, Engineering-module tests, restore drill | S–M |

## Version 2 — "Winnable" (beat incumbents in bake-offs)

Exit bar: feature parity where it matters to the ICP + the demo moments that close deals.

| Workstream | Contents |
|---|---|
| Form designer (no-code phase 1) | DB-stored schemas + visual field/layout/rule editor (Vol 5 §10) |
| Metadata expansion | list-view schemas, dashboard widgets, menu metadata (Vol 14 sequence) |
| Mobile field app | PWA-first: site diaries, HSE, timesheets, approvals — offline drafts + sync |
| Portals | customer portal (AMC tickets, invoices, IPC status) · supplier portal (RFQ, PO ack, invoice submission) |
| Scheduling depth | Gantt with baselines + Primavera XER import |
| AI wave 2 | risk scoring on records, recommendations (suppliers/prices/history), RAG over DMS, OCR autofill |
| Integration pack | M365 Graph email (recorded decision), bank feeds, FTA e-filing |
| SSO/MFA | OIDC (Entra) + TOTP |
| Module depth completions | per-module "Future Roadmap" rows from Volume 3 (warranty workflow, batch/serial, org chart, calibration automation…) |

## Version 3 — "Platform" (others build on AURA)

| Workstream | Contents |
|---|---|
| **Marketplace** | packaged extensions (schemas + plugins + workflows) with install/versioning; `@aura/plugin-sdk` published; revenue share |
| **Low Code** | custom fields on any entity → custom entities via designer + Universal Create Engine; workflow designer; scripting sandbox (formula engine grows) |
| **No Code** | full admin authoring: forms/views/dashboards/menus/rules/workflows per tenant, versioned + publishable |
| Enterprise scale | K8s reference, read replicas, partitioning, per-region cells, SOC 2 Type II |
| GraphQL / public API v2 | if integrator demand materializes (Vol 9 §2 trigger) |
| Verticals | manufacturing pack (BOM/MRP), real-estate pack (units/leasing/escrow) on the same kernel |

## Enterprise track (runs across all versions)

SOC 2 program → PDPL/GDPR posture → pen-test cycle → SLA definitions (99.9) → support tiers →
partner/implementer enablement (the docs in this report are the seed material).

## AI track (runs across all versions)

V1: ship what's built (fill/review/insights) to users by default →
V2: risk, recommendations, RAG, OCR →
V3: agents on MCP + autonomy proposals graduating to supervised auto-execution (Vol 24).

## Dependencies graph (the only hard orderings)

```
secrets vault → connectors/AI-key admin        settings service → admin center → designers
Docker → deploy → observability → SLA          permission taxonomy → portals/menus-by-role
form designer → list/dashboard designers → marketplace
PWA shell → offline drafts → mobile field app
```

---

*Next: [Volume 21 — Quality Assurance](vol-21-quality-assurance.md)*
