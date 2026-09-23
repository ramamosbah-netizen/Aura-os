import { getJson } from '@/lib/api';
import DocumentSheet from '../../../../../components/document-sheet';

export const dynamic = 'force-dynamic';

interface Ncr {
  id: string;
  ncrNumber: string;
  projectId: string;
  projectName: string | null;
  description: string;
  rootCause: string | null;
  correctiveAction: string | null;
  severity: 'minor' | 'major';
  system: string | null;
  status: string;
  /** Three different people, and the whole clause is about keeping them three. */
  raisedBy: string | null;
  assignedTo: string | null;
  correctedBy: string | null;
  verifiedBy: string | null;
  sourceIrNumber: string | null;
  dueAt: string | null;
  correctedAt: string | null;
  verifiedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  escalatedAt: string | null;
  escalatedBy: string | null;
  escalationReason: string | null;
}

interface NcrEvidence {
  id: string;
  fileId: string;
  stage: 'raised' | 'corrected';
  category: 'photo' | 'signature' | 'other';
  description: string | null;
  capturedBy: string | null;
  signedBy: string | null;
  /** Present on signatures only: whether the stored file still carries the committed bytes. */
  integrity?: 'verified' | 'mismatch' | 'unavailable';
}

interface Detail {
  ncr: Ncr;
  evidence: NcrEvidence[];
  /** Two independent facts. A boolean cannot tell a reader which half is missing. */
  evidenced: { raised: boolean; corrected: boolean };
  overdue: 'overdue' | 'on-time' | 'undated' | 'closed';
}

const date = (iso: string | null): string => (iso ? new Date(iso).toISOString().slice(0, 10) : '—');

/**
 * THE NON-CONFORMANCE REPORT AS A CONTROLLED DOCUMENT.
 *
 * There was no printable NCR at all — so "actual output" had nothing to be included in, and the
 * record existed only as a table row on a screen inside AURA. An NCR is issued OUTWARD: to the
 * subcontractor who has to correct the work and to the consultant who asked for it, neither of
 * whom holds an account here.
 *
 * WHAT THIS SHEET REFUSES TO IMPLY is the point of it. A closed NCR with no photograph of the
 * repair says so on its face; a correction signed by a foreman names the FOREMAN and names the
 * AURA user who recorded it as a separate clause; and an NCR nobody dated is printed as undated
 * rather than as on-time, because a document that quietly upgrades what it knows is worse than
 * no document.
 */
