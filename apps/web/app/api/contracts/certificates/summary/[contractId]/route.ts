import { apiBase, authHeader } from '@/lib/api';

// BFF: contract billing summary — certificate register + work-done / retention / net to date.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ contractId: string }> },
): Promise<Response> {
  const { contractId } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/contracts/certificates/summary/${contractId}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(res.ok ? await res.json() : {}, { status: res.ok ? 200 : res.status });
  } catch {
    return Response.json({}, { status: 502 });
  }
}
