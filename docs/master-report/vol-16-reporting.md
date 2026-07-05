# Volume 16 — Reporting Platform

[← Master index](README.md)

**Honest status: 40% (score 5.0).** The data layer for reporting is strong (GL-derived
statements, projections, reporting views, OLAP export); the presentation layer is tables and
print views — no charts, no report builder, no BI handoff yet.

---

## 1. Dashboards

| Exists | Content |
|---|---|
| `/finance/dashboard` | stat tiles + aggregates |
| `/projects/dashboard` | portfolio aggregates |
| `/procurement/dashboard` | spend/PO states |
| `/inventory/dashboard` | stock posture |
| `/hr/dashboard` | headcount/expiry posture |
| `/` My Work + `/inbox` | personal workload |
| `/intelligence` | AI insights/briefings |

[Gap] per-module dashboards for CRM, quality, HSE, fleet, assets, AMC (Volume 3 flags each).
[Planned] widget registry + dashboard schemas (Volume 14 §6) so dashboards become metadata.

## 2. KPIs

Computed today (verified): EVM CPI/SPI · AP/AR aging buckets · budget variance · stock WAC
value · pipeline totals (open/won) · payroll cost · training valid/expired · warranty/
registration expiry pipelines · SLA states. Volume 3 lists per-module KPI targets. [Gap]:
a KPI registry with thresholds/targets and trend history.

## 3. Reports (operational)

- **Financial statements:** P&L, balance sheet, cash flow, trial balance — GL-derived, with
  `/finance/statements/print`; VAT return; AP/AR aging; budget-vs-actual.
- **Print documents (9):** quotation, contract, payment certificate, customer invoice, PO,
  GRN, subcontract, payslip, statements.
- **CSV exports** on key registers (quotations, suppliers, POs…) via the shared exporter.
- **Registers** every module (Volume 3 "Reports" rows).

## 4. BI

[Gap]. The designed path (data side exists): reporting SQL views (`0113_reporting_views.sql`)
+ **OLAP export service** (`core/projections/olap-export`, tested) → scheduled extracts →
Power BI / Metabase connection. Decision pending: embedded BI vs export-first (recommend
export-first — zero lock-in, matches the integration posture; Volume 17 lists Power BI).

## 5. Analytics

- **Process mining** (`intelligence/src/process-mining.service.ts`): event-stream pattern
  extraction — cycle times and bottlenecks from the platform's own event log. Unique asset;
  needs a surface.
- **Form analytics** [Planned — Phase 3]: completion/abandonment/validation-failure rates per
  schema (the form engine emits the state needed).
- Usage analytics [Gap].

## 6. Widgets

[Planned]: widget = registered renderer + data source id + params (the form-engine plugin
registry pattern). Chart primitives decision in Volume 10 §10 (lightweight SVG/uPlot).

## 7. Sequencing

1. Chart primitives + KPI tiles upgrade on the five existing dashboards →
2. OLAP export schedule + Power BI template →
3. Widget registry → dashboard metadata →
4. Report definitions (parameterized, printable) →
5. Process-mining surface.

---

*Next: [Volume 17 — Integration Platform](vol-17-integration.md)*
