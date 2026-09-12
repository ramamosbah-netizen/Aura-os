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
interface Detail { record: Record_; testItems: TestItem[]; testRuns: TestRun[]; punchItems: Punch[] }

/**
 * The commissioning EVIDENCE PACK for one system (TC-GATE-3).
 *
 * What T&C can honestly produce: what was required, what was measured, how many attempts it took,
 * and who witnessed the sign-off. Every point carries its run count and, where it failed before
 * passing, says so — a pack that hid the retests would be a prettier document and a worse record.
 *
 * What this is NOT: a controlled document. Formal issue, revision and transmittal are DocControl's
 * authority, and nothing links the two yet. The sheet says so in its notes rather than implying a
 * status it cannot support.
 */
export default async function CommissioningCertificate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getJson<Detail>(`/api/commissioning/records/${id}/detail`);
  if (!detail?.record) return <div style={{ padding: 40, color: '#666' }}>Commissioning record not found, or the API is offline.</div>;

  const { record, testItems, testRuns, punchItems } = detail;
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
        `Formal controlled issue, revision and transmittal of a commissioning certificate are owned by Document Control ` +
        `and are not performed here.`
      }
      signatures={['Commissioning Engineer', 'Witness (Consultant / Client)']}
    />
  );
}
