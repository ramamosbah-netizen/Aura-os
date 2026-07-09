# AURA OS — Observability

The metrics stack is dependency-free (no OTel SDK): a process-wide `MetricsRegistry`
(`@aura/core`) that producers increment, rendered two ways.

## 1. Prometheus scrape (pull)

```
METRICS_ENABLED=true
GET /api/v1/metrics        # text exposition v0.0.4
```

Gauges (`outbox_pending`, `outbox_dead_letter`) are refreshed from the DB at scrape time.

## 2. OTLP/HTTP push (opt-in)

```
OTLP_METRICS_URL=http://otel-collector:4318/v1/metrics   # unset = off
OTLP_EXPORT_INTERVAL_MS=60000                            # default 60s
OTLP_HEADERS=authorization=Bearer <token>                # csv k=v pairs
OTLP_SERVICE_NAME=aura-os-api                            # resource service.name
```

Counters export as monotonic cumulative sums, gauges as gauges. The push refreshes the
outbox gauges before every export, so pull and push see the same numbers.

## Metric catalog

| Metric | Type | Labels | Source |
|---|---|---|---|
| `http_requests_total` | counter | `method`, `status` (class: 2xx/4xx/5xx) | main.ts middleware |
| `http_request_duration_ms_sum` / `_count` | counter | `status` | main.ts middleware (mean = sum/count) |
| `jobs_processed_total` | counter | `queue`, `outcome` | job workers |
| `webhook_deliveries_total` | counter | `outcome` | webhook dispatcher |
| `outbox_pending` | gauge | — | scrape/push-time DB count |
| `outbox_dead_letter` | gauge | — | scrape/push-time DB count |

Low-cardinality by design: no per-path or per-tenant labels on HTTP series.

## Alerts

`prometheus-alerts.yml` in this directory ships the starter rule pack:
dead-letters present, outbox backlog, webhook failure rate, 5xx ratio > 2%,
mean latency > 750ms, job failures. Wire it via `rule_files:` or a PrometheusRule CRD.
