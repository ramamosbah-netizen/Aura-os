import { apiFetch, apiBase, authHeader } from '@/lib/api';

// Metadata only. The kernel still owns VIEW authorisation and never exposes storage keys through
// this BFF unless the caller is allowed to see the document record.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/documents/${id}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({})) as {
      document?: unknown;
      versions?: Array<Record<string, unknown>>;
      [key: string]: unknown;
    };
    // Storage keys are an internal implementation detail. The content endpoint accepts a
    // document id + version and performs DOWNLOAD authorisation; browsers never need the key.
    const safe = data.document && Array.isArray(data.versions)
      ? {
          document: data.document,
          versions: data.versions.map(({ storageKey: _storageKey, ...version }) => version),
        }
      : data;
    return Response.json(safe, { status: res.status });
  } catch {
    return Response.json({ error: 'DMS API unreachable' }, { status: 502 });
  }
}
