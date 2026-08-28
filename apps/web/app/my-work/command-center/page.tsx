import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Compatibility route for bookmarks created before Business Command Center became a
 * cross-suite control surface. Preserve query parameters for saved role/deep links.
 */
export default async function LegacyMyWorkCommandCenterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const input = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) value.forEach((entry) => query.append(key, entry));
    else if (value !== undefined) query.set(key, value);
  }
  const suffix = query.size ? `?${query.toString()}` : '';
  permanentRedirect(`/command-center${suffix}`);
}
