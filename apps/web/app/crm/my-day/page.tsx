import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function LegacyCrmMyDayPage({
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
  permanentRedirect(`/my-work/my-day${suffix}`);
}
