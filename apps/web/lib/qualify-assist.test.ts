import { describe, expect, it, vi } from 'vitest';
import { buildQualifyAssistPrompt, requestQualifyAssist, type AssistAssessment, type AssistLead } from '@/lib/qualify-assist';

const LEAD: AssistLead = {
  name: 'Ahmed', companyName: 'ABC Properties', source: 'referral', status: 'contacted',
  requirement: 'CCTV + Access Control for a new villa', systems: ['cctv', 'access_control'], sector: 'residential',
  projectName: 'Al Barari Villa', projectLocation: 'Dubai', consultant: null, mainContractor: null,
  estimatedValue: 180000, expectedTimeline: '2 weeks',
};
const ASSESSMENT: AssistAssessment = {
  score: 45, recommendation: 'REVIEW', coverage: { rated: 3, total: 8 },
  gaps: [{ label: 'Decision maker' }, { label: 'Budget' }],
};

describe('qualify-assist prompt', () => {
  it('grounds the prompt on the lead facts + the assessment (verdict, coverage, gaps)', () => {
    const { system, prompt } = buildQualifyAssistPrompt(LEAD, ASSESSMENT);
    expect(prompt).toContain('ABC Properties');
    expect(prompt).toContain('CCTV + Access Control for a new villa');
    expect(prompt).toContain('REVIEW');
    expect(prompt).toContain('3/8');
    expect(prompt).toContain('Decision maker');
    // The advisor must be told it cannot decide.
    expect(system.toLowerCase()).toContain('advise only');
    expect(system.toLowerCase()).toContain('cannot change the lead status');
  });

  it('handles a not-yet-assessed lead', () => {
    const { prompt } = buildQualifyAssistPrompt(LEAD, null);
    expect(prompt).toContain('not assessed yet');
  });
});

describe('qualify-assist is READ-ONLY', () => {
  it('only ever calls /api/ai — never a lead mutation or convert', async () => {
    const calls: string[] = [];
    const fakeFetch = vi.fn(async (url: string) => {
      calls.push(url);
      return { ok: true, json: async () => ({ text: 'advice' }) } as unknown as Response;
    }) as unknown as typeof fetch;

    const out = await requestQualifyAssist(LEAD, ASSESSMENT, fakeFetch);

    expect(out).toBe('advice');
    expect(calls).toEqual(['/api/ai']);
    // No PATCH to the lead, no qualification write, no convert.
    expect(calls.some((u) => u.includes('/crm/leads'))).toBe(false);
    expect(calls.some((u) => u.includes('/convert'))).toBe(false);
    expect(calls.some((u) => u.includes('/qualification'))).toBe(false);
  });

  it('surfaces an API failure as an error (no silent success)', async () => {
    const fakeFetch = (async () => ({ ok: false, json: async () => ({ error: 'provider down' }) })) as unknown as typeof fetch;
    await expect(requestQualifyAssist(LEAD, ASSESSMENT, fakeFetch)).rejects.toThrow(/provider down/);
  });

  it('treats a missing text field as empty (advisory can be empty)', async () => {
    const fakeFetch = (async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
    await expect(requestQualifyAssist(LEAD, ASSESSMENT, fakeFetch)).resolves.toBe('');
  });
});
