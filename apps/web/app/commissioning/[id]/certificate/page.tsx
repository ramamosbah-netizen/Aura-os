import { getJson } from '@/lib/api';
import DocumentSheet from '../../../../components/document-sheet';

export const dynamic = 'force-dynamic';

interface Record_ {
  id: string; code: string; title: string; system: string; location: string | null; status: string;
  projectName: string | null; projectId: string; pointsTotal: number; pointsPassed: number;
  commissionedBy: string | null; witnessedBy: string | null; commissionedAt: string | null; testDate: string | null;
}
interface TestItem { id: string; pointNo: string; description: string; expected: string | null; actual: string | null; result: string }
interface TestRun { id: string; testItemId: string; runNo: number; result: string; actual: string | null; remarks: string | null; testedAt: string }
interface Punch { id: string; description: string; status: string; resolution: string | null }
/** The controlled document this pack is registered as (TC-GATE-10), resolved by the API on read. */
interface Certificate { linkId: string; documentId: string; documentNumber: string | null; revision: string | null; current: boolean; note: string | null }
interface Detail { record: Record_; testItems: TestItem[]; testRuns: TestRun[]; punchItems: Punch[]; certificate: Certificate | null }

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
        `This pack states the technical evidence held by Testing & Commissioning: the test sheet, the measured values, ` +
        `the number of attempts each point took, and the witnessed sign-off. Failed runs are retained in full on the ` +
        `system record and are not removed by a passing retest. ` +
        (openPunch > 0 ? `${openPunch} punch item(s) remain open against this system. ` : 'No punch item is open against this system. ') +
        (certificate === null
          ? `No controlled certificate is registered for this system: this pack is the evidence, not an issued document. `
          : certificate.current
            ? `This pack is registered in the controlled register as ${certificate.documentNumber} revision ${certificate.revision}. `
            : `The controlled document registered for this system is no longer current — ${certificate.note} `) +
        `Issue, revision and transmittal of that document are owned by Document Control and are not performed here.`
      }
      signatures={['Commissioning Engineer', 'Witness (Consultant / Client)']}
    />
  );
}
