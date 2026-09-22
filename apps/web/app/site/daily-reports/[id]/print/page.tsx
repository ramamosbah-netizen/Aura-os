import { getJson } from '@/lib/api';
import DocumentSheet from '../../../../../components/document-sheet';

export const dynamic = 'force-dynamic';

interface DailyReport {
  id: string;
  projectId: string;
  projectName: string | null;
  date: string;
  workDescription: string;
  manpowerCount: number;
  equipmentCount: number;
  status: string;
  createdAt: string;
}

interface Evidence {
  id: string;
  fileId: string;
  category: string;
  description: string | null;
  location: string | null;
  capturedBy: string | null;
  capturedAt: string | null;
  hash: string | null;
  /** WHO SIGNED. Never `capturedBy`, which is whoever uploaded the file. */
  signedBy: string | null;
}

/**
 * `GET /api/site/daily-reports/:id` returns the 360 DETAIL — `{ report, labour, plant, progress,
 * delays, evidence }` — and this page read it as a bare report. Every field it printed was
 * therefore `undefined`, and `report.date.replace(...)` threw before anything rendered: the
 * controlled output that "backs progress claims, delay evidence, and client site diaries"
 * answered "Site couldn't load". The 360 page beside it had the shape right all along.
 */
interface DailyReportDetail {
  report: DailyReport;
  evidence?: Evidence[];
  /**
   * WHICH signature the day carries and whether it still covers this text, resolved by the site
   * domain rather than here. This page cannot import `@aura/site`, and re-deriving the selection
   * rule and the content hash in the browser app would be a second answer to one question that
   * drifts from the first in silence.
   */
  signature?: {
    evidence: Evidence;
    coverage: 'current' | 'superseded' | 'unverifiable';
    /**
     * Whether the stored file still carries the bytes this record committed to. Checked on every
     * read, because a sheet that prints a signature is the last place that can still say "these
     * are not the bytes that were signed".
     */
    integrity?: 'verified' | 'mismatch' | 'unavailable';
  } | null;
}

export default async function DailyReportPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getJson<DailyReportDetail>(`/api/site/daily-reports/${id}`);
  const report = detail?.report;
  if (!report?.date) return <div style={{ padding: 40, color: '#666' }}>Daily report not found or API offline.</div>;

  const evidence = detail?.evidence ?? [];
  /**
   * SELECTED BY WHAT IT IS, and not here.
   *
   * This asked `/signature|sign-off/i` of the uploader's own free-text DESCRIPTION, while the form
   * filed photographs and the signature alike under `progress`. So a progress photo described
   * “riser sign-off” was printed AS THE SIGNATURE on a controlled document and the real one
   * dropped into the photo rows. The site domain now resolves which row is the signature — and
   * whether it still covers this text — and this page renders the answer.
   */
  const signed = detail?.signature ?? null;
  const signature = signed?.evidence;
  const photos = evidence.filter((e) => e.category !== 'signature');

  return (
    <DocumentSheet
      kind="DAILY SITE REPORT"
      reference={`DR-${report.date.replace(/-/g, '')}-${report.id.slice(0, 4)}`}
      status={report.status}
      from={{ heading: 'Site / Contractor', lines: ['AURA OS Contracting LLC', 'Engineering & Operations', 'Dubai, UAE'] }}
      to={{ heading: 'Project Context', lines: [report.projectName || 'General Construction Site', `Report Date: ${report.date}`] }}
      meta={[
        { label: 'Date', value: report.date },
        { label: 'Manpower Count', value: String(report.manpowerCount) },
        { label: 'Equipment Count', value: String(report.equipmentCount) },
        { label: 'Evidence Attached', value: String(evidence.length) },
      ]}
      columns={[
        { key: 'item', label: 'Site Execution Details' },
        { key: 'qty', label: 'Metric', align: 'right' },
      ]}
      rows={[
        { item: report.workDescription, qty: `${report.manpowerCount} workers / ${report.equipmentCount} plant` },
        // Each photograph is named on the sheet with who captured it. A printed diary that says
        // "3 photos" without saying which is not evidence anybody can check a claim against.
        ...photos.map((e) => ({
          item: `Evidence — ${e.description ?? e.fileId}${e.location ? ` · ${e.location}` : ''}`,
          qty: e.capturedBy ? `recorded by ${e.capturedBy}` : e.category,
        })),
      ]}
      notes="Official foreman daily report logged on site. Backs progress claims, delay evidence, and client site diaries."
      signatures={[
        /*
         * WHO SIGNED AND WHO RECORDED IT, never merged.
         *
         * This printed `Signed by ${capturedBy}`, and `capturedBy` falls back to the account that
         * uploaded the file. On a pad labelled "Supervisor Sign-off", filled in at the tablet by
         * the site engineer, the controlled document credited the RECORDER with the foreman's
         * act. `signedBy` is the signatory's own name and is never derived from the uploader; the
         * recorder is still shown, as the recorder.
         *
         * A SUPERSEDED SIGNATURE IS STILL SHOWN, and said to be superseded. Hiding it would lose
         * the fact that the day was signed once and then changed, which is exactly what somebody
         * checking a progress claim needs to see.
         */
        signature
          ? {
              label: 'Foreman / Site Engineer',
              src: `/api/documents/${signature.fileId}/content`,
              attribution: [
                signature.signedBy ? `Signed by ${signature.signedBy}` : 'Signatory not recorded',
                signature.capturedBy ? `recorded by ${signature.capturedBy}` : null,
                signed?.coverage === 'superseded'
                  ? 'GIVEN FOR AN EARLIER VERSION OF THIS REPORT — it does not cover the text above'
                  : signed?.coverage === 'unverifiable'
                    ? 'signed before this report recorded what a signature covers'
                    : null,
                // Never printed as sound when the bytes have moved underneath it.
                signed?.integrity === 'mismatch' ? 'THE STORED FILE IS NOT THE ONE THAT WAS SIGNED — its checksum does not match what this record committed to' : null,
              ].filter(Boolean).join(' · '),
            }
          : 'Foreman / Site Engineer',
        'Consultant Witness / QA Inspector',
      ]}
    />
  );
}
