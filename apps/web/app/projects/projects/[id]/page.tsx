import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Compatibility route only. Project ownership lives under `/project/[projectId]`;
 * keep this route until deprecation telemetry proves external bookmarks are gone.
 */
export default async function LegacyProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const next = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    for (const value of Array.isArray(raw) ? raw : raw ? [raw] : []) next.append(key, value);
  }
  const suffix = next.toString();
  redirect(`/project/${encodeURIComponent(id)}/controls${suffix ? `?${suffix}` : ''}`);
}
