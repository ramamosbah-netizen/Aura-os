import { getJson } from '@/lib/api';
import DocumentSheet from '../../../../../components/document-sheet';

export const dynamic = 'force-dynamic';

interface InspectionRequest {
  id: string;
  irNumber: string;
  projectId: string;
  projectName: string | null;
  discipline: string;
  locationDetail: string;
  inspectionDate: string;
  status: string;
  /** The AURA user who resolved it — the internal inspector, never the signatory. */
  inspectedBy: string | null;
  comments: string | null;
  approvedQuantity: number | null;
  unit: string | null;
}

interface IrEvidence {
  id: string;
  fileId: string;
  category: 'photo' | 'signature' | 'other';
  description: string | null;
  location: string | null;
  capturedBy: string | null;
  signedBy: string | null;
}

interface Detail {
  inspection: InspectionRequest;
  evidence: IrEvidence[];
  /**
   * The signature, already judged against the result by the quality domain. Resolved there and
   * not here: this page cannot import `@aura/quality`, and recomputing the result hash in the web
   * app would be a second answer to one question, drifting from the first in silence.
   */
  signature: (IrEvidence & { coverage: 'current' | 'superseded' | 'unverifiable' }) | null;
}

/**
 * THE INSPECTION REQUEST AS A CONTROLLED DOCUMENT.
 *
 * There was no printable inspection request at all. An IR is what a consultant signs and what a
 * measured quantity accrues against — QHS-07 asks for "actual output", and XOP-12 asks for the
 * signature to be "included in controlled output". Neither could be met by a record that existed
 * only as a table row.
 *
 * What this states is what quality can honestly produce: the trade, the location, the date, the
 * decision, the quantity that accrued on it, every photograph by name, and the signature that
 * decided it — with the signatory and the recorder kept apart.
 */
export default async function InspectionRequestPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getJson<Detail>(`/api/quality/irs/${id}/detail`);
  const ir = detail?.inspection;
  if (!ir?.irNumber) return <div style={{ padding: 40, color: '#666' }}>Inspection request not found, or the API is offline.</div>;

  const photos = (detail?.evidence ?? []).filter((e) => e.category !== 'signature');
  const signature = detail?.signature ?? null;
  const resolved = ir.status === 'approved' || ir.status === 'rejected';

  return (
    <DocumentSheet
      kind="INSPECTION REQUEST"
      reference={ir.irNumber}
      status={ir.status}
      from={{ heading: 'Contractor', lines: ['AURA OS Systems Integration', 'Quality Assurance', 'Dubai, UAE'] }}
      to={{ heading: 'Inspected for', lines: [ir.projectName || ir.projectId, ir.locationDetail] }}
      meta={[
        { label: 'Trade', value: ir.discipline.replace(/_/g, ' ') },
        { label: 'Location', value: ir.locationDetail },
        { label: 'Inspection date', value: ir.inspectionDate },
        { label: 'Decision', value: ir.status.replace(/_/g, ' ') },
        { label: 'Evidence attached', value: String(photos.length) },
        ...(ir.approvedQuantity != null
          ? [{ label: 'Approved quantity', value: `${ir.approvedQuantity}${ir.unit ? ` ${ir.unit}` : ''}` }]
          : []),
      ]}
      columns={[
        { key: 'item', label: 'Inspection record' },
        { key: 'detail', label: 'Detail', align: 'right' },
      ]}
      rows={[
        { item: `Inspection of ${ir.discipline.replace(/_/g, ' ')} works at ${ir.locationDetail}`, detail: ir.status },
        // EACH PHOTOGRAPH IS NAMED, with who recorded it. "3 photos" is not evidence anybody can
        // check an approved quantity against.
        ...photos.map((e) => ({
          item: `Evidence — ${e.description ?? e.fileId}${e.location ? ` · ${e.location}` : ''}`,
          detail: e.capturedBy ? `recorded by ${e.capturedBy}` : e.category,
        })),
        ...(ir.comments ? [{ item: `Comments — ${ir.comments}`, detail: '' }] : []),
      ]}
      notes={[
        'Inspection request raised and resolved under the project quality plan.',
        // CONDITIONED on what this record actually holds. An unconditional claim that the
        // inspection was signed would be the same defect as the pad that discarded the stroke,
        // one step further along.
        !resolved
          ? 'This inspection has not been resolved.'
          : signature
            ? 'The signature of the person who signed this inspection is held against this record.'
            : 'NO SIGNATURE IS HELD for this inspection: the decision below was recorded, and nothing was signed in AURA.',
        ir.status === 'approved' && ir.approvedQuantity != null
          ? 'The approved quantity above accrues on the project Quantity Ledger.'
          : '',
      ].filter(Boolean).join(' ')}
      signatures={[
        /*
         * WHO SIGNED AND WHO RECORDED IT, never merged.
         *
         * `inspectedBy` is the AURA user who resolved the inspection. On a witnessed inspection
         * the person who SIGNED is the consultant, who holds no account here — so the signatory
         * comes from the signature's own `signedBy` and is never derived from the actor.
         */
        signature
          ? {
              label: 'Inspector / Witness',
              src: `/api/documents/${encodeURIComponent(signature.fileId)}/content`,
              attribution: [
                `Signed by ${signature.signedBy ?? 'an unnamed signatory'}`,
                signature.capturedBy ? `recorded in AURA by ${signature.capturedBy}` : null,
                signature.coverage === 'superseded'
                  ? 'GIVEN FOR AN EARLIER RESULT — it does not cover the decision above'
                  : signature.coverage === 'unverifiable'
                    ? 'signed before this record captured what a signature covers'
                    : null,
              ].filter(Boolean).join(' · '),
            }
          : {
              label: 'Inspector / Witness',
              attribution: resolved
                ? `Recorded by ${ir.inspectedBy ?? 'an unidentified user'} with no signature on file — not a signed inspection`
                : 'Not yet inspected',
            },
        'Consultant / Client Representative',
      ]}
    />
  );
}
