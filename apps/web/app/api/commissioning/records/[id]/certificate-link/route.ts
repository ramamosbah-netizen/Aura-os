import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * Register a controlled document as this system's commissioning certificate (TC-GATE-10).
 *
 * T&C generates the evidence — the test sheet, every run behind every point, the witnessed sign-off.
 * Document control issues the document. This records the sentence that joins them, and nothing else:
 * the API refuses a reference the project register does not hold, and refuses a system that has not
 * been commissioned, because a certificate for unfinished work is a claim.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { documentId?: string };
  if (!body.documentId?.trim()) return Response.json({ error: 'documentId is required' }, { status: 400 });

  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/records/${id}/certificate-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Commissioning API unreachable' }, { status: 502 });
  }
}
