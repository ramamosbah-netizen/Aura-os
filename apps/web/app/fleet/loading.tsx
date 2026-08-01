import PageLoading from '@/components/ui/page-loading';

// Segment loading boundary — shows a cockpit skeleton scoped to Fleet while
// its server data loads, keeping the app shell responsive during navigation.
export default function Loading() {
  return <PageLoading label="Loading Fleet..." />;
}
