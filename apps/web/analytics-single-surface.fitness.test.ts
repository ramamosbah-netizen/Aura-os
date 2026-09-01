import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = resolve(__dirname);
const read = (path: string): string => readFileSync(resolve(WEB, path), 'utf8');

describe('Analytics single-surface composition', () => {
  it('composes the historical analytics views without a tab navigator', () => {
    const workspace = read('components/sales-insight-workspace.tsx');
    expect(workspace).toContain("const composedView: View = analytics ? 'allAnalytics' : view");
    expect(workspace).toContain('One analytics view');
    expect(workspace).not.toContain('Analytics view');
    expect(workspace).not.toContain('Sources &amp; margin');
  });

  it('keeps the legacy query views as compatible inputs while rendering all sections', () => {
    const page = read('app/crm/analytics/page.tsx');
    const client = read('components/crm-pipeline-client.tsx');
    expect(page).toContain("query.view === 'sources'");
    expect(page).toContain("query.view === 'executive'");
    expect(client).toContain("'allAnalytics'");
    expect(client).toContain("view === 'analytics' || view === 'allAnalytics'");
    expect(client).toContain("view === 'executive' || view === 'allAnalytics'");
    expect(client).toContain("view === 'sources' || view === 'allAnalytics'");
  });
});
