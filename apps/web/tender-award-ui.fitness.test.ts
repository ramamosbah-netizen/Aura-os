import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = resolve(__dirname);
const read = (path: string): string => readFileSync(resolve(WEB, path), 'utf8');

// AURA-FIT-001: this is an I/O-bound walk of the whole repository, not a behavioural test.
// vitest's 5 s default describes neither its work nor its variance under parallel turbo load
// (measured 15-20 s contended, <1 s alone). The generous budget names what it is; the assertions
// are untouched — this relaxes nothing about the check itself.
vi.setConfig({ testTimeout: 30_000 });

describe('Tender award UI — governed award command', () => {
  it('captures evidence and posts through the canonical award endpoint', () => {
    const dialog = read('components/tender-award-dialog.tsx');
    expect(dialog).toContain("method: 'POST'");
    expect(dialog).toContain('/api/tendering/tenders/${encodeURIComponent(tenderId)}/award');
    expect(dialog).toContain('awardedValue');
    expect(dialog).toContain('currency');
    expect(dialog).toContain('awardedAt');
    expect(dialog).toContain('awardReference');
  });

  it('removes the generic won status mutation from both Tender surfaces', () => {
    const register = read('components/tenders-client.tsx');
    const detail = read('components/tender-detail.tsx');
    expect(register).toContain('TenderAwardDialog');
    expect(detail).toContain('TenderAwardDialog');
    expect(register).not.toContain("setStatus(t, 'won')");
    expect(detail).not.toContain("updateStatus('won')");
  });
});
