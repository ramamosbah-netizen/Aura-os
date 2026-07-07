// Lightweight, dependency-free metrics registry with Prometheus text exposition.
// The observability floor (gap register Vol 23 #6): counters for things that happen
// (jobs processed, webhook deliveries, outbox failures) and gauges for point-in-time
// depths (outbox lag, dead-letter depth) collected lazily at scrape time. No OTel SDK
// dependency — the `/metrics` endpoint renders this registry in the standard text format
// any Prometheus/OTel-collector can scrape. Swap in an OTLP exporter later without
// touching call sites.

export type Labels = Record<string, string>;

interface Series {
  labels: Labels;
  value: number;
}
interface Metric {
  help: string;
  type: 'counter' | 'gauge';
  /** point-in-time collector for gauges (evaluated on render) */
  collect?: () => number;
  series: Map<string, Series>;
}

const seriesKey = (labels?: Labels): string =>
  labels
    ? Object.keys(labels)
        .sort()
        .map((k) => `${k}=${labels[k]}`)
        .join(',')
    : '';

export class MetricsRegistry {
  private metrics = new Map<string, Metric>();

  /** Register a counter (idempotent). Auto-registered on first `inc` if omitted. */
  counter(name: string, help = ''): void {
    if (!this.metrics.has(name)) this.metrics.set(name, { help, type: 'counter', series: new Map() });
  }

  /** Register a gauge. Pass `collect` for lazily-scraped point-in-time values. */
  gauge(name: string, help = '', collect?: () => number): void {
    const existing = this.metrics.get(name);
    if (existing) {
      if (collect) existing.collect = collect;
      return;
    }
    this.metrics.set(name, { help, type: 'gauge', collect, series: new Map() });
  }

  /** Increment a counter series by `by` (default 1); creates the counter/series as needed. */
  inc(name: string, labels?: Labels, by = 1): void {
    this.counter(name);
    const m = this.metrics.get(name)!;
    const key = seriesKey(labels);
    const s = m.series.get(key) ?? { labels: labels ?? {}, value: 0 };
    s.value += by;
    m.series.set(key, s);
  }

  /** Set a gauge series to an absolute value. */
  set(name: string, value: number, labels?: Labels): void {
    this.gauge(name);
    const m = this.metrics.get(name)!;
    const key = seriesKey(labels);
    m.series.set(key, { labels: labels ?? {}, value });
  }

  /** Render the whole registry in Prometheus text-exposition format. */
  render(): string {
    const lines: string[] = [];
    for (const [name, m] of this.metrics) {
      if (m.help) lines.push(`# HELP ${name} ${m.help}`);
      lines.push(`# TYPE ${name} ${m.type}`);
      if (m.type === 'gauge' && m.collect && m.series.size === 0) {
        lines.push(`${name} ${m.collect()}`);
        continue;
      }
      if (m.series.size === 0) {
        lines.push(`${name} 0`);
        continue;
      }
      for (const s of m.series.values()) {
        const labelStr = Object.keys(s.labels).length
          ? `{${Object.keys(s.labels)
              .sort()
              .map((k) => `${k}="${String(s.labels[k]).replace(/["\\\n]/g, '\\$&')}"`)
              .join(',')}}`
          : '';
        lines.push(`${name}${labelStr} ${s.value}`);
      }
    }
    return lines.join('\n') + '\n';
  }

  /** Test helper — clear all metrics. */
  reset(): void {
    this.metrics.clear();
  }
}

/** Process-wide singleton every producer increments and the /metrics endpoint renders. */
export const metrics = new MetricsRegistry();
