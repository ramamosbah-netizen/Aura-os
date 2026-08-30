import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = resolve(__dirname);
const read = (path: string): string => readFileSync(resolve(WEB, path), 'utf8');

describe('Commercial Decisions composition boundary', () => {
  it('identifies the route as a Decision Workspace rather than a second cockpit', () => {
    const page = read('app/crm/commercial/page.tsx');
    expect(page).toContain('<h1 style={st.h1}>Commercial Decisions</h1>');
    expect(page).toContain('not a second cockpit');
  });

  it('keeps the decision workspace on canonical read models and destinations', () => {
    const page = read('app/crm/commercial/page.tsx');
    const workspace = read('components/commercial-workspace.tsx');
    expect(page).toContain('/api/crm/quotations/commercial-pricing-summary');
    expect(workspace).toContain('CommercialDecisionQueue');
    expect(workspace).toContain('CommercialFinancials');
    expect(workspace).toContain('CommercialRisks');
    expect(workspace).toContain('/tendering/pricing');
    expect(workspace).not.toMatch(/unitCost|costPrice|line\.unitCost|lines\.reduce/);
  });

  it('keeps the known legacy execution surfaces explicit and bounded', () => {
    const quotations = read('components/quotations-client.tsx');
    const negotiation = read('components/negotiation-tab.tsx');
    const documents = read('components/documents-tab.tsx');
    expect(quotations).toContain('/api/crm/quotations/${id}/status');
    expect(negotiation).toContain("fetch('/api/crm/negotiation'");
    expect(documents).toContain('/share');
    expect(documents).toContain('/permissions/${permissionId}');
  });
});
