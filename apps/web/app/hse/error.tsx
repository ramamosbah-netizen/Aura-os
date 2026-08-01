'use client';

import ErrorState from '@/components/ui/error-state';

// Segment error boundary for HSE — recoverable, keeps the app shell mounted.
export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState {...props} label="HSE" />;
}
