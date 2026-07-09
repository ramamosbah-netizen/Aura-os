import { describe, it, expect, afterEach, vi } from 'vitest';
import { MetricsRegistry } from './metrics';
import { OtlpMetricsPusher, parseOtlpHeaders, toOtlpJson } from './otlp';

afterEach(() => {
  delete process.env.OTLP_METRICS_URL;
  delete process.env.OTLP_HEADERS;
  vi.restoreAllMocks();
});

describe('toOtlpJson (gap #6 — OTLP exporter)', () => {
  it('maps counters to monotonic cumulative sums and gauges to gauges', () => {
    const reg = new MetricsRegistry();
    reg.inc('jobs_processed_total', { queue: 'outbox', outcome: 'ok' }, 3);
    reg.gauge('outbox_pending', 'depth', () => 7);

    const payload = toOtlpJson(reg, 'test-svc', '1000000') as any;
    const scope = payload.resourceMetrics[0].scopeMetrics[0];
    expect(payload.resourceMetrics[0].resource.attributes[0]).toEqual({
      key: 'service.name',
      value: { stringValue: 'test-svc' },
    });

    const counter = scope.metrics.find((m: any) => m.name === 'jobs_processed_total');
    expect(counter.sum.isMonotonic).toBe(true);
    expect(counter.sum.aggregationTemporality).toBe(2);
    expect(counter.sum.dataPoints[0].asDouble).toBe(3);
    expect(counter.sum.dataPoints[0].attributes).toContainEqual({ key: 'queue', value: { stringValue: 'outbox' } });

    const gauge = scope.metrics.find((m: any) => m.name === 'outbox_pending');
    expect(gauge.gauge.dataPoints[0].asDouble).toBe(7); // collect() evaluated in snapshot
  });
});

describe('parseOtlpHeaders', () => {
  it('parses csv pairs and ignores malformed entries', () => {
    expect(parseOtlpHeaders('authorization=Bearer x, x-tenant=t1,junk')).toEqual({
      authorization: 'Bearer x',
      'x-tenant': 't1',
    });
    expect(parseOtlpHeaders(undefined)).toEqual({});
  });
});

describe('OtlpMetricsPusher', () => {
  it('does not start without OTLP_METRICS_URL', () => {
    expect(new OtlpMetricsPusher(new MetricsRegistry()).start()).toBe(false);
  });

  it('pushes the payload and runs beforePush first', async () => {
    const reg = new MetricsRegistry();
    reg.inc('x_total');
    const order: string[] = [];
    const pusher = new OtlpMetricsPusher(reg, () => {
      order.push('before');
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      order.push('fetch');
      return { ok: true } as Response;
    });
    expect(await pusher.pushOnce('http://collector:4318/v1/metrics')).toBe(true);
    expect(order).toEqual(['before', 'fetch']);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://collector:4318/v1/metrics',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('reports failure without throwing when the collector is down', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await new OtlpMetricsPusher(new MetricsRegistry()).pushOnce('http://down:4318')).toBe(false);
  });
});
