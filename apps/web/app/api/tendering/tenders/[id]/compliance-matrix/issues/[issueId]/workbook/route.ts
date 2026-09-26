import { apiBase, apiFetch, authHeader } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Authenticated BFF stream for an issued Technical Compliance Matrix, read back from the tender's dossier. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; issueId: string }> }): Promise<Response> {
  const { id, issueId } = await params;
  try {
    const upstream = await apiFetch(
      `${apiBase()}/api/v1/tendering/tenders/${encodeURIComponent(id)}/compliance-matrix/issues/${encodeURIComponent(issueId)}/workbook`,
      { headers: await authHeader(), cache: 'no-store' },
    );
    const headers = new Headers();
    for (const name of ['content-type', 'content-disposition', 'content-length']) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set('cache-control', 'private, no-store');
    headers.set('x-content-type-options', 'nosniff');
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return Response.json({ message: 'Compliance matrix service unreachable' }, { status: 502 });
  }
}
