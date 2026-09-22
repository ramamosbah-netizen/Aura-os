import { getJson } from '@/lib/api';
import DocumentSheet from '../../../../components/document-sheet';

export const dynamic = 'force-dynamic';

interface Checklist {
  omManuals: boolean;
  asBuilts: boolean;
  testCertificates: boolean;
  warrantyDocs: boolean;
  training: boolean;
  spares: boolean;
}

interface HandoverPackage {
  id: string;
  projectId: string;
  projectName: string | null;
  code: string;
  title: string;
  status: string;
  checklist: Checklist;
  submittedAt: string | null;
  acceptedAt: string | null;
  acceptedBy: string | null;
  clientRepresentative: string | null;
  acceptanceMethod: 'electronic' | 'paper' | 'email' | null;
  acceptanceEvidenceDocumentId: string | null;
  /** Whether the stored evidence still carries the bytes this acceptance committed to. */
  acceptanceEvidenceIntegrity?: 'verified' | 'mismatch' | 'unavailable';
  warrantyStartDate: string | null;
  warrantyMonths: number | null;
  remarks: string | null;
  systemsTotal: number;
  systemsCommissioned: number;
}

export default async function HandoverPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pkg = await getJson<HandoverPackage>(`/api/commissioning/handovers/${id}`);
  if (!pkg) return <div style={{ padding: 40, color: '#666' }}>Handover package not found or API offline.</div>;

  const checkStatus = (ok: boolean) => (ok ? '✓ Complete' : '✗ Pending');

  /**
   * MAY THIS BE DESCRIBED AS SIGNED? Only two of the four methods can. "Has a document" and "was
   * signed" are different questions, and conflating them is how an emailed confirmation becomes a
   * signature on a printed page.
   */
  const signed = pkg.status === 'accepted'
    && (pkg.acceptanceMethod === 'electronic' || pkg.acceptanceMethod === 'paper')
    && Boolean(pkg.acceptanceEvidenceDocumentId);
  const who = pkg.clientRepresentative || 'the client representative';
  // WHO ENTERED IT, kept apart from who accepted. The client holds no AURA account; a Handover/FM
  // user records their decision, and the certificate must not credit them with having made it.
  const recorder = pkg.acceptedBy ? `recorded in AURA by ${pkg.acceptedBy}` : null;

  return (
    <DocumentSheet
      kind="HANDOVER & ACCEPTANCE CERTIFICATE"
      reference={pkg.code}
      status={pkg.status}
      from={{ heading: 'Contractor', lines: ['AURA OS Systems Integration', 'Dubai, UAE', 'TRN 100000000000003'] }}
      to={{ heading: 'Client Acceptance', lines: [pkg.clientRepresentative || 'Client Representative', pkg.projectName || 'Project'] }}
      meta={[
        { label: 'Package Code', value: pkg.code },
        { label: 'Commissioned Systems', value: `${pkg.systemsCommissioned} / ${pkg.systemsTotal}` },
        ...(pkg.warrantyStartDate ? [{ label: 'Warranty Start Date', value: pkg.warrantyStartDate }] : []),
        ...(pkg.warrantyMonths ? [{ label: 'Warranty Period', value: `${pkg.warrantyMonths} Months` }] : []),
      ]}
      columns={[
        { key: 'deliverable', label: 'Handover Deliverable Item' },
        { key: 'status', label: 'Compliance Status', align: 'right' },
      ]}
      rows={[
        { deliverable: 'O&M Manuals', status: checkStatus(pkg.checklist.omManuals) },
        { deliverable: 'As-Built Drawings', status: checkStatus(pkg.checklist.asBuilts) },
        { deliverable: 'Test & Commissioning Certificates', status: checkStatus(pkg.checklist.testCertificates) },
        { deliverable: 'Warranty Documents', status: checkStatus(pkg.checklist.warrantyDocs) },
        { deliverable: 'Client Operational Training', status: checkStatus(pkg.checklist.training) },
        { deliverable: 'Spares & Consumables Handover', status: checkStatus(pkg.checklist.spares) },
      ]}
      /*
       * THE SENTENCE IS CONDITIONED ON WHAT THIS PACKAGE ACTUALLY HOLDS.
       *
       * It read "Signed acceptance signifies official system handover" on every certificate,
       * including ones evidenced by an email and ones evidenced by nothing at all. A document
       * that asserts a signature in its own notes has made the claim whatever the signature block
       * says beneath it — so the claim now follows the method, and the DLP consequence, which is
       * true of any accepted handover, is stated separately from it.
       */
      notes={pkg.remarks || [
        'Project handover acceptance certificate.',
        signed
          ? 'Signed acceptance signifies official system handover.'
          : pkg.acceptanceMethod === 'email'
            ? 'This handover was accepted by written confirmation from the client; no signature was given.'
            : pkg.status === 'accepted'
              ? 'This acceptance was recorded against the client representative\u2019s name and is not evidenced by a signed document.'
              : 'This package has not been accepted.',
        'Acceptance activates the Defects Liability Period (DLP) warranty clock.',
      ].join(' ')}
      /**
       * THE CERTIFICATE SHOWS WHAT WAS SIGNED, OR SAYS THAT NOTHING WAS.
       *
       * This printed two ruled lines regardless, under a note asserting that "signed acceptance
       * signifies official system handover" — a document claiming a signature it had no way to
       * hold, because the pad on the acceptance screen discarded every stroke. Now the client's
       * block carries the stored signature when there is one, and names the representative who
       * gave it; with no captured signature it stays a ruled line and says so, which is the
       * honest rendering of an acceptance recorded from a paper walk-down.
       *
       * The image is fetched by the BROWSER from the governed document route, so a reader who may
       * not open the signature does not get it printed for them by the server.
       */
      signatures={[
        'Project Manager',
        /*
         * A SIGNATURE IS SHOWN ONLY WHERE ONE WAS GIVEN.
         *
         * `electronic` and `paper` are signatures and are rendered as such — the drawn stroke
         * inline, the scanned page named as being on file. An EMAIL confirmation is evidence of
         * acceptance and evidence of no signature, so it is never placed under a signature image;
         * printing it there would manufacture one out of a message. A `name-only` acceptance gets
         * a ruled line and says what it is.
         *
         * The image is fetched by the BROWSER from the governed document route, so a reader who
         * may not open the evidence does not get it printed for them by the server.
         */
        signed && pkg.acceptanceEvidenceDocumentId
          ? {
              label: 'Client Representative Acceptance',
              // Only the electronic signature is an image worth inlining; a scanned document is
              // a page, and shrinking a page into a signature slot would misrepresent it.
              src: pkg.acceptanceMethod === 'electronic'
                ? `/api/documents/${encodeURIComponent(pkg.acceptanceEvidenceDocumentId)}/content`
                : undefined,
              attribution: [
                `Signed by ${who}`,
                pkg.acceptanceMethod === 'paper' ? 'on paper; the signed document is on file' : null,
                pkg.acceptedAt ? `on ${pkg.acceptedAt.slice(0, 10)}` : null,
                recorder,
                pkg.acceptanceEvidenceIntegrity === 'mismatch' ? 'THE STORED FILE IS NOT THE ONE THAT WAS SIGNED — its checksum does not match what this record committed to' : null,
              ].filter(Boolean).join(' \u00b7 '),
            }
          : {
              label: 'Client Representative Acceptance',
              attribution: pkg.status !== 'accepted'
                ? 'Not yet accepted'
                : pkg.acceptanceMethod === 'email'
                  ? [`Accepted by ${who} by written confirmation \u2014 no signature was given`, recorder].filter(Boolean).join(' \u00b7 ')
                  : [`Recorded for ${who} with no evidencing document \u2014 not a signed acceptance`, recorder].filter(Boolean).join(' \u00b7 '),
            },
      ]}
    />
  );
}
