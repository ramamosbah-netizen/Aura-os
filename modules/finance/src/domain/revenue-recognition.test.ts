import { describe, it, expect } from 'vitest';
import { recognizeRevenue } from './revenue-recognition';

describe('revenue recognition (IFRS-15 cost-to-cost)', () => {
  it('recognises revenue in proportion to cost and reports under-billing (contract asset)', () => {
    // 40% complete (400k of 1m cost), 1.5m contract → recognise 600k; billed only 500k.
    const rr = recognizeRevenue({ contractValue: 1_500_000, costIncurred: 400_000, estimatedTotalCost: 1_000_000, billedToDate: 500_000 });
    expect(rr.percentComplete).toBe(40);
    expect(rr.recognizedRevenue).toBe(600_000);
    expect(rr.grossProfitToDate).toBe(200_000); // 600k revenue − 400k cost
    expect(rr.underBilling).toBe(100_000); // recognised 600k − billed 500k
    expect(rr.overBilling).toBe(0);
  });

  it('reports over-billing (contract liability / deferred revenue) when billed ahead', () => {
    const rr = recognizeRevenue({ contractValue: 1_000_000, costIncurred: 100_000, estimatedTotalCost: 1_000_000, billedToDate: 250_000 });
    expect(rr.percentComplete).toBe(10);
    expect(rr.recognizedRevenue).toBe(100_000);
    expect(rr.overBilling).toBe(150_000); // billed 250k − recognised 100k
    expect(rr.underBilling).toBe(0);
  });

  it('caps % complete at 100 even when actuals exceed the estimate', () => {
    const rr = recognizeRevenue({ contractValue: 500_000, costIncurred: 600_000, estimatedTotalCost: 500_000, billedToDate: 500_000 });
    expect(rr.percentComplete).toBe(100);
    expect(rr.recognizedRevenue).toBe(500_000);
    expect(rr.grossProfitToDate).toBe(-100_000); // loss — cost 600k vs revenue 500k
  });

  it('handles a project with no cost yet (0% complete)', () => {
    const rr = recognizeRevenue({ contractValue: 800_000, costIncurred: 0, estimatedTotalCost: 0, billedToDate: 0 });
    expect(rr.percentComplete).toBe(0);
    expect(rr.recognizedRevenue).toBe(0);
  });
});
