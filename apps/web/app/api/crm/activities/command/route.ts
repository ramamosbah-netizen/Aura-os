/**
 * The former Activity Command Center duplicated Relationship Intelligence and had no active
 * UI consumer. Keep a safe tombstone for stale bookmarks/integrations while the canonical
 * surfaces remain `/crm/intelligence/alerts`, Sales Overview, and the Activity summary.
 */
export async function GET(): Promise<Response> {
  return Response.json(
    { error: 'Activity command endpoint retired; use Relationship Intelligence or Activity summary.' },
    { status: 410, headers: { Deprecation: 'true' } },
  );
}
