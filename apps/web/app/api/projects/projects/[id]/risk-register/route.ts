import { forwardToProjects } from '@/lib/projects-proxy';

/**
 * §21 — both registers for one project, with their rollups and ONE `asOf` date.
 *
 * A single call rather than two, so "overdue" cannot mean two different days on the two halves of
 * the same screen. The date is stamped by the API, not here and not in the browser: three clocks
 * would be three answers.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return forwardToProjects(`projects/${id}/risk-register`);
}
