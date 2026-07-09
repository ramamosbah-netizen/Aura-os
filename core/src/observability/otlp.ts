import { Logger } from '@nestjs/common';
import { type MetricsRegistry, metrics as defaultRegistry } from './metrics';

// OTLP/HTTP metrics exporter (gap register Vol 23 #6 — "OTLP exporter option").
// Dependency-free: converts the MetricsRegistry snapshot into the OTLP JSON shape
// (resourceMetrics → scopeMetrics → metrics with sum/gauge datapoints) and POSTs it
// to an OTLP/HTTP collector on an interval. Entirely config-gated:
//   OTLP_METRICS_URL          → e.g. http://otel-collector:4318/v1/metrics (unset = off)
//   OTLP_EXPORT_INTERVAL_MS   → push cadence (default 60000)
//   OTLP_HEADERS              → csv extra headers, e.g. "authorization=Bearer x,x-tenant=t1"
//   OTLP_SERVICE_NAME         → resource service.name (default aura-os-api)

const otlpAttr = (key: string, value: string) => ({ key, value: { stringValue: value } });

/** Convert a registry snapshot to one OTLP/HTTP JSON payload. Pure — unit-tested. */
export function toOtlpJson(registry: MetricsRegistry, serviceName: string, nowNs?: string): unknown {
  const timeUnixNano = nowNs ?? `${Date.now()}000000`;
  const otlpMetrics = registry.snapshot().map((m) => {
    const dataPoints = m.series.map((s) => ({
      attributes: Object.entries(s.labels).map(([k, v]) => otlpAttr(k, v)),
      timeUnixNano,
      asDouble: s.value,
    }));
    return m.type === 'counter'
      ? {
          name: m.name,
          description: m.help,
          sum: { dataPoints, aggregationTemporality: 2 /* CUMULATIVE */, isMonotonic: true },
        }
      : { name: m.name, description: m.help, gauge: { dataPoints } };
  });

  return {
    resourceMetrics: [
      {
        resource: { attributes: [otlpAttr('service.name', serviceName)] },
        scopeMetrics: [{ scope: { name: 'aura-os-metrics' }, metrics: otlpMetrics }],
      },
    ],
  };
}

/** Parse the OTLP_HEADERS csv ("k=v,k2=v2") into a headers object. */
export function parseOtlpHeaders(csv: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (csv ?? '').split(',')) {
    const i = pair.indexOf('=');
    if (i > 0) out[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  return out;
}

/**
 * Interval pusher. `start()` is a no-op unless OTLP_METRICS_URL is set, so the exporter
 * is invisible until an operator opts in. `beforePush` lets the host refresh
 * scrape-time gauges (outbox depths) right before each export.
 */
export class OtlpMetricsPusher {
  private readonly logger = new Logger('OtlpMetrics');
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly registry: MetricsRegistry = defaultRegistry,
    private readonly beforePush?: () => Promise<void> | void,
  ) {}

  start(): boolean {
    const url = process.env.OTLP_METRICS_URL?.trim();
    if (!url || this.timer) return false;
    const interval = Number(process.env.OTLP_EXPORT_INTERVAL_MS) || 60_000;
    this.timer = setInterval(() => void this.pushOnce(url), interval);
    this.timer.unref?.();
    this.logger.log(`OTLP metrics export → ${url} every ${interval}ms`);
    return true;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async pushOnce(url: string): Promise<boolean> {
    try {
      await this.beforePush?.();
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...parseOtlpHeaders(process.env.OTLP_HEADERS) },
        body: JSON.stringify(toOtlpJson(this.registry, process.env.OTLP_SERVICE_NAME ?? 'aura-os-api')),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (err) {
      this.logger.warn(`OTLP push failed: ${(err as Error).message}`);
      return false;
    }
  }
}