export default async function NcrPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getJson<Detail>(`/api/quality/ncrs/${id}/detail`);
  const ncr = detail?.ncr;
  if (!ncr?.ncrNumber) return <div style={{ padding: 40, color: '#666' }}>NCR not found, or the API is offline.</div>;

  const evidence = detail?.evidence ?? [];
  const evidenced = detail?.evidenced ?? { raised: false, corrected: false };
  const closed = ncr.status === 'closed';
  // The LATEST on each side, because corrections are append-only: a second signature does not
  // erase the first, and the sheet shows the one that stands.
  const signature = (stage: 'raised' | 'corrected'): NcrEvidence | null =>
    evidence.filter((e) => e.category === 'signature' && e.stage === stage).slice(-1)[0] ?? null;
  const raisedSignature = signature('raised');
  const correctedSignature = signature('corrected');

  /** Who signed and who recorded it, as two clauses that are never merged into one. */
  const attribution = (sig: NcrEvidence): string =>
    [
      `Signed by ${sig.signedBy ?? 'an unnamed signatory'}`,
      sig.capturedBy ? `recorded in AURA by ${sig.capturedBy}` : null,
      sig.integrity === 'mismatch'
        ? 'THE STORED FILE IS NOT THE ONE THAT WAS SIGNED — its checksum does not match what this record committed to'
        : sig.integrity === 'unavailable'
          ? 'the stored file could not be checked against the committed checksum'
          : null,
    ].filter(Boolean).join(' · ');

  return (
    <DocumentSheet
      kind="NON-CONFORMANCE REPORT"
      reference={ncr.ncrNumber}
      status={ncr.status}
      from={{ heading: 'Issued by', lines: ['AURA OS Systems Integration', 'Quality Assurance', 'Dubai, UAE'] }}
      to={{
        heading: 'Issued to',
        lines: [ncr.projectName || ncr.projectId, ncr.assignedTo ? `Responsible owner: ${ncr.assignedTo}` : 'No responsible owner named'],
      }}
      meta={[
        { label: 'Severity', value: ncr.severity },
        { label: 'System', value: ncr.system?.replace(/[_-]/g, ' ') || 'not attributed' },
        { label: 'Raised', value: date(ncr.createdAt) },
        // UNDATED IS ITS OWN ANSWER. An NCR nobody gave a date to cannot be late, and printing
        // "on time" against no date would be the sheet inventing a fact.
        { label: 'Correction due', value: ncr.dueAt ? date(ncr.dueAt) : 'NOT SET' },
        { label: 'Timeliness', value: detail?.overdue === 'undated' ? 'undated' : (detail?.overdue ?? '—') },
        ...(ncr.sourceIrNumber ? [{ label: 'From inspection', value: ncr.sourceIrNumber }] : []),
      ]}
      columns={[
        { key: 'item', label: 'Non-conformance record' },
        { key: 'detail', label: 'Detail', align: 'right' as const },
      ]}
      rows={[
        { item: `Non-conformance — ${ncr.description}`, detail: ncr.severity },
        { item: `Root cause — ${ncr.rootCause ?? 'not recorded'}`, detail: '' },
        { item: `Corrective action — ${ncr.correctiveAction ?? 'not recorded'}`, detail: ncr.correctedAt ? `carried out ${date(ncr.correctedAt)}` : 'outstanding' },
        // EACH ITEM NAMED, ON THE SIDE IT EVIDENCES. "2 photos" against an NCR is not something a
        // subcontractor can answer, and a photograph of the defect is not a photograph of the fix.
        ...evidence.map((e) => ({
          item: `Evidence (${e.stage === 'raised' ? 'the non-conformance' : 'the correction'}) — ${e.description ?? e.fileId}`,
          detail: e.capturedBy ? `recorded by ${e.capturedBy}` : e.category,
        })),
        ...(ncr.escalatedAt
          ? [{ item: `Escalated — ${ncr.escalationReason ?? 'no reason recorded'}`, detail: `${date(ncr.escalatedAt)}${ncr.escalatedBy ? ` by ${ncr.escalatedBy}` : ''}` }]
          : []),
      ]}
      notes={[
        'Raised under the project quality plan. The work described above does not conform to the approved specification or drawing and is to be corrected by the responsible owner named.',
        // WHICH HALF IS EVIDENCED, said plainly on the sheet. A closed NCR resting on nothing is
        // the case this document exists to stop being invisible.
        evidenced.raised
          ? 'Evidence of the non-conformance is held against this report.'
          : 'NO EVIDENCE OF THE NON-CONFORMANCE IS HELD: the defect above was described and nothing was attached.',
        evidenced.corrected
          ? 'Evidence of the correction is held against this report.'
          : closed
            ? 'NO EVIDENCE OF THE CORRECTION IS HELD: this report was closed on the verifier’s inspection, and nothing showing the completed repair was attached.'
            : 'No evidence of the correction has been attached yet.',
        closed
          ? ncr.correctedBy && ncr.verifiedBy && ncr.correctedBy !== ncr.verifiedBy
            ? 'The correction was verified by somebody other than the person who carried it out.'
            : 'This report is closed.'
          : ncr.dueAt && detail?.overdue === 'overdue'
            ? 'THE CORRECTION IS PAST ITS AGREED DATE and remains outstanding.'
            : 'This report remains open until the correction is verified.',
      ].filter(Boolean).join(' ')}
      signatures={[
        /*
         * THREE ACTS, THREE BLOCKS, and never one person standing in for another.
         *
         * `raisedBy`, `correctedBy` and `verifiedBy` are AURA users. The people who SIGN are
         * often neither — the foreman shown the defect and the supervisor who signs off the
         * repair hold no account here — so a signatory is only ever read from the signature's own
         * `signedBy` and is never derived from whoever pressed upload.
         */
        raisedSignature
          ? { label: 'Raised by (QA/QC)', src: `/api/documents/${encodeURIComponent(raisedSignature.fileId)}/content`, attribution: attribution(raisedSignature) }
          : { label: 'Raised by (QA/QC)', attribution: `Recorded by ${ncr.raisedBy ?? 'an unidentified user'} with no signature on file — not a signed report` },
        correctedSignature
          ? { label: 'Correction carried out by', src: `/api/documents/${encodeURIComponent(correctedSignature.fileId)}/content`, attribution: attribution(correctedSignature) }
          : {
              label: 'Correction carried out by',
              attribution: ncr.correctedBy
                ? `Recorded by ${ncr.correctedBy} with no signature on file — not a signed correction`
                : 'The correction has not been carried out',
            },
        {
          label: 'Verified by (independent)',
          attribution: ncr.verifiedBy
            ? `${ncr.verifiedBy} on ${date(ncr.verifiedAt)} — not the person who carried out the correction`
            : 'Not yet verified',
        },
      ]}
    />
  );
}
