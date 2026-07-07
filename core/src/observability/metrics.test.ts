import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsRegistry } from './metrics';

describe('MetricsRegistry', () => {
  let m: MetricsRegistry;
  beforeEach(() => {
    m = new MetricsRegistry();
  });

  it('accumulates a counter and auto-registers on first inc', () => {
    m.inc('jobs_processed_total');
    m.inc('jobs_processed_total', undefined, 4);
    const out = m.render();
    expect(out).toContain('# TYPE jobs_processed_total counter');
    expect(out).toContain('jobs_processed_total 5');
  });

  it('keeps label sets as separate series', () => {
    m.counter('jobs_processed_total', 'jobs run');
    m.inc('jobs_processed_total', { status: 'completed' }, 3);
    m.inc('jobs_processed_total', { status: 'failed' }, 1);
    const out = m.render();
    expect(out).toContain('# HELP jobs_processed_total jobs run');
    expect(out).toContain('jobs_processed_total{status="completed"} 3');
    expect(out).toContain('jobs_processed_total{status="failed"} 1');
  });

  it('renders a lazily-collected gauge at scrape time', () => {
    let depth = 2;
    m.gauge('outbox_pending', 'unprocessed outbox rows', () => depth);
    expect(m.render()).toContain('outbox_pending 2');
    depth = 9;
    expect(m.render()).toContain('outbox_pending 9');
  });

  it('sets an absolute gauge value', () => {
    m.set('dead_letter_depth', 7);
    expect(m.render()).toContain('# TYPE dead_letter_depth gauge');
    expect(m.render()).toContain('dead_letter_depth 7');
  });

  it('escapes label values and renders a zero series for an empty counter', () => {
    m.counter('webhook_deliveries_total', 'webhook sends');
    m.inc('webhook_deliveries_total', { event: 'a"b' });
    const out = m.render();
    expect(out).toContain('webhook_deliveries_total{event="a\\"b"} 1');
    m.counter('never_incremented_total');
    expect(m.render()).toContain('never_incremented_total 0');
  });
});
