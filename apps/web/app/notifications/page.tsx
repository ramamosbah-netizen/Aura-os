import { redirect } from 'next/navigation';

// The notification center now lives inside the unified Workspace hub.
export default function NotificationsPage(): never {
  redirect('/workspace?tab=notifications');
}
