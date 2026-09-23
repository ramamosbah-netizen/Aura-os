import { getJson } from '@/lib/api';
import DocumentSheet from '../../../../components/document-sheet';

export const dynamic = 'force-dynamic';

interface Record_ {
  id: string; code: string; title: string; system: string; location: string | null; status: string;
  projectName: string | null; projectId: string; pointsTotal: number; pointsPassed: number;
  commissionedBy: string | null; witnessedBy: string | null; commissionedAt: string | null; testDate: string | null;
  /** WHO RECORDED the sign-off in AURA — never the signatory. */
  commissionRecordedBy: string | null;
}
interface TestItem { id: string; pointNo: string; description: string; expected: string | null; actual: string | null; result: string }
interface TestRun { id: string; testItemId: string; runNo: number; result: string; actual: string | null; remarks: string | null; testedAt: string }
interface Punch { id: string; description: string; status: string; resolution: string | null }
/** The controlled document this pack is registered as (TC-GATE-10), resolved by the API on read. */
interface Certificate { linkId: string; documentId: string; documentNumber: string | null; revision: string | null; current: boolean; note: string | null }
/**
 * One party's signature on the sign-off. `coverage` is resolved by the commissioning domain and
 * not here: this page cannot import `@aura/commissioning`, and recomputing the result hash in the
 * web app would be a second answer to one question that drifts from the first in silence.
 */
interface SignoffEvidence {
  party: 'commissioning_engineer' | 'witness';
  signedBy: string;
  method: 'electronic' | 'paper' | 'email';
  /** WHOSE standing the signatory had. `party` says which side; this says on whose behalf. */
  authority?: 'contractor' | 'consultant' | 'client' | 'authority';
  documentId: string;
  recordedBy: string | null;
  coverage: 'current' | 'superseded' | 'unverifiable';
  /** Whether the stored file still carries the bytes this sign-off committed to. */
  integrity?: 'verified' | 'mismatch' | 'unavailable';
}
/** What the test produced. Commissioning had no door for a file until TC-07. */
interface Attachment {
  id: string;
  fileId: string;
  category: 'photo' | 'instrument' | 'certificate' | 'other';
  description: string | null;
  capturedBy: string | null;
}
interface Detail { record: Record_; testItems: TestItem[]; testRuns: TestRun[]; punchItems: Punch[]; certificate: Certificate | null; signoffEvidence?: SignoffEvidence[]; attachments?: Attachment[] }

/**
 * The commissioning EVIDENCE PACK for one system (TC-GATE-3).
 *
 * What T&C can honestly produce: what was required, what was measured, how many attempts it took,
 * and who witnessed the sign-off. Every point carries its run count and, where it failed before
 * passing, says so — a pack that hid the retests would be a prettier document and a worse record.
 *
 * What this is NOT: the authority for the DOCUMENT. Formal issue, revision and transmittal are
 * DocControl's, and T&C never creates a register entry. Since TC-GATE-10 a person can REGISTER this
 * pack as a controlled document there and link it here — so when one exists the sheet cites its
 * number and revision, and when it does not the sheet says exactly that rather than implying a
 * status it cannot support.
 */
