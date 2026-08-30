import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = resolve(__dirname);
const read = (path: string): string => readFileSync(resolve(WEB, path), 'utf8');

describe('Lead/Pipeline canonical parity', () => {
  it('uses the same canonical capture component and lead endpoint from both surfaces', () => {
    const pipeline = read('components/crm-pipeline-client.tsx');
    const leads = read('components/leads-workspace.tsx');
    const capture = read('components/lead-capture.tsx');
    expect(pipeline).toContain("import LeadCapture from './lead-capture'");
    expect(leads).toContain("import LeadCapture from './lead-capture'");
    expect(capture).toContain("fetch('/api/crm/leads'");
    for (const field of ['companyName', 'name', 'phone', 'email', 'requirement', 'source']) {
      expect(capture, `capture field ${field}`).toContain(field);
    }
    // Ownership is a separate audited command; capture must not silently pretend to assign it.
    expect(capture).not.toContain('assignedTo');
  });

  it('routes qualification and conversion through the canonical Lead service endpoints', () => {
    const pipeline = read('components/crm-pipeline-client.tsx');
    const leads = read('components/leads-workspace.tsx');
    const lead360 = read('components/lead-360-client.tsx');
    expect(pipeline).toContain("/api/crm/leads/${l.id}");
    expect(pipeline).toContain("status: 'qualified'");
    expect(pipeline).toContain("/convert");
    expect(leads).toContain("/api/crm/leads/${id}");
    expect(leads).toContain("status");
    expect(pipeline).toContain('LeadConvertDrawer');
    expect(leads).toContain("/crm/leads/${l.id}");
    expect(lead360).toContain("{ id: 'conversion', label: 'Conversion' }");
    expect(lead360).not.toContain("setTab('convert')");
  });

  it('keeps duplicate resolution and account/contact conversion choices on the canonical flow', () => {
    const capture = read('components/lead-capture.tsx');
    const drawer = read('components/lead-convert-drawer.tsx');
    const lead360 = read('components/lead-360-client.tsx');
    expect(capture).toContain('/duplicate-check');
    expect(capture).toContain('Possible duplicate');
    expect(drawer).toContain('/convert-preview');
    expect(drawer).toContain('accountId');
    expect(drawer).toContain('contactId');
    expect(drawer).toContain('createNewAccount');
    expect(drawer).toContain('createNewContact');
    expect(drawer).toContain('/convert');
    expect(lead360).toContain('LeadConvertDrawer');
  });
});
