import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  apiFetch: apiFetchMock,
  apiBase: () => 'http://api.test',
  authHeader: async () => ({ authorization: 'Bearer session-token' }),
}));

import { GET } from './route';

const source = {
  tender: { id: 't-1', title: 'CCTV Upgrade', reference: 'TDR-001', accountName: 'Example Client', submissionDeadline: '2026-10-01' },
  study: {
    id: 's-1', revisionNo: 2, title: 'CCTV Technical Study', inputRevision: 'Client addendum 03', reviewedAt: '2026-09-14T10:00:00.000Z',
    scopeSummary: 'Supply, install, test and commission 24 IP cameras with 30-day retention.',
    systems: [{ discipline: 'ELV', name: 'CCTV', designBasis: 'IP cameras and NVR', interfaces: ['LAN', 'UPS'] }],
    requirements: [{ category: 'client', statement: '30-day retention', acceptanceCriteria: 'Playback proves 30 days', sourceRef: 'Spec 7.2', compliance: 'compliant', response: 'Included' }],
    surveyFindings: [{ area: 'Control room', observation: 'Existing rack has capacity', impact: 'Reuse rack' }],
    clarifications: [{ question: 'Confirm VLAN', answer: 'Dedicated VLAN', status: 'closed', reference: 'RFI-01' }],
    deviations: [{ requirementRef: 'Spec 9', description: 'Alternative camera make', impact: 'Equal performance', proposedResolution: 'Submit samples', status: 'accepted' }],
    assumptions: ['Normal working hours'], exclusions: ['Builder works'],
    evidence: [{ title: 'Client specification', kind: 'client_specification', revision: '3' }],
  },
  commercialReference: { quotationId: 'q-1', quoteNumber: 'QUO-001', revision: 1 },
};

const call = () => GET(new Request('http://localhost/api/tendering/tenders/t-1/technical-proposal.pdf'), {
  params: Promise.resolve({ id: 't-1' }),
});

describe('Tender technical proposal PDF BFF', () => {
  afterEach(() => apiFetchMock.mockReset());

  it('generates a separate customer technical document from governed study data', async () => {
    apiFetchMock
      .mockResolvedValueOnce(Response.json(source))
      .mockResolvedValueOnce(Response.json({
        configured: true, name: 'AURA MEP', legalName: 'AURA MEP L.L.C.', trn: '100000000000000',
        address: 'Dubai, UAE', phone: '+971 4 000 0000', email: 'offers@example.invalid', website: '',
      }));

    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain('TDR-001-technical-proposal-S2.pdf');
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(2_000);
    const outputDir = path.resolve(process.cwd(), '../../output/pdf');
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, 'wave2-technical-proposal-proof.pdf'), bytes);
    expect(apiFetchMock).toHaveBeenNthCalledWith(1, 'http://api.test/api/v1/tendering/tenders/t-1/technical-proposal', {
      headers: { authorization: 'Bearer session-token' }, cache: 'no-store',
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, 'http://api.test/api/v1/crm/quotations/q-1/document-identity', {
      headers: { authorization: 'Bearer session-token' }, cache: 'no-store',
    });
  });

  it.each([403, 404])('preserves an upstream %s refusal and emits no PDF', async (status) => {
    apiFetchMock.mockResolvedValueOnce(Response.json({ message: 'Technical proposal unavailable' }, { status }));
    const response = await call();
    expect(response.status).toBe(status);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString('ascii')).not.toBe('%PDF-');
  });
});
