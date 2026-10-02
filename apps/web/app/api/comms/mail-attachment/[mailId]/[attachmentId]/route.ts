import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: stream one mail attachment (F-09). The API checks that the reader is on the message's
// envelope AND that the DMS lets them download the document now — this proxy only carries their
// identity through and relays the answer, a 403 or 404 included. Always a download, never inline.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ mailId: string; attachmentId: string }> },
): Promise<Response> {
  const { mailId, attachmentId } = await params;
  try {
    const res = await apiFetch(
      `${apiBase()}/api/v1/comms/mailbox/message/${encodeURIComponent(mailId)}/attachments/${encodeURIComponent(attachmentId)}/content`,
      { headers: await authHeader(), cache: 'no-store' },
    );
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}));
      return Response.json(body, { status: res.status || 502 });
    }
    return new Response(res.body, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
        'content-disposition': res.headers.get('content-disposition') ?? 'attachment',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'cross-origin-resource-policy': 'same-origin',
      },
    });
  } catch {
    return Response.json({ message: 'Mail API unreachable' }, { status: 502 });
  }
}