export default async function CommissioningCertificate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getJson<Detail>(`/api/commissioning/records/${id}/detail`);
  if (!detail?.record) return <div style={{ padding: 40, color: '#666' }}>Commissioning record not found, or the API is offline.</div>;

  const { record, testItems, testRuns, punchItems, certificate } = detail;
  const signoff = detail.signoffEvidence ?? [];
  const attachments = detail.attachments ?? [];

  /**
   * ON WHOSE BEHALF, in the words a certificate prints. Identity without authority is what TC-06
   * named: "witnessed by R. Consultant" does not say whether a consultant, the client or an
   * authority inspector signed, and a year later nobody can tell.
   */
  const AUTHORITY: Record<string, string> = {
    contractor: 'for the contractor',
    consultant: 'for the consultant',
    client: 'for the client',
    authority: 'for the authority having jurisdiction',
  };
  const forParty = (party: SignoffEvidence['party']) => signoff.find((e) => e.party === party) ?? null;

  /**
   * WHAT THIS PACK MAY SAY ABOUT EACH PARTY.
   *
   * `electronic` and `paper` are signatures. An emailed confirmation from a consultant is
   * evidence that they accepted the result and evidence that they did NOT sign, so it never goes
   * under a signature image — printing it there would manufacture a signature out of a message.
   *
   * WHO SIGNED and WHO RECORDED IT are separate clauses. `commissionedBy` and `witnessedBy` are
   * labels naming the people who signed, and a consultant's witness holds no AURA account; the
   * recorder is the user who entered it, and neither may be presented as the other.
   */
  const signatureBlock = (party: SignoffEvidence['party'], label: string, fallbackName: string | null) => {
    const e = forParty(party);
    if (!e) {
      return {
        label,
        attribution: record.status === 'commissioned'
          ? `Recorded for ${fallbackName || 'an unnamed party'} with no signature on file \u2014 not a signed sign-off`
          : 'Not yet signed off',
      };
    }
    const isSigned = e.method === 'electronic' || e.method === 'paper';
    return {
      label,
      // Only the electronic stroke is an image worth inlining; a scanned sheet is a page, and
      // shrinking a page into a signature slot would misrepresent it.
      src: e.method === 'electronic' ? `/api/documents/${encodeURIComponent(e.documentId)}/content` : undefined,
      attribution: [
        isSigned ? `Signed by ${e.signedBy}` : `Confirmed by ${e.signedBy} in writing \u2014 no signature was given`,
        e.authority ? AUTHORITY[e.authority] ?? null : null,
        e.method === 'paper' ? 'on paper; the signed sheet is on file' : null,
        e.recordedBy ? `recorded in AURA by ${e.recordedBy}` : null,
        e.coverage === 'superseded'
          ? 'GIVEN FOR AN EARLIER RESULT \u2014 it does not cover the figures above'
          : e.coverage === 'unverifiable'
            ? 'signed before this record captured what a signature covers'
            : null,
        // Never printed as sound when the bytes have moved underneath it.
        e.integrity === 'mismatch' ? 'THE STORED FILE IS NOT THE ONE THAT WAS SIGNED — its checksum does not match what this record committed to' : null,
      ].filter(Boolean).join(' \u00b7 '),
    };
  };
  const runsFor = (itemId: string) => (testRuns ?? []).filter((r) => r.testItemId === itemId);
  const retested = testItems.filter((t) => runsFor(t.id).some((r) => r.result === 'fail')).length;
  const openPunch = punchItems.filter((p) => p.status === 'open').length;

  return (
    <DocumentSheet
      kind="TESTING &amp; COMMISSIONING EVIDENCE PACK"
      reference={record.code}
      status={record.status}
      from={{ heading: 'Contractor', lines: ['AURA OS Systems Integration', 'Dubai, UAE', 'TRN 100000000000003'] }}
      to={{ heading: 'Witnessed by', lines: [record.witnessedBy || 'Consultant / Client Representative', record.projectName || record.projectId] }}
      meta={[
        { label: 'System', value: record.title },
        { label: 'System type', value: record.system.replace(/_/g, ' ') },
        ...(record.location ? [{ label: 'Location', value: record.location }] : []),
        { label: 'Test points', value: `${record.pointsPassed} / ${record.pointsTotal} passed` },
        { label: 'Points passed on retest', value: String(retested) },
        ...(record.commissionedBy ? [{ label: 'Commissioned by', value: record.commissionedBy }] : []),
        ...(record.commissionedAt ? [{ label: 'Commissioned on', value: record.commissionedAt.slice(0, 10) }] : []),
        // The controlled document, when one has been registered. Read from the register on every
        // render, so a superseded certificate prints as superseded rather than as it was linked.
        {
          label: 'Controlled document',
          value: certificate === null
            ? 'not registered'
            : certificate.current
              ? `${certificate.documentNumber} rev ${certificate.revision}`
              : `${certificate.documentNumber ?? certificate.documentId} — ${certificate.note}`,
        },
      ]}
      columns={[
        { key: 'point', label: 'Point' },
        { key: 'description', label: 'Requirement' },
        { key: 'expected', label: 'Acceptance' },
        { key: 'actual', label: 'Measured' },
        { key: 'attempts', label: 'Runs', align: 'right' },
        { key: 'result', label: 'Result', align: 'right' },
      ]}
      rows={testItems.map((t) => {
        const runs = runsFor(t.id);
        const failedBefore = runs.some((r) => r.result === 'fail');
        return {
          point: t.pointNo,
          description: t.description,
          expected: t.expected ?? '—',
          actual: t.actual ?? '—',
          // The number of attempts is part of the evidence: a point proven on the third run is not
          // the same fact as one proven on the first, and the pack should not flatten them.
          attempts: runs.length === 0 ? '—' : `${runs.length}${failedBefore ? ' (retested)' : ''}`,
          result: t.result,
        };
      })}
      notes={
        // WHAT THE TEST PRODUCED, named on the sheet. "3 attachments" is not evidence anybody can
        // check a measured value against.
        (attachments.length === 0
          ? 'No instrument output, photograph or calibration certificate is attached to this system. '
          : `${attachments.length} attachment(s) are held against this system: ` +
            attachments.map((a) => `${a.description ?? a.fileId} (${a.category}${a.capturedBy ? `, recorded by ${a.capturedBy}` : ''})`).join('; ') + '. ') +
        `This pack states the technical evidence held by Testing & Commissioning: the test sheet, the measured values, ` +
        `the number of attempts each point took, and the sign-off. Failed runs are retained in full on the ` +
        // CONDITIONED, because it used to say "the witnessed sign-off" on every pack including
        // ones with nothing from the witness. A document asserting a witnessed sign-off in its
        // own notes has made the claim whatever the block beneath it says.
        (record.status !== 'commissioned'
          ? `This system has not been signed off. `
          : forParty('witness')
            ? `The witness's ${forParty('witness')!.method === 'email' ? 'written confirmation' : 'signature'} is held against this record. `
            : `NO WITNESS EVIDENCE IS HELD for this sign-off: the names below were recorded, and nothing was signed in AURA. `) +
        `system record and are not removed by a passing retest. ` +
        (openPunch > 0 ? `${openPunch} punch item(s) remain open against this system. ` : 'No punch item is open against this system. ') +
        (certificate === null
          ? `No controlled certificate is registered for this system: this pack is the evidence, not an issued document. `
          : certificate.current
            ? `This pack is registered in the controlled register as ${certificate.documentNumber} revision ${certificate.revision}. `
            : `The controlled document registered for this system is no longer current — ${certificate.note} `) +
        `Issue, revision and transmittal of that document are owned by Document Control and are not performed here.`
      }
      /*
       * THE BLANK LINES ARE GONE.
       *
       * This printed two ruled lines under a note describing "the witnessed sign-off", so the
       * document asserted a witnessed sign-off and held nothing whatsoever from the witness. Each
       * party now shows the signature it gave, or states that none is on file — which is the
       * honest rendering of a sheet still waiting for wet ink.
       *
       * The image is fetched by the BROWSER from the governed document route, so a reader who may
       * not open the signature does not get it printed for them by the server.
       */
      signatures={[
        signatureBlock('commissioning_engineer', 'Commissioning Engineer', record.commissionedBy),
        signatureBlock('witness', 'Witness (Consultant / Client)', record.witnessedBy),
      ]}
    />
  );
}
