import { describe, expect, it } from 'vitest';
import { makeCbsNode, calculateCbsSummary, type CbsNode } from './cbs';

describe('CBS domain model & calculations', () => {
  it('should create a CBS node with expected default values', () => {
    const node = makeCbsNode({
      tenantId: 't1',
      projectId: 'p1',
      code: '  1.0.0  ',
      title: '  Direct Materials  ',
      category: 'direct',
      budgetAmount: 150000,
    });

    expect(node.code).toBe('1.0.0');
    expect(node.title).toBe('Direct Materials');
    expect(node.category).toBe('direct');
    expect(node.budgetAmount).toBe(150000);
    expect(node.committedAmount).toBe(0);
    expect(node.actualAmount).toBe(0);
    expect(node.forecastAmount).toBe(150000); // defaults to budget
    expect(node.variance).toBe(0);
  });

  it('should calculate roll-up summary values correctly', () => {
    const nodes: CbsNode[] = [
      makeCbsNode({
        tenantId: 't1',
        projectId: 'p1',
        code: '1.1',
        title: 'Concrete Purchase',
        category: 'direct',
        budgetAmount: 100000,
        committedAmount: 90000,
        actualAmount: 50000,
        forecastAmount: 95000,
      }),
      makeCbsNode({
        tenantId: 't1',
        projectId: 'p1',
        code: '1.2',
        title: 'Project Manager Salary',
        category: 'indirect',
        budgetAmount: 50000,
        committedAmount: 50000,
        actualAmount: 25000,
        forecastAmount: 50000,
      }),
      makeCbsNode({
        tenantId: 't1',
        projectId: 'p1',
        code: '1.3',
        title: 'Unforeseen excavation issues',
        category: 'contingency',
        budgetAmount: 20000,
        committedAmount: 10000,
        actualAmount: 5000,
        forecastAmount: 25000, // over budget forecast
      }),
    ];

    const summary = calculateCbsSummary(nodes);

    expect(summary.totalBudget).toBe(170000);
    expect(summary.totalCommitted).toBe(150000);
    expect(summary.totalActual).toBe(80000);
    expect(summary.totalForecast).toBe(170000); // 95000 + 50000 + 25000
    expect(summary.totalVariance).toBe(0);
    expect(summary.utilisationPct).toBe(47.1); // (80000 / 170000) * 100 = 47.058%
    expect(summary.commitmentPct).toBe(88.2);  // (150000 / 170000) * 100 = 88.235%

    expect(summary.byCategory.direct.budget).toBe(100000);
    expect(summary.byCategory.indirect.budget).toBe(50000);
    expect(summary.byCategory.contingency.forecast).toBe(25000);
  });
});
